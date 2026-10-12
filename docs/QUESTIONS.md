# Open questions and owner tasks

Engineering adds questions here with: feature ID, the decision needed, and a recommended answer. Product answers inline and marks them resolved.

## Owned by Sean (before alpha unless noted)

1. **Paid price.** Set in Coach settings before M5 ships. Not a code blocker.
2. **state statute.** Verify sections 324.200 to 324.225 (Dietitian Practice Act) and approve the disclosure text. Blocks paid signup going live.
3. **AI reply samples.** Work through scenarios with the PM: on track; scale stalled with good adherence; low logging week; missed check-in; travel or weekend slip; performance win; low energy and poor sleep; wants to quit; ready for a target change; medical mention. Produce 10 to 20 real replies for the editable layer and `evals/review.jsonl`. Blocks M4 sign-off.
4. **Parsing eval inputs.** 50 real meal descriptions from clients (anonymized). 20 needed for M1.
5. **Qualifications text** for the disclosure document.
6. **Privacy policy and terms.** Engineering ships templates; Sean approves final text before alpha.
7. **Product name.** Honest Reps is a working title in `app_config`. Not a blocker.
8. **Accounts for M0.** GitHub repo, Supabase project, Vercel team. Sean is creating these. Blocks the M0 deploy steps.
9. **Email sender.** Supabase's built-in email allows only a few emails per hour and is for testing only. Pick a transactional email provider (recommend Resend) and verify a sending domain. **Now blocks M0** (updated 2026-10-12): Supabase only allows editing email templates once custom SMTP is set up, and the default template has no 6 digit code and a link format `/auth/confirm` does not accept. Sign in on the hosted project fails until this is done.
10. **Two-factor on owner accounts.** Turn on two-factor (authenticator app) for the Supabase, GitHub, Vercel and Stripe accounts before the alpha. Does not block M0. See Q31.

## Engineering questions

Numbering follows the kickoff review (2026-10-12). The v1.1 handoff reset this file, so the open questions are restored here.

### Resolved by Sean (2026-10-12, folded into v1.1 specs)

- **Q1** Spec file mapping confirmed. The mislabeled root copies are gone, and the v1.1 files are in `docs/`.
- **Q2** Email OTP: every sign-in email has a magic link and a 6 digit code.
- **Q31** (2026-10-12) Multi-factor authentication is out of scope for v1. App sign in stays passwordless email OTP with no second factor, and Supabase Auth MFA stays off. Revisit if the coach view or billing ever needs stronger sign in. Owner account two-factor is tracked separately as owner task 10. PM: add MFA to PRD section 8 non-goals.
- **Q4** The coach sees full data for all assigned users, free and paid. A `coach_visibility` consent is collected at signup.
- **Q6** Paid Vercel plan before real users. Jobs run from Supabase pg_cron plus Edge Functions every 15 minutes. No Vercel cron.
- **Q7** Legal documents are exempt from the banned title check. "No dashes" means no em or en dashes.
- **Q12** M2 exit no longer depends on invites.
- **Q13** Minimum age is 18.
- **Q14** Calorie floor at BMR. Protein is based on goal weight and capped at a configurable 220 g. Goal weight is optional.
- **Q25** State disclosure is accepted before Stripe Checkout, and in onboarding for invited paid clients.

### Applied with engineering's recommendation

Sean said to apply these because they change neither the data model, nor the stack, nor anything a user sees.

- **Q5** Product name before login. Applied without a schema change: `app_config` is readable by signed in users, and the coach writes it. The manifest and sign in page read the public values on the server. iOS keeps the app name shown at install time.
- **Q11** The match score threshold lives in `app_config` (start at 0.5) and is tuned against the parsing eval in M1.
- **Q21** The editable AI layer is not filtered. It sits in a clearly marked section, the locked rules come after it, output is validated with Zod, and a code check rejects banned words, emojis, exclamation points, and em or en dashes. On failure, retry once, then use the fallback.
- **Q23** Review time adds up all time the card is visible in the foreground until the send.
- **Q9 (engineering part)** The offline queue syncs when the app opens, returns to the foreground, or goes back online, plus Background Sync where it exists. Barcodes are decoded with a JS library, because iOS has no BarcodeDetector.

### Open: needs Sean (each changes the data model or what a user sees)

**Q3. [Architecture] `role` and `tier` overlap.** `profiles.role` includes `client`, and `profiles.tier` includes `paid`, so the two can disagree.
Recommendation: `role: user|coach` plus `tier` plus `billing_source`. A client is any user with tier paid.
Blocks: nothing yet. M0 builds the spec as written (`member|client|coach` plus `tier`), and a migration can change it before real users.

**Q8. [F2] What "draft" and "flagged" mean, and what counts toward totals.**
Recommendation:
- `final` is set on "Log it". Flagged items count toward totals.
- `draft` is a confirmation card closed without "Log it". It does not count.
- `pending` is offline text or photo waiting to be parsed. It does not count until parsed.
- A day counts as "logged" when it has at least one `final` entry.

Blocks: M1.

**Q9b. [F2] Open Food Facts attribution.** The data is ODbL licensed.
Recommendation: one caption line on barcode results: "Product data from Open Food Facts". Blocks: M1.

**Q10. [AI_PROMPTS] Where AI call logs go.** The spec logs them to `events`, which feeds product metrics.
Recommendation: a separate `ai_calls` table that only the coach and the server can read. Blocks: M1.

**Q15. [F1, F11] Targets for a new paid user before the coach sets them.**
Recommendation: formula targets carry over and the user can no longer edit them. The first review card prompts the coach to confirm them. Blocks: M4.

**Q16. [F16] What account deletion does with analytics and billing.**
Recommendation: cancel Stripe first, delete all rows and photos, and keep `events` rows with `user_id` set to null. The privacy policy says so. Blocks: M2.

**Q17. [F5] Weekly cycle timing.**
Recommendation:
- All cycle times use the coach's timezone. Reminders still go at each user's local time.
- Default review day is Monday.
- The review week is the 7 days ending on check-in day.
- Check-ins are overdue at 23:59 the day after check-in day.
- Submission is allowed until review day 00:00, with `on_time = false` after the overdue time.
- P3 prep runs at review day 00:00.

Blocks: M3.

**Q18. [F7] Mapping the "feel and performance" report cards to configurable questions.**
Recommendation: a `report_metric` tag on `checkin_questions` (energy, sleep, hunger, performance). Blocks: M3.

**Q19. [F11] What happens to data on downgrade or cancel.**
Recommendation: keep all data, lock paid features, keep past reports readable, and make the thread read only. Blocks: M5.

**Q20. [F9] Roster flag definitions.**
(a) Weight flat means the 21 day trend change is within ±0.5% of bodyweight while the goal is lose fat or build muscle. The threshold lives in `app_config`.
(b) The medical flag stays until the coach marks it reviewed.
(c) P3's AI flags show on the review card only, except `medical_mention`, which also raises the roster flag.

Blocks: M4.

**Q21b. [F13] Length caps on the editable AI fields** (for example 500 characters per field, and 20 examples of up to 800 characters each). These caps are visible in Coach settings. Blocks: M4.

**Q22. [Navigation] Sean's tabs.** The spec gives Sean a 5th tab in addition to Coach, but a message thread with himself makes no sense.
Recommendation: Sean sees Today, Progress, Clients, Me. Blocks: nothing. M0 builds the spec as written (5 tabs).

**Q24. [F15] Definition of "active user" for the north star.**
Recommendation: a user who signed up at least 7 days ago and logged food in the last 14 days. Blocks: M4.

**Q26. [F14] Price stored twice** (`price_cents` and `stripe_price_id`).
Recommendation: read the displayed price from Stripe and drop `price_cents`. Blocks: M5.

**Q27. [F1, Architecture] Where the onboarding body data lives.** v1.1 collects date of birth, sex, height, current weight, optional goal weight, goal, and activity level, but the data model has no columns for them. Rule 5 bars nutrition columns on core tables.
Engineering decision for M0, since Sean asked for the goal weight column now:
- `date_of_birth` goes on `profiles`, because the age gate is core.
- A nutrition module table, `nutrition_profiles`, holds `user_id, goal, sex, height_cm, activity_level, goal_weight_kg`.
- Current weight comes from `weights`.

PM to confirm, and to add these to ARCHITECTURE.md.

**Q28. [Docs] Places v1.1 was not fully updated.** The PM should fix these, and engineering follows the decisions above in the meantime.
- CLAUDE.md stack and MILESTONES M0 still say "magic link". The decision is email OTP with both a link and a code.
- AI_PROMPTS global safety rule says "no dashes". It should say no em or en dashes.
- ARCHITECTURE `profiles` is missing the columns in Q27. Weekly cycle reminders should say "user local time".
- `docs/QUESTIONS.md` and `docs/CHANGELOG.md` in the v1.1 zip were blank templates. This file restores the questions.

**Q29. [F1, F14, F17] Default values the specs leave open.** The seed sets only the values the specs give: check-in day Friday, protein cap 220 g, evening nudge 19:00, adherence 10% and 90%. These need numbers before M2 (formula) and M3 (check-in reminders):
- activity multipliers. Recommendation: Mifflin St Jeor standard values: sedentary 1.2, light 1.375, moderate 1.55, very active 1.725, extra active 1.9.
- goal adjustments. Recommendation: lose fat -20%, maintain 0, build muscle +10%, performance +5%.
- protein per lb of goal weight. Recommendation: 1.0 g.
- check-in reminder times. Recommendation: 08:00 morning, 19:00 follow-up.
- weight trend smoothing (F4). Recommendation: EWMA factor 0.1.

Blocks: M2.

**Q30. [Metrics] `signup_started` cannot tell new users from returning ones** without revealing whether an email has an account. M0 fires it on "Send code" from any device that has never signed in, so a returning user on a new device counts once. `signup_completed` fires in the database when the account is created, so it is exact. Recommendation: accept this. Blocks: nothing.
