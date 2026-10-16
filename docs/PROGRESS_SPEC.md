# Progress tab build spec (PM, 2026-10-16)

Status: approved for build. Detailed build spec for the Progress dashboard defined in SCREENS_V2.md, with Q57, Q59 and Q60 applied. Where this file is more specific, it wins.

## Purpose
Progress is where clients see proof they are moving, which is the main reason clients quit (no visible progress). It must answer three questions in one scroll: How did my week go? Am I consistent? Is my weight trending?

## Layout, top to bottom
1. Header
2. Week chart with day tiles
3. Week averages
4. Consistency, 30 days
5. Weight trend
(Weekly reports: hidden in MVP. They return with the reports feature.)

## 1. Header
- Title "Progress", today's date below ("Friday, October 16").

## 2. Week chart
- Week label above the chart: "This week" for the current week, otherwise "Oct 6 to Oct 12". Chevrons and horizontal swipe move one week. No future weeks.
- 7 bars, Monday to Sunday.
  - Bar height = total logged calories for that local day.
  - Segments, bottom to top: protein (g x 4), carbs (g x 4), fat (g x 9) in macro colors. If logged calories exceed the macro sum (alcohol, rounding), the remainder is a neutral `border` colored segment at the top. If the macro sum exceeds logged calories, scale segments to the bar.
  - Dashed target line per day at that day's calorie target (targets effective on that date, not today's).
  - Over target: bar simply rises above the line. No red, no warning color.
  - Future days in the current week: empty slots. Unlogged past days: an empty slot with a small `text-muted` dot at the baseline.
- Y axis: 0 to the larger of the highest bar and highest target, plus 10%. 3 light gridlines, values in kcal, small `caption` labels.
- Selection: tapping a bar selects it (full opacity); others at 50%. Default selection: today in the current week, Sunday in past weeks.
- Day tiles below the chart: 4 tiles for the selected day: Protein, Carbs, Fat, Calories, each "120 of 158" with its color dot. Before targets exist: "120 g" with no "of".
- Long press or double tap on a bar: open Today on that date.

## 3. Week averages
Five compact stats for the week shown in the chart, computed over logged days only (unlogged days are not counted as zero):
| Stat | Example | Notes |
|---|---|---|
| Avg calories | 2,040 | logged days only |
| Avg protein | 151 g | logged days only |
| Days on target | 4 of 6 | adherence rule from app_config; denominator = days elapsed this week |
| Protein days | 5 of 6 | protein at or above 90% of target |
| Weighed | 62% | share of entry items with amount_source weighed (Q57) |
- Before targets exist (Q59): hide "Days on target" and "Protein days".
- No logs this week: replace the row with "No logs this week yet."

## 4. Consistency, 30 days
Two cards side by side, each a 10 column by 3 row grid of the last 30 local days, oldest top left, today bottom right with an outline.
- Food log card:
  - `accent-strong` fill: logged and on target
  - muted fill: logged, not on target (or no targets yet)
  - empty: not logged
  - Caption: "22 of 30 days logged"
- Weigh-ins card:
  - filled: weighed that day
  - Caption: "12 weigh-ins"
- Tap a food log cell: open Today on that date.
- Empty states: "No logs yet", "No weigh-ins yet".

## 5. Weight trend
- Range toggle: 7, 30, 90 days. Default 30, remembered on the device (Q60).
- Smoothed trend line (EWMA, alpha from app_config, currently 0.1) in `text`; raw weigh-ins as faint dots; goal weight as a dashed line if set.
- Above the chart: "Trend 182.4 lb" and the change over the range: "Down 1.4 lb in 30 days", "Up 0.6 lb in 30 days", or "No change in 30 days" (within 0.2 lb).
- Y axis padded 2 lb (1 kg) above and below the data.
- "Log weight" button opens the same weight sheet as Today.
- Fewer than 2 weigh-ins in range: show the dot(s) and "Log a few more weigh-ins to see your trend."
- Units per profile; stored metric.

## Data and performance
- One server function, `progress_summary(user_id, week_start, weight_range)`, returns everything for the screen in one call:
  - per day of the week: calories, protein_g, carbs_g, fat_g, logged, target values for that date, adherent, protein_hit
  - week averages including weighed share
  - 30 day arrays: logged, adherent, weighed
  - weight series for the range: raw weigh-ins plus trend values, goal weight
- All day math via `core/time/local-day.ts` in the profile timezone.
- RLS: owner reads own; the assigned coach reads the same summary (step 5 reuses these components in the client week view, so build them to take a user id).
- Target: screen data loads under 1 second on a Pixel 6 over LTE.

## Demo data (so Sean can test with a full screen)
- Add `pnpm seed:demo` creating a test member `demo@example.test` assigned to Sean with 35 days of realistic data: about 80% of days logged, mixed amount sources (about 50% weighed), 3 to 5 entries per logged day across meals, weigh-ins on about 60% of days with a slow downward trend and daily noise, some days over target, one fully unlogged weekend.
- Mark the profile `is_test = true` (additive column). Exclude test profiles from all metrics, the north star and the coach roster flags count.
- `pnpm seed:demo --remove` deletes the test account and all its rows.
- Approved to run against hosted.

## Events (standing approval)
- `progress_viewed`
- `progress_week_changed` (weeks_from_current)
- `weight_range_changed` (days)

## Copy
| Context | Copy |
|---|---|
| Week label | This week / Oct 6 to Oct 12 |
| Tile | 120 of 158 |
| No logs this week | No logs this week yet. |
| Food log caption | 22 of 30 days logged |
| Weigh-in caption | 12 weigh-ins |
| Trend | Trend 182.4 lb |
| Change | Down 1.4 lb in 30 days |
| Not enough weigh-ins | Log a few more weigh-ins to see your trend. |
No emojis, exclamation points, or em or en dashes.

## Accessibility
- Chart has a text summary: "This week: average 2,040 calories, 4 of 6 days on target, protein 5 of 6."
- Each bar is focusable: "Tuesday, 1,980 of 2,100 calories, protein 160 of 158 grams."
- Grid cells are not individually focusable; each card has a summary label ("22 of 30 days logged, 15 on target").
- Weight chart summary: "Trend 182.4 pounds, down 1.4 in 30 days."
- 44pt targets for toggles, chevrons, and Log weight. Light and dark verified with axe.

## Acceptance criteria
1. With demo data, Progress shows all five sections populated, matching database totals for at least 3 spot-checked days.
2. Bars use the target in effect on each date; changing targets today does not move last week's lines.
3. A log at 11:30 PM local appears on that local day in the chart and grid.
4. Over-target days rise above the line with no red or warning color anywhere.
5. Week swipe works back at least 12 weeks; no future weeks.
6. Range toggle switches 7, 30, 90 and remembers the choice.
7. New user with no data sees every empty state and no errors.
8. Before targets exist, on-target stats are hidden and tiles show grams only.
9. Data loads in under 1 second on a Pixel 6 over LTE.
10. Passes at 375px in light and dark, 44pt targets, axe clean, screen reader summaries present.

## Phone test script for Sean (after deploy)
1. Sign in as demo@example.test.
2. Open Progress. Check the week chart, tap 3 different days, confirm tiles change.
3. Swipe back 2 weeks and forward again.
4. Check the 30 day grids match the pattern (one empty weekend).
5. Toggle weight 7, 30, 90; close and reopen the app; confirm the range is remembered.
6. Long press a bar; confirm Today opens on that date.
7. Switch the phone to light mode and repeat a quick scan.
