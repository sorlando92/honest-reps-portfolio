"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Flashlight, FlashlightOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { track } from "@/core/events/client"
import { candidates } from "../foods/gtin"
import { servingText, type FoodResult } from "../foods/hits"
import { qualityIssue } from "../foods/label"
import { formatOf, nextRead, START, type ReadState } from "../foods/reads"

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"]
const SCAN_EVERY_MS = 200
/** FOOD_LOOKUP_SPEC 3: "Hold steady" after 3 seconds without a read. */
const HOLD_STEADY_MS = 3000

interface Read {
  rawValue: string
  format?: string
}

interface Detector {
  detect(video: HTMLVideoElement): Promise<Read[]>
  close(): void
}

/**
 * The browser's barcode detector where it exists (Chrome on Android), else
 * ZXing in a web worker (iPhone Safari has none; QUESTIONS.md Q9).
 */
async function makeDetector(): Promise<Detector> {
  const Native = (window as { BarcodeDetector?: { new (o: { formats: string[] }): { detect(v: HTMLVideoElement): Promise<Read[]> }; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (Native) {
    const supported = await Native.getSupportedFormats().catch(() => [] as string[])
    if (FORMATS.some((f) => supported.includes(f))) {
      const native = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
      return { detect: (v) => native.detect(v), close: () => {} }
    }
  }
  const worker = new Worker(new URL("./scan-worker.ts", import.meta.url), { type: "module" })
  return {
    async detect(video) {
      const frame = await createImageBitmap(video)
      return new Promise<Read[]>((resolve) => {
        worker.onmessage = (e: MessageEvent<Read[]>) => resolve(e.data)
        worker.onerror = () => resolve([])
        worker.postMessage(frame, [frame])
      })
    },
    close: () => worker.terminate(),
  }
}

/** A lookup the scan log knows about. */
export interface Scan {
  scanId: string | null
  gtin: string
}

type State =
  | { kind: "camera" }
  | { kind: "blocked" }
  | { kind: "looking"; code: string }
  | { kind: "confirm"; result: FoodResult; scan: Scan }
  | { kind: "missing"; scan: Scan }
  | { kind: "error"; message: string }

/**
 * Scan a packaged food's barcode, or type its number (docs/FOOD_LOOKUP_SPEC.md
 * 3). Every result is confirmed before logging; a product we do not have
 * leads to the label scan first.
 */
export function BarcodeScanner({
  confirmLabel,
  onConfirm,
  onNotThis,
  onLabel,
  onSearch,
  onManual,
  onCancel,
}: {
  /** "Log it", or "Add to meal" when the scan adds to an open card. */
  confirmLabel: string
  onConfirm: (result: FoodResult, scan: Scan) => void
  onNotThis: (result: FoodResult, scan: Scan) => void
  onLabel: (scan: Scan) => void
  onSearch: (scan: Scan) => void
  onManual: (scan: Scan) => void
  onCancel: () => void
}) {
  const id = useId()
  const video = useRef<HTMLVideoElement>(null)
  const track_ = useRef<MediaStreamTrack | null>(null)
  const [state, setState] = useState<State>({ kind: "camera" })
  const [typed, setTyped] = useState("")
  const [torch, setTorch] = useState<boolean | null>(null)
  const [steady, setSteady] = useState(false)
  const scanning = state.kind === "camera"

  async function lookUp(code: string, format: string, reads: number | null, ms: number | null) {
    setState({ kind: "looking", code })
    const params = new URLSearchParams({ format })
    if (reads !== null) params.set("reads", String(reads))
    if (ms !== null) params.set("ms", String(Math.round(ms)))
    const res = await fetch(`/api/foods/barcode/${encodeURIComponent(code)}?${params}`).catch(() => null)
    if (!res) return setState({ kind: "error", message: navigator.onLine ? "Lookup did not work. Try again." : "You're offline. Barcodes work when you're back online." })
    if (res.status === 400) return setState({ kind: "error", message: "That barcode number does not check out. Check the digits and try again." })
    if (res.status === 429) return setState({ kind: "error", message: "Too many lookups in an hour. Try again in a few minutes." })
    if (!res.ok) return setState({ kind: "error", message: "Lookup did not work. Try again." })
    const body = (await res.json()) as { scanId: string | null; result: FoodResult | null; source: string | null; gtin: string; msToResult: number | null }
    track("barcode_scanned", {
      result: body.result ? "hit" : "miss",
      source: body.source,
      normalized_gtin: body.gtin,
      reads_to_confirm: reads,
      ms_to_result: body.msToResult,
    })
    const scan = { scanId: body.scanId, gtin: body.gtin }
    if (body.result) setState({ kind: "confirm", result: body.result, scan })
    else setState({ kind: "missing", scan })
  }

  // Camera and detection run only while scanning; leaving stops the camera.
  useEffect(() => {
    if (!scanning) return
    let stream: MediaStream | null = null
    let detector: Detector | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let stopped = false
    let reads: ReadState = START
    const started = performance.now()
    let lastValid = started
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
        if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop())
        const camera = stream.getVideoTracks()[0] ?? null
        track_.current = camera
        const caps = (camera?.getCapabilities?.() ?? {}) as { torch?: boolean }
        setTorch(caps.torch ? false : null)
        video.current.srcObject = stream
        await video.current.play().catch(() => {})
        detector = await makeDetector()
        let busy = false
        timer = setInterval(async () => {
          if (busy || stopped || !video.current || video.current.readyState < 2) return
          setSteady(performance.now() - lastValid > HOLD_STEADY_MS)
          busy = true
          const codes = await detector!.detect(video.current).catch(() => [] as Read[])
          busy = false
          if (stopped) return
          for (const code of codes.slice(0, 1)) {
            const next = nextRead(reads, code.rawValue, formatOf(code.format))
            reads = next.state
            if (next.state.last || next.confirmed) lastValid = performance.now()
            if (next.confirmed) {
              stopped = true
              navigator.vibrate?.(15)
              void lookUp(next.confirmed.raw, next.confirmed.format, reads.reads, performance.now() - started)
            }
          }
        }, SCAN_EVERY_MS)
      } catch {
        if (!stopped) setState({ kind: "blocked" })
      }
    })()
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      detector?.close()
      stream?.getTracks().forEach((t) => t.stop())
      track_.current = null
      setTorch(null)
      setSteady(false)
    }
  }, [scanning])

  async function toggleTorch() {
    const camera = track_.current
    if (!camera || torch === null) return
    await camera.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).catch(() => {})
    setTorch(!torch)
  }

  const digits = typed.replace(/\D/g, "")
  const typedValid = candidates(digits).length > 0

  if (state.kind === "confirm") {
    const { result, scan } = state
    const issue = qualityIssue(result.serving)
    return (
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex items-start gap-3">
          {result.imageUrl && (
            // A remote product photo from Open Food Facts; next/image would need its domain configured.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.imageUrl} alt="" className="size-20 shrink-0 rounded-md bg-surface object-contain" />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-headline break-words">{[result.brand, result.name].filter(Boolean).join(" ")}</p>
            <p className="text-body text-text-muted tabular-nums">{result.serving ? `${servingText(result.serving)}, ${Math.round(result.serving.kcal)} kcal` : `${Math.round(Number((result.per100g as { kcal?: number }).kcal ?? 0))} kcal per 100 g`}</p>
            {issue && (
              <p className="text-body text-caution">
                Check this: {issue === "no_serving" ? "this product has no serving size." : "the calories do not match the protein, carbs and fat."}
              </p>
            )}
          </div>
        </div>
        {result.source === "off" && (
          <p className="text-caption text-text-muted">
            Food data from{" "}
            <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent-strong underline">
              Open Food Facts
            </a>
          </p>
        )}
        <Button onClick={() => onConfirm(result, scan)}>{confirmLabel}</Button>
        <Button variant="secondary" onClick={() => onNotThis(result, scan)}>
          Not this
        </Button>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    )
  }

  if (state.kind === "missing") {
    return (
      <div role="alert" className="flex flex-col gap-3 pb-4">
        <p className="text-body">We don&rsquo;t have this barcode yet.</p>
        <Button onClick={() => onLabel(state.scan)}>Scan the label</Button>
        <Button variant="secondary" onClick={() => onSearch(state.scan)}>
          Search
        </Button>
        <Button variant="secondary" onClick={() => onManual(state.scan)}>
          Enter it yourself
        </Button>
        <Button variant="text" onClick={() => setState({ kind: "camera" })}>
          Scan again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {state.kind === "camera" && (
        <div className="relative">
          <video ref={video} muted playsInline aria-label="Camera view for scanning a barcode" className="aspect-[4/3] w-full rounded-lg bg-surface object-cover" />
          {torch !== null && (
            <Button
              variant="secondary"
              size="icon"
              aria-label={torch ? "Turn off the light" : "Turn on the light"}
              aria-pressed={torch}
              onClick={toggleTorch}
              className="absolute top-2 right-2 rounded-full"
            >
              {torch ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
            </Button>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="text-body text-text-muted">
        {state.kind === "camera" && (steady ? "Hold steady. Fill the frame with the barcode." : "Point the camera at the barcode.")}
        {state.kind === "blocked" && "The camera is not available. Type the number under the barcode instead."}
        {state.kind === "looking" && `Looking up ${state.code}.`}
      </p>
      {state.kind === "error" && (
        <p role="alert" className="text-body">
          {state.message}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (typedValid) void lookUp(digits, "unknown", null, null)
        }}
        className="flex items-end gap-2"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`${id}-code`} className="text-label text-text-muted uppercase">
            Barcode number
          </label>
          <input
            id={`${id}-code`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            aria-describedby={digits.length >= 12 && !typedValid ? `${id}-code-hint` : undefined}
            className="h-12 rounded-md border border-border bg-surface px-4 text-body text-text tabular-nums"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!typedValid || state.kind === "looking"}>
          Look up
        </Button>
      </form>
      {digits.length >= 12 && !typedValid && (
        <p id={`${id}-code-hint`} className="text-body text-text-muted">
          Those digits do not check out. Check the number under the barcode.
        </p>
      )}
      {state.kind === "error" && (
        <Button variant="text" onClick={() => setState({ kind: "camera" })}>
          Scan again
        </Button>
      )}
      <Button variant="text" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
