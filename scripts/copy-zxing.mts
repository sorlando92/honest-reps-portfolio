// Copies the barcode reader's WebAssembly into public/vendor so the scanner
// loads it from our own domain instead of a CDN. Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm")
mkdirSync("public/vendor", { recursive: true })
copyFileSync(source, "public/vendor/zxing_reader.wasm")
