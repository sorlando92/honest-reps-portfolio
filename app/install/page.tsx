import { Suspense } from "react"
import type { Metadata } from "next"
import { getPublicConfig } from "@/core/settings/public-config"
import { InstallScreen } from "./install-screen"

export const metadata: Metadata = { title: "Install" }

/** PRD F1 install step, then push permission (Q62). `?from=more` or `?from=today` comes back there. */
export default function InstallPage({ searchParams }: PageProps<"/install">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <Suspense>
        <Install searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Install({ searchParams }: { searchParams: PageProps<"/install">["searchParams"] }) {
  const [{ productName }, { from }] = await Promise.all([getPublicConfig(), searchParams])
  return (
    <InstallScreen
      productName={productName}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      from={from === "more" || from === "today" ? from : null}
    />
  )
}
