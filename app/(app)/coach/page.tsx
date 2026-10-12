import type { Metadata } from "next"
import { EmptyState, Screen } from "@/components/screen"

export const metadata: Metadata = { title: "Coach" }

export default function CoachPage() {
  return (
    <Screen title="Coach">
      <EmptyState>Your coach and messages show up here.</EmptyState>
    </Screen>
  )
}
