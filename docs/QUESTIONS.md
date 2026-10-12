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
8. **Accounts for M0.** Done: GitHub (sorlando92/honest-reps), Supabase (honest-reps). Vercel still to set up. Blocks the M0 deploy.
9. **Email sender.** Blocks M0: Supabase only allows editing email templates once custom SMTP is set up, and the default template has no 6 digit code and a link format `/auth/confirm` does not accept. Decided 2026-10-12: Resend on Sean's domain, sending domain `mail.honestreps.app`, sender `auth@mail.honestreps.app` (see ARCHITECTURE.md "Domains and email"). Sean bought `honestreps.app` on Cloudflare Registrar. Remaining: Resend account, DNS records, Supabase SMTP settings, paste the template.
10. **Two-factor on owner accounts.** Turn on two-factor (authenticator app) for the Supabase, GitHub, Vercel, Cloudflare, Resend and Stripe accounts before the alpha. Does not block M0. See Q31.

## Engineering questions

Numbering follows the kickoff review (2026-10-12).

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

### Open: needs a decision (each changes the data model or what a user sees)

**Q3. [Architecture] `role` and `tier` overlap.** `profiles.role` includes `client`, and `profiles.tier` includes `paid`, so the two can disagree.
Recommendation: `role: user|coach` plus `tier` plus `billing_source`. A client is any user with tier paid.
Blocks: nothing yet. M0 builds the spec as written, and a migration can change it before real users.

**Q15. [F1, F11] Targets for a new paid user before the coach sets them.**
Recommendation: formula targets carry over and the user can no longer edit them. The first review card prompts the coach to confirm them. Blocks: M4.

**Q16. [F16] What account deletion does with analytics and billing.**
Recommendation: cancel Stripe first, delete all rows and photos, and keep `events` rows with `user_id` set to null. The privacy policy says so. Blocks: M2.

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

**Q24. [F15] Definition of "active user" for the north star.**
Recommendation: a user who signed up at least 7 days ago and logged food in the last 14 days. Blocks: M4.

**Q26. [F14] Price stored twice** (`price_cents` and `stripe_price_id`).
Recommendation: read the displayed price from Stripe and drop `price_cents`. Blocks: M5.

**Q30. [Metrics] `signup_started` cannot tell new users from returning ones** without revealing whether an email has an account. M0 fires it on "Send code" from any device that has never signed in, so a returning user on a new device counts once. `signup_completed` fires in the database when the account is created, so it is exact. Recommendation: accept this. Blocks: nothing.

**Q32. [F5, F10] Late check-ins after review prep.** Check-ins stay open until Sunday, but AI review prep runs Saturday 10:00pm. A client who submits between Saturday 10:00pm and Sunday gets a review card built without their check-in.
Recommendation: when a check-in arrives after prep has run, rerun P3 for that client only and replace the card if the coach has not opened it yet. Blocks: M4.
