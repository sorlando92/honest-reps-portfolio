# Sign-in and account creation spec (PM, 2026-10-17)

Status: approved by Sean. Adds Google sign-in to the existing passwordless email code and link. Build in MVP step 4 together with coach invites.

## Decisions (Sean, 2026-10-17)
1. Google now. Facebook later, only if members ask (prerequisites listed below).
2. iPhone: Google shows in Safari and on Android; inside the installed iPhone home-screen app only the email code shows.
3. No passwords. Email code (with link) plus Google.

## Feasibility
- Supabase Auth supports Google natively. Engineering effort about 1 to 2 days including tests. Sean setup about 45 minutes in Google Cloud and Supabase.
- Risk: low. Main known limitation is iOS installed web apps, handled by decision 2.
- Cost: free, except the optional custom auth domain below.

## Sign-in screen
- Title: Honest Reps. Line: "Your coach can see what you log so he can help." (unchanged).
- Buttons, in order:
  1. Continue with Google (hidden inside the installed iPhone app)
  2. Continue with email (sends the 6-digit code and link, as today)
- Footer: "By continuing you agree to the Terms and Privacy Policy." with links.
- Inside the installed iPhone app, under the email button: "Used Google before? Enter the same email and we'll send you a code."
- Detect the installed iPhone app with `navigator.standalone` or `display-mode: standalone` on iOS.

## New and returning users
- One flow for both. After sign-in: if onboarding is not complete, go to onboarding; else go to Today.
- From Google, keep only email, verified status, and full name (first name used for "Hi, Sean"). Do not store the Google profile photo; keep the initial avatar.
- If Google returns an unverified email (rare), require the email code before creating the account.
- User cancels the Google consent screen: return to sign-in with "Sign in was canceled."

## One account per person
- Supabase automatic identity linking on the same verified email stays on. A person who signs up with Google and later uses the email code with the same address lands in the same account. Test both directions.
- Different emails mean different accounts. Document it; merging is a post-MVP admin tool.

## Coach invites (binds regardless of sign-in method)
- Invite links carry a single-use token. Opening the link, then signing in by any method, assigns the coach and paid flag from the token, even if the person signs in with a different email than the one invited.
- Token expires after 14 days or on use. Expired: "This invite expired. Ask your coach for a new one."
- The coach sees which email each client actually signed in with.

## Branding on the Google consent screen
- By default Google shows "to continue to <project-ref>.supabase.co", which looks untrustworthy.
- Recommended: Supabase custom domain `auth.honestreps.app` (paid add-on on Pro, about $10 a month) so Google shows honestreps.app. Sean decides; until then, ship with the default.

## Sean setup steps (engineering sends exact values)
1. Google Cloud Console: create project "Honest Reps".
2. OAuth consent screen: External; app name Honest Reps; support email; logo; app domain honestreps.app; privacy policy and terms URLs; authorized domain honestreps.app; scopes openid, email, profile only.
3. Create OAuth client (Web application): authorized JavaScript origin `https://app.honestreps.app`; redirect URI = the Supabase callback URL engineering provides.
4. Publish the app to Production (Testing mode limits sign-in to listed test users). Basic scopes do not need Google's sensitive-scope verification; brand verification of name and logo may take a few days.
5. Supabase, Authentication, Providers, Google: paste client ID and secret, enable.

## Privacy and legal
- Privacy policy adds: when you use Google, we receive your name and email address only.
- Account deletion also removes linked identities.

## Facebook later (prerequisites, not built)
- Meta developer app, business verification, app review for email and public_profile, a data deletion instructions URL, and handling for accounts with no email (ask for one before creating the account). Plan a week or more for Meta review.

## Apple
- Not needed for the web app. Required only if a native App Store app offers Google sign-in.

## Events
- `signup_completed` and a new `sign_in_completed` gain `method` (google, email_code, email_link).
- `auth_error` (method, reason) for canceled, unverified email, provider error.

## Acceptance criteria
1. Continue with Google works in Chrome on Android (browser and installed app) and in Safari on iPhone.
2. The installed iPhone app shows only Continue with email plus the "Used Google before?" line.
3. Google sign-up then email code with the same address opens the same account, and the reverse.
4. A coach invite link accepted with a different Google email assigns the coach and paid flag.
5. New users land in onboarding; returning users land on Today.
6. Canceling Google returns to sign-in with the message; no account is created.
7. Only email, verified flag and name are stored from Google.
8. Passes at 375px in light and dark, 44pt targets, axe clean.
