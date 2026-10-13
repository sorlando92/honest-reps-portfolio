import { Suspense } from "react"
import { getCurrentUser } from "@/core/auth/current-user"
import { TabBar } from "@/components/nav/tab-bar"
import "@/modules/nutrition"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="pt-[env(safe-area-inset-top)] pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-[720px] px-4">{children}</div>
      {/* The session read streams in; until then the role-specific tab is an empty slot. */}
      <Suspense fallback={<TabBar isCoach={null} />}>
        <RoleAwareTabBar />
      </Suspense>
    </div>
  )
}

async function RoleAwareTabBar() {
  const user = await getCurrentUser()
  return <TabBar isCoach={user.role === "coach"} />
}
