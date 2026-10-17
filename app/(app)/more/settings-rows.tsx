"use client"

import { useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import { setDisplayName, setHasScale, setUnits } from "./actions"

/** A two choice segmented control on a More row; 44pt segments. */
function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => o.value !== value && onChange(o.value)}
          className={cn("flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-body", o.value === value ? "bg-accent text-on-accent" : "text-text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-1">
      <span className="text-body">{label}</span>
      {children}
    </div>
  )
}

export function UnitsRow({ initial }: { initial: "imperial" | "metric" }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [busy, start] = useTransition()
  return (
    <Row label="Units">
      <Segmented
        label="Units"
        value={value}
        disabled={busy}
        options={[
          { value: "imperial", label: "lb" },
          { value: "metric", label: "kg" },
        ]}
        onChange={(v) => {
          setValue(v)
          start(async () => {
            const res = await setUnits(v)
            if (!res.ok) setValue(initial)
            router.refresh()
          })
        }}
      />
    </Row>
  )
}

export function ScaleRow({ initial }: { initial: boolean | null }) {
  const [value, setValue] = useState<"yes" | "no">(initial ? "yes" : "no")
  const [busy, start] = useTransition()
  return (
    <Row label="Food scale">
      <Segmented
        label="Food scale"
        value={value}
        disabled={busy}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "Not yet" },
        ]}
        onChange={(v) => {
          setValue(v)
          start(async () => {
            const res = await setHasScale(v === "yes")
            if (!res.ok) setValue(v === "yes" ? "no" : "yes")
          })
        }}
      />
    </Row>
  )
}

/** Q63: the first name in "Hi, {first name}" on Progress. Saved on blur. */
export function NameRow({ initial }: { initial: string }) {
  const id = useId()
  const [value, setValue] = useState(initial)
  const saved = useRef(initial)
  const [status, setStatus] = useState("")
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-1">
      <label htmlFor={id} className="text-body">
        Name
      </label>
      <div className="flex flex-col items-end">
        <input
          id={id}
          value={value}
          maxLength={60}
          autoComplete="given-name"
          placeholder="Your first name"
          onChange={(e) => {
            setValue(e.target.value)
            setStatus("")
          }}
          onBlur={async () => {
            if (value.trim() === saved.current.trim()) return
            const res = await setDisplayName(value)
            if (res.ok) {
              saved.current = value
              setStatus("Saved.")
            } else setStatus("Not saved. Try again.")
          }}
          className="h-11 w-44 rounded-md border border-border bg-bg px-3 text-right text-body placeholder:text-text-muted"
        />
        <p role="status" aria-live="polite" className="text-caption text-text-muted">
          {status}
        </p>
      </div>
    </div>
  )
}
