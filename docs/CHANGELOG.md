# Changelog

Engineering records what shipped per milestone, deviations from spec, and deferred items.

## Unreleased

- Specs handed off: PRD v1, Design System v1, Architecture v1, AI Prompts v1, Milestones v1 (proposed).
- 2026-10-12: v1.1 specs copied into the repo (CLAUDE.md, AGENT_PROMPTS.md, docs/). Kickoff answers recorded in QUESTIONS.md. Open questions restored there, plus Q27 (onboarding body data) and Q28 (doc gaps in v1.1).
- M0 plan updated for: email OTP sign in (link plus 6 digit code), `coach_visibility` consent, coach read access in RLS for all assigned users, `profiles.date_of_birth`, and `nutrition_profiles.goal_weight_kg` added in M0 (used in M2).

## M0 Foundation (in progress, 2026-10-12)

Shipped in code, not yet run against a database:
- Repo at `C:\dev\honest-reps` (outside OneDrive). pnpm 10.34.7, Next.js 16.4 (App Router, cache components, `proxy.ts`), TypeScript strict, Tailwind 4 themed only from DESIGN_SYSTEM.md tokens (the default palette and shadows are removed), shadcn/ui (Radix), Lucide.
- Supabase migrations: `profiles`, `app_config`, `coach_settings`, `consents`, `events`, and nutrition `nutrition_profiles` (with `goal_weight_kg` for M2). RLS on every table. The coach reads all rows of assigned users, free and paid. Users cannot change role, tier, billing, coach, medical flag or date of birth. Consents and events are append only and carry server timestamps.
- Signup trigger: creates the profile, assigns the default coach, records the `coach_visibility` consent, emits `signup_completed`.
- Sign in: email OTP. One email contains both the 6 digit code and the link (`supabase/templates/sign-in.html`). The coach visibility statement is shown before an account is created.
- App shell: tab bar with Today, Progress, Coach and Me, plus Clients for the coach. Empty states, safe areas, 44pt targets, system light and dark mode.
- PWA: manifest named from `app_config.product_name`, placeholder icons, service worker shell (offline page and push handler), `pwa_installed` event.
- Analytics: `track()` on server and client, `/api/events` with the PRD event list. Pre auth events are limited to `signup_started` and `pwa_installed`.
- Copy lint: ESLint rule for em and en dashes, emojis, exclamation points and protected titles, with legal pages and AI prompts exempt from the title check. Boundary lint: core cannot import modules.
- Tests: unit tests (copy rule, event schema), RLS suites for all 6 tables, Playwright smoke at 375px in light and dark with axe and tap target checks.
- CI: GitHub Actions runs typecheck, lint, local Supabase, unit and RLS tests, and e2e.

Deviations and notes:
- New env var `COACH_EMAIL`: the seed makes this account the coach. ARCHITECTURE.md env list needs it.
- The hosted Supabase project needs the sign in email template pasted into Auth > Email Templates (Magic link and Confirm signup), and Site URL set to the app URL.
- Seed does not invent defaults the specs leave open (Q17, Q29).
- `signup_started` approximation (Q30).

### 2026-10-12: hosted Supabase and GitHub

- GitHub: private repo sorlando92/honest-reps. First CI run passed every step (typecheck, lint, unit and RLS tests, e2e at 375px light and dark).
- Hosted Supabase project `honest-reps` (ref <project-ref>, us-east-1). All 3 migrations applied. Seeded with coach@example.test as the coach. Verified: RLS on for all 6 tables, signup trigger present, settings rows as seeded.
- Security advisor fix: RLS helper functions and the signup trigger function moved from `public` to a `private` schema the API does not expose (migration 20261012000003). The one remaining advisor warning (leaked password protection) does not apply, since sign in is passwordless.
- Hosted keys are kept in the gitignored `.env.hosted`, which Next.js never loads, so local builds and tests cannot reach the hosted database.
- Still to do by hand in the Supabase dashboard: paste the sign in email template into Magic Link and Confirm signup. Site URL is set during the Vercel step.
- Descoped: multi-factor authentication for app users (QUESTIONS.md Q31). Owner account two-factor added as owner task 10.
- Blocker found: Supabase requires custom SMTP before email templates can be edited, so the hosted sign in email has no code until the email sender (owner task 9) is set up.

### 2026-10-12: PM decisions applied to docs

- Repo docs are now the source of truth.
- Resolved Q8, Q9b, Q10, Q17, Q22, Q27, Q28, Q29, Q31 and COACH_EMAIL; see QUESTIONS.md. Added Q32 (late check-ins after review prep).
- Domain plan recorded: app.honestreps.app on Vercel, Resend sending from auth@mail.honestreps.app.
- Code for the PM decisions: coach tab bar is Today, Progress, Clients, Me (Q22). New `coach_settings.weekly_cycle` column (migration 20261012000004). Seed carries the Q17 and Q29 defaults; applied to the hosted project, including a one time update of the existing coach row. Unit, RLS and e2e tests pass.

### 2026-10-13: PM decisions round 2 applied to docs

- Resolved Q3, Q15, Q16, Q18, Q19, Q21b, Q24, Q26, Q30. MILESTONES.md approved. M0 review findings 1, 2, 3, 5, 6, 7 approved for a fix before M1.
- Spec change "precision first logging" applied to PRD (thesis, F1, F2, F3, F5, F7, F9, F10, F14, F15), DESIGN_SYSTEM, ARCHITECTURE, AI_PROMPTS (P1, P2, P3) and MILESTONES (M1 to M4).
- `evals/parsing.jsonl` and `evals/README.md` v0.2 added: 24 synthetic cases with new M1 pass bars.
- AI_PROMPTS P3 now matches the Q21 resolution (editable layer not filtered); the old "strip" wording was left over.
- New questions: Q33 (where hand portion conversions live), Q34 ("Estimated" and "Check this" on one row), Q35 (real meals versus the synthetic set). Owner task 11 added for the M1 API keys.
- Deferred to M2: the privacy policy template that states the F16 deletion terms (no template exists yet).

### 2026-10-13: M0 review fixes and round 2 schema

Migration 20261013000001 (local only; pushed to the hosted project with the Vercel setup):
- Q3: `profiles.role` is `member` or `coach`; any `client` rows become `member`.
- Q26: `coach_settings.price_cents` dropped.
- Finding 3: `events.user_id` is `on delete set null`.
- Finding 1: a check limits `events.name` to the PRD list (now with `onboarding_completed`). RLS refuses `signup_completed`, `upgrade_completed`, `subscription_canceled` and `review_reply_sent` from clients, and `/api/events` rejects them.
- Finding 2: events before sign in are rate limited to 60 per hour per hashed IP (`private.rate_limits`, `hit_rate_limit()` callable by the service role only). Over the limit returns 429.
- Finding 5: a trigger rejects unknown timezones on `profiles`.

App:
- Finding 6: while the role loads, the tab bar shows the shared tabs and an empty slot instead of the member Coach tab.
- Finding 7: the coach is redirected from `/coach` to `/clients`.

Tests: 69 unit and RLS (9 new, including a suite for `rate_limits`), 10 e2e at 375px light and dark, all passing.

### 2026-10-13: M0 deployed, awaiting Sean's phone sign-off

- Live at https://app.honestreps.app on Vercel (Hobby plan), deploying from `main`. Preview deploys per PR come with the Vercel GitHub integration.
- Hosted Supabase has migrations through 20261013000001. Sign in email goes through Resend SMTP from `auth@mail.honestreps.app`; both hosted templates match `supabase/templates/sign-in.html` (verified with a test email: subject, 6 digit code, `/auth/confirm?token_hash` link).
- The hosted email templates and URL settings are set by hand in the dashboard; `supabase/config.toml` only covers local. If the dashboard template is ever reset, the link breaks (the default link is a PKCE redirect `/auth/confirm` does not handle).
- Not done: root `honestreps.app` redirect (no DNS record), real app icons (placeholders), Vercel Pro (required before clients).
- New question Q36 (chain restaurant nutrition data).

## M1 Logging core (in progress)

M0 signed off by Sean 2026-10-13 (Pixel: sign in by code, install, tabs, light and dark). Anthropic and USDA keys verified with one call each.

### 2026-10-13: step 1, parsing pipeline and eval

- Migration 20261014000001 (local only): `ai_calls` (core; coach reads assigned users, server writes) and `food_items` (nutrition; signed in users read, server writes), with RLS suites.
- `lib/ai/p1.ts`: P1 locked layer verbatim from AI_PROMPTS.md, Zod structured output, one retry, confidence caps, server-side refusal fallback (`fallbacks: "default"`). Model `ANTHROPIC_MODEL`, default `claude-opus-5-5`, effort low.
- `modules/nutrition/parsing/`: USDA search, re-ranking (state default cooked for meat, fish, grains, pasta, beans; penalties for a different leading food and for breaded, fried, dried and similar variants), flags per PRD F2 (hand portions never flagged for amount).
- USDA FDC finding: a multi-value `dataType` filter, or "Survey (FNDDS)" alone, gets a bare 400 on most requests. Searches now run Foundation and SR Legacy filtered plus one unfiltered search keeping FNDDS, with retries. 0 failures in 48 concurrent calls.
- `pnpm eval:parsing` (evals/run-parsing.mts, scoring per evals/README.md, unit tested). Latest 3 run median: dev and holdout pass every bar except meal calories (dev 71%, holdout 57%, bar 80%). P1 latency median 2.2 s; $0.008 per parse.
- Holdout note: the first failure dump included holdout cases, and one matcher fix (rice noodles) came from p017. Tuning since uses dev only.
- Not yet wired: writing `ai_calls` rows and caching matches in `food_items` happen in `/api/parse`, built with the confirmation card (step 2). Hand portion conversions wait on Q33; P1's gram estimate is used meanwhile.

### 2026-10-13: PM decisions round 3 applied to docs

- Resolved Q33, Q34, Q36, Q37, Q38, the P1/P2 medical flag sentence, and the P1 model selection rule. Eval set v0.3 (29 cases; fresh holdout p025 to p029).
- AI_PROMPTS: Q37 line in P1, curated chain matching, model selection rule. ARCHITECTURE: `nutrition_coach_settings`, `food_items.source_url` and `verified_on`. PRD F2 and DESIGN_SYSTEM: one signal per row (Q34), chain coverage (Q36), quick add never calls a model.

### 2026-10-13: round 3 code, step 2 server side (not yet run against a database)

- P1: Q37 line, safety rules without the medical_flag sentence (P1_VERSION p1-2026-10-14.2), model override, refusal fallback only on models that support it (not Haiku).
- Q33: `nutrition_coach_settings` (migration 20261014000002, RLS suite), seeded with the PRD F14 defaults. Palm, cupped hand and thumb convert to grams; fist keeps P1's estimate (it is a volume).
- Q36: curated chain data as one JSON file per chain in `modules/nutrition/data/chains/`, seeded into `food_items` with `source_url` and `verified_on`. Done: Domino's (75 items, Nutrition Guide PDF, August 2026) and Chick-fil-A (369 items, official nutrition page). Menu ranking for curated chains; whole servings from P1's grams. Uncovered chains get a generic match, estimated and flagged. Not done: the other 9 chains, whose official pages block automated fetches or need a browser.
- Q34: items carry `flagReason` (match or amount).
- Step 2 server side: `food_entries` and `food_entry_items` (migration 20261014000003, RLS suite), `ai_calls.input` and `output`, `POST /api/parse` (60 per user per hour) and `POST /api/entries` (copies the audit trail from `ai_calls`, dedupes offline syncs, emits `food_logged` with amount source counts).
- Eval: `--model` flag; USDA responses cached on disk during eval runs (`USDA_CACHE_DIR`).
- Found: the USDA key's 3,600 requests an hour ran out during the three model comparison, so the Opus comparison run is invalid and the comparison is not finished.
- Blocked: Docker Desktop fails to start, so the three new migrations and their RLS suites have not run, and the card UI cannot be checked at 375px.

### 2026-10-13: database back, more curated chains

- Docker restored: all migrations applied locally; 100 of 100 unit and RLS tests pass, including the new suites for `ai_calls`, `food_items`, `nutrition_coach_settings`, `food_entries` and `food_entry_items`.
- Curated chains now 6 of 11 (1,549 items), each from the chain's own published document: Chick-fil-A (official page), Chipotle (US nutrition facts PDF, March 2025), Culver's (Nutrition and Allergen Guide PDF), Domino's (Nutrition Guide PDF, August 2026), Panera (Nutrition Guide PDF, effective 9/2/2026), Subway (U.S. Nutrition Information PDF, January 2026).
- Serving only items: Panera publishes portions ("1 Bagel", "1/2 Sandwich", "Cup") without weights. Those items count servings from P1's quantity and keep P1's gram estimate; their nutrition is still the chain's (amount source label).
- Not curated yet: McDonald's, Starbucks, Taco Bell and Raising Cane's (pages block automated access or render nutrition only in a browser; Taco Bell item pages show calories without macros), and Imo's (only document is May 2018, per whole pizza, no weights or slice counts). See QUESTIONS.md Q41.
- Model comparison still waiting on the USDA hourly quota.

### 2026-10-13: chain data descoped

- Sean descoped further chain PDFs (Q41). Six chains curated; the other five stay uncovered for now. Eval cases p004 (Chick-fil-A, covered) and p027 (McDonald's, uncovered) are affected accordingly.

### 2026-10-13: PM decisions round 4 applied to docs

- Q39 (cans are label), Q40 (local FDC import, cache-first interim), eval v0.4 (p027 expects estimated). MILESTONES M1 build order set; barcode, favorites, quick add and meal tags deferred until after phone testing.

### 2026-10-13: confirmation card

- Today has the log bar (pinned above the tab bar) and a timeline of today's entries in the user's timezone, with "est." and "Check this" markers (Q34).
- Confirmation card: one signal per row by cause, "Weigh it" focuses the amount and typing a weight makes the item weighed, swapping to an alternative resolves "Check this" (the user's own food name stays), g/oz toggle and stepper, remove, discard, Log it. The draft stays on the device and reopens with the app; falls back to memory when storage is blocked.
- Saved through `POST /api/entries`; `food_logged` fires on the server.
- e2e at 375px light and dark: describe, fix and log a meal; draft survives a reload. axe and 44pt checks pass. /api/parse is stubbed in e2e so tests never call the model or USDA.
- Fixed: FDC rejects any search containing a slash ("93/7 ground beef"), which failed every time. Lean ratios now become "93% lean" and other slashes spaces. Found from the eval's clean run check (failed search logging); the fix is to the search request, not tuning on the holdout's results.
- Deferred from the card: Raw / Cooked / Dry toggle (state shown as text), "Add item" (comes with manual entry), no-scale hand picker (needs `has_scale`, M2).

### 2026-10-13: P1 model comparison (eval v0.4, clean runs)

All runs: 29 cases x 3, USDA cache from clean runs only, 0 failed searches.

| Model | Fails | Holdout meal kcal | P1 latency median | Cost per parse |
|---|---|---|---|---|
| Haiku 5.5 | holdout amount source (86%), holdout meal kcal | 75% | 1.7 s | $0.0003 |
| Sonnet 5.5 | holdout meal kcal | 67% | 1.8 s | $0.0040 |
| Opus 5.5 | holdout meal kcal | 67% | 2.2 s | $0.0081 |

- Dev meal kcal is 82% for all three after matcher fixes from dev failures: menu size and style words optional (size taken from the meal text), the named brand preferred, skin on avoided unless said, no leading food rule for comma-free branded names.
- No model meets every bar; all miss holdout meal calories, which depends on matching and chain data rather than the model. Default set to Sonnet 5.5 (provisional, QUESTIONS.md Q42).

### 2026-10-15: PM decisions applied to docs

- Q42 resolved: Sonnet 5.5 locked as the P1 model; Haiku 5.5 re-tested once real alpha meals are in the eval.
- Holdout meal calories (80%) is an M1 exit gate, measured on fresh holdout cases from the PM after the local FDC import and any further chain curation.
- Raw / Cooked / Dry toggle stays in M1; only the no-scale hand portion picker moves to M2.
- Hosted auth settings script (Supabase Management API, apply and verify-only modes) recorded in ARCHITECTURE.md.
- MILESTONES M1 build order extended through the FDC import and the PM's final holdout measurement.
- PRD F2 lists the 6 curated chains that ship (Q41); the other 5 are added if holdout meal calories stay under 80% after the FDC import. AI_PROMPTS eval section corrected to v0.4, 29 cases.

### 2026-10-15: M1 log bar and confirmation card deployed

- Hosted Supabase: migrations 20261014000001 to 20261014000003 applied; seed run (coach settings, hand portions, 1,549 curated chain items from 6 chains). No sample users on hosted.
- Production deploy from `main` (85afe03). P1 runs on Sonnet 5.5 (code default; `ANTHROPIC_MODEL` is not set in Vercel).
- Checks before deploy: typecheck, lint, 111 unit and RLS tests pass.
- Waiting on Sean's phone test of the log bar and confirmation card.

### 2026-10-15: phone test fixes (timezone, entry titles)

- Bug: entry times showed in UTC. Cause: the seeded coach account had no timezone, so the profile kept the `UTC` default, and signup is the only place the device timezone was saved. Fix: the app corrects `profiles.timezone` to the device's timezone when it opens (QUESTIONS.md Q43). Sean's profile corrects itself on next open.
- `core/time/local-day.ts` is the one source of local days (`localDate`, `localToday`, `dayBounds`, including 23 and 25 hour days). Today now queries the exact local day bounds instead of a 36 hour window. Rule recorded in ARCHITECTURE.md "Local days" for daily totals, adherence, logging-day counts, nudges and the weekly cycle when they are built.
- Tests: unit tests for 11:30 PM Central (summer and winter), midnight rollover, half hour zones and DST days; a database test that an 11:30 PM Central log lands on that Central day at "11:30 PM".
- Timeline rows are titled with the raw input on one line; tapping a row shows its items. Entries without typed input use the item names. PRD F3 and DESIGN_SYSTEM "Entry row" updated; quick add and favorites will reuse the title.
- Tracking confirmed in MILESTONES: targets with remaining and day switcher (M2), barcode with the log bar icon (M1, after phone testing), camera icon locked for free users (moved from M5 to M3 with photo logging). The log bar shows neither icon yet.
