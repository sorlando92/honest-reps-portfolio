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
