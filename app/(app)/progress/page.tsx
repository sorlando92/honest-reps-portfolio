import type { Metadata } from "next"
import { EmptyState, Screen } from "@/components/screen"

export const metadata: Metadata = { title: "Progress" }

export default function ProgressPage() {
  return (
    <Screen title="Progress">
      <EmptyState>No weigh-ins yet. Your trend shows up here.</EmptyState>
    </Screen>
  )
}
