"use client"

import { cn } from "cn"
import { fill, formatNumber } from "../../days/week"
import { useCountUp } from "./use-count-up"
import { MACRO_LABEL, MACRO_STROKE, type Macro, type MacroMode } from "./macros"

export { MACRO_LABEL, type Macro, type MacroMode } from "./macros"

/** "Protein, 120 of 158 grams", "Calories, 2,250 of 2,100, 150 over". */
export function macroSentence(macro: Macro, eaten: number, target: number | null): string {
  const unit = macro === "calories" ? "" : " grams"
  if (target === null) return `${MACRO_LABEL[macro]}, ${formatNumber(eaten)}${unit}`
  const over = Math.round(eaten) - target
  return `${MACRO_LABEL[macro]}, ${formatNumber(eaten)} of ${formatNumber(target)}${unit}${over > 0 ? `, ${formatNumber(over)} over` : ""}`
}

/** A circular progress ring on its 15% track (DESIGN_SYSTEM.md "Macro ring"). */
export function Ring({ macro, value, size, stroke }: { macro: Macro; value: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={cn("-rotate-90", MACRO_STROKE[macro])}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
      {value > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
        />
      )}
    </svg>
  )
}

/**
 * One macro ring with its center and label. Eaten mode: "120" over "of
 * 158". Left mode: "38" over "left". Over target: full ring and "+12 over"
 * in text-muted, never a warning color. Before targets: eaten only.
 */
export function MacroRing({ macro, eaten, target, mode }: { macro: Macro; eaten: number; target: number | null; mode: MacroMode }) {
  const shown = useCountUp(Math.round(eaten))
  const over = target === null ? 0 : Math.round(eaten) - target
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={macroSentence(macro, eaten, target)}>
      <div className="relative">
        <Ring macro={macro} value={fill(eaten, target)} size={76} stroke={7} />
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none tabular-nums">
          {target !== null && over > 0 ? (
            <span className="text-caption text-text-muted">+{formatNumber(over)} over</span>
          ) : target !== null && mode === "left" ? (
            <>
              <span className="text-headline font-bold">{formatNumber(target - shown)}</span>
              <span className="text-caption text-text-muted">left</span>
            </>
          ) : (
            <>
              <span className="text-headline font-bold">{formatNumber(shown)}</span>
              <span className="text-caption text-text-muted">{target === null ? (macro === "calories" ? "kcal" : "g") : `of ${formatNumber(target)}`}</span>
            </>
          )}
        </div>
      </div>
      <span className="text-label text-text-muted uppercase">{MACRO_LABEL[macro]}</span>
    </div>
  )
}
