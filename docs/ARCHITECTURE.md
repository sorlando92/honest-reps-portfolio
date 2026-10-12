# Honest Reps Architecture v1

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js App Router, TypeScript strict | Installable PWA (manifest, service worker) |
| UI | Tailwind CSS, shadcn/ui, Lucide | Theme from DESIGN_SYSTEM.md tokens as CSS variables |
| Data | Supabase Postgres | RLS on every table |
| Auth | Supabase email OTP with a 6-digit code and a link in the same email | Roles: member, client, coach. Coach reads all data for users assigned to him (free and paid). No MFA in v1. |
| Files | Supabase Storage | Private buckets, signed URLs |
| Jobs | Supabase pg_cron + Edge Functions | Runs every 15 minutes. Reminders fire at each user's local time; the check-in window and review prep run on the coach's timezone. Not Vercel cron. |
| Push | Web Push (VAPID) | iOS requires home screen install |
| Offline | Service worker + IndexedDB queue | Sync on reconnect |
| AI | Anthropic API | Model ID in env `ANTHROPIC_MODEL`; prompts in `lib/ai/`; every call logged to `ai_calls` |
| Food data | USDA FoodData Central, Open Food Facts | Cache lookups in `food_items` |
| Billing | Stripe Checkout + Billing + webhooks | Price ID from coach settings |
| Analytics | `events` table (first party) | Product analytics only; feeds the metrics page. LLM call logs go to `ai_calls`. |
| Hosting | Vercel (paid plan before any real users; the free plan does not allow commercial use) | Preview deploy per PR. Production at `app.honestreps.app` (see Domains and email). |
| Email | Resend as Supabase Auth SMTP | Sender `auth@mail.honestreps.app`, name "Honest Reps". Required: Supabase only allows custom email templates with custom SMTP. |

## Domains and email

- Domain: `honestreps.app`, registered on Cloudflare Registrar; DNS on Cloudflare.
- App: `app.honestreps.app` on Vercel. The root `honestreps.app` redirects to it for now.
- Email: sending domain `mail.honestreps.app`, verified in Resend (DKIM and SPF records in Cloudflare DNS). Sender `auth@mail.honestreps.app`, sender name "Honest Reps". Supabase Auth uses Resend over SMTP.
- `.app` is on the HSTS preload list, so every URL must be HTTPS, including previews and redirects. Vercel issues the TLS certificates.
- Supabase Auth Site URL is `https://app.honestreps.app`; Vercel preview URLs are added to the allowed redirect URLs.

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
- `profiles` (id, role, coach_id, display_name, units, timezone, tier: free|paid, billing_source: stripe|comped|external, medical_flag, date_of_birth, created_at). Date of birth lives in core because the 18+ age gate is core; all other onboarding body data is in `nutrition_profiles`.
- `app_config` (key, value jsonb) — product name, consent versions, adherence thresholds, weight trend smoothing, default coach
- `coach_settings` (coach_id, price_cents, stripe_price_id, checkin_day, review_day, weekly_cycle jsonb, target_defaults jsonb, reminder_defaults jsonb, disclosure_text, ai_editable_layer_version_id)
- `ai_prompt_versions` (id, coach_id, voice, focus, phrases_use, phrases_avoid, examples jsonb, created_at)
- `checkin_questions` (id, coach_id, position, type: scale|text|number, prompt, active)
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
- `consents` (user_id, kind: terms|privacy|disclaimer|coach_visibility|mo_disclosure, version, accepted_at)
- `events` (id, user_id, name, props jsonb, created_at) — product analytics only (PRD section 5)
- `ai_calls` (id, user_id, prompt_id: P1..P5, prompt_version, editable_layer_version_id, model, latency_ms, input_tokens, output_tokens, outcome: ok|retried|fallback|error, validation: passed|failed_then_passed|failed, error, created_at) — one row per LLM call. Readable by the coach and the server only. Created in M1 with the first LLM call.

Nutrition module
- `nutrition_profiles` (user_id, goal: lose_fat|maintain|build_muscle|performance, sex, height_cm, activity_level, goal_weight_kg, updated_at) — onboarding body data. Current weight comes from `weights`.
- `targets` (user_id, calories, protein_g, carbs_g, fat_g, set_by: formula|user|coach, effective_from)
- `food_items` (id, source: usda|off|custom, source_id, name, brand, serving jsonb, per_100g jsonb, barcode)
- `food_entries` (id, user_id, logged_at, meal_tag, method, raw_input, raw_photo_path, model_output jsonb, confidence, status: final|pending, client_uuid for offline dedupe). Entry states per PRD F2: a draft (unconfirmed card) is never saved here, it lives on the device; a flagged entry is a `final` entry with one or more items where `flagged` is true; `pending` is captured offline and not yet parsed.
- `food_entry_items` (id, entry_id, food_item_id, name, amount, unit, grams, calories, protein_g, carbs_g, fat_g, flagged)
- `favorites` (user_id, food_item_id or entry template)
- `weights` (user_id, date, weight_kg)

Store everything in metric; convert at the edge.

## Key flows

**Text logging:** client → `/api/parse` → P1 extraction → match each item to `food_items` (cache first, then USDA search) → compute macros → return draft card → user confirms → save entry and items.

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

**Adherence definition:** a day counts as adherent when calories are within ±10% of target and food was logged. Protein day hit when protein ≥ 90% of target. Both thresholds in `app_config`.

**Target formula defaults** (seeded into `coach_settings.target_defaults`, editable in Coach settings):
- Calories: Mifflin St Jeor BMR × activity multiplier (sedentary 1.2, light 1.375, moderate 1.55, very active 1.725, extra active 1.9), then goal adjustment (lose fat −20%, maintain 0%, build muscle +10%, performance +5%). Floor: never below estimated BMR.
- Protein: grams per lb of goal weight, current weight if none (lose fat 1.0, maintain 0.8, build muscle 1.0, performance 0.9), capped at 220 g.
- Fat and carbs fill the remainder.
- Weight trend: EWMA with alpha 0.1 (`app_config.weight_trend`).

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `USDA_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `APP_URL`, `COACH_EMAIL` (the account `pnpm db:seed` makes the coach).

## Testing

- Vitest for units, including target math, trend smoothing, adherence, and flag rules.
- RLS tests for every table using two users and the coach.
- Playwright e2e at 375px: onboarding, text log, barcode fallback, offline log and sync, check-in, review send, upgrade with Stripe test mode.
- AI calls mocked in tests with recorded fixtures; a separate `pnpm eval:parsing` runs the parsing eval set in `evals/parsing.jsonl`.
