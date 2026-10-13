# Open questions and owner tasks

Engineering adds questions here with: feature ID, the decision needed, and a recommended answer. Product answers inline and marks them resolved.

## Owned by Sean (before alpha unless noted)

1. **Paid price.** Set in Coach settings before M5 ships. Saving it creates the Stripe price (Q26). Not a code blocker.
2. **state statute.** Verify sections 324.200 to 324.225 (Dietitian Practice Act) and approve the disclosure text. Blocks paid signup going live.
3. **AI reply samples.** Work through scenarios with the PM: on track; scale stalled with good adherence; low logging week; missed check-in; travel or weekend slip; performance win; low energy and poor sleep; wants to quit; ready for a target change; medical mention. Produce 10 to 20 real replies for the editable layer and `evals/review.jsonl`. Blocks M4 sign-off.
4. **Parsing eval inputs.** No longer blocks M1: the synthetic v0.2 set in `evals/` is the M1 gate. Real anonymized meals are still wanted as new cases toward the 50 case beta target. See Q35.
5. **Qualifications text** for the disclosure document.
6. **Privacy policy and terms.** Engineering ships templates in M2; the privacy policy states the PRD F16 deletion terms exactly. Sean approves final text before alpha.
7. **Product name.** Honest Reps is a working title in `app_config`. Not a blocker.
8. **Accounts for M0.** Done 2026-10-13: GitHub (sorlando92/honest-reps), Supabase (honest-reps), Vercel (Hobby plan, app live at `app.honestreps.app`). Remaining: upgrade Vercel to Pro before any client uses the app (Q6); add the root `honestreps.app` redirect (no DNS record yet). Commits must be authored as coach@example.test or Vercel blocks the deploy.
9. **Email sender.** Done 2026-10-13: Resend sends from `auth@mail.honestreps.app` through Supabase SMTP; both sign in templates set in the hosted dashboard and verified with a test email.
10. **Two-factor on owner accounts.** Turn on two-factor (authenticator app) for the Supabase, GitHub, Vercel, Cloudflare, Resend and Stripe accounts before the alpha. Does not block M0. See Q31.
11. **M1 API keys.** Anthropic API key and USDA FoodData Central API key. Put them in Vercel environment variables (Production and Preview) and in the local `.env.local`, never in chat or the repo. Blocks M1.

## Engineering questions

Numbering follows the kickoff review (2026-10-12).

### Open: needs a decision

**Q20. [F9] Roster flag definitions.**
(a) Weight flat means the 21 day trend change is within ±0.5% of bodyweight while the goal is lose fat or build muscle. The threshold lives in `app_config`.
(b) The medical flag stays until the coach marks it reviewed.
(c) P3's AI flags show on the review card only, except `medical_mention`, which also raises the roster flag.
Blocks: M4.

**Q32. [F5, F10] Late check-ins after review prep.** Check-ins stay open until Sunday, but AI review prep runs Saturday 10:00pm. A client who submits between Saturday 10:00pm and Sunday gets a review card built without their check-in.
Recommendation: when a check-in arrives after prep has run, rerun P3 for that client only and replace the card if the coach has not opened it yet. Blocks: M4.

**Q33. [F14, rule 5] Where hand portion conversions live.** They are nutrition-specific, and CLAUDE.md rule 5 keeps nutrition columns off core tables, but `coach_settings` is core. M1 needs them seeded, because parsing converts hand portions to grams (eval case p022).
Recommendation: a nutrition module table `nutrition_coach_settings` (coach_id, hand_portions jsonb) with the same RLS as `coach_settings`, edited from the same Coach settings screen. Blocks: M1.

**Q34. [F2] "Estimated" and "Check this" on the same row.** The eval set treats every estimated item as flagged (confidence capped at 0.6, under the 0.7 flag line). PRD F2 shows flagged rows with a caution dot and "Check this", and the precision spec adds "Estimated" plus "Weigh it". As written, an estimated row carries both, and every photo entry (always estimated) stays "Check this" until confirmed.
Recommendation: keep one `flagged` value in data, but show one signal per row by cause. A weak food match shows the caution dot, "Check this" and alternatives. A good match with an estimated amount shows only "Estimated" plus "Weigh it" (or the hand picker), with no caution dot. On the timeline, "est." replaces "Check this" when the amount is the only reason. Blocks: M1 confirmation card.

**Q35. [M1] Real meals versus the synthetic eval set.** `evals/README.md` v0.2 says the synthetic set replaces "Sean supplies 20 real meals" for M1. The PM decisions round 2 say Sean will supply 20 real meals.
Recommendation: v0.2 is the M1 gate. When Sean's meals arrive they are added as p025 onward (set v0.3), split between dev and holdout, and count toward the 50 case beta target. They do not block M1. Blocks: nothing.

**Q36. [F2, M1] Where chain restaurant nutrition comes from.** Three eval cases are chain meals with published numbers (p003 Chipotle, p004 Chick-fil-A, p012 Domino's). USDA FoodData Central covers generic and packaged branded foods well but has little restaurant menu data, and Open Food Facts is barcode first. Without another source these cases likely fail "meal calories in range" and the label amount source.
Recommendation: seed a small curated set of `food_items` with `source = custom` for the chains in the eval plus the ones gym members eat most (Sean names 5 to 10), using each chain's published nutrition page, re-verified before each release as `evals/README.md` already requires. A paid restaurant database API would be a stack change and is not recommended for v1. Blocks: the M1 eval pass bars.

### Resolved by the PM (round 2, 2026-10-13, commit "docs: PM decisions round 2")

- **Q3** `role` is `member` or `coach` only. Paid status lives only in `tier` plus `billing_source`. "Client" is UI language for a member with tier paid.
- **Q15** New paid users keep formula targets until the coach changes them. The coach sees a "targets not reviewed" flag until he saves or confirms them once.
- **Q16** Account deletion: delete all user data and storage objects; keep events with `user_id` null; keep consents 3 years with `user_id` removed and the email replaced by a one-way hash, then purge; cancel Stripe immediately and delete our subscription row. The privacy policy says exactly this. See PRD F16.
- **Q18** Each check-in question has an optional report tag (energy, sleep, hunger, performance, none). Tagged scale questions feed the feel and performance card; untagged ones show only on the review card.
- **Q19** Downgrade or cancel keeps all data. See PRD F11.
- **Q21b** Voice 600 characters, focus 600, phrases to use 400, phrases to avoid 400, up to 20 example replies of up to 1,200 characters. Live counter.
- **Q24** North star = of everyone who completed onboarding, the % who logged food on 4 or more days in the measured week. New `onboarding_completed` event. Metrics also show "active this week" (logged at least 1 day).
- **Q26** Stripe is the source of truth for price. Only `stripe_price_id` is stored. A price change creates a new Stripe price and archives the old one.
- **Q30** Accepted: `signup_started` may count a returning user once on a new device.
- **M0 review findings** 1, 2, 5, 6 and 7 approved for a fix before M1. Finding 3: `events.user_id` becomes `on delete set null`.
- **MILESTONES.md** approved as written.
- **Spec change: precision first logging** applied to PRD, DESIGN_SYSTEM, ARCHITECTURE, AI_PROMPTS, MILESTONES, plus `evals/` v0.2.

### Resolved by the PM (2026-10-12, applied in commit "docs: PM decisions 2026-10-12")

- **Q8** Entry states defined in PRD F2: draft (unsaved, on device, never counts), flagged (saved, counts, "Check this" until edited or confirmed), pending (offline, does not count, parses and saves automatically when online, notify only if flagged).
- **Q9b** Attribution "Food data from Open Food Facts", linking to openfoodfacts.org, on barcode results and in Me, About.
- **Q10** Separate `ai_calls` table for every LLM call. `events` is product analytics only. Built in M1.
- **Q17** Weekly cycle in the coach's timezone: check-in opens Friday 6:00am, overdue Saturday 6:00am, AI review prep Saturday 10:00pm, review day Sunday. See Q32 for one gap.
- **Q22** Coach role tabs: Today, Progress, Clients, Me. Clients replaces Coach. Members and clients unchanged.
- **Q27** `date_of_birth` on `profiles`; all other onboarding body data in `nutrition_profiles`. In ARCHITECTURE.md.
- **Q28** Doc fixes applied: "email OTP with a 6-digit code and a link" in CLAUDE.md and MILESTONES; "no em or en dashes" in AI_PROMPTS; weekly cycle reminders on user local time; domain plan in ARCHITECTURE. The repo is the source of truth for all docs.
- **Q29** Seed defaults: activity multipliers 1.2, 1.375, 1.55, 1.725, 1.9; goal adjustment lose fat -20%, maintain 0%, build muscle +10%, performance +5%; protein per lb of goal weight by goal 1.0, 0.8, 1.0, 0.9, cap 220 g; calorie floor at BMR; EWMA alpha 0.1; reminders 7:00pm nudge, 8:00am check-in, 7:00pm follow-up. All editable in Coach settings.
- **Q31** Multi-factor authentication is a v1 non-goal (PRD section 8). Sign in stays passwordless email OTP. Owner account two-factor is owner task 10.
- **COACH_EMAIL** env var approved and added to ARCHITECTURE.md.

### Resolved by Sean (2026-10-12, folded into v1.1 specs)

- **Q1** Spec file mapping confirmed.
- **Q2** Email OTP: every sign-in email has a 6 digit code and a link.
- **Q4** The coach sees full data for all assigned users, free and paid. A `coach_visibility` consent is collected at signup.
- **Q6** Paid Vercel plan before real users. Jobs run from Supabase pg_cron plus Edge Functions every 15 minutes. No Vercel cron.
- **Q7** Legal documents are exempt from the banned title check. "No dashes" means no em or en dashes.
- **Q12** M2 exit no longer depends on invites.
- **Q13** Minimum age is 18.
- **Q14** Calorie floor at BMR. Protein is based on goal weight and capped at a configurable 220 g. Goal weight is optional.
- **Q25** State disclosure is accepted before Stripe Checkout, and in onboarding for invited paid clients.

### Applied with engineering's recommendation

These change neither the data model, nor the stack, nor anything a user sees.

- **Q5** Product name before login: `app_config` is readable by signed in users and written by the coach. The manifest and sign in page read it on the server. iOS keeps the app name shown at install time.
- **Q11** The match score threshold lives in `app_config` (start at 0.5) and is tuned against the parsing eval in M1.
- **Q21** The editable AI layer is not filtered. It sits in a clearly marked section, the locked rules come after it, output is validated with Zod, and a code check rejects banned words, emojis, exclamation points, and em or en dashes. On failure, retry once, then use the fallback.
- **Q23** Review time adds up all time the card is visible in the foreground until the send.
- **Q9 (engineering part)** The offline queue syncs when the app opens, returns to the foreground, or goes back online, plus Background Sync where it exists. Barcodes are decoded with a JS library, because iOS has no BarcodeDetector.
