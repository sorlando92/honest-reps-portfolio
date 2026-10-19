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

## MVP (scope change, PM 2026-10-15)

- MILESTONES.md v2: M1 to M5 paused; MVP in six steps (finish logging, accuracy gate, member basics, client loop, coach view, trust), then Post-MVP before the gym beta. MVP exit: Sean plus at least 3 clients log for 7 days, complete one check-in each, and Sean reviews all of them in the app with no Google Form.
- Q43 resolved (timezone follows the phone). New questions Q44 (unread reply flag in MVP), Q45 (coach target edit in MVP), Q46 (offline is post-MVP against CLAUDE.md rule 4).

### 2026-10-15: MVP step 1, edit and delete

- Tap a timeline row, then Edit: the entry opens in the same card as a new meal (amount stepper, g/oz, Weigh it, remove items). Save replaces the items in one transaction (`replace_food_entry_items`, migration 20261015000001, security invoker so RLS applies). Delete entry asks once inline, then deletes the entry and its items.
- Saving from the editor is the user confirming the entry (PRD F2 "Flagged"), so "Check this" clears. The timeline "est." marker now follows the amount source (estimated) instead of the flag, so a confirmed estimate still shows "est.".
- Events: `food_entry_corrected` (items before and after, calorie change, flags before and after) and `food_entry_deleted` (method), both from the server.
- Tests: database suite for the edit function (owner only, coach and other users refused, invalid items leave the entry unchanged, empty list refused); e2e edit then delete at 375px light and dark with axe and 44pt checks.
- Deferred: swipe left on a row for edit and delete (DESIGN_SYSTEM "Entry row"). The Edit button in the opened row is the accessible path either way. Saved items keep no alternatives, so "Did you mean" does not appear in the editor; the Raw / Cooked / Dry toggle and food search will give saved items a way to change food.

### 2026-10-15: PM decisions (MVP round 2), offline card

- Hosted migration applied: 20261015000001_entry_edit (additive: one function). Edit and delete deployed.
- Resolved Q44, Q45, Q46; MILESTONES v2 approved. MVP step 5 gains the coach target edit (Q45). CLAUDE.md rule 4 notes the MVP offline exception.
- Offline card (Q46): when the phone goes offline with a card open, the card says "You're offline. Your draft is saved on this phone. Log it when you're back online." and Log it is disabled; it enables again when the phone reconnects. e2e covers it.

### 2026-10-15: MVP step 1, food search, Add item, manual entry, swipe

- Food search (`GET /api/foods/search`, 120 per user per hour): curated chain items first when the query names a curated chain (ranked by the text logging matcher, chain name ignored), then USDA generic foods ranked the same way and cached in `food_items`. Runs on submit, not as you type, to protect the shared USDA quota until the local FDC import (Q40).
- Entry points: a "Search foods" button on the log bar (Q47), "Add item" on the card and in the editor, and the P1 fallback, which now opens search prefilled with what was typed (AI_PROMPTS P1 fallback).
- A searched generic food starts at 100 g marked Estimated with "Weigh it"; a curated chain item starts at its published serving as label. Manual entry ("Enter it yourself"): name, weight in the card's unit, calories, protein, carbs, fat; saved as weighed.
- "Change food" on every card row (new meal and editor): pick from search, the row keeps its amount and the user's name, and "Check this" clears. This is how a saved item swaps to another food.
- Entries started from search log as `method: search`, from manual entry as `manual`; `food_logged` counts them by method.
- Swipe left on a timeline row opens the editor; the Edit button in the opened row stays as the keyboard and screen reader path.
- Tests: unit (search and manual items, weighing, scaling), database (chain detection, curated search with USDA off), e2e at 375px light and dark (search and weigh, Change food, Add item curated and manual, parse fallback, swipe) with axe and 44pt checks.
- Left out: curated servings without a weight in search (Q48).

### 2026-10-15: servings stepper and common portions (PM MVP round 3)

- Label items step in servings (Q48, generalized): curated chain items from text logging and search, and later barcode products. The stepper moves in halves; the serving label and grams (when known) sit beside it. Panera servings without a weight are now in search; their grams are recorded as 0.
- Change food between a label item and a generic food converts between servings and grams at the closest amount.
- A generic food from search starts at USDA's first common portion: FNDDS portions come with the search; SR Legacy and Foundation foods look theirs up once on pick (`GET /api/foods/[id]/portion`, one USDA request, cached in `food_items.serving`). Else 100 g. Still Estimated with Weigh it.
- Scale users (`nutrition_profiles.has_scale`) get grams by default; others get their units' weight.
- DESIGN_SYSTEM "Log bar" and "Confirmation card", PRD F2: Q47 layout (3 controls at most), servings stepper, starting portion. The log bar layout ships with the barcode button.

### 2026-10-15: MVP step 1, Raw / Cooked / Dry toggle

- Meat, fish, grains and pasta rows show a Raw / Cooked toggle, plus Dry for grains and pasta (44pt segments). Flipping it fetches the USDA entry in that state (`GET /api/foods/state`, ranked like text logging with the state forced, cached in `food_items`) and recalculates at the same weight. When no entry in that state exists, the row stays and says "No raw entry found. Kept as it was."
- Label items (servings) have no toggle; their nutrition is the published serving.
- Tests: unit (which foods get which states), e2e flip to Dry and a missing Raw entry at 375px light and dark.

### 2026-10-15: MVP step 1, barcode and the log bar layout

- Log bar per Q47: an empty field shows "Search foods" and "Scan a barcode"; typing swaps them for send. Never more than 3 controls.
- Scan a barcode: the camera opens in the card sheet and reads EAN-13, EAN-8, UPC-A and UPC-E. Chrome on Android uses its built-in detector; iPhone Safari uses the ZXing WebAssembly reader (`barcode-detector` 3.2.2, `zxing-wasm` 3.1.3), served from our own domain (`public/vendor`, copied at dev and build time, not committed). The camera stops as soon as a code is read or the sheet closes. "Barcode number" lets anyone type the digits instead, and is the path when the camera is blocked.
- Lookup (`GET /api/foods/barcode/[code]`, 120 per user per hour): `food_items` by barcode first, then the Open Food Facts v2 product API. Found products are cached in `food_items` (source `off`, barcode, per 100 g, label serving, product page URL). A product with a label serving steps in servings; one without starts at 100 g, Estimated with Weigh it. Unknown products offer Search foods and Enter it yourself.
- Attribution: "Food data from Open Food Facts" linking to openfoodfacts.org on cards with a barcode item and in Me, About (Q9b).
- Entries started from a barcode log as `method: barcode`.
- Tests: unit (barcode normalizing, reading Open Food Facts products), e2e (log bar layout; typed barcode not found, then found, servings, attribution, log) at 375px light and dark with axe and 44pt checks. One live Open Food Facts lookup checked by hand.
- Not yet: cached barcodes offline (post-MVP offline queue).

### 2026-10-15: MVP step 1, quick add and favorites

- Migration 20261015000002 (additive): `food_entries.title` (the timeline title for entries that were not typed, so `raw_input` stays the audit of what the user typed) and `favorites` (title, items as a template, source entry; own rows, coach reads assigned users, insert and delete only), with an RLS suite.
- Favorites: "Add to favorites" in an opened timeline row stars the entry (title and items). Starred again it stays one favorite; tapping "Favorite" removes it.
- Quick add chips show above the log bar while it has focus: up to 3 favorites (newest first), then the most frequent foods for this time of day (morning, midday, evening, late in the user's timezone, over 60 days), up to 6 chips. A frequent food logs at its last weighed amount, else its most recent. One tap logs (`method: quick_add`, `food_logged` with `quick_add_source`); no card, no model. Disabled offline (Q46).
- Favorites log at the amounts they were starred with; only frequent food chips use the last weighed amount.
- Tests: unit (time of day buckets, ranking, last weighed amount), RLS (favorites), e2e (star, chips, one tap log) at 375px light and dark with axe and 44pt checks.

### 2026-10-15: MVP step 2, local FDC import (Q40)

- Migration 20261015000003 (additive): `fdc_foods` (one row per food: per 100 g, ordered common portions, release, generated full text index; signed in users read, server writes) and `search_fdc()` (foods sharing any word with the query, best full text rank first, up to 200). RLS suite added.
- `scripts/import-fdc.mts` (`pnpm db:import-fdc --dir <folder>`): Foundation 2026-04-30 (323 foods; 72 without calories skipped), SR Legacy 2018-04 (7,793), FNDDS 2024-10-31 (5,431). Energy is kcal, else the Atwater values, as the API reports it. Loaded into local and hosted (13,547 foods each).
- Generic food search now runs on our copy for text logging, food search, the Raw / Cooked / Dry toggle and common portions. The FDC API is called only for branded foods. `FDC_SEARCH=api` switches back, for comparing in the eval.
- Eval v0.4, Sonnet 5.5, 3 runs, local search: every bar passes except meal calories (dev 82%, holdout 67%, bar 80%), the same as the API search. P1 latency median 1.9 s. Generic matching no longer depends on the USDA hourly quota.
- Holdout meal calorie misses by kind (not tuned on): one uncovered chain (McDonald's), one curated chain, one weighed generic meal, one vague portion that flips between runs.

### 2026-10-15: Today v2 spec applied to docs

- `docs/TODAY_SPEC.md` (approved by Sean) added. PRD F2 (meal on every entry) and F3 (Today v2), section 5 events (`food_logged` meal and manual method, `meal_copied`, `day_switched`, `streak_milestone`), non-goals (no exercise calorie add-back; water post-MVP as a habit). DESIGN_SYSTEM Today layout, components (week strip, summary card, insight row, meal section, meal chip row, weight row) and copy. ARCHITECTURE `food_entries.meal`, `title`, `copied_from_entry_id`. MILESTONES: meal sections, meal chip and copy meal in step 1; the rest of Today v2 in step 3; build order 1, 3, 2.
- New questions Q49 (meal column and backfill), Q50 (copied meal method and events), Q51 (dots before targets), Q52 (past day timestamps), Q53 (habits placement).

### 2026-10-15: Today v2 part 1, meal sections (branch `today-v2-meals`, not deployed)

- Waiting on PM approval before hosted: migrations 20261015000004_meals (renames `meal_tag` to `meal`, backfills every entry's meal from its local time in the owner's timezone, sets not null, adds `copied_from_entry_id`), 20261015000005_copy_meal (one function) and 20261015000006_today_events (widens the event name check with `meal_copied`, `day_switched`, `streak_milestone`). The code needs them, so it ships with them.
- Today shows Breakfast, Lunch, Dinner and Snacks, always, with subtotals. Each section's "+" focuses the log bar on that meal ("What did you have for lunch?"). Rows inside are the existing rows (title, est., Check this, tap, swipe, edit, favorite).
- Every new entry gets a meal: the chosen section, else the time window of now in the user's timezone (`app_config.meal_windows`, seeded 4 to 11, 11 to 16, 16 to 22). The card and the editor show a meal chip row; one tap changes it. The server assigns a meal when a client sends none.
- Copy a meal: the section menu shows "Copy yesterday's lunch" when yesterday had that meal. `copy_meal()` copies entries and items in one transaction as the user (RLS), at the current time, with the source's title and a link back. "Copied." `meal_copied` (meal, from_date, entries); copies save as `quick_add` and emit no `food_logged` (Q50 recommendation). "Copy to today" from a past day comes with the week strip in step 3.
- `food_logged` carries `meal`; `food_entry_corrected` carries `meal_changed`.
- Tests: unit (meal windows, 11:30 PM Central is a snack), database (copy_meal: items, title, order, link; never copies another user's entries; signed out refused), e2e (sections, + preselects, chip changes the meal, edit moves it, copy yesterday's lunch) at 375px light and dark with axe and 44pt checks.

### 2026-10-15: Today v2 part 1 deployed

- Hosted `food_entries` exported before migrating (data only, outside the repo). Applied to hosted: 20261015000004_meals, 20261015000005_copy_meal, 20261015000006_today_events. Backfill: 4 rows before (meal null), 4 after (3 breakfast, 1 lunch), checked against the owner's timezone (America/Chicago).
- Hosted seed rerun: `app_config.meal_windows` and `meal_anchors` (Q52) added; existing settings untouched.
- Q49 to Q53 resolved; Q52 changed to meal anchor times for past days (used by the day switcher in step 3).

## MVP step 3 (in progress)

### 2026-10-15: data and target formula

- Migration 20261015000007_member_basics (additive), applied to hosted: `nutrition_profiles.has_scale` (fixes a bug: Today already read it, the column never existed, so grams by default for scale users never took effect), `profiles.onboarding_completed_at`, `targets` (history; formula rows for anyone, user rows only for free members, coach rows only for assigned users; never updated or deleted) and `weights` (one per local day; owner writes, coach reads). RLS suites added.
- Target formula (`modules/nutrition/targets/formula.ts`): Mifflin St Jeor, activity multiplier, goal adjustment, rounded to 10 and never below BMR; protein per lb of goal weight (current weight if none), capped; fat and carbs per Q54's recommendation until decided; age from date of birth for the 18+ gate. Unit tested.
- New questions: Q54 (fat and carb split), Q55 (signup consents before the legal documents), Q56 (onboarding weight as the first weigh-in).

### 2026-10-15: Screens v2 (Journal and Dashboard) applied to docs

- `docs/SCREENS_V2.md` (approved by Sean) added; it overrides TODAY_SPEC where they differ. PRD F3 (Today, the journal: header arrows and Go to date, week strip calorie rings, macro card with 4 rings and week insight, sticky compact header, meal cards with macro chips, day note, floating log bar) and F4 (Progress, the dashboard: week chart and day tiles, week averages, 30 day consistency grids, weight trend 7, 30, 90 days). Section 5 events: `day_note_saved`, `macro_card_mode_changed`.
- DESIGN_SYSTEM: macro color tokens and their rules, plus `macro-*-text` shades for light mode (the spec colors fail 4.5:1 as text on their own chips), (macro data only, never the only signal, over is muted), log bar as a floating pill (supersedes the Q47 layout), macro ring, macro card, sticky compact header, meal card chips, consistency grid, week chart, day note; Today and Progress screens; copy. The Week sheet and the status dots are gone.
- ARCHITECTURE: `day_notes`. MILESTONES step 3 rewritten around SCREENS_V2; step 5 week view shows day notes.
- New questions Q57 (weighed share on Progress), Q58 (day note limits and screening), Q59 (rings and charts before targets; supersedes Q51), Q60 (default trend range).

### 2026-10-15: Screens v2 foundations

- Migration 20261015000008_day_notes (additive): `day_notes` (one per user and local day, 1 to 1,000 characters; owner reads and writes, assigned coach reads only), RLS suite added. Local only for now: it ships with 20261015000009.
- Migration 20261015000009_screens_v2_events: widens the event name check with `day_note_saved` and `macro_card_mode_changed`. It drops and recreates the constraint, so it waits for PM approval; until then those two events would be refused by the database.
- Macro color tokens and the light mode `-text` shades in the theme (`bg-macro-protein`, `text-macro-protein-text` and so on).

### 2026-10-16: step 3 decisions applied

- Applied to hosted: 20261015000008_day_notes, 20261015000009_screens_v2_events (widens the event name check), 20261016000001_targets_note (additive: the coach note when floors raise calories).
- Target formula per Q54: fat 30% (lose fat, maintain) or 25% (build muscle, performance) of calories, floor 0.3 g per lb of goal weight; carbs the rest, minimum 50 g; fat gives way first, then calories rise with a note. Unit tested, including both fallbacks.
- Seed: Q54 keys in `coach_settings.target_defaults` and draft-2026-10 consent versions (Q55) in `app_config.consent_versions`. The seed now adds keys missing from existing settings without changing any set value; run on local and hosted (added only the new keys).
- Docs: Q54 to Q60 resolved; PRD F1 (fat and carbs, consents, first weigh-in), F4 (weighed share); ARCHITECTURE target defaults; DESIGN_SYSTEM macro text tokens approved, weighed share on Progress, stray backslashes removed.

### 2026-10-16: onboarding (PRD F1)

- `/onboarding`, one question per screen: units, goal, sex, date of birth (18+ gate, Q61), height, current and optional goal weight, activity level, food scale (Not yet shows one screen with the hand portion guide), medical screening (yes shows the doctor message), consents (disclaimer, terms, privacy; links to `/legal/*` draft pages, public), then the starting targets computed with the coach's settings (Q54).
- Finishing saves the profile (units, date of birth and the medical flag with the service role, since users cannot change them later), the nutrition profile with `has_scale`, today's weigh-in (Q56), a formula `targets` row (with the floors note when it applies), and consents at version draft-2026-10 (Q55); emits `onboarding_completed` once; lands on Today. Under 18 saves nothing and offers Sign out.
- Every app screen sends users who have not finished onboarding to `/onboarding`; finished users are sent back to Today. Existing accounts (Sean's) go through onboarding on their next open, which gives them targets.
- e2e: full onboarding with a database check of everything saved, the under 18 stop, axe and 44pt checks. The sign in helper marks other test users onboarded with fixed test targets.
- Not yet: the required install step and push permission (next, with Web Push), Q61's cleanup of under 18 accounts (with account deletion in step 6).

### 2026-10-16: fix, onboarding failed for the coach account

- Bug: on hosted, Sean's onboarding showed no targets and then "Your answers were not saved. Check your connection and try again." Cause, confirmed in the data: Sean's profile is the coach, with `coach_id` NULL; onboarding read target settings only from the user's own coach, found none, so the preview had nothing to compute and the save returned early (no rows were written). The message wrongly blamed the connection. Runtime logs for the attempt were gone (Vercel Hobby keeps about 30 minutes).
- Fix: target settings resolve from the user's coach, else the default coach (`app_config.default_coach_id`), else `app_config.target_defaults` (new seeded key), layered so an older settings row missing a key still works. The targets screen always shows protein, carbs, fat and calories before Start logging, computed with the same settings the save uses.
- The save is one transaction, `complete_onboarding()` (migration 20261016000002, additive, server only): retrying with the same answers adds nothing; a weigh-in is one per day, consents are added only when that kind and version is missing, targets only when they differ from the latest; date of birth is set once; a medical yes is kept.
- Errors: causes are logged on the server (`[onboarding] ...`); the screen says "Could not reach Honest Reps..." only for network failures, otherwise that the problem is on our side; both say nothing is saved twice.
- Tests: unit (settings order and fill), database (retry, partial earlier save, coach without a coach, rollback, server only), e2e (coach account onboards itself, member with no coach, retry after a failed save).
- Hosted: migration applied; seed added `app_config.target_defaults`.

### 2026-10-16: install step and push permission (PRD F1)

- After onboarding, `/install`: platform specific steps to add the app to the Home Screen (iPhone Safari: Share, Add to Home Screen, open from the Home Screen; other iPhone browsers: open in Safari; Android Chrome: the native install dialog when ready, else the browser menu steps), then Reminders on the same screen. On iPhone, reminders are offered only once the app runs from the Home Screen, and the screen says so. Product name from `app_config`.
- Q62 (recommended, pending): "Not now" the first time; on the next app open on that device it shows once more with "Skip"; then never again. Counted per device.
- Web Push: migration 20261016000003_push_subscriptions (additive; owner only, not even the coach), `POST/DELETE /api/push/subscribe`, `push_enabled` on a user's first device. When another person signs in on the same phone, the device moves to them. VAPID keys generated and set in Vercel (Production and Preview) and `.env.local`; `VAPID_SUBJECT` added to the env list. Sending reminders comes with step 4.
- `beforeinstallprompt` is kept by the PWA runtime so the install screen can open Android's dialog.
- Docs: MILESTONES step 6 adds Sentry error monitoring (release tags, source maps, user id only, email on new issue types) and logs kept at least 7 days (Vercel Pro or a log drain). Owner tasks 12 (Sentry account, DSN and auth token) and 13 (Pro or log drain before alpha). Q62 added.
- Tests: RLS (push_subscriptions), e2e (Not now, Skip, never again across app opens; reminders on with a stubbed browser push service, saved and `push_enabled`; iPhone steps and the Home Screen note) at 375px light and dark with axe and 44pt checks. Onboarding tests now pass through the install step.

### 2026-10-16: Today journal (SCREENS_V2 Today, TODAY_SPEC)

- Daily aggregates, shared by Today, Progress and the coach client week view: migration 20261016000004_daily_totals (additive, two read-only functions, security invoker). `daily_totals(user_id, from, to)` returns one row per local day in the profile timezone: calories, protein, carbs, fat, items and weighed items from final entries, the targets in effect at the end of that day, adherent and protein_hit (app_config "adherence"; null before targets), and the weigh-in. `logging_streak(user_id, today)` counts consecutive logged days and does not break before the day ends. The owner and the assigned coach read the same rows; others get empty days.
- Today: header "‹ Today ›" ("‹ Thu, Oct 15 ›" on other days) with a Today button and Go to date; `?date=` loads a past day, future days fall back to today. Week strip with calorie rings (track only before targets, Q59), selected day boxed, dot under today, swipe moves a week. Macro card: 4 rings (Protein, Carbs, Fat, Calories), tap for Eaten or Left (remembered on the device), "+N over" in `text-muted`; page 2 with the week insight, mini bars with protein markers, and the streak; earned moment at 7, 14, 30, 60, 100 days, once per day. Sticky compact header once the card scrolls away. Meal cards with P, C, F, kcal chips; "Copy to today" on past days. Weight row and sheet (entry for the selected day, last 7 days, EWMA trend and weekly change). Day note saved on blur.
- Logging on a past day (Q52): with a chosen meal (section "+" or meal chip) the entry is stamped at the meal's anchor time on that date; otherwise at the current clock time on that date. A card remembers the day it was opened on.
- New routes: `POST /api/weights` (one per local day, replaces; `weight_logged`), `PUT /api/day-notes` (empty clears; `day_note_saved`). Events wired: `day_switched`, `macro_card_mode_changed`, `streak_milestone`, `day_note_saved`, `weight_logged`.
- Tests: unit (weeks, insight, EWMA and change wording, Q52 stamps across daylight saving), database (daily_totals at 11:30 PM local, targets per date, adherence, coach and outsider reads, streak), e2e at 375px light and dark (rings and labels, mode remembered, day switch, past day log at the anchor, note, copy to today, weight and trend, sticky header, axe and 44pt).
- Deferred: the check-in card (step 4) and the free coaching card (links to the upgrade screen, which ships with billing); "Set your targets" is plain text until targets can be edited from Me.

### 2026-10-16: CI fixes

- Cause of the red CI since `86dbe2e`: CI had no VAPID public key, so the reminders button rendered disabled and the e2e click waited until the test timed out. Production kept deploying because deploys are not gated on CI.
- CI sets a throwaway `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public, test only). The e2e push test stubs the service worker and the push service, so it never depends on a real one.
- Turning on reminders gives up after 10 seconds with "Reminders could not be turned on. Try again." and the button works again (e2e covers a push service that never answers).
- GitHub Actions on Node 24 versions: checkout v7, setup-node v7, pnpm/action-setup v6, upload-artifact v7. `runs-on: ubuntu-24.04`.
- Not done by engineering: gating production deploys on CI is a Vercel dashboard setting (owner task 14).

### 2026-10-16: install prompts (Q62) and targets in Me

- Q62 as decided: "Not now" on the install screen is allowed once; the second full-screen prompt is gone. 3 days after that dismissal, if the app is still not installed, Today shows one banner ("Add {product} to your Home Screen so reminders can reach you.", Set up, Dismiss). Dismissing it or tapping Set up ends prompts on that device. Devices with the old dismissal count carry over (1: the 3 days start now; 2: never prompted again).
- Me: "Home Screen and reminders" opens the install screen; Back returns to Me and is not a dismissal.
- Me, Targets: free users edit calories, protein, carbs and fat, with the macro calorie sum shown. Under the BMR floor (from date of birth, sex, height and the latest weigh-in) the app shows "1,500 calories is below your estimated resting burn of 1,750." with Save anyway and Change it; `POST /api/targets` refuses without the confirmation (409) and refuses paid users (403; RLS refuses their rows too). Paid clients see their targets read only with "Set by your coach." or "Your coach will review these." "Set your targets" on Today links to it.
- Tests: unit (calorie floor), e2e at 375px light and dark (banner timing and never again, Me link and Back, free edit with floor confirmation, API refusal, paid read only).

### 2026-10-16: Progress (PROGRESS_SPEC)

- Migration 20261016000005_progress: `profiles.is_test` (additive; users cannot set it), the event name check widened with `progress_viewed`, `progress_week_changed`, `weight_range_changed` (standing approval), and `progress_summary(user_id, week_start, weight_range)`: one read-only call on top of `daily_totals` returning the week, the week averages (logged days only; on target counts null before targets; weighed share), the last 30 days, and weigh-ins with their EWMA trend, the trend just before the range and goal weight. The owner and the assigned coach read the same summary; others get nothing.
- Progress screen: header with today's date; week chart (stacked protein, carbs, fat bars plus a neutral remainder, each day's own dashed target line, no warning colors, 3 gridlines, empty slot and baseline dot for unlogged days), chevrons and swipe by week back without limit and never into the future, selection with 4 day tiles, long press or double tap opens Today on that date; week averages (5 stats, 2 hidden before targets, "No logs this week yet."); 30 day Food log and Weigh-ins grids (today outlined, tap a Food log cell opens Today); weight trend with 7, 30, 90 toggle remembered on the device, trend and change wording, goal line, 2 lb (1 kg) padding, "Log weight" with the Today weight sheet, and the fewer than 2 weigh-ins state. Screen reader summaries for the chart, each bar, both grids and the trend.
- Reuse for step 5: `progressSummary(supabase, userId, ...)`, `GET /api/progress?user=&week=&range=` and `ProgressDashboard userId own` (own=false turns off opening Today and Log weight).
- Demo data: `pnpm seed:demo` creates demo@example.test (assigned to the coach, `is_test`) with 35 days in America/Chicago: about 80% of days logged with one fully unlogged weekend, 3 to 5 entries per logged day, about half weighed, some days over target, weigh-ins on about 60% of days drifting down with noise. Deterministic; rerunning recreates it. `--remove` deletes the account, its rows and its events. Hosted: `node --env-file=.env.hosted scripts/seed-demo.mts`.
- Test profiles and metrics: no metrics page, north star or roster count exists yet; each must filter `is_test` when built (ARCHITECTURE "Metrics").
- Tests: unit (bar segments and scaling, axis, default selection, week label, range change wording, weight padding), database (summary contents, logged-day averages, weighed share, 7 and 90 day trend, coach and outsider reads, bad arguments, empty user, is_test not user settable), e2e at 375px light and dark (all sections, bars fit the card, a day's tiles match daily_totals including an 11:30 PM log, 12 weeks back and forward, range remembered, long press to Today, events, empty states, before targets).
- Fixed before shipping: at 375px the 7 bar columns plus the axis gutter overflowed the card, so bars sat under the wrong weekday. The axis labels now overlay the gridlines; the e2e checks every bar sits inside the card.

### 2026-10-16: navigation and calendar (NAV_SPEC)

- Migration 20261016000006_nav_events: the event name check widened with `quick_action_used` and `calendar_expanded` (standing approval).
- Tab bar: floating rounded bar, Progress, Today, Coach (Clients for the coach), More; Today still opens first; the active tab has the 15% accent pill. A tab list with selected state for screen readers. The active label is in `text` and only the icon in `accent-strong`: `accent-strong` as 12px text on the 15% pill is 4.2:1 in light mode and fails AA (axe caught it).
- "+" button beside the bar opens the quick action sheet: Search food, Scan barcode (barcode already ships, so it works), Log weight, Day note, Copy yesterday's {meal for the current time window}. On Today they act on the selected day (copy into a past day is stamped at the meal anchor, Q52; the copy API takes `toDate`); elsewhere they open Today with `?qa=` and run there. Each fires `quick_action_used`.
- Log bar: a floating pill with leading search, the field, then barcode or send. On Today and Progress; from Progress, Log it lands on Today. Its buttons keep focus in the field so the bar never moves under a tap.
- Keyboard: on touch screens a focused text field hides the tab bar, "+" and log bar (the log bar stays when its own field has focus and drops to the bottom edge). Android uses `interactive-widget=resizes-content` so the log bar sits above the keyboard.
- Today header band, pinned on the new `band` token (#F0F0F0 light, #000000 dark): title row with ‹ ›, "Today" when another day is selected, and "…" with Go to date and Day note; the week strip slides whole weeks with momentum and snap from the account's first week to the current week, loads each week's rings as it comes into view, never changes the selected day on swipe, and has focusable previous and next week buttons; once the macro card is under the band the strip crossfades to the compact macro row (200ms, instant with reduced motion). Pulling the strip down or tapping the title slides down a month calendar (‹ ›, swipe, Escape, tap outside, pull up); picking a day collapses to its week. `calendar_expanded` on open. New `GET /api/days?from=&to=` (up to 62 days, RLS decides whose).
- Progress header: "Hi, {first name}" (Q63 fallback: "Hi" alone) with the date and a round initial avatar that opens More.
- More (was Me; `/me` redirects): Goals (Targets), App (Units, Add to Home Screen and turn on reminders, Food scale), Account (Name per Q63, signed in email, Privacy and data, Terms, About with Open Food Facts, Sign out). Reminders times, Subscription, Delete account and Coach settings appear when they ship (Q64).
- Tests: e2e at 375px light and dark for tab order, labels and selection, Progress greeting and avatar, More name, /me redirect, week slide without changing the day, never past the current week, tap to select, month calendar select and collapse, tap outside, compact row swap and back, quick actions on a past day (copy at the anchor, weight sheet, day note focus), bars hidden while typing, Search food from Progress, log bar from Progress to Today, events; existing specs updated for tabs, the band and the log bar. The "+" button exposes `data-hydrated` so tests wait until a tap can work.

### 2026-10-18: MVP step 4, client loop (branch `step-4`, not deployed)

- Migration 20261018000001_client_loop (additive; applied to hosted 2026-10-18 under the standing rule). New tables: `invites`, `checkin_questions`, `checkins`, `checkin_photos`, `messages`, `notifications_sent`; new column `coach_settings.disclosure_title`; private `checkin-photos` bucket (no app-user storage policies). Functions: `claim_invite`, `checkin_state`, `due_checkin_reminders`, `private.checkin_window` and `private.run_checkin_reminders`. pg_cron job `checkin-reminders` every 15 minutes, which does nothing until the Vault secrets `app_url` and `jobs_secret` exist. Seed (local and hosted): the Q72 check-in steps, the Q73 disclosure, and `consent_versions.mo_disclosure` = draft-2026-10.
- Invites (F12, Q69, Q75): Clients has Invite a client (email, optional first name, comped or billed outside the app). The invite email goes through the Resend API with reply-to the coach. The link is shown once with Copy link (Q79). Pending invites have Resend (new token; the old one dies) and Revoke; accepted invites show "Joined as {email}". `/invite/{token}`:
  - Signed out: the token waits in an httpOnly cookie, and the next sign in claims it, whatever the email.
  - Signed in with the invited email: claimed at once.
  - Signed in as someone else: "This invite was sent to another account. Sign out to accept it." with Sign out.
  - Used: "This invite was already used." (the person who used it goes to Today). Expired or revoked: "This invite expired. Ask your coach for a new one."
  - Claiming sets the coach, `tier = paid` and the billing source. Existing accounts skip onboarding.
- State disclosure (F16, Q73): the app layout sends a paid client without the current `mo_disclosure` consent to `/disclosure`. The checkbox is required, and the consent is stored with a server timestamp.
- Weekly check-in (F5, Q72): `/checkin`, one question per screen, with progress dots and focus moved to each question.
  - Weight is prefilled from today's weigh-in, else the trend, in the user's units.
  - Up to 3 photos, resized on the phone and uploaded through the server, removable before submit; Skip when there are none.
  - 1 to 5 scales with labels, text steps, then Submit.
  - On time until the overdue time, late until the review day starts (Q77).
  - Today card while open and unsent ("Overdue. Still open through {weekday}." when late).
  - Events: `checkin_started`, and `checkin_submitted` with `on_time`.
- Coach reply (F5, Q74):
  - Clients lists this week's check-ins, unreplied first. The detail screen shows weight, answers with scale labels, photos (1 hour signed URLs) and the reply composer.
  - A reply is saved as a `messages` row, pushes "{coach} replied to your check-in" with its first 80 characters, and fires `message_sent` (role coach). Submitting pushes "New check-in" to the coach.
  - The client sees "Your coach replied." on Today and reads replies on the Coach tab, which marks them read.
- Reminders (F5, F17, Q74, Q76): `POST /api/jobs/checkin-reminders` (Bearer `JOBS_SECRET`) sends the morning reminder and evening follow-up at the client's local times, once each per week; only the follow-up goes if both are due. Push sending lives in `core/notifications/push.ts`, which removes dead subscriptions.
- Links sent outside the app use `appBaseUrl()`: `APP_URL`, else `https://$VERCEL_URL` on previews (PM 2026-10-19; owner task 17 done).
- PM answers 2026-10-19 (Q76 to Q79):
  - Migration 20261019000001_job_events (additive): `job_run` added to the event name check and kept server only.
  - The reminder job moved to `core/jobs/checkin-reminders.ts`. The route compares the secret in constant time over SHA-256 digests, the job claims before sending, and every run logs one `job_run`.
  - The invite link now shows "Copy this now. For security it won't be shown again." under Copy link.
  - Database test `tests/rls/checkin-reminders-job.test.ts`: two runs at the same moment send each reminder once and both log `job_run`; members cannot write `job_run`.
  - Copy check for Q78: the copy lint passes, and a scan of every step 4 string finds only the exempt legal "dietitian".
- Ops (PM 2026-10-18): the FDC import reruns the word rebuild over `HOSTED_DB_URL` when the API path hits the statement timeout; `fdc-refresh.yml` passes the secret.
- Fixes found while testing:
  - Route handler redirects built from `request.url` or `nextUrl` named `localhost`, which lost the session behind 127.0.0.1. The invite routes now redirect with a relative Location.
  - Controlled forms typed into before hydration never submitted. The reply and disclosure forms now use form actions.
  - `/clients/checkins/[id]` could not prerender under the tab bar, so the detail screen is `/clients/checkin?id=`.
- Tests:
  - RLS and database (`tests/rls/client-loop.test.ts`): invites visibility and writes; `claim_invite` with another email, yours, used, expired, revoked, invalid, coach and signed out; questions, check-ins, photos and messages read rules; no direct writes; read_at only; notifications_sent and the bucket server only; the window in Chicago (open, overdue, close); state for coach and outsiders; reminders due at New York local times, once, stopped by submission; service role only.
  - Unit: submission validation, push and email copy, tokens.
  - e2e at 375px light and dark (`e2e/client-loop.spec.ts`): invite to sign in with a different email to claim, disclosure, check-in with photo, scale and text, events, coach reply, client reads it; used, expired, resent, revoked and other-account links; the job refuses without the secret. axe and 44pt checks on each new screen.
  - Full suite: 307 unit and RLS tests, 98 e2e.
- Not done:
  - Restore test: blocked; the repository has no secrets yet (owner task 16), so no backup has run.
  - Preview builds: blocked on owner task 17, so there is no step 4 PR yet.
  - Invite emails need `RESEND_API_KEY` (owner task 18).
  - `JOBS_SECRET` and the Vault secrets are set at deploy.
  - The hosted coach has no display name, so pushes and the invite email say "Your coach" until Sean sets Name in More.
  - Coach roster flags and the client week view are step 5.
  - Photo deletion after submit is step 6 with account deletion.

### 2026-10-18: step 3 shipped; Sentry, backups, hosted Branded Foods

- Step 3 approved by the PM. PR #1 merged to main and deployed to production. Hosted already had every migration through 20261017000001_food_lookup.
- Hosted Branded Foods import (PM rule: only if the total stays under 400 MB). Before: 24 MB. After: 265 MB, with 435,490 branded products, 13,547 generic foods and 44,622 search words. `fdc_import_runs` has a row per dataset, so the monthly refresh treats the 2026-04-30 releases as imported.
- Fix: on hosted, the import's final "remove old products" delete (one statement over the whole table) hit the statement timeout after every row had loaded. It now deletes by GTIN in batches, like the generic foods. On this run the Branded run row and the word rebuild were finished by hand through the CLI. Risk: the monthly job rebuilds the word list through the API, which may hit the same timeout as the index grows. If it does, the job will run it over `HOSTED_DB_URL`.
- Sentry (step 6 item, pulled forward): `@sentry/nextjs` 11.5.0, `instrumentation.ts` (Node and edge, `onRequestError`), `instrumentation-client.ts`, `app/global-error.tsx`, `withSentryConfig` (source maps uploaded and then deleted from the build, only when `SENTRY_AUTH_TOKEN` is set). Errors only: no tracing and no Session Replay. `lib/monitoring/scrub.ts` keeps the user id only, set on the server in `getCurrentUser` and in the browser by `MonitoringUser`. It drops request bodies, headers, cookies, query strings, extras, stack variables, and console and UI breadcrumbs, and redacts emails and Postgres row values. Off without a DSN. Owner task 12 updated with the four Vercel variables.
- Backups: `.github/workflows/backup.yml`, Mondays 09:00 UTC and on demand. Supabase CLI dumps roles, schema and data (FDC reference tables left out), encrypts them with AES-256 and keeps them 30 days as a private artifact. Restore steps are in ARCHITECTURE "Backups and restore". Needs owner task 16 (`HOSTED_DB_URL`, `BACKUP_PASSPHRASE`). Not covered: Storage files and dashboard settings. The restore has not been tested; recommended test: restore the first artifact into a throwaway free Supabase project.
- Docs (PM 2026-10-18): Google sign in moved to post-MVP in MILESTONES, with notes in PRD F1 and the DESIGN_SYSTEM sign in screen. Email code stays the only sign in. MVP exit: Vercel Pro and Supabase Pro before any paying client. Step 6 marks Sentry as built and adds backups. Q68, Q70 and Q71 wait for Google sign in. New step 4 questions Q72 to Q75.
- Tests: unit (scrub: user id only, request stripped, emails and row values redacted, breadcrumbs dropped or stripped). Typecheck, lint, unit and a production build pass locally.

### 2026-10-18: AUTH_SPEC applied to docs (build in MVP step 4)

- `docs/AUTH_SPEC.md` (Sean 2026-10-17) added: Google sign in alongside the email code and link, hidden inside the installed iPhone app; token-based coach invites that bind regardless of the sign in email.
- PRD F1 (sign in, one flow, identity linking, Google data kept), F12 (single-use token, 14 days, expired copy, coach sees the sign in email), F16 (privacy line, identities removed on deletion), section 5 events (`signup_completed` and `sign_in_completed` with method, `auth_error`), section 8 non-goals.
- ARCHITECTURE: Auth row, Google OAuth and the custom auth domain under Domains, `invites` table and `claim_invite`, sign in and invite claim flows, identities in account deletion, e2e list.
- DESIGN_SYSTEM: Sign in screen and its copy. MILESTONES step 4: sign in, token invites, events.
- QUESTIONS: owner task 15 (Google and Supabase setup); Q68 (Google identity data), Q69 (invite delivery and edge cases), Q70 (email field or button), Q71 (when `signup_completed` fires).
- Not built yet: step 4 starts after Sean approves step 3.

### 2026-10-17: food lookup (FOOD_LOOKUP_SPEC), before step 4

Root causes, from the hosted records of Sean's Ascent attempts (no scan or search events existed yet): the only barcode hit ever recorded is 815863022027 (stored as read, 12 digits), Open Food Facts "Native Whey Protein Blend - Key Lime Pie", Ascent, 1 rounded scoop (31 g), 120 kcal, 25 g protein. Open Food Facts files it as 0815863022027, so the 12 and 13 digit forms were different cache keys. The scan was a single read with no check digit test. FDC Branded has 25 Ascent GTINs but not this one, and search never queried Branded at all, so "ascent" could not be found by text.

- Migration 20261017000001_food_lookup (additive; not yet on hosted): `pg_trgm`; `fdc_branded` and `food_words` (reference data, signed in read); `food_items` gains `owner_id`, `image_url`, `log_count`, source `user`, and custom food write policies for the owner only (its read policy now hides other users' custom foods; the coach reads clients'); `barcode_matches`; `barcode_scans` (the scan log); `log_count` trigger excluding test profiles, backfilled; `refresh_food_words()` (server only), `private.norm_words()`, `search_food_index()`; event names `search_performed`, `barcode_scanned`, `barcode_mismatch`, `label_scanned`, `custom_food_created` (standing approval). `fdc_foods` and P1's `search_fdc()` are unchanged.
- Import: `scripts/import-fdc.mts` loads Branded Foods (one row per canonical GTIN-14, latest version, discontinued and calorie-less products left out, removed products dropped on refresh), reads multi-line CSV fields, skips releases not in the folder, and rebuilds the word list. Local run: 2,000,000 versions to 435,490 products in about a minute, 213 MB with indexes.
- One bar, two functions: from 2 characters, results open above the log bar (150 ms debounce, earlier requests aborted). Row 1 "Describe with AI: {text}"; send and Enter always run P1; a tapped result opens the card for that item with no model call; a favorite logs in one tap like its chip (Q67). Sections My foods, Brands and restaurants, Basic foods, 5 rows each with Show more. No match: "No match for '{text}'." with Describe it with AI, Scan the label, Enter it yourself. The search glyph and the Search food quick action open the sheet with the field focused (the user's most logged foods before typing). Escape closes it. Add item, Change food, the P1 fallback and Not this use the same search inside the card.
- Ranking (`search_food_index`): the user's history, then brand (or brand owner) plus product words, then completeness, then gym-wide `log_count`, then similarity; one row per name and brand. Typos: when no food has every word, each word may also be one of its two closest more common words. Chains match on the chain name plus any other word (Chipotle is curated by component). Generic foods favor the base food ("Egg, whole" over "Egg burrito").
- `evals/search.jsonl`, 40 queries, `pnpm eval:search`: top 3 39/40 (98%), top 5 40/40 locally. "egg" ranks the whole egg 4th behind egg dishes. Median 38 ms per query from this machine; typo queries about 170 ms.
- Barcode: GTIN normalization (`foods/gtin.ts`: check digit, UPC-E expansion, canonical GTIN-14, every stored form queried, 13 digit and EAN-8 forms for Open Food Facts). The scanner needs two identical consecutive valid reads; BarcodeDetector where available, else ZXing in a web worker; torch toggle when the camera has one; haptic on success; "Hold steady" after 3 seconds without a valid read; typed numbers must pass the check digit. Lookup order: the user's correction or custom food, `food_items` cache, FDC Branded, Open Food Facts; every hit cached with source and fetch date; every lookup logged in `barcode_scans`.
- Confirm before logging: product, brand, Open Food Facts image when there is one, serving line, Check this when the data quality rule fails, Log it (saves one serving at once, Q65) and Not this (search prefilled with brand and product words; the pick becomes the user's match for the GTIN and `barcode_mismatch` fires). Barcode entries store the GTIN as `raw_input` and the scan as `model_output`.
- Not found: "We don't have this barcode yet." with Scan the label, Search, Enter it yourself. Scan the label: photo resized on the phone, P2 label mode (`lib/ai/p2-label.ts`, Sonnet 5.5, `p2-label-2026-10-17.1`, logged to ai_calls, 20 per hour, free), the custom food form prefilled with Check this on unsure fields, saved on the GTIN so the next scan is an instant hit.
- Custom foods: Enter it yourself now saves a custom food (name, brand, barcode when known, serving words, serving size in g, oz or ml, calories and macros) and adds one serving; More, My foods lists them with Edit and Delete. Deleting keeps logged entries' numbers; a favorite pointing at a deleted food still logs.
- Data quality: label products with no serving size, or calories more than 20% off 4P + 4C + 9F, show Check this on the card, the confirmation and the custom food form.
- Coach: Clients shows Food lookups, the last 50 barcode misses and wrong products with who scanned, the GTIN and what they chose instead. Read only.
- Tests: unit (GTIN forms and check digits, two read rule, label serving, quality rule, custom food columns, search rows, stored forms), RLS (fdc_branded, food_words, custom foods for owner, other members, outsider and both coaches, barcode_matches, barcode_scans column grants, popularity counter with test profiles, search sections and privacy), e2e at 375px light and dark (live results and AI row, no model call on a tapped result, Enter and the AI row run P1, no match buttons, card search, custom food saved and listed in My foods, check digit refusal, confirmation and Log it, Not this correction, miss to label scan to an instant real lookup, Escape, quick action focus).
- Deferred: hosted migration and Branded import (Q66); monthly refresh automation (Q66); P1 branded matching on the local copy (step 2); Sean's 25 product barcode test set, after deploy.
- PM decisions the same day (QUESTIONS "Resolved by the PM (food lookup, 2026-10-17)"): `food_staples` puts the plain Foundation or SR Legacy item first for everyday generic searches (40 terms); eval cases s41 to s48, now 48/48 in the top 3 and 8/8 plain items first. P1 branded matching uses `search_fdc_branded` on the local copy plus cached Open Food Facts products of the brand (`FDC_SEARCH=api` keeps the API for comparison). Scheduled refresh: `.github/workflows/fdc-refresh.yml` on the 2nd of each month runs `scripts/fdc-refresh.mts`, which reads the newest release of each dataset from the FDC download page, imports what is new, and records added, changed and removed per dataset in `fdc_import_runs` and the job summary (generic foods no longer in a release are now removed too). Verified locally from a reset database: a fresh load reports 449,037 added; a rerun of the same release reports 0 changed and 0 removed; a third run records "no new release" for all four datasets.
- Test helper: `signInWithCode` looked only at the first 1,000 auth users; it now pages, which fixed the coach smoke test on a well used local database.
- Parsing eval with P1 branded matching on the local copy (29 cases x 3, Sonnet 5.5): identical to the same run with `FDC_SEARCH=api` on every metric (dev and holdout meal calories 82% and 67%, all other bars pass), with 0 USDA API calls instead of 3 plus 486 cached. Holdout meal calories stay at 67% as on 2026-10-13: the misses are chain coverage and amounts (p004, p015, p025, p027 and others), not branded lookups. Step 2 still needs more curated chains and the PM's fresh holdout cases.
