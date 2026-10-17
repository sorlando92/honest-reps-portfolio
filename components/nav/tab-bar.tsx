"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChartLine, CircleEllipsis, ClipboardList, MessageSquare, Plus, Utensils, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { DEFAULT_MEAL_WINDOWS, type MealWindows } from "@/modules/nutrition/entries/meals"
import { QuickActions } from "./quick-actions"

const noSubscribe = () => () => {}

interface Tab {
  href: string
  label: string
  icon: LucideIcon
}

// NAV_SPEC 1: Progress, Today, Coach, More. The coach gets Clients in place
// of Coach (QUESTIONS.md Q22). The app still opens on Today.
const MEMBER_TABS: Tab[] = [
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/today", label: "Today", icon: Utensils },
  { href: "/coach", label: "Coach", icon: MessageSquare },
  { href: "/more", label: "More", icon: CircleEllipsis },
]

const COACH_TABS: Tab[] = MEMBER_TABS.map((tab) =>
  tab.href === "/coach" ? { href: "/clients", label: "Clients", icon: ClipboardList } : tab
)

/**
 * The floating tab bar and the round "+" beside it (NAV_SPEC 1, 2). `isCoach`
 * is null while the role is still loading: the shared tabs render and the one
 * that differs is an empty slot, so the coach never sees Coach flash.
 */
export function TabBar({ isCoach, mealWindows = DEFAULT_MEAL_WINDOWS }: { isCoach: boolean | null; mealWindows?: MealWindows }) {
  const pathname = usePathname()
  const tabs = isCoach === null ? null : isCoach ? COACH_TABS : MEMBER_TABS
  const [quick, setQuick] = useState(false)
  // True once React runs in the browser; a tap before that would do nothing.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false)

  return (
    <div
      className="hide-on-keyboard fixed inset-x-0 z-40 mx-auto flex max-w-[720px] items-center gap-2 px-4"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <nav aria-label="Main" className="h-16 flex-1 rounded-full border border-border bg-surface px-1">
        <ul role="tablist" aria-label="Main" className="flex h-full items-center">
          {(tabs ?? MEMBER_TABS).map(({ href, label, icon: Icon }) => {
            if (!tabs && href === "/coach") return <li key={href} role="presentation" aria-hidden className="h-14 flex-1" />
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={href} role="presentation" className="flex-1">
                <Link
                  href={href}
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 rounded-full text-caption font-medium",
                    active ? "bg-accent/15 text-text" : "text-text-muted"
                  )}
                >
                  {/* accent-strong fails 4.5:1 as 12px text on the 15% pill in light mode, so only the icon takes it. */}
                  <Icon aria-hidden className={cn("size-6", active && "text-accent-strong")} strokeWidth={1.75} />
                  <span>{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <button
        type="button"
        aria-label="Quick actions"
        aria-haspopup="dialog"
        data-hydrated={hydrated ? "" : undefined}
        onClick={() => setQuick(true)}
        className="flex size-16 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
      >
        <Plus aria-hidden className="size-8" strokeWidth={2} />
      </button>
      <QuickActions open={quick} onOpenChange={setQuick} mealWindows={mealWindows} />
    </div>
  )
}
