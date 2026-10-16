# Honest Reps Architecture v1

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js App Router, TypeScript strict | Installable PWA (manifest, service worker) |
| UI | Tailwind CSS, shadcn/ui, Lucide | Theme from DESIGN_SYSTEM.md tokens as CSS variables |
| Data | Supabase Postgres | RLS on every table |
| Auth | Supabase email OTP with a 6-digit code and a link in the same email | Roles: member, coach. "Client" is UI language for a member with tier paid, never a stored role. Coach reads all data for users assigned to him (free and paid). No MFA in v1. |
| Files | Supabase Storage | Private buckets, signed URLs |
| Jobs | Supabase pg_cron + Edge Functions | Runs every 15 minutes. Reminders fire at each user's local time; the check-in window and review prep run on the coach's timezone. Not Vercel cron. |
| Push | Web Push (VAPID) | iOS requires home screen install |
| Offline | Service worker + IndexedDB queue | Sync on reconnect |
| AI | Anthropic API | Model ID in env `ANTHROPIC_MODEL`; prompts in `lib/ai/`; every call logged to `ai_calls` |
| Food data | USDA FoodData Central (Foundation 2026-04-30, SR Legacy 2018-04 and FNDDS 2024-10-31 imported into `fdc_foods` and searched locally), Open Food Facts for barcodes | QUESTIONS.md Q40. `scripts/import-fdc.mts` loads the CSV releases; `search_fdc()` returns full text candidates that the matcher re-ranks. The FDC API is used only for branded foods. Matched foods are kept in `food_items`. |
| Billing | Stripe Checkout + Billing + webhooks | Stripe is the source of truth for price. `coach_settings` stores only `stripe_price_id`; the display amount is read from Stripe and cached. |
| Analytics | `events` table (first party) | Product analytics only; feeds the metrics page. LLM call logs go to `ai_calls`. A database check limits names to the PRD list. Server-only events are written with the service role. Events before sign in are rate limited per IP (hashed, never stored raw). |
| Hosting | Vercel (paid plan before any real users; the free plan does not allow commercial use) | Preview deploy per PR. Production at `app.honestreps.app` (see Domains and email). |
| Email | Resend as Supabase Auth SMTP | Sender `auth@mail.honestreps.app`, name "Honest Reps". Required: Supabase only allows custom email templates with custom SMTP. |

## Domains and email

- Domain: `honestreps.app`, registered on Cloudflare Registrar; DNS on Cloudflare.
- App: `app.honestreps.app` on Vercel. The root `honestreps.app` redirects to it for now.
- Email: sending domain `mail.honestreps.app`, verified in Resend (DKIM and SPF records in Cloudflare DNS). Sender `auth@mail.honestreps.app`, sender name "Honest Reps". Supabase Auth uses Resend over SMTP.
- `.app` is on the HSTS preload list, so every URL must be HTTPS, including previews and redirects. Vercel issues the TLS certificates.
- Supabase Auth Site URL is `https://app.honestreps.app`; Vercel preview URLs are added to the allowed redirect URLs.
- Hosted auth settings are kept in code, not set by hand: a script uses the Supabase Management API to apply and verify the sign in email templates (from `supabase/templates/`), OTP length 6, OTP expiry 3600 seconds, Site URL, redirect URLs and the SMTP sender fields. Its verify-only mode runs before each release and fails on any drift. The Supabase personal access token lives in the gitignored `.env.hosted`, never in the repo.

## Module boundaries

```
/core       users, coach relationships, check-ins, habits, messaging, reports,
            notifications, billing, settings, events, compliance
/modules
  /nutrition  targets, food entries, parsing, food items, weight
  /workouts   (future)
```

Core never imports from a module. Modules register: their check-in metrics, their report stat cards, their review summary inputs, and their roster flags through a small registry in `core/modules.ts`. This is what lets workouts plug in later without touching core.

## Data model (initial)

Core
- `profiles` (id, role: member|coach, coach_id, display_name, units, timezone, tier: free|paid, billing_source: stripe|comped|external, medical_flag, date_of_birth, is_test, created_at). `is_test` marks demo accounts (`pnpm seed:demo`); test profiles are excluded from metrics, the north star and roster flag counts. Date of birth lives in core because the 18+ age gate is core; all other onboarding body data is in `nutrition_profiles`.
- `app_config` (key, value jsonb) — product name, consent versions, adherence thresholds, weight trend smoothing, default coach
- `coach_settings` (coach_id, stripe_price_id, checkin_day, review_day, weekly_cycle jsonb, target_defaults jsonb, reminder_defaults jsonb, disclosure_text, ai_editable_layer_version_id)
- `ai_prompt_versions` (id, coach_id, voice, focus, phrases_use, phrases_avoid, examples jsonb, created_at). Limits enforced in the database and the form: voice and focus 600 characters each, each phrases field 400, up to 20 examples of up to 1,200 characters.
- `checkin_questions` (id, coach_id, position, type: scale|text|number, prompt, report_tag: energy|sleep|hunger|performance|null, active)
- `checkins` (id, user_id, week_start, submitted_at, weight, answers jsonb, on_time)
- `checkin_photos` (id, checkin_id, storage_path)
- `habit_library` (id, coach_id, name, archived)
- `habit_assignments` (id, user_id, habit_id or custom_name, active_from, active_to)
- `habit_logs` (id, assignment_id, date, done)
- `messages` (id, thread_user_id, sender_id, body, photo_path, flagged_medical, read_at)
- `review_items` (id, user_id, week_start, ai_summary, ai_flags jsonb, ai_suggestion jsonb, ai_draft, final_reply, opened_at, sent_at, prompt_version_id)
- `reports` (id, user_id, week_start, headline, stats jsonb, coach_note)
- `notification_prefs` (user_id, kind, enabled, local_time)
- `push_subscriptions` (user_id, endpoint, keys)
- `subscriptions` (user_id, stripe_customer_id, stripe_subscription_id, status)
- `consents` (user_id, kind: terms|privacy|disclaimer|coach_visibility|mo_disclosure, version, accepted_at, email_hash). On account deletion `user_id` is set to null and `email_hash` is filled; rows are purged 3 years after deletion.
- `day_notes` (user_id, local_date, body, updated_at; unique on user_id plus local_date) — one note per local day on Today (docs/SCREENS_V2.md). Owner reads and writes; the assigned coach reads only.
- `events` (id, user_id, name, props jsonb, created_at) — product analytics only (PRD section 5). `user_id` is set to null on account deletion.
- `ai_calls` (id, user_id, prompt_id: P1..P5, prompt_version, editable_layer_version_id, model, latency_ms, input_tokens, output_tokens, outcome: ok|retried|fallback|error, validation: passed|failed_then_passed|failed, error, input, output jsonb, created_at) — one row per LLM call. `input` and `output` are the audit trail a saved food entry copies, so the browser never supplies them. Readable by the coach and the server only. Created in M1 with the first LLM call.

Nutrition module
- `nutrition_profiles` (user_id, goal: lose_fat|maintain|build_muscle|performance, sex, height_cm, activity_level, goal_weight_kg, has_scale, updated_at) — onboarding body data. Current weight comes from `weights`.
- `targets` (user_id, calories, protein_g, carbs_g, fat_g, set_by: formula|user|coach, effective_from). The coach confirming targets saves the current values as a new row with `set_by = coach`. A paid user whose latest row is not `set_by = coach` raises the "targets not reviewed" flag.
- `food_items` (id, source: usda|off|custom, source_id, name, brand, data_type, state, serving jsonb, per_100g jsonb, barcode, source_url, verified_on). Curated chain menu items (QUESTIONS.md Q36) are `source = custom` with the chain in `brand`, the published nutrition page in `source_url` and the date it was read in `verified_on`. Signed in users read; only the server writes.
- `nutrition_coach_settings` (coach_id, hand_portions jsonb, updated_at) — nutrition module settings edited on the Coach settings screen (QUESTIONS.md Q33). Same RLS as `coach_settings`.
- `food_entries` (id, user_id, logged_at, meal: breakfast|lunch|dinner|snack (not null, assigned from the local time by the app_config meal windows, user changeable), title, method, raw_input, raw_photo_path, model_output jsonb, confidence, status: final|pending, client_uuid for offline dedupe, ai_call_id, copied_from_entry_id). Users may change only `logged_at`, `meal` and `status`; the audit columns are written once. Entry states per PRD F2: a draft (unconfirmed card) is never saved here, it lives on the device; a flagged entry is a `final` entry with one or more items where `flagged` is true; `pending` is captured offline and not yet parsed.
- `food_entry_items` (id, entry_id, food_item_id, name, amount, unit, grams, amount_source: weighed|label|measured|hand|estimated, state: raw|cooked|dry|null, calories, protein_g, carbs_g, fat_g, flagged, flag_reason: match|amount|null, user_id, position). `flag_reason` picks the card signal (QUESTIONS.md Q34).
- `favorites` (user_id, food_item_id or entry template)
- `weights` (user_id, date, weight_kg)

Store everything in metric; convert at the edge.

**Local days.** Instants are stored as `timestamptz` (UTC). Every displayed time and every day boundary (Today, daily totals, adherence, logging-day counts, the north star, evening nudge, reminders) uses the user's `profiles.timezone`; the weekly cycle uses the coach's. In TypeScript, go through `core/time/local-day.ts` (`localDate`, `localToday`, `dayBounds`), which handles 23 and 25 hour days. In SQL and jobs, use `(logged_at at time zone p.timezone)::date`. Never use the server's or the browser's zone. The app keeps `profiles.timezone` on the device's timezone (QUESTIONS.md Q43).

## Key flows

**Text logging:** client → `/api/parse` → P1 extraction → match each item to `food_items` (cache first, then USDA search) → compute macros → return draft card → user confirms → save entry and items. Weighed items keep the exact stated grams. Hand items convert to grams with the coach's hand portion conversions (`nutrition_coach_settings`). Items whose brand is a curated chain match that chain's curated items; other chains fall back to a generic match marked estimated. Quick add and favorites log stored items directly and never call a model. Meat, fish, grains and pasta with no stated state match the cooked entry and expose the toggle.

**Photo logging (paid):** upload to private bucket → P2 vision extraction → same matching path.

**Offline:** entries created with a client UUID in IndexedDB; sync runs when the app opens, returns to the foreground, or comes back online (plus Background Sync where supported; iOS has none); server dedupes on `client_uuid`. Text and photo inputs stay `pending` until parsed, then parse and save automatically; low-confidence items become flagged, and the user is notified only if something was flagged. Unconfirmed confirmation cards (drafts) are kept on the device and resurfaced when the app reopens.

**Weekly cycle (cron).** Check-in times use the coach's timezone; reminders go out at each user's local time. Defaults, all editable in Coach settings (`coach_settings.checkin_day`, `review_day`, `weekly_cycle`, `reminder_defaults`):
1. Friday 6:00am: check-in opens.
2. Friday 8:00am user local time: check-in reminder.
3. Friday 7:00pm user local time: follow-up reminder to non-submitters.
4. Saturday 6:00am: still unsubmitted check-ins are marked overdue and raise a coach flag. Submission stays open until review day, with `on_time = false`.
5. Saturday 10:00pm: for each paid client build the week summary, run P3, write `review_items`.
6. Sunday (review day): the review queue is open for the coach.
7. On send: save final reply, generate P4 headline, create `reports` row, push notify client.

**Account deletion (PRD F16):** cancel any active Stripe subscription immediately → fill `consents.email_hash` and null their `user_id` → delete all storage objects → delete the auth user, which cascades every user-owned row; `events.user_id` is set to null. A daily job purges consents 3 years after deletion.

**Downgrade or cancel (PRD F11):** the Stripe webhook sets `tier = free`. No data is deleted. Paid features lock in RLS and UI; past reports and the message thread stay readable but read only; the latest coach-set target stays and becomes user-editable.

**Price change (PRD F14):** saving a new price creates a new Stripe price, archives the old one, and stores the new `stripe_price_id`. Existing subscriptions keep their old price.

**Daily aggregates and Progress:** per local day totals (calories, protein, carbs, fat, logged), the target in effect on that date, adherent and protein_hit come from one shared nutrition aggregate used by both Today and Progress (and the coach client week view in M5). `progress_summary(user_id, week_start, weight_range)` returns everything the Progress screen needs in one server call: the week by day, week averages including weighed share, the last 30 days (logged, adherent, weighed), and the weight series (raw weigh-ins, EWMA trend, goal weight). The owner reads their own summary; the assigned coach reads the same summary. Progress components take a user id so the coach view reuses them. Spec: `docs/PROGRESS_SPEC.md`.

**Demo data:** `pnpm seed:demo` creates the test member `demo@example.test` (assigned to the coach, `is_test = true`) with 35 days of data; `pnpm seed:demo --remove` deletes the account and all its rows. Approved to run against hosted.

**Metrics:** north star = users who completed onboarding (`onboarding_completed`) and logged food on 4 or more days in the measured week, divided by all users who completed onboarding. Active this week = logged food on at least 1 day. All metrics exclude profiles with `is_test = true`.

**Adherence definition:** a day counts as adherent when calories are within ±10% of target and food was logged. Protein day hit when protein ≥ 90% of target. Both thresholds in `app_config`.

**Target formula defaults** (seeded into `coach_settings.target_defaults`, editable in Coach settings):
- Calories: Mifflin St Jeor BMR × activity multiplier (sedentary 1.2, light 1.375, moderate 1.55, very active 1.725, extra active 1.9), then goal adjustment (lose fat −20%, maintain 0%, build muscle +10%, performance +5%). Floor: never below estimated BMR.
- Protein: grams per lb of goal weight, current weight if none (lose fat 1.0, maintain 0.8, build muscle 1.0, performance 0.9), capped at 220 g.
- Fat: 30% of calories (lose fat, maintain) or 25% (build muscle, performance), floor 0.3 g per lb of goal weight. Carbs fill the remainder, minimum 50 g; fat gives way toward its floor first, then calories rise to fit and `targets.note` tells the coach (Q54). Keys: `fat_pct_of_calories`, `fat_min_g_per_lb_goal_weight`, `carbs_min_g`.
- Weight trend: EWMA with alpha 0.1 (`app_config.weight_trend`).

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `USDA_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APP_URL`, `COACH_EMAIL` (the account `pnpm db:seed` makes the coach).

## Testing

- Vitest for units, including target math, trend smoothing, adherence, and flag rules.
- RLS tests for every table using two users and the coach.
- Playwright e2e at 375px: onboarding, text log, barcode fallback, offline log and sync, check-in, review send, upgrade with Stripe test mode.
- AI calls mocked in tests with recorded fixtures; a separate `pnpm eval:parsing` runs the parsing eval set in `evals/parsing.jsonl`.
