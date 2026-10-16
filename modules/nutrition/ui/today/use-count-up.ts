"use client"

import { useEffect, useRef, useState } from "react"

/**
 * DESIGN_SYSTEM.md "Motion": a 300ms count-up when a total changes. Instant
 * with reduced motion, and on first render.
 */
export function useCountUp(value: number, ms = 300): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    from.current = value
    if (start === value) return
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : ms
    const t0 = performance.now()
    let frame = 0
    const step = (t: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (t - t0) / duration)
      setShown(Math.round(start + (value - start) * (1 - (1 - p) ** 3)))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, ms])

  return shown
}
