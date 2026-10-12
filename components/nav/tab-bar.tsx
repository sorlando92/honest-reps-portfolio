"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, ChartLine, ClipboardList, MessageSquare, UserRound, type LucideIcon } from "lucide-react"
import { cn } from "cn"

interface Tab {
  href: string
  label: string
  icon: LucideIcon
}

// DESIGN_SYSTEM.md "Navigation": members and clients get Coach; the coach
// gets Clients in its place (QUESTIONS.md Q22).
const MEMBER_TABS: Tab[] = [
  { href: "/today", label: "Today", icon: Activity },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/coach", label: "Coach", icon: MessageSquare },
  { href: "/me", label: "Me", icon: UserRound },
]

const COACH_TABS: Tab[] = MEMBER_TABS.map((tab) =>
  tab.href === "/coach" ? { href: "/clients", label: "Clients", icon: ClipboardList } : tab
)

export function TabBar({ isCoach }: { isCoach: boolean }) {
  const pathname = usePathname()
  const tabs = isCoach ? COACH_TABS : MEMBER_TABS

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-[720px]">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-label",
                  active ? "text-accent-strong" : "text-text-muted"
                )}
              >
                <Icon aria-hidden className="size-6" strokeWidth={1.75} />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
