# Honest Reps Architecture v1

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js App Router, TypeScript strict | Installable PWA (manifest, service worker) |
| UI | Tailwind CSS, shadcn/ui, Lucide | Theme from DESIGN_SYSTEM.md tokens as CSS variables |
| Data | Supabase Postgres | RLS on every table |
| Auth | Supabase email OTP: magic link plus 6-digit code in the same email | Roles: member, client, coach. Coach reads all data for users assigned to him (free and paid). |
| Files | Supabase Storage | Private buckets, signed URLs |
| Jobs | Supabase pg_cron + Edge Functions | Runs every 15 minutes and sends reminders whose user-local time has arrived; also drives the check-in window and review prep. Not Vercel cron. |
| Push | Web Push (VAPID) | iOS requires home screen install |
| Offline | Service worker + IndexedDB queue | Sync on reconnect |
| AI | Anthropic API | Model ID in env `ANTHROPIC_MODEL`; prompts in `lib/ai/` |
| Food data | USDA FoodData Central, Open Food Facts | Cache lookups in `food_items` |
| Billing | Stripe Checkout + Billing + webhooks | Price ID from coach settings |
| Analytics | `events` table (first party) | Feeds the metrics page |
| Hosting | Vercel (paid plan before any real users; the free plan does not allow commercial use) | Preview deploy per PR |

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
- `profiles` (id, role, coach_id, display_name, units, timezone, tier: free|paid, billing_source: stripe|comped|external, medical_flag, created_at)
- `app_config` (key, value jsonb) — product name, AI defaults, smoothing factor
- `coach_settings` (coach_id, price_cents, stripe_price_id, checkin_day, review_day, target_defaults jsonb, reminder_defaults jsonb, disclosure_text, ai_editable_layer_version_id)
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
- `events` (id, user_id, name, props jsonb, created_at)

Nutrition module
- `targets` (user_id, calories, protein_g, carbs_g, fat_g, set_by: formula|user|coach, effective_from)
- `food_items` (id, source: usda|off|custom, source_id, name, brand, serving jsonb, per_100g jsonb, barcode)
- `food_entries` (id, user_id, logged_at, meal_tag, method, raw_input, raw_photo_path, model_output jsonb, confidence, status: final|draft|pending, client_uuid for offline dedupe)
- `food_entry_items` (id, entry_id, food_item_id, name, amount, unit, grams, calories, protein_g, carbs_g, fat_g, flagged)
- `favorites` (user_id, food_item_id or entry template)
- `weights` (user_id, date, weight_kg)

Store everything in metric; convert at the edge.

## Key flows

**Text logging:** client → `/api/parse` → P1 extraction → match each item to `food_items` (cache first, then USDA search) → compute macros → return draft card → user confirms → save entry and items.

**Photo logging (paid):** upload to private bucket → P2 vision extraction → same matching path.

**Offline:** entries created with a client UUID in IndexedDB; service worker background sync posts them; server dedupes on `client_uuid`. Text and photo inputs stay `pending` until parsed.

**Weekly cycle (cron, coach timezone):**
1. Check-in day morning: open check-ins, send reminders.
2. Check-in day evening: follow-up reminder to non-submitters.
3. Check-in day + 24h: mark overdue, create coach flag.
4. Before review day: for each paid client build the week summary, run P3, write `review_items`.
5. On send: save final reply, generate P4 headline, create `reports` row, push notify client.

**Adherence definition:** a day counts as adherent when calories are within ±10% of target and food was logged. Protein day hit when protein ≥ 90% of target. Both thresholds in `app_config`.

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `USDA_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `APP_URL`.

## Testing

- Vitest for units, including target math, trend smoothing, adherence, and flag rules.
- RLS tests for every table using two users and the coach.
- Playwright e2e at 375px: onboarding, text log, barcode fallback, offline log and sync, check-in, review send, upgrade with Stripe test mode.
- AI calls mocked in tests with recorded fixtures; a separate `pnpm eval:parsing` runs the parsing eval set in `evals/parsing.jsonl`.
