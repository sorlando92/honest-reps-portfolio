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
