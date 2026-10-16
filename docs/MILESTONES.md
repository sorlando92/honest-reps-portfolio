# Honest Reps Milestones v2 (MVP scope, PM 2026-10-15)

The M1 to M5 sequence is paused. The goal is now an MVP that Sean's current paid clients use daily in place of the Wodify Google Form. Post-MVP work follows before the gym beta.

Each MVP step ends with a demo to Sean on a real phone. Coach-configurable values (check-in day and questions, target formula defaults, hand portions, reminder times, product name) stay seeded in the database; until the Coach settings screen ships, Sean asks engineering to change them.

Every MVP step emits the PRD section 5 events for the features it ships.

## Done before the MVP

- **M0 Foundation** (signed off 2026-10-13): repo, Next.js, Tailwind tokens, Supabase with RLS and tests, email OTP (6-digit code and link), PWA shell, tab bars, `events` and `track()`, CI, Vercel at `app.honestreps.app`.
- **Logging so far:** P1 text parsing on Sonnet 5.5 (Q42), USDA matching, six curated chains, `ai_calls`, `food_entries` and items, confirmation card with one signal per row (Q34), Weigh it, g/oz stepper, draft kept on the device, Today timeline with raw input titles, local days in the profile timezone (Q43), `pnpm eval:parsing`.

## MVP

Build in this order: 1, then 3, then 2, then 4 to 6 (PM 2026-10-15: Sean tests the full daily experience before the accuracy gate). The accuracy gate (2) still blocks MVP exit.

### 1. Finish logging (F2 minus photo and offline)
- Offline in MVP (Q46): the draft stays on the phone, Log it waits until the phone is back online
- Manual entry (grams default for scale users) and "Add item" on the confirmation card
- Edit and delete any entry from the timeline
- Raw / Cooked / Dry toggle for meat, fish, grains and pasta, recalculating from the matching food
- Barcode with the log bar icon: Open Food Facts lookup, "Food data from Open Food Facts" attribution, fallback to search or manual entry
- Quick add chips (most frequent foods for the time of day, last weighed amount) and favorites; neither calls a model
- Today v2 (`docs/TODAY_SPEC.md`) part 1: meal sections replace the timeline, meal auto-assigned by local time, meal chip on the card and in edit, copy a meal. Includes the `food_entries` meal migration and backfill (approved by the PM before it runs on hosted)
- Events: `food_logged` for every method (with meal), `food_entry_corrected`, `food_entry_deleted`, `meal_copied`

### 2. Accuracy gate
- Local FDC import (QUESTIONS.md Q40): Foundation, SR Legacy and FNDDS in Postgres, searched locally
- More curated chains if holdout meal calories are still under 80%
- Engineering tells the PM when this is done; the PM supplies fresh holdout cases

Done when: the parsing eval meets every pass bar in `evals/README.md`, including holdout meal calories 80% or higher on the PM's fresh holdout cases.

### 3. Member basics (F1, F3, F4)
- Onboarding: goal, sex, date of birth with the 18+ gate, height, weight, optional goal weight, activity level, units, food scale question
- Targets from the seeded formula with the BMR floor and the protein cap
- Medical screening question; yes flags the coach
- Signup consents: terms, privacy, disclaimer, coach visibility
- Required install step and push permission; one Today banner 3 days after a dismissal, then never again; install and reminders in Me (Q62)
- Target editing in Me: free users edit their own with the BMR floor and a confirmation to go below it; paid clients read only. "Set your targets" on Today links to it
- Journal and Dashboard (`docs/SCREENS_V2.md` on top of `docs/TODAY_SPEC.md`): macro color tokens; Today as the landing screen with header arrows and Go to date, week strip with calorie rings (view and log past days, Q52 anchors), macro card (4 rings, Eaten and Left, week insight, mini bars, streak with earned moments), sticky compact header, meal cards with P, C, F, kcal chips, weight row and sheet, day notes, floating log bar
- Progress dashboard (`docs/PROGRESS_SPEC.md`): week chart with day tiles, week averages, 30 day consistency grids, weight trend with 7, 30, 90 day ranges, all from one `progress_summary` call on the daily aggregates shared with Today; components take a user id for reuse in the M5 client week view
- Demo data: `pnpm seed:demo` and `--remove`, `profiles.is_test`, test profiles excluded from metrics and roster counts
- Weight logging and the EWMA trend
- Events: `signup_started`, `signup_completed`, `onboarding_completed`, `pwa_installed`, `push_enabled`, `weight_logged`, `day_switched`, `streak_milestone`, `day_note_saved`, `macro_card_mode_changed`, `progress_viewed`, `progress_week_changed`, `weight_range_changed`

### 4. Client loop (F5, F12, F16 disclosure)
- Coach invite by email with the paid flag set to comped or external; the invited client skips any upgrade step
- State disclosure accepted during invited client onboarding
- Weekly check-in on the seeded schedule with the seeded questions: weight, up to 3 progress photos, then the questions. Overdue after the seeded window.
- Check-in reminder push (morning of check-in day, one evening follow-up) at the user's local time
- Coach reply to each check-in; push to the client; the client reads the reply in the app
- Events: `checkin_started`, `checkin_submitted`, `message_sent` (coach reply)

### 5. Coach view (F9 subset, F10 subset)
- Roster sorted by flags: logged under 4 of the last 7 days, check-in overdue, medical flag, unread reply
- Client week view: daily totals against targets, entries, weight trend, day notes, check-in answers and photos
- Reply composer on the check-in
- Target edit for each client (calories, protein, carbs, fat) with the BMR floor and a coach override confirmation, saved with `set_by = coach` (Q45)
- Events: `review_card_opened`, `review_reply_sent` (server only)

### 6. Trust (F16)
- Privacy policy and terms templates for Sean's approval; the privacy policy states the Q16 deletion terms exactly
- Self-serve account deletion per Q16
- Error monitoring (PM 2026-10-16): Sentry free tier for client and server errors, tagged with the release, source maps uploaded at build. Payloads carry the user id only: no email, no food, weight, health or note data. Sean gets an email alert on each new error type.
- Logs kept at least 7 days before alpha: Vercel Pro (already required before clients, Q6) or a log drain

**MVP exit:** Sean plus at least 3 clients log food for 7 days, each completes one check-in, and Sean reviews all of them in the app with no Google Form.

## Post-MVP (before the gym beta)

- AI review prep (P3) and drafted replies, review queue
- Coach settings screen, including AI settings (F13, F14)
- Habits (F6)
- Weekly progress report with P4 headline (F7)
- Messaging thread with P5 safety screen (F8)
- Photo logging with P2, with the log bar camera icon locked for free users
- Offline queue and sync, pending entries
- No-scale hand portion picker
- Stripe upgrade, billing, downgrade behavior and locked states (F11)
- Metrics page (F15)
- Evening nudge and reminder preferences in Me (F17)
- Accessibility audit (axe plus manual VoiceOver), performance pass, copy review
- `evals/review.jsonl` graded by Sean; parsing eval grown to 50 cases

## Gym beta (6 weeks)

Open free tracking to all gym members. Measure the north star at week 6.
