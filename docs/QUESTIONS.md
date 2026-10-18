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
12. **Sentry.** Create a free Sentry account (sentry.io) and a Next.js project, then add Vercel environment variables (Production and Preview) `NEXT_PUBLIC_SENTRY_DSN` (Project Settings, Client Keys), `SENTRY_AUTH_TOKEN` (an organization auth token), `SENTRY_ORG` and `SENTRY_PROJECT` (the slugs in the Sentry URL), never in chat or the repo, then redeploy. Set the alert rule "a new issue is created" to email you. The code shipped 2026-10-18 and stays off until the DSN exists.
13. **Logs before alpha.** Upgrade Vercel to Pro (also owner task 8 and Q6) so runtime logs persist, or add a log drain. The Hobby plan keeps about 30 minutes, which lost the logs for the onboarding bug on 2026-10-16. Blocks alpha.
14. **Gate production deploys on CI.** In Vercel, Project Settings, Deployment Checks: add the GitHub check "CI / check" as required for Production, so a push to main is promoted only after CI passes. It is a dashboard setting; engineering cannot reach it without a Vercel token, and the alternative (deploying from GitHub Actions) also needs a `VERCEL_TOKEN` secret from you. Until then, a red CI run still deploys.

15. **Google sign in setup (AUTH_SPEC; paused 2026-10-18, post-MVP).** Google Cloud project, consent screen, OAuth client, publish to Production, then the client ID and secret in Supabase (Authentication, Providers, Google) and the app callback in the Supabase redirect URLs. Engineering sent the exact values on 2026-10-18. Optional: the Supabase custom domain `auth.honestreps.app` (about $10 a month) so Google's consent screen shows honestreps.app; until then it shows the supabase.co host. Blocks the step 4 demo of Google sign in only.
16. **Backup secrets.** In GitHub, Settings, Secrets and variables, Actions, add `HOSTED_DB_URL` (Supabase, Connect, Session pooler connection string, with the database password filled in; reset the password under Database settings if you do not have it) and `BACKUP_PASSPHRASE` (a long random passphrase; also keep it in your password manager, since a backup cannot be opened without it). Then run "Backup" once from the Actions tab. Blocks: backups.

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

**Q35. [M1] Real meals versus the synthetic eval set.** `evals/README.md` v0.2 says the synthetic set replaces "Sean supplies 20 real meals" for M1. The PM decisions round 2 say Sean will supply 20 real meals.
Recommendation: v0.2 is the M1 gate. When Sean's meals arrive they are added as p025 onward (set v0.3), split between dev and holdout, and count toward the 50 case beta target. They do not block M1. Blocks: nothing.

**Q61. [F1, F16] Under 18 when the account already exists.** PRD F1 says under 18 cannot create an account, but sign in by email code creates the account before onboarding asks the date of birth.
Recommendation: onboarding stops at the date of birth with "Honest Reps is for adults 18 and over for now.", saves nothing from onboarding, and signs the person out. The empty account is deleted by the account deletion job when it ships in step 6 (until then it has no data beyond the email and the coach visibility consent). The date of birth is not stored. Blocks: nothing.

**Q63. [NAV_SPEC 5] Where the first name in "Hi, {first name}" comes from.** Onboarding never asks for a name, so `profiles.display_name` is empty for most users.
Recommendation: use the first word of `display_name` when set; otherwise show "Hi" alone and take the avatar initial from the email. Add a Name row under More, Account, so users can set it (one text field, saved to `display_name`). Engineering builds the fallback now and the Name row with this pass unless the PM says otherwise. Blocks: nothing.

**Q64. [NAV_SPEC 6] More rows that have no screen yet.** Reminders (time and toggle per reminder) is step 4 (F17), Delete account is step 6, Subscription comes with billing, Coach settings with step 5.
Recommendation: show only rows that work; add each row when its feature ships. Until step 4, reminders are reached through "Add to Home Screen and turn on reminders". Blocks: nothing.

**Q68. [AUTH_SPEC, F1, F16] What "only email, verified flag and name" can mean.** Supabase must keep the Google account id (`sub`) and provider in `auth.identities` to sign the person in again and to link identities. It also copies the picture URL and other claims into the identity data and user metadata on every Google sign in.
Recommendation: a trigger on insert and update trims the Google identity data and user metadata to email, email_verified, full name and the account id; the picture is never kept, and a test checks it. The privacy policy line becomes "When you use Google, we receive your name and email address only. We keep an account identifier from Google so you can sign in again." Blocks: nothing until Google sign in is built (post-MVP, PM 2026-10-18).

**Q69. [F12, AUTH_SPEC] Invite delivery and edge cases.** (a) Delivery: the app emails the invite link from Clients through Resend, and the coach can also copy the link to text it. (b) A used link reopened by the person who used it goes to Today; anyone else sees "This invite expired. Ask your coach for a new one." (c) The coach's own account cannot claim an invite. (d) An existing free member who opens an invite becomes a paid client of the coach with the token's billing source; their data stays. (e) The coach can revoke an unused invite.
Recommendation: all five. Blocks: the invite screen in step 4.

**Q70. [AUTH_SPEC, Design system] "Continue with email" as a button or a field.** AUTH_SPEC lists two buttons. Today the screen shows the email field with Send code.
Recommendation: keep the email field visible below Continue with Google and label its button "Continue with email", so email users save a tap and the code step is unchanged. Blocks: nothing until Google sign in is built (post-MVP).

**Q71. [PRD section 5] When `signup_completed` fires.** It needs a method (google, email_code, email_link), but the database trigger fires when the email code is requested, before the method is known and before the person proves the address.
Recommendation: move `signup_completed` to the first completed sign in, written by the server step with its method. Accounts that requested a code and never entered it stop counting as signups. Blocks: nothing; can wait for Google sign in (post-MVP), or apply now so step 4 counts verified signups only.

**Q72. [F5, step 4] Seeded check-in question wording.** PRD F5 names the defaults (energy, sleep, hunger on 1 to 5, a performance note, one open question) but not their text or scale labels.
Recommendation: "How was your energy this week?" (1 Low, 5 High; tag energy), "How did you sleep this week?" (1 Poorly, 5 Very well; tag sleep), "How was your hunger this week?" (1 Rarely hungry, 5 Hungry all the time; tag hunger), "How did training go?" (short text; tag performance), "Anything else your coach should know?" (text; no tag). Weight step "Your weight this week", prefilled from the trend. Photo step "Add up to 3 progress photos" with Skip. Blocks: the check-in seed in step 4.

**Q73. [F16, step 4] State disclosure text before owner tasks 2 and 5.** Invited paid clients accept the disclosure in onboarding, but Sean has not approved the text or the qualifications line.
Recommendation: seed `coach_settings.disclosure_text` from the PRD F16 contents with qualifications "CSCS, CSPS, CF L3, NSCA CPT", record acceptances as version "draft-2026-10" like the other legal documents (Q55), and ask for acceptance again once Sean approves. Blocks: the invited client onboarding step.

**Q74. [F5, F17, step 4] Notification copy.** The design system has only the morning reminder ("Check-in is open. Takes under a minute.").
Recommendation: evening follow-up "Your check-in is still open. Takes under a minute."; coach reply "Your coach replied to your check-in."; no client push when overdue (coach flag only). Blocks: the follow-up and reply pushes.

**Q75. [F12, step 4] Invite email.** Sender and wording for the invite link (Q69a).
Recommendation: from "Honest Reps" auth@mail.honestreps.app through Resend, subject "{coach first name} invited you to {product}", body "{coach first name} set up coaching for you in {product}. Open this link on your phone to start: {link}. It works once and expires in 14 days." Names come from the coach profile and `app_config`. Blocks: the invite email only; Copy link works without it.

### Resolved by the PM (food lookup, 2026-10-17)

- **Q65** Approved: with no card open, barcode Log it saves one serving at once; from Add item it reads "Add to meal" and joins the card.
- **Q66** Sean is upgrading Supabase to Pro; engineering imports Branded on hosted once he confirms. Monthly refresh approved as a scheduled job that reports rows added, changed and removed each run; no manual refresh. Built as `.github/workflows/fdc-refresh.yml` (2nd of each month) running `scripts/fdc-refresh.mts`; each run is recorded in `fdc_import_runs`. Needs the repository secrets `HOSTED_SUPABASE_URL` and `HOSTED_SUPABASE_SERVICE_ROLE_KEY` (owner task).
- **Q67** All four approved. P1 branded matching moved to the local index now (`search_fdc_branded`, plus cached Open Food Facts products of the brand); the parsing eval reruns right after this ships.
- **Plain items:** single word everyday generic searches (egg, banana, rice, chicken breast) rank the plain Foundation or SR Legacy item first. Built as the `food_staples` reference table (40 terms, each pointing to one FDC item, reviewable like the curated chains); cases s41 to s48 in `evals/search.jsonl`.
- **Preview first:** this branch goes to a Vercel preview against hosted Supabase, with a phone test script for Sean, before production.
- **The Ascent scan was Key Lime Pie:** the barcode returned the right product. The wrong product most likely came from text logging: FDC has no Key Lime Pie, so P1 could only match another Ascent flavor. Local matching now also sees cached Open Food Facts products of the brand.


### Resolved by the PM (CI, install prompts, targets in Me, 2026-10-16)

- **Q62** Changed: the first dismissal of the install step is allowed. If the app is not installed 3 days later, Today shows one dismissible reminder banner. After that second dismissal, never prompt again. Install and reminders stay available in Me.
- **Targets in Me** (step 3): free users edit their own calories, protein, carbs and fat with the BMR floor and a confirmation to go below it; paid clients see coach-set targets read only. "Set your targets" links there.

### Resolved by the PM (step 3 and Screens v2, 2026-10-16)

- **Migrations** 20261015000008_day_notes and 20261015000009_screens_v2_events approved and applied. **Standing approval extended:** widening the events.name check to add PRD event names is approved going forward; it is listed in each update.
- **macro-*-text shades** for light mode approved (DESIGN_SYSTEM tokens).
- **Q54** Fat 30% of calories for lose fat and maintain, 25% for build muscle and performance, floor 0.3 g per lb of goal weight (current weight if none). Carbs fill the remainder, minimum 50 g. Under 50 g, fat drops toward its floor first; if both floors bind, protein and floors stay and calories rise to fit, with a note to the coach. All in the coach settings seed.
- **Q55** Consent version "draft-2026-10" until Sean approves the final legal text; on approval, bump the version and require re-acceptance on next app open.
- **Q56** The onboarding weight becomes the first weigh-in.
- **Q57** Weighed share is a fifth week average on Progress.
- **Q58** 1,000 character cap on day notes; run P5 on notes when messaging ships.
- **Q59, Q60** Approved as recommended.

### Resolved by the PM (Today v2, 2026-10-15)

- **Q49** Approved: `meal_tag` renamed to `meal`, backfilled from local time, not null, plus `copied_from_entry_id`. Applied to hosted after an export of `food_entries` (kept outside the repo): 4 rows before (meal null), 4 after (3 breakfast, 1 lunch).
- **Q50** Approved: copies save as `quick_add` with `copied_from_entry_id`, emit `meal_copied`, no `food_logged`.
- **Q51** Approved: before targets exist, logged days show the outline dot.
- **Q52** Changed: a log on a past day uses that date. With a chosen meal (section "+" or meal chip) it is stamped at the meal's anchor time: breakfast 8:00, lunch 12:30, dinner 18:30, snack 15:00 local (`app_config.meal_anchors`). With no meal chosen it uses the current clock time and auto-assigns as on today.
- **Q53** Approved: habits go between the coach or check-in card and the meal sections when they ship.

### Resolved by the PM (MVP round 3, 2026-10-15)

- **Q47** Keep Search on the log bar. At 375px, an empty field shows text field, search and barcode; once the user types, search and barcode collapse and send appears. Never more than 3 controls. In DESIGN_SYSTEM "Log bar".
- **Q48** Generalized: every label item (chain and packaged) gets a servings stepper, with grams shown when known.
- **Generic starting amount:** USDA's first common portion when available (1 medium, 1 cup), else 100 g, still Estimated with Weigh it. Scale users see the amount field in grams.

### Resolved by the PM (MVP round 2, 2026-10-15)

- **MILESTONES v2** approved as written.
- **Q44** MVP "unread reply" means a check-in was submitted and the coach has not replied. It becomes the unread message flag when messaging ships.
- **Q45** Target edit (calories, protein, carbs, fat) in the client week view, respecting the BMR floor with a coach override confirmation. Saves a `targets` row with `set_by = coach`.
- **Q46** Accepted. CLAUDE.md rule 4 notes the MVP exception. Offline in MVP: the draft stays on the phone, the card shows "You're offline. Your draft is saved on this phone. Log it when you're back online.", and Log it is disabled until back online, then works with no retyping.
- **Swipe to edit** and **swapping a saved item to another food** land with Add item and food search.
- **Standing approval:** engineering deploys and applies hosted migrations without asking when the migration is additive only (new tables, columns, functions, indexes, policies that do not reduce access). Anything that drops, renames, rewrites or deletes data, or loosens RLS, is asked first. Every applied migration is listed in the update.

### Resolved by the PM (MVP scope, 2026-10-15)

- **Scope change:** M1 to M5 paused. MVP then Post-MVP per MILESTONES.md v2.
- **Q43** Keep the profile timezone following the phone.
- **Camera lock** moves with photo logging (post-MVP).
- **Events:** instrument every PRD section 5 event for MVP features as they ship.
- **Settings:** coach-configurable values stay seeded; Sean asks engineering to change them until the settings screen ships.

### Resolved by the PM (2026-10-15, commit "docs: PM decisions 2026-10-15")

- **Q42** Sonnet 5.5 is locked as the P1 model. Re-test Haiku 5.5 when real alpha meals are in the eval. Quick add and favorites never call a model.
- **Holdout meal calories** 80% or higher is an M1 exit gate, not an open bar. Closed by the local FDC import (Q40), then more curated chains if still under 80% (revisits Q41). Measured on fresh holdout cases the PM supplies once that work is done.
- **Raw / Cooked / Dry toggle** ships in M1. Only the no-scale hand portion picker moves to M2 (it needs `has_scale`).
- **Hosted auth settings** are applied and verified by a script through the Supabase Management API (ARCHITECTURE.md "Domains and email"). Its verify-only mode runs before each release.
- **Root domain:** `honestreps.app` redirects to `app.honestreps.app`. Engineering gives Sean the Vercel and Cloudflare steps (owner task 8).

### Resolved by the PM (round 4, 2026-10-13)

- **Q39** Cans are label. The Q37 example "a can" is now "a banana", so branded drinks count as packaged products.
- **Q40** Import FDC Foundation, SR Legacy and FNDDS into Postgres and search locally. Interim: cache-first API search. A higher USDA limit is optional, not a gate.
- **p027** Kept in the holdout. Eval v0.4 expects estimated and flagged with a wide calorie range until McDonald's is curated.
- **Priorities:** lock the P1 model from the eval (cache must come from a clean run), then the confirmation card, then manual entry, edit and delete, offline queue and sync. Barcode, favorites, quick add and meal tags wait until Sean has tested on his phone for a few days.

### Resolved by Sean (2026-10-13)

- **Q41** Chain data descoped for now. Six chains stay curated (Chick-fil-A, Chipotle, Culver's, Domino's, Panera, Subway). McDonald's, Starbucks, Taco Bell, Raising Cane's and Imo's stay uncovered (generic match, estimated, flagged) until revisited.

### Resolved by the PM (round 3, 2026-10-13, commit "docs: PM decisions round 3")

- **Q33** Hand portion conversions live in the nutrition module table `nutrition_coach_settings`.
- **Q34** One signal per row by cause: uncertain food match shows "Check this"; clear food with an estimated amount shows "Estimated" plus "Weigh it". The timeline shows "est." for estimated rows.
- **Q36** Curated `food_items` from published nutrition pages for Chipotle, Chick-fil-A, Domino's, McDonald's, Starbucks, Taco Bell, Panera, Subway, Raising Cane's, Culver's and Imo's, covering the most common menu items, with source URL and date per item. Other chains: generic match, amount source estimated, flagged.
- **Q37** Locked P1 line replaced: "If the user gives no amount, use the standard serving for a packaged or chain restaurant product (amount_source label), the typical size for a counted item such as an egg, an apple or a can (measured), and otherwise a typical single adult serving with confidence at most 0.6 (estimated)."
- **Q38** Eval set v0.3: p019 patty flagged and diet coke label; p010 range 300 to 345; fresh holdout p025 to p029, never tuned on.
- **Medical flag** dropped from P1's and P2's copy of the global rules. Medical screening stays in P3 and P5.
- **P1 model** chosen by the eval: the cheapest of Opus 5.5, Sonnet 5.5 and Haiku 5.5 that meets every bar on dev and holdout with P1 median latency at or under 2.5 s. Quick add and favorites never call a model.

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
