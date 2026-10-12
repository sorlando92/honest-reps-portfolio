import type { Metadata, Viewport } from "next"
import { getPublicConfig } from "@/core/settings/public-config"
import { PwaRuntime } from "@/components/pwa/pwa-runtime"
import "./globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const { productName } = await getPublicConfig()
  return {
    title: { default: productName, template: `%s · ${productName}` },
    applicationName: productName,
    appleWebApp: { capable: true, title: productName, statusBarStyle: "default" },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/pwa-icon/180", sizes: "180x180", type: "image/png" }],
    },
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  )
}
