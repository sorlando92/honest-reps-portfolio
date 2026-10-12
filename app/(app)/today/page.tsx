import type { Metadata } from "next"
import { EmptyState, Screen } from "@/components/screen"

export const metadata: Metadata = { title: "Today" }

export default function TodayPage() {
  return (
    <Screen title="Today">
      <EmptyState>Nothing logged yet. Start with your last meal.</EmptyState>
    </Screen>
  )
}
