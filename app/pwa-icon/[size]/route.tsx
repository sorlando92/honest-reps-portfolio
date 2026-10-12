import { ImageResponse } from "next/og"

// Placeholder app icon until Sean supplies artwork: black square with the
// accent green bar. No product name, since the name is configurable.
const SIZES = [180, 192, 512] as const

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }))
}

export async function GET(_request: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params
  const size = SIZES.find((s) => String(s) === raw)
  if (!size) return new Response("Not found", { status: 404 })

  const bar = Math.round(size * 0.14)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: bar * 0.6 }}>
          <div style={{ width: size * 0.5, height: bar, background: "#f5f5f5", borderRadius: bar / 2 }} />
          <div style={{ width: size * 0.5, height: bar, background: "#39e27a", borderRadius: bar / 2 }} />
        </div>
      </div>
    ),
    { width: size, height: size }
  )
}
