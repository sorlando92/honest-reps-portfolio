# Honest Reps Milestones v1 (proposed, awaiting Sean's approval)

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
- Search, barcode via Open Food Facts, manual entry
- Edit, delete, favorites, quick add chips by time of day, optional meal tags
- Offline queue and sync
- `evals/parsing.jsonl` with first 20 cases (Sean supplies real meal descriptions)

Done when: repeat meal logs in under 5 seconds, described meal under 20 seconds, parsing eval at 85% or better, offline log syncs.

## M2. Member experience (F1, F3, F4, F17 member reminders, F16 signup consents)
- Onboarding, target formula from settings, medical screening and flag
- Required install step and push permission
- Today screen complete, Progress with weight trend
- Evening nudge, reminder preferences in Me
- Signup consents, privacy policy and terms pages, account deletion

Done when: a new member goes from the signup link to first food logged in under 3 minutes, on both an Android phone (Sean's Pixel) and an iPhone (installed to home screen, signed in by code).

## M3. Client features (F5, F6, F7, F8, photo logging)
- Weekly check-in flow, configurable questions, reminders, overdue logic
- Habit library and assignments, daily checks, streaks
- Messaging with photos and push, P5 message safety screen
- Photo logging with P2
- Weekly report with P4 headline

Done when: a test client completes a full week cycle end to end.

## M4. Coach loop (F9, F10, F12, F13, F14, F15)
- Roster with flags and filters
- Weekly review prep job with P3, review card queue, edit and send, report generation
- Client invite with comped or external flag
- Coach settings screen including AI settings, preview, versions, rollback
- Metrics page
- `evals/review.jsonl` graded by Sean

Done when: Sean reviews 10 test clients averaging 3 minutes or less each.

## M5. Billing, compliance, polish (F11, F16 paid disclosure)
- Upgrade screen, Stripe Checkout, webhooks, cancel, comp
- State disclosure acceptance on paid signup
- Locked states for free users (camera, report preview, coaching card)
- Accessibility audit (axe plus manual VoiceOver), performance pass, copy review against DESIGN_SYSTEM.md rules
- Bug bash

Done when: Stripe test mode upgrade works end to end and the accessibility audit passes. **Closed alpha starts.**

## Alpha (2 to 3 weeks)
Sean plus current clients. Google Form retired. Daily bug triage. Track the north star and guardrails.

Exit to gym beta when: no open P0 bugs, 90% of alpha check-ins on time, review time trending to 3 minutes, parsing complaints rare.

## Gym beta (6 weeks)
Open free tracking to all members. Measure north star at week 6.
