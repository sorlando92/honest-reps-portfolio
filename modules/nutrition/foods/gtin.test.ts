import { describe, expect, it } from "vitest"
import { candidates, checkDigit, expandUpcE, hasValidCheckDigit, offCodes, padGtin, toGtin14 } from "./gtin"

// Ascent Native Whey, Key Lime Pie: the UPC Sean scanned (2026-10-17).
const ASCENT_UPC = "815863022027"

describe("check digits", () => {
  it("computes the GS1 check digit", () => {
    expect(checkDigit("81586302202")).toBe(7)
    expect(checkDigit("400638133393")).toBe(1) // EAN-13 4006381333931
    expect(checkDigit("9638507")).toBe(4) // EAN-8 96385074
  })

  it("accepts valid codes and refuses one wrong digit", () => {
    expect(hasValidCheckDigit(ASCENT_UPC)).toBe(true)
    expect(hasValidCheckDigit("815863022028")).toBe(false)
    expect(hasValidCheckDigit("815863922027")).toBe(false)
    expect(hasValidCheckDigit("abc")).toBe(false)
  })
})

describe("UPC-E", () => {
  it("expands each last digit rule", () => {
    expect(expandUpcE("04252614")).toBe("042100005264")
    expect(expandUpcE("01234565")).toBe("012345000065")
    expect(expandUpcE("01234531")).toBe("012300000451")
    expect(expandUpcE("01234542")).toBe("012340000052")
  })

  it("only takes number systems 0 and 1", () => {
    expect(expandUpcE("24252614")).toBeNull()
    expect(expandUpcE("0425261")).toBeNull()
  })
})

describe("canonical GTIN-14", () => {
  it("gives UPC-A, EAN-13 and GTIN-14 forms of one product one key (acceptance 3)", () => {
    const key = "00815863022027"
    expect(toGtin14(ASCENT_UPC)).toBe(key)
    expect(toGtin14(`0${ASCENT_UPC}`)).toBe(key)
    expect(toGtin14(`00${ASCENT_UPC}`)).toBe(key)
    expect(toGtin14(" 8 15863 02202 7 ")).toBe(key)
  })

  it("gives a UPC-E the same key as its UPC-A", () => {
    expect(toGtin14("04252614", "upc_e")).toBe(toGtin14("042100005264"))
  })

  it("refuses a misread that fails the check digit (acceptance 4)", () => {
    expect(toGtin14("815863022028")).toBeNull()
    expect(toGtin14("04252615", "upc_e")).toBeNull()
    expect(toGtin14("1234567")).toBeNull()
    expect(toGtin14("123456789012345")).toBeNull()
  })

  it("keeps an EAN-8 as an EAN-8 when the scanner says so", () => {
    expect(candidates("96385074", "ean_8")).toEqual(["00000096385074"])
  })

  it("tries both readings of a typed 8 digit code", () => {
    // 04252614 is a valid UPC-E; as an EAN-8 its check digit fails.
    expect(candidates("04252614")).toEqual(["00042100005264"])
    expect(candidates("96385074")).toEqual(["00000096385074"])
  })
})

describe("stored codes", () => {
  it("pads FDC and Open Food Facts codes without checking them", () => {
    expect(padGtin("815863022027")).toBe("00815863022027")
    expect(padGtin("0815863022028")).toBe("00815863022028")
    expect(padGtin("123")).toBeNull()
  })

  it("asks Open Food Facts for the 13 digit form, plus 8 digits for EAN-8", () => {
    expect(offCodes("00815863022027")).toEqual(["0815863022027"])
    expect(offCodes("00000096385074")).toEqual(["0000096385074", "96385074"])
    expect(offCodes("10815863022024")).toEqual(["10815863022024"])
  })
})
