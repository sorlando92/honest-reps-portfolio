# Prompts for the Claude Code agent

Paste these into Claude Code in order. Put this whole folder at the root of a new repo first so `CLAUDE.md` and `/docs` are in place.

---

## 1. Kickoff (run once)

```
Read CLAUDE.md and every file in /docs before doing anything.

Then, without writing code yet:
1. Summarize the product in 5 lines so I can confirm you understood it.
2. List any contradictions, gaps, or risks you see across PRD.md, DESIGN_SYSTEM.md, ARCHITECTURE.md, and AI_PROMPTS.md. Add each to docs/QUESTIONS.md with your recommended answer.
3. Propose the task breakdown for M0 as a checklist with an estimate per task.

Stop and wait for my approval.
```

## 2. Start a milestone (reuse for M0 through M5)

```
Start milestone M{N} from docs/MILESTONES.md.

Rules:
- Build only what M{N} lists. If something from a later milestone is needed, stub it and note it in CHANGELOG.md.
- Follow the definition of done in CLAUDE.md for every task.
- Commit in small, reviewable commits with clear messages.
- If you hit a product question, add it to docs/QUESTIONS.md with a recommendation and keep going on unblocked work.

When finished:
1. Run typecheck, lint, unit, RLS, and e2e tests and show the results.
2. Give me a demo script: the exact steps to try every acceptance criterion on my phone.
3. List anything deferred or not meeting spec.

Stop and wait for my sign-off before the next milestone.
```

## 3. Review and fix after my phone test

```
Here is my feedback from testing M{N} on my phone:

{paste notes}

For each item: say whether it's a bug (doesn't match the spec), a spec change (I'm asking for something new), or a question. Fix the bugs now. For spec changes, update the relevant doc in /docs first, show me the diff, then implement after I approve.
```

## 4. Spec change from the PM

```
The product spec changed. Updated files: {list}.
Read the diffs, tell me which built code is affected and the plan to update it, then wait for approval.
```

## 5. Design review pass

```
Do a design review of every screen built so far against docs/DESIGN_SYSTEM.md.
Check: tokens only (no stray colors), type scale, 8pt spacing, 44pt tap targets, light and dark mode, reduced motion, copy rules (no emojis, exclamation points, or dashes; no protected titles), and empty states.
Take screenshots at 375px in both themes, list every deviation, then fix them.
```

## 6. Parsing quality pass

```
Run pnpm eval:parsing. Show the pass rate and the 10 worst cases with the model output, matched foods, and expected values.
Propose changes to the P1 prompt or matching logic, apply them, rerun, and show before and after. Do not change the output schema.
```

## 7. Pre-alpha checklist

```
Prepare for the closed alpha. Confirm and show evidence for:
- All P0 acceptance criteria in PRD.md pass
- RLS tests cover every table
- Stripe test mode upgrade, cancel, and comp work
- Account deletion removes all rows and storage objects
- Push works on an installed iPhone PWA and Android
- Offline log and sync works
- Accessibility audit passes
- All events in PRD section 5 fire
- Coach settings can change every configurable value without a deploy
List anything not ready and what it would take.
```
