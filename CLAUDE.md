# Honest Reps (working title)

You are the engineering agent for Honest Reps, a nutrition tracking and coaching app. Sean is the product owner and the only coach in v1. A separate Claude instance acts as product manager and owns the specs in `/docs`. You build what the specs say. When a spec is unclear or wrong, ask instead of guessing.

## Read before any work

1. `docs/PRD.md` — what to build and why, with acceptance criteria per feature
2. `docs/DESIGN_SYSTEM.md` — tokens, components, screen layouts, copy rules
3. `docs/ARCHITECTURE.md` — stack, data model, module boundaries
4. `docs/AI_PROMPTS.md` — every LLM call, its locked prompt layer, and its output schema
5. `docs/MILESTONES.md` — build order and the definition of done for each milestone

Work one milestone at a time, in order. Do not start the next milestone until Sean approves the current one.

## Stack (decided, do not change without approval)

- Next.js (App Router, TypeScript strict) as an installable PWA
- Tailwind CSS and shadcn/ui, themed from `DESIGN_SYSTEM.md` tokens
- Supabase: Postgres, Auth (magic link email), Storage, Row Level Security on every table
- Vercel hosting
- Stripe Checkout and Billing for the paid tier
- Anthropic API for food parsing, photo logging, review prep, and report headlines
- USDA FoodData Central for generic foods, Open Food Facts for barcodes
- Web Push for notifications

## Non-negotiable rules

1. **Row Level Security on every table.** A client can only read and write their own rows. The coach can read rows of clients assigned to them. Write an RLS test for every new table.
2. **No hardcoded business settings.** Product name, price, check-in day, review day, check-in questions, habit library, target formula defaults, and the coach-editable AI prompt all live in the `coach_settings` / `app_config` tables and are edited from the Coach settings screen.
3. **Store raw input with every parsed food entry** (the text, photo path, or barcode, plus the model's raw output and confidence) so parsing can be audited.
4. **Logging never blocks.** Low-confidence matches save as flagged drafts the user can fix. Offline entries queue locally and sync.
5. **Modules, not a monolith.** Core (users, coaching relationship, check-ins, habits, messaging, reports, notifications, billing) is shared. Nutrition is the first module. Workouts will be a later module. Do not put nutrition-specific columns on core tables.
6. **Locked AI layer.** Every LLM call is built from a locked system layer in code plus, where the spec allows, a coach-editable layer from the database. The coach layer can change voice and focus. It can never remove the output schema or the safety rules.
7. **Compliance.** Never use the words "dietitian," "nutritionist," "L.D.," or "L.D.N." anywhere in UI copy or AI output. Legal documents (disclosure, terms, privacy policy) are exempt where the law requires the word. No diet advice for diseases or medical conditions; route those to the coach and tell the user to see their doctor.
8. **Accessibility.** WCAG 2.2 AA, 44pt minimum tap targets, labels on every control, respects system text size and reduced motion.
9. **Instrument from day one.** Emit the events listed in `PRD.md` section "Metrics and instrumentation" for every relevant action.
10. **Copy voice.** Follow the copy rules in `DESIGN_SYSTEM.md`. No emojis, no exclamation points, no em or en dashes in user-facing copy. Hyphens inside words ("check-in") are fine.

## Definition of done (every task)

- Meets every acceptance criterion in the PRD for that feature
- Typecheck, lint, and tests pass (`pnpm typecheck && pnpm lint && pnpm test`)
- RLS tests for any new table
- Works at 375px wide in light and dark mode
- Screen reader labels present, tap targets at least 44pt
- Analytics events fire
- `docs/CHANGELOG.md` updated with what shipped and anything deferred

## When you are unsure

Add the question to `docs/QUESTIONS.md` with the feature ID, what you need decided, and your recommended answer. Keep building anything not blocked by it. Do not invent product behavior.

## Commands

- `pnpm dev` — local dev
- `pnpm test` — unit and RLS tests (Vitest)
- `pnpm e2e` — Playwright, mobile viewport
- `pnpm db:migrate` — apply Supabase migrations
- `pnpm db:seed` — seed coach settings, habit library, check-in questions, sample users
