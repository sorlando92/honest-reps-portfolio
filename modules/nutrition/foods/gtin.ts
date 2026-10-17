// Barcode numbers to one key (docs/FOOD_LOOKUP_SPEC.md 3 "Normalize"). UPC-E,
// EAN-8, UPC-A, EAN-13 and GTIN-14 forms of one product all become the same
// canonical GTIN-14. Pure, so the scanner (browser) and the lookup (server)
// share it and it is unit tested. No @/ imports: scripts/import-fdc.mts runs
// it in Node directly.

/** A barcode format as the scanner reports it; "unknown" for typed digits. */
export type BarcodeFormat = "upc_a" | "upc_e" | "ean_8" | "ean_13" | "itf" | "unknown"

/** GS1 mod 10 check digit for the digits before it. */
export function checkDigit(body: string): number {
  let sum = 0
  // Weights alternate 3, 1 starting from the rightmost body digit.
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}

/** True when the last digit is the GS1 check digit of the rest. */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1])
}

/**
 * UPC-E (8 digits: number system 0 or 1, six digits, check digit) expanded
 * to its 12 digit UPC-A. Null when it is not a UPC-E shape. The check digit
 * carries over; it is the UPC-A's check digit.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null
  const ns = code[0]
  const d = code.slice(1, 7)
  const check = code[7]
  const last = d[5]
  let body: string
  if (last <= "2") body = `${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}`
  else if (last === "3") body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`
  else if (last === "4") body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}`
  return `${ns}${body}${check}`
}

/**
 * The canonical GTIN-14 for a scanned or typed code, or null when the code
 * fails its check digit. An 8 digit code is ambiguous when typed (UPC-E or
 * EAN-8): `candidates` returns both; this picks UPC-E only when the scanner
 * said so.
 */
export function toGtin14(raw: string, format: BarcodeFormat = "unknown"): string | null {
  return candidates(raw, format)[0] ?? null
}

/**
 * Every canonical GTIN-14 the code could mean, most likely first. Empty when
 * no reading passes its check digit. Only typed 8 digit codes give two.
 */
export function candidates(raw: string, format: BarcodeFormat = "unknown"): string[] {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 8) {
    const out: string[] = []
    const upcA = format === "ean_8" ? null : expandUpcE(digits)
    // A UPC-E is valid when its expanded UPC-A passes the check digit.
    if (upcA && hasValidCheckDigit(upcA)) out.push(upcA.padStart(14, "0"))
    if (format !== "upc_e" && hasValidCheckDigit(digits)) out.push(digits.padStart(14, "0"))
    return format === "upc_e" || format === "ean_8" ? out.slice(0, 1) : out
  }
  if (digits.length < 12 || digits.length > 14) return []
  return hasValidCheckDigit(digits) ? [digits.padStart(14, "0")] : []
}

/**
 * A GTIN as FDC or Open Food Facts store it, to canonical form without
 * checking the digit: their data has codes with a bad or missing check digit,
 * and those still have to match the same stored text on the next scan.
 */
export function padGtin(code: string): string | null {
  const digits = code.replace(/\D/g, "")
  if (digits.length < 8 || digits.length > 14) return null
  return digits.padStart(14, "0")
}

/** The code Open Food Facts files a product under: 13 digits, or 8 for EAN-8. */
export function offCodes(gtin14: string): string[] {
  if (!gtin14.startsWith("0")) return [gtin14]
  const codes = [gtin14.slice(1)]
  if (gtin14.startsWith("000000")) codes.push(gtin14.slice(6))
  return codes
}
