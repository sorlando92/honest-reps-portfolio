# Honest Reps Architecture v1

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js App Router, TypeScript strict | Installable PWA (manifest, service worker) |
| UI | Tailwind CSS, shadcn/ui, Lucide | Theme from DESIGN_SYSTEM.md tokens as CSS variables |
| Data | Supabase Postgres | RLS on every table |
| Auth | Supabase Auth: email OTP with a 6-digit code and a link in the same email; Google OAuth post-MVP (`docs/AUTH_SPEC.md`, paused 2026-10-18) | No passwords. Automatic identity linking on the same verified email stays on. Roles: member, coach. "Client" is UI language for a member with tier paid, never a stored role. Coach reads all data for users assigned to him (free and paid). No MFA in v1. |
| Files | Supabase Storage | Private buckets, signed URLs |
| Jobs | Supabase pg_cron + Edge Functions | Runs every 15 minutes. Reminders fire at each user's local time; the check-in window and review prep run on the coach's timezone. Not Vercel cron. |
| Push | Web Push (VAPID) | iOS requires home screen install |
| Offline | Service worker + IndexedDB queue | Sync on reconnect |
| AI | Anthropic API | Model ID in env `ANTHROPIC_MODEL`; prompts in `lib/ai/`; every call logged to `ai_calls` |
| Food data | USDA FoodData Central (Foundation 2026-04-30, SR Legacy 2018-04, FNDDS 2024-10-31 and Branded Foods 2026-04-30 imported into `fdc_foods` and `fdc_branded` and searched locally), Open Food Facts for barcodes not in FDC | QUESTIONS.md Q40, `docs/FOOD_LOOKUP_SPEC.md`. `scripts/import-fdc.mts` loads the CSV releases; `.github/workflows/fdc-refresh.yml` runs `scripts/fdc-refresh.mts` on the 2nd of each month, imports any newer release and records rows added, changed and removed in `fdc_import_runs`. `search_fdc()` and `search_fdc_branded()` return full text candidates for P1 matching (branded also includes cached Open Food Facts products of the brand); `search_food_index()` serves search as you type. Matched and picked foods are kept in `food_items`. |
| Billing | Stripe Checkout + Billing + webhooks | Stripe is the source of truth for price. `coach_settings` stores only `stripe_price_id`; the display amount is read from Stripe and cached. |
| Analytics | `events` table (first party) | Product analytics only; feeds the metrics page. LLM call logs go to `ai_calls`. A database check limits names to the PRD list. Server-only events are written with the service role. Events before sign in are rate limited per IP (hashed, never stored raw). |
| Hosting | Vercel (paid plan before any real users; the free plan does not allow commercial use) | Preview deploy per PR. Production at `app.honestreps.app` (see Domains and email). |
| Monitoring | Sentry free tier (`@sentry/nextjs`) | Client, server and edge errors only: no tracing, no Session Replay. Release from the Vercel commit; source maps uploaded and removed from the build when `SENTRY_AUTH_TOKEN` is set. `lib/monitoring/scrub.ts` keeps the user id only and drops request bodies, headers, cookies, query strings, console and UI breadcrumbs, and Postgres row values. Off without a DSN (local, CI). |
| Backups | Weekly GitHub Action (`.github/workflows/backup.yml`) | Supabase Free keeps none. See "Backups and restore". |
| Email | Resend as Supabase Auth SMTP | Sender `auth@mail.honestreps.app`, name "Honest Reps". Required: Supabase only allows custom email templates with custom SMTP. |

## Domains and email

- Domain: `honestreps.app`, registered on Cloudflare Registrar; DNS on Cloudflare.
- App: `app.honestreps.app` on Vercel. The root `honestreps.app` redirects to it for now.
- Email: sending domain `mail.honestreps.app`, verified in Resend (DKIM and SPF records in Cloudflare DNS). Sender `auth@mail.honestreps.app`, sender name "Honest Reps". Supabase Auth uses Resend over SMTP.
- `.app` is on the HSTS preload list, so every URL must be HTTPS, including previews and redirects. Vercel issues the TLS certificates.
- Supabase Auth Site URL is `https://app.honestreps.app`; Vercel preview URLs are added to the allowed redirect URLs.
- Google sign in: Google Cloud project "Honest Reps", OAuth consent screen External with scopes openid, email and profile only, and one OAuth client (Web application) with JavaScript origin `https://app.honestreps.app` and redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Supabase does the Google code exchange; the client ID and secret live only in Supabase (Authentication, Providers, Google), never in Vercel or the repo. Supabase then returns to the app at `/auth/callback` (PKCE), which must be in the redirect URLs: `https://app.honestreps.app/auth/callback` for production; previews and local are covered by their wildcards. Local Supabase can read a client from `[auth.external.google]` with env values in `supabase/.env` (gitignored), redirect `http://127.0.0.1:54321/auth/v1/callback`. CI and e2e never call Google; the provider is stubbed.
- Custom auth domain (Sean decides, AUTH_SPEC): `auth.honestreps.app` (Supabase Pro add-on, about $10 a month) makes Google's consent screen name honestreps.app instead of the supabase.co host. If adopted, the Google redirect URI changes to `https://auth.honestreps.app/auth/v1/callback` and `NEXT_PUBLIC_SUPABASE_URL` to `https://auth.honestreps.app`. Ships with the default host.
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
- `invites` (id, coach_id, email, billing_source: comped|external, token_hash unique, expires_at, claimed_by, claimed_at, revoked_at, created_at) — coach invites (PRD F12, AUTH_SPEC). Only a SHA-256 hash of the token is stored; the raw token exists only in the link. Expires 14 days after creation or on use. The coach reads and creates their own invites and reads the claimer's sign in email; members cannot read the table. Claiming goes through the server: `claim_invite(token)` (security definer, `private` schema) checks the hash, expiry and use, then sets the claimer's `coach_id`, `tier = paid` and `billing_source` and marks the invite claimed, in one transaction.
- `consents` (user_id, kind: terms|privacy|disclaimer|coach_visibility|mo_disclosure, version, accepted_at, email_hash). On account deletion `user_id` is set to null and `email_hash` is filled; rows are purged 3 years after deletion.
- `day_notes` (user_id, local_date, body, updated_at; unique on user_id plus local_date) — one note per local day on Today (docs/SCREENS_V2.md). Owner reads and writes; the assigned coach reads only.
- `events` (id, user_id, name, props jsonb, created_at) — product analytics only (PRD section 5). `user_id` is set to null on account deletion.
- `ai_calls` (id, user_id, prompt_id: P1..P5, prompt_version, editable_layer_version_id, model, latency_ms, input_tokens, output_tokens, outcome: ok|retried|fallback|error, validation: passed|failed_then_passed|failed, error, input, output jsonb, created_at) — one row per LLM call. `input` and `output` are the audit trail a saved food entry copies, so the browser never supplies them. Readable by the coach and the server only. Created in M1 with the first LLM call.

Nutrition module
- `nutrition_profiles` (user_id, goal: lose_fat|maintain|build_muscle|performance, sex, height_cm, activity_level, goal_weight_kg, has_scale, updated_at) — onboarding body data. Current weight comes from `weights`.
- `targets` (user_id, calories, protein_g, carbs_g, fat_g, set_by: formula|user|coach, effective_from). The coach confirming targets saves the current values as a new row with `set_by = coach`. A paid user whose latest row is not `set_by = coach` raises the "targets not reviewed" flag.
- `fdc_foods` (fdc_id, data_type: Foundation|SR Legacy|Survey (FNDDS), description, per_100g jsonb, portions jsonb, release, search) — the local generic FDC copy (Q40), used by P1 matching (`search_fdc()`) and food search. Signed in users read; only the import writes.
- `fdc_branded` (fdc_id, gtin unique, description, brand_owner, brand_name, serving_size, serving_unit: g|ml, household_serving, per_100g jsonb, category, release, name_search) — FDC Branded Foods, one row per canonical GTIN-14, the latest available version, discontinued products and products without calories left out (435,490 products in the 2026-04-30 release, 213 MB with indexes). `name_search` covers brand, owner and description. Same access as `fdc_foods`.
- `food_staples` (term, fdc_id) — the plain Foundation or SR Legacy item for everyday generic searches ("egg" is a whole raw egg), ranked first in Basic foods. Reference data reviewed by the PM; signed in users read.
- `fdc_import_runs` (dataset, release, imported, added, changed, removed, total, trigger: schedule|manual, ran_at) — one row per dataset per refresh. The import writes; the coach reads.
- `food_words` (word, n) — every word in the index with how many foods use it, rebuilt by `refresh_food_words()` after each import; search swaps a misspelled word for its closest common neighbors when nothing matches ("ascnet protien").
- `food_items` (id, source: usda|off|custom|user, source_id, owner_id, name, brand, data_type, state, serving jsonb, per_100g jsonb, barcode, source_url, verified_on, log_count). Curated chain menu items (QUESTIONS.md Q36) are `source = custom` with the chain in `brand`, the published nutrition page in `source_url` and the date it was read in `verified_on`. User custom foods (FOOD_LOOKUP_SPEC 4) are `source = user` with `owner_id` set: the owner reads, writes and deletes them, the assigned coach reads them, nobody else sees them. Every other row is shared: signed in users read, only the server writes. `barcode` is always the canonical GTIN-14. `log_count` counts logged items across non-test users (gym-wide popularity), kept by a trigger.
- `barcode_matches` (user_id, gtin, food_item_id, created_at; key user_id plus gtin) — the food a user picked after "Not this", returned first on their next scan. Owner reads and writes; the coach reads.
- `barcode_scans` (id, user_id, raw_read, gtin, result: hit|miss, source: user|cache|fdc|off|null, food_item_id, outcome: confirmed|not_this|null, chosen_food_item_id, reads_to_confirm, ms_to_result, created_at) — the scan log behind the coach "Food lookups" list and the barcode test set. The server writes the lookup; the owner sets the outcome through the API. Owner and assigned coach read.
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

**Food search (FOOD_LOOKUP_SPEC 1, 2):** the log bar sends `GET /api/foods/search?q=` 150 ms after the last keystroke (earlier requests aborted). `search_food_index(q)` runs as the user (RLS applies) over the user's custom foods and history, favorites, curated chain items, cached Open Food Facts products, `fdc_branded` and `fdc_foods`, with prefix full text candidates (and `food_words` typo correction when nothing matches), and returns sections mine, brands and basic, scored by history and favorites, brand plus product token match, completeness, `log_count` and similarity. A tapped FDC row is copied into `food_items` (`POST /api/foods/pick`) so the saved item references it; search itself never writes.

**GTIN normalization:** `modules/nutrition/foods/gtin.ts`. A read is accepted only if its check digit is valid (UPC-E is checked after expansion). UPC-E expands to UPC-A; every form is left padded to 14 digits and stored that way. Lookups query the canonical value; Open Food Facts is asked for the 13 digit form (and the 8 digit form for EAN-8). FDC `gtinUpc` values are normalized on import.

**Barcode lookup (FOOD_LOOKUP_SPEC 3):** the scanner (BarcodeDetector, else ZXing in a web worker) waits for two identical valid reads → `GET /api/foods/barcode/{code}` → the user's `barcode_matches` and custom foods → `food_items` by GTIN → `fdc_foods` Branded by GTIN → Open Food Facts → miss. Every hit is cached in `food_items` with its source and fetch date, and every lookup writes a `barcode_scans` row. Log it and Not this set the scan's outcome; a barcode entry stores the GTIN as `raw_input` and the scan's source as `model_output`.

**Label scan (free):** photo resized on the phone → `POST /api/foods/label` → P2 label mode → the custom food form, prefilled → `POST /api/foods/custom` saves a `source = user` food on the GTIN.

**Offline:** entries created with a client UUID in IndexedDB; sync runs when the app opens, returns to the foreground, or comes back online (plus Background Sync where supported; iOS has none); server dedupes on `client_uuid`. Text and photo inputs stay `pending` until parsed, then parse and save automatically; low-confidence items become flagged, and the user is notified only if something was flagged. Unconfirmed confirmation cards (drafts) are kept on the device and resurfaced when the app reopens.

**Weekly cycle (cron).** Check-in times use the coach's timezone; reminders go out at each user's local time. Defaults, all editable in Coach settings (`coach_settings.checkin_day`, `review_day`, `weekly_cycle`, `reminder_defaults`):
1. Friday 6:00am: check-in opens.
2. Friday 8:00am user local time: check-in reminder.
3. Friday 7:00pm user local time: follow-up reminder to non-submitters.
4. Saturday 6:00am: still unsubmitted check-ins are marked overdue and raise a coach flag. Submission stays open until review day, with `on_time = false`.
5. Saturday 10:00pm: for each paid client build the week summary, run P3, write `review_items`.
6. Sunday (review day): the review queue is open for the coach.
7. On send: save final reply, generate P4 headline, create `reports` row, push notify client.

**Sign in (AUTH_SPEC):** Continue with Google calls `signInWithOAuth` (provider google, PKCE, `redirectTo` `/auth/callback`), hidden when the page runs as an installed iPhone app (`navigator.standalone` or `display-mode: standalone` on iOS). Continue with email sends the OTP email as before; the link lands on `/auth/confirm` and the typed code is verified on the server. All three paths end in one server step that records `sign_in_completed` (and `signup_completed` the first time, Q71) with the method, claims a pending invite, and redirects to onboarding or Today. A canceled consent or provider error returns to `/sign-in?error=canceled|provider` and records `auth_error` (service role; no user id). A `before_user_created` auth hook refuses a Google sign-up whose email is not verified, and the sign in screen asks for the email code instead. Google identity data and user metadata are trimmed by a trigger to email, email_verified, full name and the provider account id (Q68); the full name fills an empty `profiles.display_name`. Supabase links identities automatically on the same verified email, so Google first then the email code (and the reverse) open the same user.

**Invite claim (PRD F12):** the coach creates an invite (email, comped or external); the server stores the token hash and emails the link `/invite/{token}` through Resend (Q69). Opening the link checks the token, keeps it in an httpOnly cookie until it expires and shows sign in; the server step after any sign in calls `claim_invite`, then clears the cookie. The binding comes from the token, not the email. Expired or used: "This invite expired. Ask your coach for a new one."

**Account deletion (PRD F16):** cancel any active Stripe subscription immediately → fill `consents.email_hash` and null their `user_id` → delete all storage objects → delete the auth user, which cascades every user-owned row and the linked identities (`auth.identities`, Google included); `events.user_id` is set to null. A daily job purges consents 3 years after deletion.

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

## Backups and restore

Monday 09:00 UTC, and on demand from Actions, `backup.yml` dumps the hosted database with the Supabase CLI: `roles.sql`, `schema.sql` and `data.sql` (COPY format, auth and storage metadata included; `fdc_foods`, `fdc_branded` and `food_words` left out because the FDC import rebuilds them). The three files are tarred, encrypted with AES-256 (`gpg --symmetric`, passphrase in the `BACKUP_PASSPHRASE` secret) and uploaded as the artifact `honest-reps-YYYY-MM-DD`, kept 30 days. Only repository collaborators can download artifacts. Not covered: Storage files (check-in photos from step 4) and dashboard settings (auth templates, SMTP, providers, URLs), which ARCHITECTURE "Domains and email" lists.

Restore into a new Supabase project (or the same one after a reset):
1. Download: `gh run download <run id> -n honest-reps-YYYY-MM-DD` (the run id is on the Actions page for "Backup").
2. Decrypt and unpack: `gpg -d honest-reps-YYYY-MM-DD.tar.gz.gpg | tar -xz` (asks for the passphrase).
3. Restore, with the target project's session pooler URL: `psql "$TARGET_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -c 'SET session_replication_role = replica' -f data.sql`. `session_replication_role = replica` keeps triggers (signup, `log_count`, events) from firing on restored rows.
4. Reload the FDC reference data: `node --env-file=<target env> scripts/fdc-refresh.mts` (about 20 minutes).
5. Reapply the dashboard settings: email templates and SMTP, Site URL and redirect URLs, OTP length 6 and expiry 3600.
6. If it is a new project, point Vercel's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` at it and redeploy.
7. Check: sign in as the coach, open Today and Progress for a real account, and compare row counts of `profiles`, `food_entries` and `weights` with the old project.

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `USDA_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APP_URL`, `COACH_EMAIL` (the account `pnpm db:seed` makes the coach), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` (Vercel Production and Preview only). GitHub secrets: `HOSTED_SUPABASE_URL`, `HOSTED_SUPABASE_SERVICE_ROLE_KEY` (FDC refresh), `HOSTED_DB_URL`, `BACKUP_PASSPHRASE` (backup).

## Testing

- Vitest for units, including target math, trend smoothing, adherence, and flag rules.
- RLS tests for every table using two users and the coach.
- Playwright e2e at 375px: sign in (Google stubbed; canceled; installed iPhone app; identity linking both ways; invite claimed with a different email), onboarding, text log, barcode fallback, offline log and sync, check-in, review send, upgrade with Stripe test mode.
- AI calls mocked in tests with recorded fixtures; a separate `pnpm eval:parsing` runs the parsing eval set in `evals/parsing.jsonl`.
- `pnpm eval:search` runs `evals/search.jsonl` (40 queries) against the local food index. Pass: the expected food in the top 3 for 90% of queries and the top 5 for all of them.
