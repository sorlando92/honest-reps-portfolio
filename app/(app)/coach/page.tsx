import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { EmptyState, Screen } from "@/components/screen"

export const metadata: Metadata = { title: "Coach" }

export default function CoachPage() {
  return (
    <Suspense fallback={null}>
      <MembersOnly />
    </Suspense>
  )
}

// The coach's tab bar has Clients in place of Coach (QUESTIONS.md Q22).
async function MembersOnly() {
  const user = await getCurrentUser()
  if (user.role === "coach") redirect("/clients")
  return (
    <Screen title="Coach">
      <EmptyState>Your coach and messages show up here.</EmptyState>
    </Screen>
  )
}
