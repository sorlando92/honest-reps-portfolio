# Honest Reps Milestones v1 (approved 2026-10-13)

Each milestone ends with a demo to Sean on a real phone and his sign-off. Order is chosen so the riskiest part (logging) is proven first and the alpha can start as soon as the coach loop works.

## M0. Foundation
- Repo, Next.js, TypeScript strict, Tailwind with design tokens, shadcn/ui, Lucide
- Supabase project, migrations, RLS scaffolding and test harness
- Email OTP auth with a 6-digit code and a link, roles, `profiles`, `app_config`, `coach_settings` with seed
- PWA manifest, service worker shell, light and dark theme, tab bar with 4 tabs (the coach's Coach tab is replaced by Clients)
- `events` table and `track()` helper
- CI: typecheck, lint, test, Playwright smoke at 375px
- Vercel preview deploys

Done when: Sean can sign in on his phone, install to home screen, and see empty tabs in both themes.

## M1. Logging core (F2 minus photo)
- Text logging with P1, USDA matching, confirmation card, flags and alternatives
- Precision first: amount source and state on every item, confidence caps, grams default for scale users, "Weigh it" hint, hand portion tag, Raw / Cooked / Dry toggle, cooked default matching. The no-scale hand portion picker moves to M2 (PM 2026-10-15).
- Hand portion conversions seeded with the PRD F14 defaults (the edit screen ships in M4)
- Search, barcode via Open Food Facts, manual entry (grams default for scale users)
- Edit, delete
- Deferred until Sean has tested the log loop on his phone for a few days (PM 2026-10-13): barcode (log bar icon, Open Food Facts lookup, attribution), favorites, quick add chips (remember the last weighed amount), optional meal tags
- Offline queue and sync
- `ai_calls` table
- `evals/parsing.jsonl` v0.2 (24 synthetic cases, in the repo) and `pnpm eval:parsing`

Build order (PM 2026-10-13, updated 2026-10-15): P1 model locked (Sonnet 5.5), confirmation card, then manual entry, Add item, edit and delete, Raw / Cooked / Dry toggle, offline queue and sync; then the local FDC import (QUESTIONS.md Q40), then more curated chains if holdout meal calories are still under 80%. Engineering tells the PM when that is done, and the PM supplies fresh holdout cases for the final M1 measurement.

Done when: repeat meal logs in under 5 seconds (measured once favorites and quick add land), described meal under 20 seconds, the parsing eval meets every M1 pass bar in `evals/README.md` (holdout meal calories 80% or higher included, measured on the PM's fresh holdout cases), offline log syncs.

## M2. Member experience (F1, F3, F4, F17 member reminders, F16 signup consents)
- Onboarding, target formula from settings, medical screening and flag, food scale step and hand portion guide, `onboarding_completed` event
- No-scale hand portion picker on the confirmation card in place of "Weigh it" (moved from M1)
- Required install step and push permission
- Today screen complete: calorie and protein targets with remaining and progress bars, carbs and fat pair, day switcher, the "est." marker; Progress with weight trend and weighed share
- Evening nudge, reminder preferences and food scale setting in Me
- Signup consents, privacy policy and terms pages, account deletion per PRD F16 (consent retention with email hash, events kept without user id)

Done when: a new member goes from the signup link to first food logged in under 3 minutes, on both an Android phone (Sean's Pixel) and an iPhone (installed to home screen, signed in by code).

## M3. Client features (F5, F6, F7, F8, photo logging)
- Weekly check-in flow, configurable questions with report tags, reminders, overdue logic
- Habit library and assignments, daily checks, streaks
- Messaging with photos and push, P5 message safety screen
- Photo logging with P2, and the log bar camera icon (locked for free users, opens the upgrade screen; PM 2026-10-15)
- Weekly report with P4 headline and the Weighed stat card

Done when: a test client completes a full week cycle end to end.

## M4. Coach loop (F9, F10, F12, F13, F14, F15)
- Roster with flags and filters, including "targets not reviewed"
- Weekly review prep job with P3 (amount source counts in the input), review card queue with weighed share, edit and send, report generation
- Client invite with comped or external flag
- Coach settings screen including AI settings with field limits and counters, hand portion conversions, preview, versions, rollback
- Metrics page with the north star as defined in PRD section 5, active this week, and weighed share
- `evals/review.jsonl` graded by Sean

Done when: Sean reviews 10 test clients averaging 3 minutes or less each.

## M5. Billing, compliance, polish (F11, F16 paid disclosure)
- Upgrade screen, Stripe Checkout, webhooks, cancel, comp
- Price from Stripe, new price on change with the old one archived
- Downgrade behavior per PRD F11: locks, read-only thread and reports, user-editable targets
- State disclosure acceptance on paid signup
- Locked states for free users (report preview, coaching card; the camera lock ships in M3)
- Accessibility audit (axe plus manual VoiceOver), performance pass, copy review against DESIGN_SYSTEM.md rules
- Bug bash

Done when: Stripe test mode upgrade works end to end and the accessibility audit passes. **Closed alpha starts.**

## Alpha (2 to 3 weeks)
Sean plus current clients. Google Form retired. Daily bug triage. Track the north star and guardrails.

Exit to gym beta when: no open P0 bugs, 90% of alpha check-ins on time, review time trending to 3 minutes, parsing complaints rare.

## Gym beta (6 weeks)
Open free tracking to all members. Measure north star at week 6.
