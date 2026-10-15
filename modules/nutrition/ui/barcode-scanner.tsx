"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { FoodResult } from "../foods/search"

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"]
const SCAN_EVERY_MS = 250

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

/**
 * The browser's barcode detector where it exists (Chrome on Android), else
 * the ZXing WebAssembly ponyfill (iPhone Safari has none; QUESTIONS.md Q9),
 * loaded from our own domain.
 */
async function makeDetector(): Promise<Detector> {
  const Native = (window as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (Native) {
    const supported = await Native.getSupportedFormats().catch(() => [] as string[])
    if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS })
  }
  const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill")
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/vendor/zxing_reader.wasm" : prefix + path) })
  return new BarcodeDetector({ formats: FORMATS as never })
}

type State =
  | { kind: "camera" }
  | { kind: "blocked" }
  | { kind: "looking"; code: string }
  | { kind: "missing"; code: string }
  | { kind: "error"; message: string }

/**
 * Scan a packaged food's barcode, or type its number (PRD F2). Found products
 * come from Open Food Facts; a product it does not know falls back to search
 * or entering the food by hand.
 */
export function BarcodeScanner({
  onFound,
  onSearch,
  onManual,
  onCancel,
}: {
  onFound: (result: FoodResult) => void
  onSearch: () => void
  onManual: () => void
  onCancel: () => void
}) {
  const id = useId()
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<State>({ kind: "camera" })
  const [typed, setTyped] = useState("")
  const scanning = state.kind === "camera"

  async function lookUp(code: string) {
    setState({ kind: "looking", code })
    const res = await fetch(`/api/foods/barcode/${encodeURIComponent(code)}`).catch(() => null)
    if (!res) return setState({ kind: "error", message: navigator.onLine ? "Lookup did not work. Try again." : "You're offline. Barcodes work when you're back online." })
    if (res.status === 400) return setState({ kind: "error", message: "That is not a barcode number. Check it and try again." })
    if (!res.ok) return setState({ kind: "error", message: "Lookup did not work. Try again." })
    const { result } = (await res.json()) as { result: FoodResult | null }
    if (result) onFound(result)
    else setState({ kind: "missing", code })
  }

  // Camera and detection run only while scanning; leaving stops the camera.
  useEffect(() => {
    if (!scanning) return
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let stopped = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
        if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop())
        video.current.srcObject = stream
        await video.current.play().catch(() => {})
        const detector = await makeDetector()
        let busy = false
        timer = setInterval(async () => {
          if (busy || stopped || !video.current || video.current.readyState < 2) return
          busy = true
          const codes = await detector.detect(video.current).catch(() => [])
          busy = false
          const code = codes[0]?.rawValue
          if (code && !stopped) {
            stopped = true
            navigator.vibrate?.(10)
            lookUp(code)
          }
        }, SCAN_EVERY_MS)
      } catch {
        if (!stopped) setState({ kind: "blocked" })
      }
    })()
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // lookUp only changes state; restarting the camera on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  return (
    <div className="flex flex-col gap-3 pb-4">
      {state.kind === "camera" && (
        <video ref={video} muted playsInline aria-label="Camera view for scanning a barcode" className="aspect-[4/3] w-full rounded-lg bg-surface object-cover" />
      )}
      <p role="status" aria-live="polite" className="text-body text-text-muted">
        {state.kind === "camera" && "Point the camera at the barcode."}
        {state.kind === "blocked" && "The camera is not available. Type the number under the barcode instead."}
        {state.kind === "looking" && `Looking up ${state.code}.`}
      </p>
      {state.kind === "missing" && (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-body">We do not have that product yet. Search for it or enter it yourself.</p>
          <Button variant="secondary" onClick={onSearch}>
            Search foods
          </Button>
          <Button variant="secondary" onClick={onManual}>
            Enter it yourself
          </Button>
        </div>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-body">
          {state.message}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (typed.replace(/\D/g, "").length >= 8) lookUp(typed)
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
            className="h-12 rounded-md border border-border bg-surface px-4 text-body text-text tabular-nums"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={typed.replace(/\D/g, "").length < 8 || state.kind === "looking"}>
          Look up
        </Button>
      </form>
      {(state.kind === "missing" || state.kind === "error") && (
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
