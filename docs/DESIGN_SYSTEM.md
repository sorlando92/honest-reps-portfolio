# Honest Reps Design System v1

Feel: **athletic minimal.** Mostly black and white, big bold numbers, one electric green accent. Confident, plain, gym native. Nothing decorative.

## Principles

1. **Logging speed is the product.** The fastest path to log is always within thumb reach.
2. **First guess is a draft.** Correcting must be as easy as logging.
3. **Numbers first, labels second.** Large numbers, small labels.
4. **No guilt.** Never red for food. Over target is neutral.
5. **Earned emphasis only.** Celebrate real wins the data supports, nothing else.
6. **One screen, one job.**

## Color tokens

Follow the system light or dark setting. Both themes are first class.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #FFFFFF | #0A0A0A | App background |
| `surface` | #F5F5F5 | #161616 | Cards, sheets, inputs |
| `border` | #E5E5E5 | #262626 | Dividers, input borders, bar tracks |
| `text` | #0A0A0A | #F5F5F5 | Primary text and numbers |
| `text-muted` | #525252 | #A3A3A3 | Labels, secondary text, "over" values |
| `accent` | #22D266 | #39E27A | Primary button fill, selected states, highlights |
| `on-accent` | #0A0A0A | #0A0A0A | Text and icons on accent fill |
| `accent-strong` | #15803D | #39E27A | Accent used as text or thin graphics (progress bars, chart line). Meets contrast. |
| `caution` | #B45309 | #F59E0B | System warnings only (sync failed, overdue for coach). Never for food totals. |
| `danger` | #B91C1C | #F87171 | Destructive actions only (delete account) |

Rules
- Never put `accent` as text on a light background; use `accent-strong`.
- Progress bar fill uses `accent-strong` on a `border` track.
- No other colors. No gradients. No shadows.

## Typography

System font stack: `-apple-system, BlinkMacSystemFont, "SF Pro", "Roboto", "Segoe UI", sans-serif`.
All numbers use `font-variant-numeric: tabular-nums` so totals don't jitter.
Respect system text size (use rem, test at 200%).

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 48 / 52 | 800 | Calories remaining on Today |
| `number-lg` | 32 / 36 | 700 | Protein remaining, report headline stats |
| `title` | 22 / 28 | 700 | Screen titles |
| `headline` | 17 / 22 | 600 | Card titles, list item names |
| `body` | 17 / 24 | 400 | Body text |
| `label` | 13 / 18 | 500 | Labels under numbers, uppercase tracking 0.02em |
| `caption` | 12 / 16 | 400 | Timestamps, helper text |

## Spacing, shape, layout

- 8 point grid: 4, 8, 12, 16, 24, 32, 48.
- Screen side padding 16. Card padding 16. Gap between cards 12.
- Radius: 12 for cards and sheets, 10 for inputs and buttons, full for chips and pills.
- Flat: no shadows. Separate with `surface` fill or 1px `border`.
- Minimum tap target 44x44, even when the visible icon is smaller.
- Respect safe areas (notch, home indicator).
- Mobile first at 375px. Coach screens scale to desktop with a max content width of 720px.

## Icons

Lucide, 1.75px stroke, 24px default, 20px inline. One set only. Tab icons always paired with labels.

## Motion and feedback

- Every log: light haptic (where supported) and a 300ms count-up on the affected totals.
- Earned moments only: a short, bolder animation (accent pulse plus one line of copy) for real milestones: new logging streak record, protein hit 7 of 7 days, first trend drop after a plateau. Max once per day.
- Sheets slide up 250ms ease-out. Screen transitions are native feeling slides.
- Honor `prefers-reduced-motion`: no count-ups or pulses, instant state changes.

## Navigation

Bottom tab bar, labeled icons:
- Members and clients: **Today, Progress, Coach, Me**
- Sean (coach role): **Today, Progress, Clients, Me**. Clients (roster, review queue, metrics, settings) replaces the Coach tab.

Stacks for drill-ins, bottom sheets for short tasks (log confirm, weight entry, habit edit).

## Components

- **Log bar:** pinned above the tab bar on Today. Text field ("What did you eat?") with camera and barcode icon buttons. On focus, shows quick add chips above it.
- **Quick add chip:** pill, `surface` fill, food name plus calories. One tap logs it.
- **Stat block:** big number + label + thin progress bar.
- **Confirmation card (bottom sheet):** list of parsed items. Each row: name, amount stepper, macros line, swap and remove. Flagged rows have a `caution` dot and "Check this" label with alternatives. Primary button "Log it." Secondary "Add item."
- **Entry row:** time, name, calories, protein. Swipe left for edit and delete. Optional meal tag pill.
- **Habit row:** checkbox (44pt), habit name, streak count.
- **Locked element:** standard component with a small lock icon and muted overlay; tapping opens the upgrade screen. Report preview is blurred.
- **Review card (coach):** full-screen card with sections: summary, flags, numbers, check-in, suggestion (accept or ignore), editable draft, Send button. Swipe or Send to advance.
- **Buttons:** primary (accent fill, on-accent text), secondary (surface fill, text), text button. Height 48.
- **Empty states:** one line of plain copy and the action. No illustrations.

## Screens

### Today
1. Date and day switcher
2. Calories remaining (display) with bar
3. Protein remaining (number-lg) with bar; carbs and fat as small stat pair
4. Check-in card when due (paid) or quiet coaching card (free)
5. Habits (paid)
6. Timeline of entries
7. Log bar pinned above tab bar

New user: targets shown, timeline empty, log bar focused with placeholder "2 eggs and toast". No tutorial.

### Log confirmation
Bottom sheet over Today. Items, edits, flags, "Log it." Pending offline items show "Pending, will finish when you're online." An unconfirmed card (draft) is kept on the device and reopens with the app. Barcode results carry the caption "Food data from Open Food Facts" (`caption` style, links to openfoodfacts.org).

### Progress
1. Weight trend chart (smoothed line in `accent-strong`, raw dots in `text-muted` at 40% opacity), 7 and 28 day change
2. Weekly cards: adherence, protein days, habits (paid), feel and performance (paid)
3. Weekly reports list (paid; blurred preview for free)

### Check-in (paid)
One question per screen, progress dots at top, big tap targets for 1 to 5 scales, photo step with skip, short text last, Submit. Target completion under 60 seconds.

### Weekly report (paid)
Single scroll: headline sentence, coach note, 4 to 5 stat cards, trend chart.

### Coach
Members see the coach card and upgrade screen here; clients see their message thread and latest report.

### Me
Profile, targets (editable for free users), units, reminders (time and toggle per reminder), subscription, privacy and data, About (includes "Food data from Open Food Facts" linking to openfoodfacts.org), delete account.

### Clients (Sean only)
Roster with flag badges and filters, Review queue entry point with count, Metrics, Settings.

## Copy rules

Voice: **plain coach with honest hype.** Direct, short, honest. Celebrate wins only when the numbers earn it.

- No emojis. No exclamation points. No em or en dashes in user-facing copy. Hyphens inside words ("check-in") are fine.
- Use sentence case.
- Say what happened, then what's next. "Logged." "Protein 6 of 7 days. That's the habit that moves the needle."
- Over target: "+120 over" in muted gray. Never "bad," "cheat," "failed."
- Hype only with proof: "Trend down 1.4 lb in 3 weeks. That's real." Not "Amazing job!"
- Never use "dietitian," "nutritionist," "L.D.," or "L.D.N." Use "nutrition coach" or "coach." Legal documents are exempt where the law requires the word.

Examples
| Context | Copy |
|---|---|
| Log bar placeholder | What did you eat? |
| Empty timeline | Nothing logged yet. Start with your last meal. |
| Low confidence item | Check this one |
| Offline save | Saved. Will sync when you're back online. |
| Evening nudge | Nothing logged today. Two minutes now keeps the week honest. |
| Check-in reminder | Check-in is open. Takes under a minute. |
| Upgrade screen title | Get coached |
| Locked report | Your weekly report unlocks with coaching |

## Accessibility

- WCAG 2.2 AA across the app.
- Text contrast 4.5:1, large text and graphics 3:1 (tokens above are chosen to pass; verify in CI with axe).
- Every icon button has an accessible label.
- Charts have a text summary for screen readers.
- Focus order follows visual order. Visible focus ring in `accent-strong`.
- Test with VoiceOver on iPhone Safari and TalkBack on Android Chrome.
