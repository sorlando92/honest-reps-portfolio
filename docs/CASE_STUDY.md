# Case study: shipping a coaching app with a two-agent AI team

**Role:** product owner. I set the strategy, approved every spec and decision, and tested each build on a real phone.
**Team:** one Claude instance as product manager (owns the specs in `/docs`) and Claude Code as the engineering agent (builds what the specs say).
**Timeline:** October 2026. First scaffold to production in 1 day; the client check-in loop live in about a week.
**Status:** live, invite-only, ahead of a closed alpha with my coaching clients.

## 1. The problem and the bet

I coach paying nutrition clients out of a CrossFit gym I co-own. Clients logged food in different apps, then retyped their numbers into a weekly Google Form. The double entry hurt three things about equally: clients skipped or half-filled the form, my weekly reviews were slow, and numbers from different apps didn't line up.

The bet ([PRD](PRD.md) section 2): **one place to log, so reporting happens automatically.** If logging is fast and the coach can review at a glance, compliance rises and coaching scales.

I set one north star and three guardrails before any code existed:

- **North star:** of everyone who finished onboarding, the share who log food on 4 or more days a week at week 6 of the gym beta. Target 40%, and people who stopped logging still count.
- **Guardrails:** 90% of check-ins on time, 3 minutes or less of coach review per client per week, and at least 2 free members upgrading during the beta.

Every event needed to measure these is listed in the PRD and fired from the first build.

## 2. The operating model

Working with AI agents is mostly a management problem: clear ownership, written standards, and checkpoints.

**Separate roles, separate artifacts.** The PM agent writes and maintains the PRD, design system, architecture and prompt specs. The engineering agent builds against them and keeps the [CHANGELOG](CHANGELOG.md). When a spec is unclear, the engineer doesn't guess. It logs the question in [QUESTIONS.md](QUESTIONS.md) with a recommended answer and keeps building anything not blocked. That file now holds 79 decisions, each traceable to the doc it changed.

**Standing rules the agent can't negotiate away.** [CLAUDE.md](../CLAUDE.md) holds ten non-negotiables, including Row Level Security on every table with a test, no hardcoded business settings, raw input stored with every AI-parsed entry, logging never blocks, and compliance language rules. It also defines "done" for every task: acceptance criteria met, typecheck, lint and tests passing, works at 375px in light and dark mode, screen reader labels, analytics events firing, and changelog updated.

**Repeatable prompts for each stage.** [AGENT_PROMPTS.md](../AGENT_PROMPTS.md) holds the prompts I use for kickoff, starting a milestone, triaging my phone-test feedback (sorted into bug, spec change or question), spec changes, design review and parsing quality passes. Each one ends with "stop and wait for approval", so I'm the gate between milestones.

**Rules enforced in code, not memory.** Copy rules (no dashes, emojis or exclamation points) and the compliance rule against protected professional titles are a [custom ESLint rule](../eslint-rules/copy-rules.mjs), so CI fails if the agent drifts.

## 3. Five decisions, and what drove them

### Picking the model with an eval, not a demo

The core feature is typing "6 oz chicken, cup of rice, some broccoli" and getting accurate macros. Before choosing a model I had a [29-case eval](../evals/README.md) built, with a dev and holdout split and explicit pass bars. It covers weighed amounts, hand portions, restaurant items, typos and no-food inputs.

| Model | Holdout meal calories in range | Median latency | Cost per parse |
|---|---|---|---|
| Haiku 5.5 | 75% | 1.7 s | $0.0003 |
| Sonnet 5.5 | 67% | 1.8 s | $0.0040 |
| Opus 5.5 | 67% | 2.2 s | $0.0081 |

**No model passed, and the most expensive one wasn't better.** All three missed the same bar, which meant the gap was in food matching and data coverage, not model intelligence. So instead of buying a bigger model, I made calorie accuracy an MVP exit gate and funded the fix that mattered: a local import of the USDA food database, including branded foods. Sonnet became the provisional default, with a note to re-test the cheaper Haiku once real alpha meals are in the eval ([Q42](QUESTIONS.md)).

### Cutting the roadmap to one exit test

Three days in, the five-milestone plan was building breadth before anyone used the app. I replaced it ([MILESTONES v2](MILESTONES.md)) with a six-step MVP and a single exit test: **I and at least 3 clients log food for 7 days, each completes one check-in, and I review them all in the app with no Google Form.** Messaging, habits, reports, billing and photo logging moved to post-MVP.

That forced a hard call on one of my own non-negotiables. Rule 4 says offline entries queue and sync. A real sync engine was too much for the MVP, so I made an explicit, documented exception ([Q46](QUESTIONS.md)): the draft stays on the phone, the card says so plainly, and Log it works once the phone is back online with no retyping. I wrote the exception into CLAUDE.md itself, so the agent wouldn't treat a broken rule as precedent.

### Descoping restaurant data without blocking logging

Curating chain restaurant nutrition by hand was slow. I stopped at six chains ([Q41](QUESTIONS.md)) and let everything else fall back to a generic match marked as an estimate and flagged for review. That kept a product principle intact (logging never blocks, low confidence is shown rather than hidden) while cutting a time sink. The eval was updated so the uncovered case expects a flagged estimate, which keeps the scoring honest.

### Testing on a real phone catches what CI misses

CI ran green, but my first phone test showed entry times in UTC. The root cause was a seeded account with no timezone, and Today was querying a loose 36-hour window. The fix went beyond the symptom: one module became the single source of truth for local days, including 23- and 25-hour DST days, with tests for 11:30 PM Central in summer and winter. The rule was recorded in the architecture doc so later features (adherence, streaks, reports) inherit it. Every MVP step now ends with a scripted demo on my phone.

### Security and cost controls before the first tester

Before inviting anyone, the app went through a security audit and I fixed every must-fix finding first: invite-only signup enforced in the database, security headers on every route, rate limits that fail closed, and immediate account deletion for anyone under 18. Separately, I added a per-client switch for AI features, off by default for new signups and on when I send an invite, so AI cost can't grow faster than paying coaching relationships.

## 4. Guardrails for AI in a health-adjacent product

- **Locked prompt layer.** Every LLM call is built from a system layer in code plus, where allowed, a coach-editable layer from the database. The coach layer can change voice and focus but can never remove the output schema or the safety rules ([AI_PROMPTS.md](AI_PROMPTS.md)).
- **Auditability.** Every parsed entry stores the raw input, the model's raw output and its confidence, so any number can be traced back.
- **Calibrated uncertainty.** Low-confidence items save as flagged entries with a nudge to weigh the food, instead of being silently trusted or blocked.
- **Scope of advice.** No diet advice for medical conditions. Those go to the coach, and the user is told to see their doctor. A state-required disclosure is accepted before coaching starts.
- **Privacy by default.** Row Level Security on every table, and error reports that carry only a user id, never email, food, weight or health data.

## 5. Where it stands and what's next

**Shipped:** text logging with AI parsing, search, barcode and label scan; Today and Progress dashboards; onboarding with calculated targets; invites, weekly check-ins with photos, coach replies and reminders; error monitoring; and encrypted weekly database backups.

**Next:** the coach review view, self-serve account deletion and legal pages, then the closed alpha against the exit test above. After that come the post-MVP features and a 6-week gym beta to measure the north star.

**What I'd carry to any AI product team:**
- Write the eval before choosing the model. It changed where the money went.
- Put standards where the agent can't forget them: a rules file, a definition of done, lint rules and CI.
- Keep a decision log. 79 questions answered in writing is why a fast build stayed coherent.
- When cutting scope breaks one of your own rules, change the rule in writing instead of quietly ignoring it.
