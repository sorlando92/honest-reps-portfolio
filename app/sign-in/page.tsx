import type { Metadata } from "next"
import { getPublicConfig } from "@/core/settings/public-config"
import { SignInForm } from "./sign-in-form"

export const metadata: Metadata = { title: "Sign in" }

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { productName } = await getPublicConfig()
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-8 px-4 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <h1 className="text-title">{productName}</h1>
      <SignInForm linkErrorPromise={searchParams.then((p) => p.error === "link")} />
    </main>
  )
}
