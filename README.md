# Honest Reps engineering handoff

Drop this folder's contents at the root of a new repo, then open it in Claude Code and run prompt 1 from `AGENT_PROMPTS.md`.

| File | What it is |
|---|---|
| `CLAUDE.md` | Standing instructions the agent reads every session |
| `docs/PRD.md` | Problem, users, tiers, metrics, features F1 to F17 with acceptance criteria |
| `docs/DESIGN_SYSTEM.md` | Tokens, type, components, screen layouts, copy rules, accessibility |
| `docs/ARCHITECTURE.md` | Stack, module boundaries, data model, key flows, env vars, testing |
| `docs/AI_PROMPTS.md` | Every LLM call: locked layer, coach-editable layer, schemas, fallbacks, evals |
| `docs/MILESTONES.md` | Build order M0 to M5, alpha and beta exit criteria |
| `docs/QUESTIONS.md` | Open decisions and Sean's owner tasks |
| `docs/CHANGELOG.md` | What shipped, kept by the agent |
| `AGENT_PROMPTS.md` | Prompts to paste into Claude Code at each step |

## Local development

Prerequisites: Node 24, Docker Desktop (running), and pnpm via corepack (`corepack install -g pnpm@10.34.7`).

```
pnpm install
pnpm db:start          # local Supabase in Docker
pnpm env:local         # writes .env.local from the local stack
pnpm db:reset          # migrations + seed (coach@example.test plus 2 sample members)
pnpm dev               # http://127.0.0.1:3000
```

Sign in emails land in the local mail catcher at http://127.0.0.1:54324.

Checks: `pnpm typecheck && pnpm lint && pnpm test` (unit + RLS, needs the local stack) and `pnpm e2e`.
