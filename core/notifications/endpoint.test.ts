import { describe, expect, it } from "vitest"
import { isPushServiceEndpoint } from "./endpoint"

describe("isPushServiceEndpoint", () => {
  it("accepts the browser push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://web.push.apple.com/QGx1",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYA",
    ]) {
      expect(isPushServiceEndpoint(url), url).toBe(true)
    }
  })

  it("refuses anything else", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/send",
      "https://notfcm.googleapis.com/send",
      "https://fcm.googleapis.com:8443/send",
      "https://user:pass@fcm.googleapis.com/send",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(isPushServiceEndpoint(url), url).toBe(false)
    }
  })
})
