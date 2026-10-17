"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SECTIONS, SECTION_TITLES, type SearchHit, type Section } from "../foods/hits"
import { resultCount, type SearchState } from "./use-food-search"

/** docs/FOOD_LOOKUP_SPEC.md 1: 5 rows per section, then "Show more". */
const SHOWN = 5

/**
 * Search results in sections (My foods, Brands and restaurants, Basic foods),
 * optionally led by "Describe with AI". Shared by the log bar sheet and the
 * food search in the card.
 */
export function SearchResults({
  id,
  state,
  query,
  onPick,
  onAI,
  onLabel,
  onManual,
  busyRef,
}: {
  id: string
  state: SearchState
  query: string
  onPick: (hit: SearchHit, rank: number) => void
  /** Row 1 and the empty state's first button (log bar only). */
  onAI?: () => void
  onLabel?: () => void
  onManual?: () => void
  /** The row being resolved after a tap. */
  busyRef?: string | null
}) {
  const [expanded, setExpanded] = useState<Section[]>([])
  const q = query.trim()
  const sections = state.kind === "results" ? state.sections : state.kind === "loading" ? state.previous : null
  const count = sections ? resultCount(sections) : 0
  const settled = state.kind === "results"
  // Keep the pointer from blurring the log bar field before the tap lands.
  const keep = (e: React.PointerEvent) => e.preventDefault()

  return (
    <div id={id} className="flex flex-col gap-2">
      <p role="status" aria-live="polite" className="sr-only">
        {settled && q.length > 0 ? (count === 0 ? `No match for ${q}.` : `${count} ${count === 1 ? "result" : "results"}.`) : ""}
      </p>
      {onAI && q.length > 0 && (
        <button
          type="button"
          onPointerDown={keep}
          onClick={onAI}
          className="flex min-h-12 w-full items-center gap-3 rounded-md bg-surface px-3 py-2 text-left"
        >
          <Sparkles aria-hidden className="size-5 shrink-0 text-accent-strong" />
          <span className="min-w-0 text-body break-words">
            Describe with AI: <span className="font-semibold">{q}</span>
          </span>
        </button>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-body">
          {state.message}
        </p>
      )}

      {settled && q.length > 0 && count === 0 && (
        <div className="flex flex-col gap-2 py-1">
          <p className="text-body">No match for &lsquo;{q}&rsquo;. {emptyLine(Boolean(onAI), Boolean(onLabel), Boolean(onManual))}</p>
          {onAI && (
            <Button variant="secondary" onPointerDown={keep} onClick={onAI}>
              Describe it with AI
            </Button>
          )}
          {onLabel && (
            <Button variant="secondary" onPointerDown={keep} onClick={onLabel}>
              Scan the label
            </Button>
          )}
          {onManual && (
            <Button variant="secondary" onPointerDown={keep} onClick={onManual}>
              Enter it yourself
            </Button>
          )}
        </div>
      )}

      {sections &&
        SECTIONS.map((section) => {
          const rows = sections[section]
          if (!rows.length) return null
          const open = expanded.includes(section)
          const shown = open ? rows : rows.slice(0, SHOWN)
          const offset = SECTIONS.slice(0, SECTIONS.indexOf(section)).reduce((n, s) => n + sections[s].length, 0)
          return (
            <section key={section} aria-labelledby={`${id}-${section}`} className="flex flex-col gap-1">
              <h3 id={`${id}-${section}`} className="pt-1 text-label text-text-muted uppercase">
                {q.length === 0 && section === "mine" ? "Your usual foods" : SECTION_TITLES[section]}
              </h3>
              <ul className="flex flex-col gap-1">
                {shown.map((hit, i) => (
                  <li key={hit.ref}>
                    <button
                      type="button"
                      onPointerDown={keep}
                      onClick={() => onPick(hit, offset + i + 1)}
                      disabled={busyRef === hit.ref}
                      aria-label={`${hit.name}${hit.brand ? `, ${hit.brand}` : ""}, ${hit.servingLabel}, ${hit.kcal} calories`}
                      className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md bg-surface px-3 py-2 text-left disabled:opacity-60"
                    >
                      <span className="text-body break-words">{hit.name}</span>
                      <span className="text-caption text-text-muted tabular-nums">{caption(hit)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {rows.length > SHOWN && (
                <Button
                  variant="text"
                  onPointerDown={keep}
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? expanded.filter((s) => s !== section) : [...expanded, section])}
                  className="self-start"
                >
                  {open ? "Show fewer" : "Show more"}
                </Button>
              )}
            </section>
          )
        })}
    </div>
  )
}

function caption(hit: SearchHit): string {
  return [hit.brand, hit.servingLabel, `${hit.kcal} cal`].filter(Boolean).join(" · ")
}

/** "Describe it with AI, scan the label, or enter it yourself." for the buttons shown. */
function emptyLine(ai: boolean, label: boolean, manual: boolean): string {
  const parts = [ai && "describe it with AI", label && "scan the label", manual && "enter it yourself"].filter((p): p is string => Boolean(p))
  if (!parts.length) return "Try other words."
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} or ${parts[parts.length - 1]}`
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}
