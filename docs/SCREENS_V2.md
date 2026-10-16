# Screens v2: Journal and Dashboard (PM, 2026-10-15)

Status: approved by Sean. Builds on TODAY_SPEC.md and overrides it where they conflict. Based on reference screenshots Sean supplied from a leading macro tracker (Journal and Dashboard tabs, macro rings, color-coded macros, meal cards with macro chips, 30 day consistency grids).

## Decisions (Sean, 2026-10-15)
1. Macro colors: adopt 4 macro colors, used only on macro data (rings, chips, chart segments, legend dots). The green accent stays for actions only.
2. Summary: 4 rings, protein first: Protein, Carbs, Fat, Calories. Replaces the big calories number and bars.
3. Landing: Today (the journal) opens first. Progress becomes the dashboard.

Unchanged: meal sections, no exercise add-back, water not now, no steps, no micronutrients.

## Macro color tokens (add to DESIGN_SYSTEM)
Fat is purple, not green, so it never reads as the action color.

| Token | Light | Dark | Use |
|---|---|---|---|
| `macro-protein` | #DB2777 | #F472B6 | Protein ring, chip, segment |
| `macro-carbs` | #2563EB | #60A5FA | Carbs |
| `macro-fat` | #7C3AED | #A78BFA | Fat |
| `macro-calories` | #EA580C | #FB923C | Calories |

Each has a 15% opacity track or chip background. Rules:
- Color is never the only signal: every ring and chip also carries a label or letter (P, C, F, kcal).
- Over target: ring completes, center shows "+12 over" in `text-muted`. Never red, never a warning color.
- Verify contrast with axe in both themes; darken text-on-chip shades if needed.

## Navigation
Tabs unchanged: Today, Progress, Coach (Clients for the coach), Me. Today is the default landing. No floating "+" button: the log bar is the single entry point.

## Log bar (supersedes Q47 layout)
Floating pill above the tab bar.
- Empty: leading search glyph (tap opens food search), placeholder "What did you eat?", trailing barcode icon.
- Typing: trailing icon becomes send.
- Camera icon: not shown until photo logging ships (post-MVP), then visible and locked for free users.

## Today (journal)
Top to bottom:
1. **Header:** "‹ Today ›" (arrows move one day; title shows "Wed, Oct 15" on other days), overflow menu with "Go to date".
2. **Week strip:** Monday to Sunday. Each day shows its date inside a small ring filled to calories eaten over target (calories color, capped at full). Selected day boxed, dot under today. Future days disabled. Swipe for previous weeks.
3. **Macro card, 2 pages with dots:**
   - Page 1: 4 rings, Protein, Carbs, Fat, Calories. Center: eaten in bold, "of 158" below. Tap the card to switch to Left mode ("158" and "left"). Remember mode on device.
   - Page 2: week insight ("This week: 4 of 6 days on target. Protein 5 of 6."), 7 mini bars (calories vs target line, protein marker on hit days), and streak ("6 day streak").
4. **Sticky compact header:** once the macro card scrolls away, a one-line header pins under the title: 4 small rings with "eaten of target" beside each.
5. **Check-in or coach card:** unchanged.
6. **Meal cards:** Breakfast, Lunch, Dinner, Snacks. Header: name, "…" menu (Copy yesterday's {meal}; on past days Copy to today), "+" button. Under the header, a chip row: P, C, F, kcal subtotals in macro colors. Entries below, as specified.
7. **Weight row:** unchanged.
8. **Day notes:** "Add a note" field at the bottom. Saves on blur. One note per local day. Visible to the user and their coach (shown in the coach client week view). Placeholder: "Add a note".

## Progress (dashboard)
Top to bottom:
1. **Header:** "Progress" with today's date below.
2. **Week chart:** 7 stacked bars, Monday to Sunday, segments are calories from protein, carbs and fat in macro colors, with a dashed target line. Tap a day to select it. Below the chart, 4 tiles for the selected day: Protein, Carbs, Fat, Calories as "eaten of target" with color dots. Swipe for previous weeks. Text summary for screen readers.
3. **Week averages:** 4 small stats: average calories, average protein, days on target, protein days.
4. **Consistency, 30 days:** two cards side by side.
   - Food log: 30 cells, filled when food was logged that day, `accent-strong` when on target, muted fill when logged but off target, empty when not logged. Caption: "22 of 30 days logged".
   - Weigh-ins: 30 cells, filled when weighed. Caption: "12 weigh-ins".
   - Empty states: "No logs yet", "No weigh-ins yet".
5. **Weight trend:** 7, 30, 90 day toggle; smoothed line with faint raw dots; trend value and change for the range. "Log weight" button.
6. **Weekly reports (paid):** list; free users see the locked preview (post-MVP with reports).

Not included: steps, nutrients, water.

## Data
- `day_notes` (user_id, local_date, body, updated_at). RLS: owner read and write; assigned coach read only. Unique on user_id plus local_date.
- Everything else derives from existing tables. Use `core/time/local-day.ts` for all day math.

## Events (add to PRD section 5)
- `day_note_saved`
- `macro_card_mode_changed` (eaten, left)

## Copy
| Context | Copy |
|---|---|
| Ring center | 120 / of 158 |
| Left mode | 38 / left |
| Over | +12 over |
| Consistency caption | 22 of 30 days logged |
| Weigh-in caption | 12 weigh-ins |
| Day notes placeholder | Add a note |
| Log bar placeholder | What did you eat? |

## Acceptance criteria
1. Today opens as the landing screen with 4 rings in Protein, Carbs, Fat, Calories order, colored per tokens, each with a text label.
2. Scrolling past the macro card shows the sticky compact header; scrolling back hides it.
3. Week strip rings reflect each day's calories over target; tapping a day loads it.
4. Meal chip rows show P, C, F, kcal subtotals and update immediately after logging.
5. Day notes save per local day, survive reload, and appear in the coach client week view.
6. Progress shows the week chart with target line, day tiles, week averages, both 30 day grids, and the weight trend with range toggle.
7. Over target never uses red or warning colors anywhere.
8. Passes at 375px in light and dark, 44pt targets, axe clean, screen reader summaries for rings, grids and charts.

## Placement
MVP step 3 (member basics), together with onboarding and targets. Progress dashboard is in MVP step 3 as well, since consistency and trend are the visible progress signal clients churn without.
