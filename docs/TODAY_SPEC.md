# Today screen v2 spec (PM, 2026-10-15)

Status: approved by Sean. Supersedes the Today layout in PRD F3 and DESIGN_SYSTEM "Screens > Today" where they conflict. Update both docs to match.

## Why
Sean's phone test: Today lacks table stakes every major tracker has (MyFitnessPal, Lose It, Cronometer, MacroFactor, Carbon): an at-a-glance daily summary against targets, meal grouping, day navigation, weekly insight, streak, weight on the home screen, and copying meals. This spec adds those within our rules: athletic minimal, protein first, precision first, no guilt colors, weekly trend over daily noise.

## Decisions (Sean, 2026-10-15)
- Meal sections replace the timeline. Entries auto-file by time of day; user can change.
- Water tracking: not now (post-MVP; remains a paid habit in the library).
- No exercise calorie add-back. Activity is built into targets. Add to PRD non-goals.

## Layout, top to bottom

### 1. Header and week strip
- Title: "Today" when today is selected; otherwise the weekday and date ("Wed, Oct 15").
- Week strip: 7 days, Monday to Sunday, each shows weekday letter and date number. Selected day uses accent fill.
- Status dot under each past or current day:
  - filled `accent-strong`: logged and on target (adherent per app_config: calories within ±10% of target)
  - outline `text-muted`: logged, not on target
  - none: nothing logged
- Swipe the strip for previous weeks. Tap the title to open a date picker. Future days disabled. "Today" text button appears when another day is selected.
- All day math uses `core/time/local-day.ts`.

### 2. Summary card
- Calories: remaining as `display` number with label "left", thin bar, and a caption "1,450 eaten of 2,100".
- Over target: number shows "+120 over" in `text-muted`. Never red.
- Protein: remaining as `number-lg`, "g left", thin bar.
- Carbs and fat: small stat pair with mini bars.
- Tap the card to toggle Remaining and Eaten. Remember the choice on the device.
- Before targets exist (pre onboarding): show eaten totals only, with "Set your targets" link.

### 3. Week insight row
- One line: "This week: 4 of 6 days on target. Protein 5 of 6." Counts Monday through the selected day.
- Protein day hit = protein at or above 90% of target (app_config).
- Hidden until the user has logged on at least one day this week.
- Tap opens a Week sheet: 7 bars of calories vs target (target as a line), a protein marker on days protein was hit, and a text summary for screen readers.

### 4. Logging streak
- Shown at the right of the insight row: "6 day streak".
- Counts consecutive local days with at least one food entry. If today has no entry yet, show the streak through yesterday (it does not break until the day ends).
- Earned moment (per DESIGN_SYSTEM motion rules) at 7, 14, 30, 60, 100 days. Max once per day.

### 5. Coach or check-in card
Unchanged: check-in card when due (paid), quiet coaching card (free).

### 6. Meal sections
- Breakfast, Lunch, Dinner, Snacks, in that order, always shown.
- Section header: name, subtotal calories and protein, and a "+" button (44pt) that focuses the log bar with that meal preselected.
- Entries inside a section in time order. Row: title (raw input, one line), calories, protein, "est." and "Check this" markers. Tap or swipe to edit as today.
- Auto-assign by local time of the entry: Breakfast 4:00 to 10:59, Lunch 11:00 to 15:59, Dinner 16:00 to 21:59, otherwise Snacks. Windows live in app_config.
- The confirmation card shows a meal chip row with the auto-assigned meal selected. One tap changes it. Edit also allows changing it.
- Section overflow menu:
  - On a past day: "Copy to today".
  - On today: "Copy yesterday's {meal}".
  - Copy creates new entries at the current time with the same items, amounts and amount_source. No model call. Confirms with "Copied."
- Empty sections show the header and "+" only.

### 7. Weight row
- "Weight" with today's weigh-in, or a "Log weight" button.
- Trend value and weekly change: "Trend 182.4 lb, down 0.6 this week" (EWMA per app_config).
- Tap opens a weight sheet for entry and the last 7 days. Units per profile.

### 8. Log bar
Unchanged per Q47. Logs to the selected day. Meal defaults to the time window; on a past day, uses the current time of day to pick the window, editable on the card.

## Data
- `food_entries.meal`: breakfast | lunch | dinner | snack, not null. Reuse or migrate the existing meal tag column. Backfill existing rows from logged_at with the windows above. Additive migration plus backfill: ask Sean before applying (backfill rewrites data).
- Copy uses existing entry and item tables. Store `copied_from_entry_id` for analytics.
- No exercise or water tables.

## Events (add to PRD section 5)
- `meal_copied` (meal, from_date)
- `day_switched` (days_from_today)
- `streak_milestone` (days)
- `food_logged` gains `meal`

## Copy
| Context | Copy |
|---|---|
| Calories label | left |
| Over | +120 over |
| Insight | This week: 4 of 6 days on target. Protein 5 of 6. |
| Streak | 6 day streak |
| Streak milestone | 7 days straight. That's the habit. |
| Copy action | Copy yesterday's lunch |
| Copy done | Copied. |
| Weight empty | Log weight |
| No targets | Set your targets |

No emojis, exclamation points, or em or en dashes.

## Acceptance criteria
1. A user with targets sees calories and protein remaining, carbs and fat, within 1 second of opening Today on a Pixel 6.
2. Logging an entry updates the summary, the section subtotal, and the day's dot without a reload.
3. Week strip dots match adherence rules for each local day, including a log at 11:30 PM local.
4. Switching to a past day shows that day's totals and sections; the log bar logs to that day.
5. Entries auto-file to the right meal by local time; changing the meal on the card or in edit moves the entry.
6. "Copy yesterday's lunch" creates matching entries today with no model call, and totals update.
7. Streak counts correctly across midnight and does not break before the day ends.
8. Over target shows muted "+N over", never red.
9. Weight row shows today's weigh-in or Log weight, plus trend and weekly change.
10. Everything passes at 375px in light and dark, 44pt targets, screen reader labels on strip days, bars and charts.

## Placement in MVP
- Meal sections, meal chip, copy meal: MVP step 1 (with quick add and favorites).
- Week strip, summary card, insight row, streak, weight row: MVP step 3 (needs onboarding targets). Build step 3 before step 2 (accuracy gate), so Sean can test the full daily experience sooner. The accuracy gate still blocks MVP exit.
