"use client"

import { useId, useState } from "react"
import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react"
import { Dialog, DropdownMenu } from "radix-ui"
import { Button } from "@/components/ui/button"
import { addDays } from "@/core/time/local-day"
import { longDate, shortDate } from "../../days/week"
import { useGoToDay } from "./day-nav"

/**
 * "‹ Today ›" (other days "‹ Wed, Oct 15 ›"), with "Go to date" in the
 * overflow menu (docs/SCREENS_V2.md Today 1). No future days.
 */
export function DayHeader({ date, today }: { date: string; today: string }) {
  const go = useGoToDay(today, date)
  const [picking, setPicking] = useState(false)
  const isToday = date === today
  const title = isToday ? "Today" : shortDate(date)

  return (
    <header className="flex items-center gap-1">
      <Button variant="text" size="icon" aria-label={`Previous day, ${longDate(addDays(date, -1))}`} onClick={() => go(addDays(date, -1))}>
        <ChevronLeft aria-hidden />
      </Button>
      <h1 className="text-title" aria-label={isToday ? `Today, ${longDate(date)}` : longDate(date)}>
        {title}
      </h1>
      <Button variant="text" size="icon" aria-label={isToday ? "Next day" : `Next day, ${longDate(addDays(date, 1))}`} disabled={isToday} onClick={() => go(addDays(date, 1))}>
        <ChevronRight aria-hidden />
      </Button>
      <span className="ml-auto flex items-center">
        {!isToday && (
          <Button variant="text" className="h-11 px-3" onClick={() => go(today)}>
            Today
          </Button>
        )}
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <Button variant="text" size="icon" aria-label="More for this day">
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-lg border border-border bg-bg p-1">
              <DropdownMenu.Item
                onSelect={() => setPicking(true)}
                className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-body outline-none data-[highlighted]:bg-surface"
              >
                Go to date
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </span>
      <GoToDate open={picking} onOpenChange={setPicking} date={date} today={today} onGo={go} />
    </header>
  )
}

function GoToDate({ open, onOpenChange, date, today, onGo }: { open: boolean; onOpenChange: (o: boolean) => void; date: string; today: string; onGo: (d: string) => void }) {
  const id = useId()
  const [value, setValue] = useState(date)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70" />
        <Dialog.Content className="fixed inset-x-4 top-1/3 z-50 mx-auto flex max-w-sm flex-col gap-3 rounded-lg border border-border bg-bg p-4">
          <Dialog.Title className="text-headline">Go to date</Dialog.Title>
          <Dialog.Description className="sr-only">Pick a day up to today.</Dialog.Description>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!valid) return
              onOpenChange(false)
              onGo(value)
            }}
          >
            <label htmlFor={id} className="text-label text-text-muted uppercase">
              Date
            </label>
            <input
              id={id}
              type="date"
              max={today}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-12 rounded-md border border-border bg-surface px-3 text-body"
            />
            <Button type="submit" disabled={!valid}>
              Go
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
