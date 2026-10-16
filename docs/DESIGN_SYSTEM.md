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
| `macro-protein` | #DB2777 | #F472B6 | Protein ring, chip, chart segment, legend dot |
| `macro-carbs` | #2563EB | #60A5FA | Carbs |
| `macro-fat` | #7C3AED | #A78BFA | Fat (purple, so it never reads as the action green) |
| `macro-calories` | #EA580C | #FB923C | Calories |

Macro colors (SCREENS_V2, Sean 2026-10-15) are used only on macro data: rings, chips, chart segments and legend dots. Each has a 15% opacity track or chip background. Color is never the only signal: every ring and chip also carries a label or letter (P, C, F, kcal). Over target, a ring completes and its center shows "+12 over" in `text-muted`. Text on a macro chip is checked with axe in both themes and darkened if needed.

Measured (engineering, 2026-10-15; approved by the PM 2026-10-16): as ring and bar graphics every macro color passes 3:1 on `surface` in both themes, but in light mode none passes 4.5:1 as text on its own 15% chip (2.7 to 4.2), and `macro-calories` fails as text on white. So macro numbers and letters use text tokens:

| Token | Light | Dark | Contrast on its chip (light) |
|---|---|---|---|
| `macro-protein-text` | #9D174D | #F472B6 | 5.8 |
| `macro-carbs-text` | #1E40AF | #60A5FA | 6.5 |
| `macro-fat-text` | #5B21B6 | #A78BFA | 6.6 |
| `macro-calories-text` | #9A3412 | #FB923C | 5.6 |

Rules
- Never put `accent` as text on a light background; use `accent-strong`.
- Progress bar fill uses `accent-strong` on a `border` track.
- No other colors: the green accent is for actions only, the four macro colors only for macro data. No gradients. No shadows.

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

- **Log bar:** a floating pill above the tab bar on Today (SCREENS_V2; supersedes the Q47 layout). The only entry point for logging; no floating "+" button.
  - Empty: leading search glyph (44pt, opens food search), placeholder "What did you eat?", trailing barcode icon (44pt).
  - Typing: the trailing icon becomes send.
  - On focus, shows quick add chips above it. The camera icon appears only when photo logging ships (post-MVP), locked for free users.
- **Quick add chip:** pill, `surface` fill, food name plus calories. One tap logs it.
- **Stat block:** big number + label + thin progress bar.
- **Confirmation card (bottom sheet):** list of parsed items. Each row: name, amount stepper, macros line, swap and remove. Flagged rows have a `caution` dot and "Check this" label with alternatives. Primary button "Log it." Secondary "Add item."
  - Amount defaults to grams for scale users (oz or g per units otherwise), with a g / oz toggle.
  - Label items (chain menu items and packaged products with a published serving) use a servings stepper in steps of 0.5, with the serving label and the grams when known beside it.
  - A generic food added from search starts at USDA's first common portion ("1 medium", "1 cup"), else 100 g, shown as "Estimated" with "Weigh it".
  - One signal per row, by cause: the `caution` dot and "Check this" only when the food match is uncertain. A clear food with an estimated amount shows "Estimated" in `text-muted` plus an inline "Weigh it" text button that focuses the amount field in grams, with no caution dot. No-scale users get a hand portion picker in its place. One line, never a modal.
  - Hand portion row: small "Hand portion" tag in `text-muted`. Not flagged.
  - Meat, fish, grains and pasta: one-tap segmented toggle Raw / Cooked, plus Dry for grains and pasta. 44pt segments.
- **Entry row:** inside a meal section. Title (the user's raw input on one line, truncated; item names when there was none), calories, protein. Tap to show the items. Swipe left for edit and delete. Estimated entries show "est." in `caption` style, `text-muted`.
- **Week strip:** 7 day cells, Monday to Sunday: weekday letter (`label`) over the date inside a small ring filled to calories eaten over target (`macro-calories` on its 15% track, capped at full). Selected day boxed with a 1px `text` border; a dot under today. Future days disabled. Each cell is at least 44pt and labeled for screen readers ("Wednesday, October 15, 1,850 of 2,100 calories").
- **Macro ring:** a circular progress ring in a macro color on its 15% track, with the label (Protein, Carbs, Fat, Calories) under it. Center: eaten in bold `number-lg` scale with "of 158" in `caption`; Left mode shows "38" and "left". Over: full ring, center "+12 over" in `text-muted`. Screen readers get one sentence ("Protein, 120 of 158 grams").
- **Macro card:** `surface` card, 2 pages with page dots. Page 1: 4 macro rings, Protein, Carbs, Fat, Calories. Tap toggles Eaten and Left. Page 2: week insight line, 7 mini bars of calories against a target line with protein markers, and the streak.
- **Sticky compact header:** once the macro card scrolls out of view, a one line bar pins under the title: 4 small rings, each with "eaten of target". Hidden again when the card is back in view.
- **Meal card:** `surface` card per meal. Header with the meal name (`headline`), a "…" menu (copy) and a 44pt "+" icon button. Under the header, a chip row of subtotals: P, C, F and kcal, each a pill with its letter and number in the macro color on the 15% background. Entry rows below. Empty cards show the header, zero chips and "+".
- **Consistency grid:** 30 cells, oldest to newest, in rows of 10. Food log: `accent-strong` fill when on target, `border` fill when logged off target, outline only when not logged. Weigh-ins: `text` fill when weighed. Caption under each grid. Screen readers get the caption plus "most recent: logged today".
- **Week chart:** 7 stacked bars, Monday to Sunday: calories from protein, carbs and fat in macro colors (4, 4 and 9 calories per gram), a dashed `text-muted` calorie target line, selected day outlined. Below it, 4 tiles for the selected day with color dots. A text summary for screen readers.
- **Day note:** a single multiline field at the end of Today, placeholder "Add a note", saved on blur with a quiet "Saved." status.
- **Meal picker chips:** on the confirmation card and in edit. Four pill chips (Breakfast, Lunch, Dinner, Snack), single select, selected chip in `accent` fill. 44pt targets.
- **Weight row:** "Weight" with today's weigh-in (`headline`) or a "Log weight" text button, and "Trend 182.4 lb, down 0.6 this week" in `caption`. Opens the weight sheet.
- **Habit row:** checkbox (44pt), habit name, streak count.
- **Locked element:** standard component with a small lock icon and muted overlay; tapping opens the upgrade screen. Report preview is blurred.
- **Review card (coach):** full-screen card with sections: summary, flags, numbers, check-in, suggestion (accept or ignore), editable draft, Send button. Swipe or Send to advance.
- **Buttons:** primary (accent fill, on-accent text), secondary (surface fill, text), text button. Height 48.
- **Empty states:** one line of plain copy and the action. No illustrations.

## Screens

### Onboarding: food scale step
"Do you have a food scale?" with two large buttons, Yes and Not yet. Not yet opens one skippable screen with the copy below and a 4 row hand portion guide (palm, fist, cupped hand, thumb), each row an outline icon, the hand portion name and what it measures.

### Today (journal, the landing screen)
Specs: `docs/SCREENS_V2.md` on top of `docs/TODAY_SPEC.md`.
1. Header "‹ Today ›" (other days "‹ Wed, Oct 15 ›"), overflow menu with "Go to date"
2. Week strip with calorie rings
3. Macro card (rings; week insight, mini bars and streak)
4. Sticky compact header once the macro card scrolls away
5. Check-in card when due (paid) or quiet coaching card (free)
6. Meal cards: Breakfast, Lunch, Dinner, Snacks, each with its P, C, F, kcal chip row
7. Weight row
8. Day note
9. Log bar floating above the tab bar

New user: targets shown, meal cards empty, log bar focused. No tutorial. Before targets exist, the rings show eaten totals and "Set your targets".

### Log confirmation
Bottom sheet over Today. Items, edits, flags, "Log it." Pending offline items show "Pending, will finish when you're online." An unconfirmed card (draft) is kept on the device and reopens with the app. Barcode results carry the caption "Food data from Open Food Facts" (`caption` style, links to openfoodfacts.org).

### Progress (dashboard)
Spec: `docs/PROGRESS_SPEC.md` on top of `docs/SCREENS_V2.md` "Progress (dashboard)"; PROGRESS_SPEC wins where it is more specific (bar segments, target line, selection, empty states, copy, screen reader summaries).
1. Header "Progress" with today's date below
2. Week chart (stacked macro bars, target line) and 4 tiles for the selected day
3. Week averages: average calories, average protein, days on target, protein days, weighed share (Q57)
4. Consistency, 30 days: Food log and Weigh-ins grids side by side
5. Weight trend (7, 30, 90 days; line in `text`, raw dots in `text-muted` at 40% opacity), "Log weight"
6. Weekly reports list (paid; blurred preview for free, post-MVP; hidden in MVP)

Over target, a bar rises above the dashed target line with no red or warning color.

### Check-in (paid)
One question per screen, progress dots at top, big tap targets for 1 to 5 scales, photo step with skip, short text last, Submit. Target completion under 60 seconds.

### Weekly report (paid)
Single scroll: headline sentence, coach note, 4 to 6 stat cards (including "Weighed"), trend chart.

### Coach
Members see the coach card and upgrade screen here; clients see their message thread and latest report. After a downgrade, the thread and past reports stay visible, read only, with the message field replaced by a locked element.

### Me
Profile, targets (editable for free users), units, food scale (Yes / Not yet), reminders (time and toggle per reminder), subscription, privacy and data, About (includes "Food data from Open Food Facts" linking to openfoodfacts.org), delete account.

### Clients (Sean only)
Roster with flag badges and filters, Review queue entry point with count, Metrics, Settings. AI settings fields show a live character counter (`caption`, `text-muted`) against their limit.

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
| Estimated item hint | Weigh it |
| Estimated item tag | Estimated |
| Estimated entry marker | est. |
| Calories label | left |
| Ring center | 120 / of 158 |
| Ring, Left mode | 38 / left |
| Ring, over | +12 over |
| Consistency caption | 22 of 30 days logged |
| Weigh-in caption | 12 weigh-ins |
| Consistency empty | No logs yet |
| Weigh-ins empty | No weigh-ins yet |
| Day note placeholder | Add a note |
| Week insight | This week: 4 of 6 days on target. Protein 5 of 6. |
| Streak | 6 day streak |
| Streak milestone | 7 days straight. That's the habit. |
| Copy meal action | Copy yesterday's lunch |
| Copy meal done | Copied. |
| Weight empty | Log weight |
| No targets | Set your targets |
| Hand portion tag | Hand portion |
| Report and Progress stat label | Weighed |
| Onboarding scale question | Do you have a food scale? |
| Onboarding, no scale yet | A food scale is the biggest upgrade to your accuracy. Most cost less than lunch. Until then, use hand portions. |

## Accessibility

- WCAG 2.2 AA across the app.
- Text contrast 4.5:1, large text and graphics 3:1 (tokens above are chosen to pass; verify in CI with axe).
- Every icon button has an accessible label.
- Charts have a text summary for screen readers.
- Focus order follows visual order. Visible focus ring in `accent-strong`.
- Test with VoiceOver on iPhone Safari and TalkBack on Android Chrome.
