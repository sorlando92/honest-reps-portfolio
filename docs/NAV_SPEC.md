# Navigation and calendar spec (PM, 2026-10-16)

Status: approved by Sean. Aesthetic and navigation pass modeled on Sean's reference screenshots (floating pill tab bar, round quick-action button, sliding week calendar, sticky header). Overrides SCREENS_V2, TODAY_SPEC and DESIGN_SYSTEM where they conflict.

## Decisions (Sean, 2026-10-16)
1. Tabs: Progress, Today, Coach, More, in that order. "Me" becomes "More". App still opens on Today.
2. Round "+" quick-action button beside the tab bar. This reverses the earlier "no floating +" decision.
3. Sliding week calendar at the top of Today, plus pull down (or tap the title) to expand a month calendar.

## 1. Bottom navigation
- Floating rounded bar: `surface` fill, 1px `border`, full radius, 64pt tall, 16pt from screen edges, 12pt above the bottom safe area. No shadow (flat rule holds).
- Tabs, left to right, each icon above a label, always labeled:
  - Progress (chart icon)
  - Today (fork and knife icon)
  - Coach (message or clipboard icon). For the coach role this tab is "Clients".
  - More (circle with three dots icon)
- Active tab: an inner pill highlight behind icon and label (`accent` at 15%), icon and label in `accent-strong`. Inactive: `text-muted`.
- Round "+" button: separate 64pt circle to the right of the bar, same `surface` fill and border, large "+" in `text`. Label for screen readers: "Quick actions".
- Hide the tab bar, "+" and log bar while the keyboard is open.
- Content gets bottom padding so nothing hides behind the floating bars.

## 2. Quick actions ("+")
Bottom sheet with large rows (icon plus label, 56pt each):
- Search food
- Scan barcode
- Log weight
- Day note
- Copy yesterday's {meal for the current time window}
Rules:
- On Today, actions apply to the selected day. Elsewhere, they apply to today and switch to the Today tab.
- Scan barcode shows "Coming soon" until barcode ships, then works.
- Event: `quick_action_used` (action).

## 3. Log bar
- Floating pill above the tab bar on Today and Progress. From Progress, logs go to today and switch to Today after confirming.
- Layout unchanged from SCREENS_V2: leading search glyph, "What did you eat?", trailing barcode icon, send when typing.

## 4. Today header and sliding calendar
### Header band
- A pinned header band on a slightly darker `bg` shade spanning the top of the screen.
- Row 1: centered "‹ Today ›" (chevrons move one day, 44pt targets; title shows "Wed, Oct 15" on other days), "…" overflow at right with Go to date and Day note.
- Row 2: the week strip (below).
- On scroll down, row 2 swaps to the compact macro row (4 small rings with "eaten of target"), as in the reference. Scrolling back to the top swaps it back. 200ms crossfade; instant with reduced motion.

### Week strip
- Monday to Sunday. Each day: weekday letter above, date number inside a ring filled to calories eaten over target in `macro-calories` with a 15% track.
- Selected day: rounded rectangle outline around letter and ring. Today: small dot under its ring.
- Future days: dimmed, not tappable.
- Horizontal swipe slides a whole week with momentum and snaps to week boundaries. Swiping does not change the selected day; tapping a day does. Cannot slide past the current week; can slide back to the account's first week.
- "Today" text button appears in row 1 when another day is selected.

### Month calendar
- Pull the week strip down, or tap the title, to expand a month calendar that slides down from the header (250ms; instant with reduced motion).
- Month name with ‹ › and horizontal swipe between months. 7 column grid with the same day rings, today dot, selected box, future days dimmed.
- Tap a day: select it, collapse back to the week strip showing that week.
- Pull up, tap outside, or tap the title again: collapse.
- Event: `calendar_expanded`.

## 5. Progress header
- "Hi, Sean" (first name) with today's date below.
- Round avatar with the user's initial at top right; tap opens More.

## 6. More tab (was Me)
List rows, grouped:
- Goals: Targets (edit, per Q45 and free user rules)
- App: Units, Reminders, Add to Home Screen and turn on reminders, Food scale
- Account: Privacy and data, Terms, About (includes "Food data from Open Food Facts"), Sign out, Delete account
Coach role adds: Coach settings (when that screen ships).

## Accessibility
- Tab bar is a tab list with labeled tabs and selected state.
- Week strip days: "Wednesday October 15, 1,840 of 2,100 calories, selected".
- Month grid days labeled the same way. Swipe actions also have buttons (chevrons) for screen reader and keyboard users.
- All targets at least 44pt. Light and dark verified with axe.

## Events (standing approval)
- `quick_action_used` (action)
- `calendar_expanded`

## Acceptance criteria
1. Tab bar floats with labeled tabs in order Progress, Today, Coach (Clients for coach), More; Today opens by default; active tab shows the pill highlight.
2. "+" opens the quick action sheet; each action works on the selected day on Today and on today elsewhere.
3. Week strip swipes a week at a time with snap, never past the current week; tapping a day selects it; rings reflect calories.
4. Pull down or title tap expands the month calendar; selecting a day collapses it to that week.
5. On scroll, the header swaps the week strip for the compact macro row and back.
6. Tab bar, "+" and log bar hide while typing.
7. Progress shows "Hi, {first name}", date, and an avatar that opens More.
8. Passes at 375px in light and dark, 44pt targets, axe clean, reduced motion respected.
