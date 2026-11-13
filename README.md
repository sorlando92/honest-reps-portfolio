# Honest Reps

A nutrition tracking and coaching app I designed, specified and shipped as the product owner, built with a two-agent AI team: one Claude instance as product manager and Claude Code as the engineer. It is live in production as an invite-only PWA, ahead of a closed alpha with my own coaching clients.

**Start here:** [Case study](docs/CASE_STUDY.md), about a 10 minute read.

## The problem

I coach paying nutrition clients out of a CrossFit gym I co-own. Clients logged food in whatever app they liked, then copied their numbers into a weekly Google Form. Compliance slipped, reviews were slow, and numbers from different apps didn't line up. Honest Reps puts logging and coaching in one place so reporting happens automatically, and I can review a client in 3 minutes or less.

## What this repo shows

| If you want to see | Look at |
|---|---|
| How I frame a product | [PRD](docs/PRD.md): problem, thesis, users, tiers, north star and guardrails, 17 features with acceptance criteria |
| How I direct AI agents | [CLAUDE.md](CLAUDE.md) (standing rules for the engineering agent) and [AGENT_PROMPTS.md](AGENT_PROMPTS.md) (the prompts I run at each stage) |
| How decisions get made | [QUESTIONS.md](docs/QUESTIONS.md): 79 logged questions, each with the agent's recommendation and the decision |
| How I cut scope | [MILESTONES.md](docs/MILESTONES.md): the M1 to M5 plan replaced mid-build by a six-step MVP with one exit test |
| How I measure AI quality | [evals/](evals/README.md): a parsing eval with a holdout split and pass bars, used to choose the model |
| How I keep LLM output safe | [AI_PROMPTS.md](docs/AI_PROMPTS.md): a locked system layer in code, plus a coach-editable layer that can't remove the schema or safety rules |
| What actually shipped | [CHANGELOG.md](docs/CHANGELOG.md): dated entries for every build, decision round and deferral |

## By the numbers

- 66 commits over 10 days, from first scaffold (Oct 12) to a production deploy the next day, and the full client check-in loop live a week in
- 7 product specs (PRD plus 6 feature specs) and a design system
- 79 product questions logged and decided
- 28 database migrations, with Row Level Security on every table and RLS tests in CI
- 60+ unit, RLS and end-to-end test files, run on every pull request at a 375px phone viewport in light and dark mode
- A 29-case parsing eval that compared three models on accuracy, latency and cost

## Stack

Next.js (App Router, TypeScript strict) as an installable PWA, Tailwind and shadcn/ui, Supabase (Postgres, Auth, Storage, RLS), Vercel, the Anthropic API, USDA FoodData Central and Open Food Facts, Web Push, Sentry.

## About this copy

This is a public copy of a private working repo. Client data, credentials and the database backup workflows stay private, and some personal and business details in the docs are generalized. The commit history is otherwise intact, so you can follow how the specs and the code changed together.

## Run it locally

Prerequisites: Node 24, Docker Desktop (running), and pnpm via corepack (`corepack install -g pnpm@10.34.7`).

```
pnpm install
pnpm db:start          # local Supabase in Docker
pnpm env:local         # writes .env.local from the local stack
pnpm db:reset          # migrations + seed (coach@example.test plus 2 sample members)
pnpm dev               # http://127.0.0.1:3000
```

Sign-in emails land in the local mail catcher at http://127.0.0.1:54324. AI logging needs your own `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`).

Checks: `pnpm typecheck && pnpm lint && pnpm test` (unit and RLS, needs the local stack) and `pnpm e2e`.

&copy; Sean Orlando. All rights reserved. Shared for review, not licensed for reuse.
