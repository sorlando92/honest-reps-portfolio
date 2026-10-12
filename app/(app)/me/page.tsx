import { Suspense } from "react"
import type { Metadata } from "next"
import { getCurrentUser } from "@/core/auth/current-user"
import { Screen } from "@/components/screen"
import { Button } from "@/components/ui/button"
import { signOut } from "./actions"

export const metadata: Metadata = { title: "Me" }

export default function MePage() {
  return (
    <Screen title="Me">
      <Suspense fallback={<div className="h-6" />}>
        <SignedInAs />
      </Suspense>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </Screen>
  )
}

async function SignedInAs() {
  const user = await getCurrentUser()
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <span className="text-label text-text-muted uppercase">Signed in as</span>
      <span className="text-body break-all">{user.email}</span>
    </div>
  )
}
