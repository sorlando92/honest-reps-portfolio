import type { Metadata } from "next"
import { getPublicConfig } from "@/core/settings/public-config"
import { InstallScreen } from "./install-screen"

export const metadata: Metadata = { title: "Install" }

/** PRD F1 required install step, then push permission (Q62). */
export default async function InstallPage() {
  const { productName } = await getPublicConfig()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <InstallScreen productName={productName} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
    </main>
  )
}
