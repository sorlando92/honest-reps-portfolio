# Honest Reps PRD v1

Owner: Sean (product owner, coach). PM: Claude. Engineering: Claude Code agent.
Status: approved for build. Last updated 2026-10-13.

## 1. Problem

Sean coaches a small group of paying nutrition clients. They log food in different apps with no standard, then Wodify sends them a Google Form and they copy their numbers into it. That double entry hurts three things about equally:

- **Compliance:** clients skip or half fill the form.
- **Coach time:** reviewing each client is slow and hard to compare week to week.
- **Data quality:** numbers from different apps are inconsistent.

Clients mostly stall or quit because they don't see visible progress, not because tracking is hard.

Gym members who are not clients mostly track nothing and have no simple path into paid coaching.

## 2. Product thesis

One place to log, so reporting is automatic. Progress shown as more than the scale: weight trend, adherence, habits, photos, and how training feels. If logging is fast and the coach can review at a glance, compliance rises and coaching scales.

**Precision first.** A food scale is the standard. Human estimates are expected to be wrong, so the app nudges users toward weighing. Hand portions are the accepted fallback without a scale. Logging still never blocks, and there are no pop-ups or nagging.

Long-term vision: this is the first module of a full health app (nutrition, habits, workout delivery). v1 is nutrition only, built on a shared core so later modules plug in.

## 3. Users

| User | Who | Job to be done | Success |
|---|---|---|---|
| Member (free) | Gym member, mostly tracks nothing today | Eat better for training and body comp without hiring anyone | Logs most days, sees an obvious next step when they want more |
| Client (paid) | Pays for coaching | Hit targets without tracking becoming a second job; feel coached | Steady logging, visible progress, weekly feedback |
| Coach | Sean only in v1 | Spot who needs help and give specific guidance fast | 3 minutes or less per client per week, nobody slips through |

Scope: v1 serves Sean's clients and gym members. Data model supports multiple coaches later.

## 4. Tiers

**Free:** onboarding and targets, full calorie and macro tracking (text, barcode, search), Today, weight trend, Progress basics.

**Paid:** Sean's coaching (weekly reviewed check-in, personal targets, async messaging), weekly progress report, habit tracking, photo logging.

Price: not set. Configurable in Coach settings. Paid features are visible but locked for free users, and every locked element opens the same upgrade screen. No pop-ups, no nagging.

## 5. Goals and metrics

North star: **of everyone who completed onboarding, the % who logged food on 4 or more days in the measured week, at week 6 of the gym beta. Target 40%.** Users who stopped logging still count in the denominator.

Guardrails:
- 90% of paid check-ins submitted on time
- Coach review time 3 minutes or less per client per week
- 2 or more free members upgrade during the beta

### Metrics and instrumentation (emit from day one)

Events: `signup_started`, `signup_completed`, `onboarding_completed` (the first time the user reaches Today after onboarding), `pwa_installed`, `push_enabled`, `food_logged` (method: text, photo, barcode, search, manual, quick_add; meal; confidence; offline; counts per amount source), `food_entry_corrected`, `food_entry_deleted`, `weight_logged`, `habit_checked`, `checkin_started`, `checkin_submitted` (on_time boolean), `report_viewed`, `message_sent` (role), `upgrade_viewed` (source), `upgrade_completed`, `subscription_canceled`, `review_card_opened`, `review_reply_sent` (seconds_on_card, draft_edit_distance), `meal_copied` (meal, from_date), `day_switched` (days_from_today), `streak_milestone` (days), `day_note_saved`, `macro_card_mode_changed` (mode: eaten, left), `progress_viewed`, `progress_week_changed` (weeks_from_current), `weight_range_changed` (days).

Test profiles (`profiles.is_test`, the demo account) are excluded from every metric, the north star and the coach roster flags count.

Coach review time = time from `review_card_opened` to `review_reply_sent`.

`signup_completed`, `upgrade_completed`, `subscription_canceled` and `review_reply_sent` are written only by the server, never by the client. `signup_started` may count a returning user once on a new device (accepted).

## 6. Rollout

1. **Closed alpha (2 to 3 weeks):** Sean plus current clients. The app replaces the Wodify Google Form from day one; the form stays only as a backup.
2. **Gym beta (6 weeks):** free tracking open to all gym members; most paid features tested at the same time.

Billing migration for existing clients is out of scope. Existing clients are invited with a comped or externally billed paid flag.

## 7. Features

Priority: all P0 unless marked.

### F1. Onboarding and targets (free)
Stories
- As a member, I get calorie and macro targets without doing math.
- As a coach, I can override any client's targets.

Acceptance
- Passwordless email sign in. Every sign-in email contains both a magic link and a 6-digit code. The code can be typed inside the installed app, which fixes iPhone home screen apps keeping a separate session from Safari. Invite links from the coach preassign the coach and paid flag.
- Minimum age 18. Date of birth collected; under 18 cannot create an account and sees "Honest Reps is for adults 18 and over for now."
- Collects goal (lose fat, maintain, build muscle, performance), sex, date of birth, height, current weight, optional goal weight, activity level, units (imperial default, metric toggle).
- Food scale step: "Do you have a food scale?" Yes / Not yet, stored as `has_scale` and changeable in Me. Not yet shows one skippable screen ("A food scale is the biggest upgrade to your accuracy. Most cost less than lunch. Until then, use hand portions.") followed by a 4 item hand portion guide: palm, fist, cupped hand, thumb.
- Calories: Mifflin St Jeor x activity multiplier, adjusted by goal. **Floor: the calorie target never goes below the user's estimated BMR**, including after coach or user edits (show a plain note if an edit would cross it; coach can override with a confirmation).
- Protein: grams per lb of goal weight (current weight if no goal weight), **capped at a configurable maximum, default 220 g**.
- Fat: 30% of calories for lose fat and maintain, 25% for build muscle and performance, never under 0.3 g per lb of goal weight (current weight if none). Carbs fill the remainder, at least 50 g. If carbs would fall under 50 g, fat drops toward its floor first; if both floors bind, protein and the floors are kept and calories rise to fit, with a note to the coach (Q54).
- All multipliers, goal adjustments, protein per lb, the protein cap, fat percentages and floors read from coach settings.
- Medical screening question: "Do you have a medical condition that affects what you eat?" Yes shows "Talk with your doctor before changing your diet. Your coach will be notified." and flags the coach. The user can still track.
- Disclaimer, terms and privacy policy accepted at signup (see F16). Until Sean approves the final legal text, acceptances record version "draft-2026-10"; on approval the version is bumped and every user accepts again on their next app open (Q55).
- The weight entered in onboarding is saved as the first weigh-in (Q56).
- Required install step: guided add to home screen with platform-specific visuals, then push permission. Reminders will not work until installed on iPhone, and the screen says so plainly. The first dismissal ("Not now") is allowed. If the app is still not installed 3 days later, Today shows one dismissible reminder banner; after that second dismissal it never prompts again. Install and reminders stay available in Me (Q62).
- Free users edit their own calories, protein, carbs and fat in Me; below the BMR floor they see a plain note and must confirm. Paid clients see their targets read only. Paid users' targets are set by the coach. A new paid user keeps their formula targets until the coach changes them; the coach sees a "targets not reviewed" flag on that client until he saves or confirms them once.
- Lands on Today with targets shown and the log bar focused.

### F2. Food logging (free; photo is paid)
Stories
- As a user, I describe a meal in plain words and it logs correctly.
- As a user, I relog a usual meal in one tap.
- As a user, when the app guesses wrong, fixing it takes one thumb.

Acceptance
- Inputs: free text, barcode scan, food search, quick add chips, photo (paid; locked camera for free users).
- Text and photo go through the parsing service (AI_PROMPTS.md P1, P2) and return a confirmation card listing each item with name, amount, unit, calories, protein, carbs, fat.
- Every field on the card is editable. Amount uses a stepper plus typed input. Each item can be swapped from a list of alternatives or removed.
- Every item records an amount source: **weighed** (a weight in g, oz or lb, or "weighed"), **label** (packaged or chain item with a standard serving), **measured** (volume, spoons, fluid ounces, or counts of a known size), **hand** (palm, fist, cupped hand, thumb, handful), or **estimated** (no usable amount). Meat, fish, grains and pasta also record a state: raw, cooked, dry, or none.
- Scale users: amount defaults to weight (g or oz per units) with a quick toggle to cups, servings or hand portions. Manual entry and search also default to grams.
- Label items (chain menu items and packaged products) use a servings stepper, with grams shown when the serving has a weight.
- A generic food added from search starts at USDA's first common portion (for example 1 medium, 1 cup), else 100 g. It is marked Estimated with Weigh it.
- One signal per row, by cause. An uncertain food match shows "Check this" with alternatives. A clear food with an estimated amount shows "Estimated" and an inline "Weigh it" action that focuses the amount field in grams; users without a scale see a hand portion picker instead. One inline line only: no modals, no blocking, no repeated nags. On the timeline, estimated rows show "est.".
- Chain restaurants: curated menu items from each chain's published nutrition page for Chick-fil-A, Chipotle, Culver's, Domino's, Panera and Subway (amount source label). Other chains get a generic match, marked estimated and flagged. McDonald's, Starbucks, Taco Bell, Raising Cane's and Imo's are added if holdout meal calories stay under 80% after the local FDC import (QUESTIONS.md Q40, Q41).
- Hand portion items show a "Hand portion" tag and are not flagged. Conversions come from Coach settings (F14).
- Meat, fish, grains and pasta show a one-tap Raw / Cooked toggle, plus Dry for grains and pasta. Default cooked unless stated. Changing it recalculates from the matching database entry.
- Low-confidence items are visibly flagged with alternatives and a manual entry option. Saving is never blocked.
- Barcode uses Open Food Facts; not found falls back to search or manual entry. Barcode results show the caption "Food data from Open Food Facts" linking to openfoodfacts.org; the same attribution appears in Me, About.
- Quick add: 5 to 6 chips of the user's most frequent foods for the current time of day, shown when the log bar is focused.
- Favorites: any entry can be starred.
- Quick add and favorites remember the last weighed amount for that food, and never call the AI model.
- Every entry has a meal: breakfast, lunch, dinner or snack. It is assigned from the entry's local time (F3 windows) and shown as a meal chip on the confirmation card and in edit, where one tap changes it.
- Edit and delete any entry (swipe on the timeline).
- Each entry stores raw input, model output, confidence, method, and timestamps.
- Offline: quick add, favorites, cached barcodes, and manual entries save locally and sync later. Text and photo parsing queue as "pending" and resolve when back online.
- Entry states:
  - **Draft:** an unconfirmed confirmation card. Not saved to `food_entries`. Kept on the device if the app closes and resurfaced on reopen. Never counts toward totals.
  - **Flagged:** a saved entry with one or more low-confidence items. Counts toward totals. Shows a "Check this" marker until the user edits or confirms it.
  - **Pending:** a text or photo entry captured offline. Shows on the timeline as pending and does not count. When back online it parses automatically and saves without asking again; low-confidence items become flagged. The user is notified only if something was flagged.
- Target: a repeat meal logs in under 5 seconds; a new described meal in under 20 seconds.

### F3. Today, the journal (free)
Story: as a user, I see in one glance what I have eaten against my targets, how my week is going, and log in the right place fast.

Specs: `docs/SCREENS_V2.md` (Journal and Dashboard, approved by Sean 2026-10-15) on top of `docs/TODAY_SPEC.md`; SCREENS_V2 wins where they differ. Today is the landing screen. Layout top to bottom: header, week strip, macro card (rings, then week insight and streak), sticky compact header, coach or check-in card, meal cards, weight row, day note, log bar.

Acceptance
- Header: "‹ Today ›"; the arrows move one day and the title shows "Wed, Oct 15" on other days. Overflow menu with "Go to date". Future days disabled.
- Week strip, Monday to Sunday: each day shows its date inside a small ring filled to calories eaten over the calorie target (calories color, capped at full). Selected day boxed, a dot under today. Swipe for earlier weeks. Tapping a day loads it.
- Macro card, 2 pages with dots. Page 1: 4 rings in order Protein, Carbs, Fat, Calories, each in its macro color with a text label; center shows eaten in bold with "of 158" below. Tap switches to Left mode ("38" and "left"), remembered on the device. Over target: the ring completes and the center shows "+12 over" in muted gray. Never red, never a warning color. Before targets exist: eaten totals only and "Set your targets". Page 2: "This week: 4 of 6 days on target. Protein 5 of 6." counting Monday through the selected day (on target per the app_config adherence range, protein hit at 90% of target), 7 mini bars of calories against the target line with a protein marker on hit days, and the logging streak ("6 day streak": consecutive local days with at least one entry; today without an entry yet does not break it; earned moment at 7, 14, 30, 60 and 100 days, at most once per day).
- Sticky compact header: once the macro card scrolls away, one line pins under the title with 4 small rings and "eaten of target" beside each; scrolling back hides it.
- Paid users: check-in card when due. Free users: one quiet coaching card linking to the upgrade screen.
- Meal cards: Breakfast, Lunch, Dinner, Snacks, always shown. Header with the name, a "…" menu ("Copy yesterday's {meal}" on today, "Copy to today" on a past day) and a 44pt "+" that focuses the log bar with that meal selected. Under the header, a chip row of P, C, F and kcal subtotals in macro colors. Entries in time order; each row is titled with what the user typed (raw input, first line, truncated to one line), or the item names when there was no typed input; quick add and favorites log with the title of the entry they came from. Rows show calories, protein, "est." and "Check this"; tap or swipe to edit.
- Meals auto-assign from the entry's local time: Breakfast 4:00 to 10:59, Lunch 11:00 to 15:59, Dinner 16:00 to 21:59, else Snacks (`app_config.meal_windows`). The card and edit change it with one tap. A log on a past day uses that date: at the meal's anchor time when a meal is chosen (`app_config.meal_anchors`), else the current clock time (Q52).
- Copies are new entries at the current time with the same items, amounts and amount sources; no model call; "Copied."
- Weight row: today's weigh-in or "Log weight", plus "Trend 182.4 lb, down 0.6 this week" (EWMA per app_config). Tap opens a weight sheet with entry and the last 7 days.
- Day note: "Add a note" at the bottom, saved on blur, one per local day, visible to the user and their coach (coach client week view).
- Log bar: a floating pill above the tab bar. Empty: leading search glyph (opens food search), placeholder "What did you eat?", trailing barcode icon. Typing: the trailing icon becomes send. The camera icon appears only when photo logging ships, locked for free users. It logs to the selected day. No floating "+" button.
- Times and days follow the user's profile timezone (ARCHITECTURE.md "Local days").

### F4. Progress, the dashboard (free)
Story: as a user, I see my real trend and my consistency, not daily noise.

Spec: `docs/PROGRESS_SPEC.md` (build spec, approved 2026-10-16) on top of `docs/SCREENS_V2.md` "Progress (dashboard)"; PROGRESS_SPEC wins where it is more specific, and its acceptance criteria are part of this feature.

Acceptance
- Header: "Progress" with today's date below.
- Week chart: 7 stacked bars, Monday to Sunday, segments are calories from protein, carbs and fat in macro colors, with a dashed calorie target line. Tap a day to select it; below the chart, 4 tiles for that day (Protein, Carbs, Fat, Calories as "eaten of target" with color dots). Swipe for earlier weeks. Text summary for screen readers.
- Week averages: average calories, average protein, days on target, protein days, weighed share ("Weighed: 64% of items", Q57).
- Consistency, last 30 days, two cards: Food log (filled `accent-strong` when on target, muted fill when logged off target, empty when not logged; "22 of 30 days logged") and Weigh-ins (filled when weighed; "12 weigh-ins"). Empty states "No logs yet" and "No weigh-ins yet".
- Weight trend: 7, 30 and 90 day toggle; an exponentially weighted moving average line (smoothing in app_config) with faint raw weigh-ins; trend value and change over the range; "Log weight". Weight can be logged any day from Today or Progress.
- Weekly reports (paid): list; free users see the locked preview (post-MVP with reports; hidden in MVP).
- Demo data: `pnpm seed:demo` creates a test member with 35 days of realistic data so the full screen can be tested; `pnpm seed:demo --remove` deletes it (PROGRESS_SPEC "Demo data").
- Not included: steps, nutrients, water.

### F5. Weekly check-in (paid)
Stories
- As a client, I report my week in under 60 seconds.
- As a coach, I never chase a check-in.

Acceptance
- Opens on the configured check-in day (default Friday 6:00am, coach's timezone) and stays open until the review day (default Sunday).
- One question per screen: weight (prefilled from trend, editable), up to 3 progress photos, then the coach-defined questions. Defaults: energy, sleep, hunger (1 to 5 scales), performance note (short text), one open question.
- Questions are edited in Coach settings and apply to all clients. Each question has an optional report tag: energy, sleep, hunger, performance, or none. Seeded defaults are tagged.
- Reminder the morning of check-in day (default 8:00am) and one follow-up that evening if not submitted (default 7:00pm), at the user's local time.
- Marked overdue 24 hours after the check-in opens (default Saturday 6:00am); overdue shows as a coach flag. AI review prep runs Saturday 10:00pm by default.

### F6. Habit tracking (paid)
Acceptance
- Coach assigns 1 to 3 habits per client from a library or as a custom habit.
- Seeded library: drink water, protein at every meal, vegetables twice a day, 7 plus hours of sleep, daily step goal, no late night snacking, plan tomorrow's food, eat slowly. Coach can add, edit, archive library habits.
- Daily yes or no check on Today. Shows current streak and weekly hit rate.

### F7. Weekly progress report (paid; blurred preview for free)
Story: as a client, I see proof I'm progressing even when the scale stalls.

Acceptance
- Generated when the coach sends the weekly reply.
- Single scroll: one headline sentence (AI_PROMPTS.md P4), coach note, then stat cards: weight trend change, adherence (days within calorie target range), protein days hit, habit hit rate, feel and performance trend, weighed share ("Weighed: X% of entries"); then the trend chart.
- Feel and performance uses tagged scale questions (F5). Untagged questions show only on the coach's review card.
- Free users see the same weighed share in the Progress weekly cards.
- Stored and browsable on Progress.

### F8. Messaging (paid)
Acceptance
- One thread per client with text and photos.
- Push notification to the client when the coach replies or sends the weekly feedback.
- Unread count on the coach roster.
- Messages that mention a medical condition are flagged to the coach (AI_PROMPTS.md P5).

### F9. Coach roster (coach)
Acceptance
- List of clients sorted by number of flags.
- Flags: logged fewer than 4 days in the last 7, check-in overdue, weight trend flat 3 weeks against goal, unread message, medical screening yes, targets not reviewed (F1).
- Filter: all, needs attention, paid, free. A user who downgrades or cancels shows as free.

### F10. Review queue and client detail (coach)
Story: as a coach, I review a client in 3 minutes or less on my phone.

Acceptance
- After the check-in window closes, the review queue opens: one card per paid client, flagged first.
- Each card: AI summary (3 lines), flags, key numbers for the week including weighed share, check-in answers and photos, suggested target or habit change, and a drafted reply (AI_PROMPTS.md P3).
- Coach can edit the draft, accept or ignore the suggestion, adjust targets and habits inline, and send. Send moves to the next card.
- Nothing is ever sent automatically.
- Tapping into a client opens full detail: daily logs, entries, habits, history of check-ins and replies.

### F11. Upgrade and billing
Acceptance
- One upgrade screen: what paid includes, price read from Stripe (F14), Stripe Checkout.
- Monthly subscription, cancel anytime from Me.
- Webhook updates paid status on success, failure, and cancel.
- Coach can comp any account or mark it externally billed.
- Coach is notified on every new upgrade.
- State disclosure acceptance is required on the upgrade screen before checkout opens (F16).
- Downgrade or cancel keeps all data and returns the user to the free experience. Past weekly reports and the message thread stay readable, read only. Habits, check-ins, photo logging and new messages lock. Targets keep the last coach-set values, and the user can now edit them.

### F12. Client invite (coach)
Acceptance
- Invite by email with paid flag set to comped or external.
- Invited client skips the upgrade screen.

### F13. AI review assist settings (coach)
Acceptance
- Coach can edit: voice and style notes, coaching focus instructions, phrases to use, phrases to avoid, and 10 to 20 example replies.
- Limits, each with a live counter: voice 600 characters, focus 600, phrases to use 400, phrases to avoid 400, example replies up to 20 at up to 1,200 characters each.
- These form the editable layer only. The locked layer (output schema, scope and safety rules) is not editable.
- Preview: run the edited prompt against a selected client's current week before saving.
- Every save creates a version. One tap rollback.
- Changes apply on the next review cycle with no deploy.

### F14. Coach settings (coach)
One screen for every configurable value:
- Product name (app config)
- Paid price. Stripe is the source of truth: saving a new price creates a new Stripe price and archives the old one. Existing subscribers keep their price.
- Check-in day and review day
- Check-in questions (add, edit, reorder, remove, report tag)
- Hand portion conversions. Defaults: palm 100 g cooked protein; fist 1 cup vegetables or fruit; cupped hand 1/2 cup cooked grains or starch (about 90 g); thumb 1 tbsp fats (oil 14 g, butter 14 g, nut butter 16 g)
- Habit library
- Target formula defaults (activity multipliers, goal adjustments, protein per lb by goal, protein cap); default values are in ARCHITECTURE.md "Target formula defaults"
- Weekly cycle times (check-in open time, overdue time, review prep time)
- AI settings (F13)
- Default reminder times

### F15. Metrics page (coach)
Acceptance
- North star and the three guardrails for the current week and beta to date.
- Weekly trend for each metric.
- Counts: total users, active this week (logged food on at least 1 day), paid, free, upgrades.
- Weighed share of all entries, weekly trend. Tracked only, not a gate.

### F16. Trust, privacy, compliance
Acceptance
- Signup: privacy policy, terms, and "general nutrition information, not medical advice" disclaimer accepted with timestamp.
- **Coach visibility:** the coach can see full data (food logs, weights, habits, check-ins, photos where applicable) for every user assigned to him, free and paid. Signup states this plainly before account creation ("Your coach can see what you log so he can help.") and the privacy policy matches. Consent recorded in `consents` as `coach_visibility`.
- State disclosure document accepted with timestamp **before Stripe checkout** (on the upgrade screen), and as a required onboarding step for invited paid clients who skip the upgrade screen. Contents: Sean is not a dietitian licensed by the state; the information or advice may be considered alternative care by licensed practitioners in state; Sean's qualifications (CSCS, CSPS, CF L3, NSCA CPT). Text editable in Coach settings.
- No protected titles anywhere (dietitian, nutritionist, L.D., L.D.N.). Use "nutrition coach." Exception: legal documents (disclosure, terms, privacy policy) may use these words where legally required, for example "not a dietitian licensed by the state."
- Self-serve account deletion. The privacy policy states exactly this:
  - Deleted: profile, nutrition profile, food entries and items, weights, favorites, habits, check-ins and their photos, messages and their photos, review items, reports, notification preferences, push subscriptions, and all storage objects.
  - Kept: analytics events with the user id removed.
  - Kept for 3 years, then purged: consent records with the user id removed and the email replaced by a one-way hash, so a disclosure acceptance can still be proven.
  - Stripe: any active subscription is canceled immediately. Stripe keeps its own customer and payment records; our subscription row is deleted.
- Users can delete any progress photo. Photos visible only to the user and their coach (private storage bucket, signed URLs).

### F17. Notifications
Acceptance
- Defaults: evening nudge at 7pm only on days with zero food logged; check-in reminder morning of check-in day plus one evening follow-up; coach reply received.
- No meal-time reminders.
- Users can change the time of each reminder or turn it off from Me.
- Coach gets: new upgrade, medical flag, client message.

## 8. Non-goals for v1

Meal plans, recipes, micronutrients, wearables and Apple Health sync, social features, native App Store apps, smart adaptive targets, progress photo comparison timeline, AI-drafted messages outside the weekly review, multiple coaches, workout delivery, billing migration, multi-factor authentication (sign in stays passwordless email OTP), exercise calorie add-back (activity is built into targets). Water tracking is post-MVP and stays a paid habit in the library, not a tracker.

## 9. Open items

See `docs/QUESTIONS.md`.
