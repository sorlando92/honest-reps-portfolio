import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { EmptyState, Screen } from "@/components/screen"

export const metadata: Metadata = { title: "Clients" }

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <CoachOnly />
    </Suspense>
  )
}

async function CoachOnly() {
  const user = await getCurrentUser()
  if (user.role !== "coach") notFound()
  return (
    <Screen title="Clients">
      <EmptyState>No clients yet. Your roster and review queue show up here.</EmptyState>
    </Screen>
  )
}
