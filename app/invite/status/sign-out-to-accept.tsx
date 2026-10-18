"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

/** Signs out, then opens the invite link again so it waits for the next sign in. */
export function SignOutToAccept({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await createClient().auth.signOut()
          router.replace(`/invite/${token}`)
        })
      }
    >
      {pending ? "Signing out" : "Sign out"}
    </Button>
  )
}
