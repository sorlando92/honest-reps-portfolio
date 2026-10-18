"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { shrinkImage } from "@/lib/shrink-image"
import { MAX_PHOTOS, TEXT_ANSWER_MAX, type CheckinQuestion } from "../questions"

const KG_PER_LB = 0.45359237
/** Progress photos: enough detail for the coach, small enough to upload on gym wifi. */
const PHOTO_SIDE = 1600

type Photo = { position: number; url: string; status: "uploading" | "saved" | "failed" }

/**
 * PRD F5 and DESIGN_SYSTEM "Check-in": one question per screen, progress dots
 * at the top, big targets for 1 to 5 scales, the photo step can be skipped,
 * text last, then Submit. Answers stay on the screen until Submit.
 */
export function CheckinFlow({
  questions,
  units,
  prefillKg,
}: {
  questions: CheckinQuestion[]
  units: "imperial" | "metric"
  prefillKg: number | null
}) {
  const [index, setIndex] = useState(0)
  const [checkinId, setCheckinId] = useState<string | null>(null)
  const [startError, setStartError] = useState(false)
  const toUnit = (kg: number) => String(Math.round((units === "metric" ? kg : kg / KG_PER_LB) * 10) / 10)
  const [weight, setWeight] = useState(prefillKg === null ? "" : toUnit(prefillKg))
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [photos, setPhotos] = useState<Photo[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let live = true
    fetch("/api/checkins", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const { id } = (await res.json()) as { id: string }
        if (live) setCheckinId(id)
      })
      .catch(() => live && setStartError(true))
    return () => {
      live = false
    }
  }, [])

  // Each new screen moves focus to its question for screen readers.
  useEffect(() => {
    heading.current?.focus()
  }, [index, done])

  const q = questions[index]
  const last = index === questions.length - 1
  const weightKg = (() => {
    const n = Number(weight.replace(",", "."))
    if (!weight.trim() || !Number.isFinite(n) || n <= 0) return null
    return units === "metric" ? n : n * KG_PER_LB
  })()
  const answered = (() => {
    if (!q) return false
    if (q.optional || q.type === "photos") return true
    if (q.type === "weight") return weightKg !== null && weightKg >= 30 && weightKg <= 300
    const v = answers[q.id]
    return typeof v === "number" || (typeof v === "string" && v.trim() !== "")
  })()
  const uploading = photos.some((p) => p.status === "uploading")

  async function addPhoto(file: File) {
    if (!checkinId) return
    const position = [1, 2, 3].find((n) => !photos.some((p) => p.position === n))
    if (!position) return
    const url = URL.createObjectURL(file)
    setPhotos((ps) => [...ps, { position, url, status: "uploading" }])
    const body = new FormData()
    try {
      body.append("photo", await shrinkImage(file, PHOTO_SIDE), `${position}.jpg`)
    } catch {
      body.append("photo", file)
    }
    body.append("position", String(position))
    const res = await fetch(`/api/checkins/${checkinId}/photos`, { method: "POST", body }).catch(() => null)
    setPhotos((ps) => ps.map((p) => (p.position === position ? { ...p, status: res?.ok ? "saved" : "failed" } : p)))
  }

  async function removePhoto(position: number) {
    if (!checkinId) return
    setPhotos((ps) => ps.filter((p) => p.position !== position))
    await fetch(`/api/checkins/${checkinId}/photos?position=${position}`, { method: "DELETE" }).catch(() => null)
  }

  async function submit() {
    if (!checkinId) return
    setSending(true)
    setError(null)
    const res = await fetch(`/api/checkins/${checkinId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weightKg, answers }),
    }).catch(() => null)
    setSending(false)
    if (!res?.ok) {
      setError("Not sent. Try again.")
      return
    }
    setDone(true)
  }

  if (startError) {
    return (
      <section className="flex flex-col gap-4 py-6">
        <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
          Check-in
        </h1>
        <p className="text-body">This check-in is not open right now.</p>
        <Link href="/today" className="inline-flex min-h-11 items-center text-body text-accent-strong underline">
          Back to Today
        </Link>
      </section>
    )
  }

  if (done) {
    return (
      <section className="flex flex-col gap-4 py-6">
        <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
          Check-in sent.
        </h1>
        <p className="text-body text-text-muted">Your coach will reply here in the app.</p>
        <Link href="/today" className="inline-flex min-h-11 items-center text-body text-accent-strong underline">
          Back to Today
        </Link>
      </section>
    )
  }

  if (!q) return null

  return (
    <section className="flex min-h-[70dvh] flex-col gap-6 py-4">
      <ol aria-label={`Step ${index + 1} of ${questions.length}`} className="flex justify-center gap-2">
        {questions.map((step, i) => (
          <li key={step.id} aria-hidden className={cn("size-2 rounded-full", i <= index ? "bg-accent-strong" : "bg-border")} />
        ))}
      </ol>

      <h1 ref={heading} tabIndex={-1} className="text-title outline-none">
        {q.prompt}
      </h1>

      {q.type === "weight" && <WeightStep value={weight} onChange={setWeight} units={units} />}
      {q.type === "photos" && (
        <PhotoStep photos={photos} onAdd={addPhoto} onRemove={removePhoto} disabled={!checkinId} />
      )}
      {q.type === "scale" && (
        <ScaleStep question={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      )}
      {q.type === "text" && (
        <TextStep question={q} value={(answers[q.id] as string | undefined) ?? ""} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      )}

      {error && (
        <p role="alert" className="text-body text-caution">
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <Button
          type="button"
          disabled={!answered || uploading || sending || (last && !checkinId)}
          onClick={() => (last ? submit() : setIndex(index + 1))}
        >
          {last ? (sending ? "Sending" : "Submit") : q.type === "photos" && photos.length === 0 ? "Skip" : "Next"}
        </Button>
        {index > 0 && (
          <Button type="button" variant="text" onClick={() => setIndex(index - 1)}>
            Back
          </Button>
        )}
      </div>
    </section>
  )
}

function WeightStep({ value, onChange, units }: { value: string; onChange: (v: string) => void; units: "imperial" | "metric" }) {
  const id = useId()
  const unit = units === "metric" ? "kg" : "lb"
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="sr-only">
        {`Weight in ${unit === "kg" ? "kilograms" : "pounds"}`}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 w-40 rounded-md border border-border bg-surface px-4 text-title tabular-nums"
      />
      <span aria-hidden className="text-headline text-text-muted">
        {unit}
      </span>
    </div>
  )
}

function ScaleStep({ question, value, onChange }: { question: CheckinQuestion; value: number | string | undefined; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label={question.prompt} className="flex flex-col gap-2">
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={n === 1 ? `1, ${question.lowLabel}` : n === 5 ? `5, ${question.highLabel}` : String(n)}
            onClick={() => onChange(n)}
            className={cn(
              "h-14 rounded-md border text-headline tabular-nums",
              value === n ? "border-accent-strong bg-accent text-on-accent" : "border-border bg-surface text-text"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div aria-hidden className="flex justify-between text-caption text-text-muted">
        <span>{question.lowLabel}</span>
        <span>{question.highLabel}</span>
      </div>
    </div>
  )
}

function TextStep({ question, value, onChange }: { question: CheckinQuestion; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {question.prompt}
      </label>
      <textarea
        id={id}
        rows={5}
        maxLength={TEXT_ANSWER_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-surface p-3 text-body"
      />
      {question.optional && <p className="text-caption text-text-muted">Optional</p>}
    </div>
  )
}

function PhotoStep({
  photos,
  onAdd,
  onRemove,
  disabled,
}: {
  photos: Photo[]
  onAdd: (file: File) => void
  onRemove: (position: number) => void
  disabled: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Progress photos" className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <li key={p.position} className="flex flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file */}
            <img src={p.url} alt={`Progress photo ${p.position}`} className="aspect-[3/4] w-full rounded-md object-cover" />
            <p className="text-caption text-text-muted" aria-live="polite">
              {p.status === "uploading" ? "Uploading" : p.status === "failed" ? "Not saved" : "Saved"}
            </p>
            <Button type="button" variant="text" onClick={() => onRemove(p.position)} aria-label={`Remove photo ${p.position}`}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {photos.length < MAX_PHOTOS && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) onAdd(file)
            }}
          />
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
            Add photo
          </Button>
        </>
      )}
    </div>
  )
}
