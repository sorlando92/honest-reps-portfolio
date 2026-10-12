import type { MetadataRoute } from "next"
import { getPublicConfig } from "@/core/settings/public-config"

// The name is read from app_config so it can change without a deploy. iOS
// keeps the name a user saw when they installed (QUESTIONS.md Q5).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { productName } = await getPublicConfig()
  return {
    name: productName,
    short_name: productName,
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
