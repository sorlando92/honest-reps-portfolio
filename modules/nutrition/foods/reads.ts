// docs/FOOD_LOOKUP_SPEC.md 3 "Decode": a read counts only if it passes the
// check digit, and a product is looked up only after two identical valid
// reads in a row. Pure, so the rule is unit tested.

import { toGtin14, type BarcodeFormat } from "./gtin"

export interface ReadState {
  /** Every read the scanner returned, valid or not (barcode_scanned reads_to_confirm). */
  reads: number
  /** The last valid read and its canonical GTIN, waiting for its twin. */
  last: { raw: string; gtin: string; format: BarcodeFormat } | null
}

export const START: ReadState = { reads: 0, last: null }

/** The next state and, once confirmed, the read to look up. */
export function nextRead(state: ReadState, raw: string, format: BarcodeFormat): { state: ReadState; confirmed: { raw: string; gtin: string; format: BarcodeFormat } | null } {
  const reads = state.reads + 1
  const gtin = toGtin14(raw, format)
  // A misread (bad check digit) breaks the streak.
  if (!gtin) return { state: { reads, last: null }, confirmed: null }
  if (state.last && state.last.gtin === gtin) return { state: { reads, last: null }, confirmed: { raw, gtin, format } }
  return { state: { reads, last: { raw, gtin, format } }, confirmed: null }
}

/** BarcodeDetector format names to ours; anything else is "unknown". */
export function formatOf(name: string | undefined): BarcodeFormat {
  return name === "upc_a" || name === "upc_e" || name === "ean_8" || name === "ean_13" || name === "itf" ? name : "unknown"
}
