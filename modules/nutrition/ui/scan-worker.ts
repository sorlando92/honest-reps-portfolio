// ZXing barcode decoding off the main thread (docs/FOOD_LOOKUP_SPEC.md 3
// "Decode"), for browsers without a native BarcodeDetector (iPhone Safari).
// Receives one ImageBitmap per frame and answers with what it read.

import { BarcodeDetector, setZXingModuleOverrides } from "barcode-detector/ponyfill"

setZXingModuleOverrides({
  // Served from our own domain (scripts/copy-zxing.mts).
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/vendor/zxing_reader.wasm" : prefix + path),
})

const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] })

self.onmessage = async (event: MessageEvent<ImageBitmap>) => {
  const frame = event.data
  try {
    const codes = await detector.detect(frame)
    self.postMessage(codes.map((c) => ({ rawValue: c.rawValue, format: c.format })))
  } catch {
    self.postMessage([])
  } finally {
    frame.close()
  }
}
