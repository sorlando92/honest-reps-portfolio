"use client"

import { Suspense, use, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { track } from "@/core/events/client"
import { Button } from "@/components/ui/button"

const SIGNED_IN_BEFORE_KEY = "hr:signed_in_before"

type Step = { kind: "email" } | { kind: "code"; email: string }

export function SignInForm({ linkErrorPromise }: { linkErrorPromise: Promise<boolean> }) {
  const [step, setStep] = useState<Step>({ kind: "email" })

  return (
    <>
      <Suspense fallback={null}>
        <LinkError promise={linkErrorPromise} />
      </Suspense>
      {step.kind === "email" ? (
        <EmailStep onSent={(email) => setStep({ kind: "code", email })} />
      ) : (
        <CodeStep email={step.email} onChangeEmail={() => setStep({ kind: "email" })} />
      )}
    </>
  )
}

function LinkError({ promise }: { promise: Promise<boolean> }) {
  if (!use(promise)) return null
  return (
    <p role="alert" className="text-body text-text-muted">
      That sign in link expired or was already used. Enter your email for a new code.
    </p>
  )
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    setError(null)
    startTransition(async () => {
      if (!signedInBefore()) track("signup_started", {})
      const { error } = await createClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          // Read by the database only when this email creates a new account.
          data: {
            coach_visibility_accepted: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        },
      })
      if (error) {
        setError(
          error.status === 429
            ? "Too many codes requested. Wait a minute and try again."
            : // Invite-only signup: the before-user-created hook refuses a new email without an open invite.
              error.status === 403 && error.message === "invite_required"
              ? "Honest Reps is invite only. Use the email your coach sent the invite to, or ask your coach for an invite."
              : "We could not send the code. Check the email address and try again."
        )
        return
      }
      onSent(email)
    })
  }

  return (
    <form action={submit} className="flex flex-col gap-4" noValidate={false}>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className="text-label text-text-muted uppercase">
          Email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="h-12 rounded-md border border-border bg-surface px-4 text-body text-text"
          aria-describedby={`${id}-help ${id}-visibility`}
        />
        <p id={`${id}-help`} className="text-caption text-text-muted">
          We will email you a 6 digit code and a sign in link.
        </p>
      </div>

      <p id={`${id}-visibility`} className="text-body">
        Your coach can see what you log so he can help.
      </p>

      {error && (
        <p role="alert" className="text-body text-caution">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Send code"}
      </Button>
    </form>
  )
}

function CodeStep({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const id = useId()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function verify(formData: FormData) {
    const token = String(formData.get("code") ?? "").replace(/\D/g, "")
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const { error } = await createClient().auth.verifyOtp({ email, token, type: "email" })
      if (error) {
        setError("That code did not work. Use the code from the latest email.")
        inputRef.current?.focus()
        return
      }
      rememberSignedIn()
      router.replace("/today")
      router.refresh()
    })
  }

  function resend() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const { error } = await createClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/confirm` },
      })
      if (error) {
        setError("We could not send a new code. Wait a minute and try again.")
        return
      }
      setNotice("New code sent.")
    })
  }

  return (
    <form action={verify} className="flex flex-col gap-4">
      <p className="text-body">
        We sent a code to <span className="font-semibold break-all">{email}</span>. Type it here, or tap the link in the
        email on this device.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-code`} className="text-label text-text-muted uppercase">
          6 digit code
        </label>
        <input
          ref={inputRef}
          id={`${id}-code`}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="h-14 rounded-md border border-border bg-surface px-4 text-number-lg tracking-[0.3em] text-text"
        />
      </div>

      {error && (
        <p role="alert" className="text-body text-caution">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-body text-text-muted">
          {notice}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Checking" : "Sign in"}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="text" onClick={resend} disabled={pending}>
          Send a new code
        </Button>
        <Button type="button" variant="text" onClick={onChangeEmail} disabled={pending}>
          Use a different email
        </Button>
      </div>
    </form>
  )
}

function signedInBefore(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_BEFORE_KEY) === "1"
  } catch {
    return false
  }
}

function rememberSignedIn() {
  try {
    localStorage.setItem(SIGNED_IN_BEFORE_KEY, "1")
  } catch {
    // Storage blocked: signup_started may count a returning user once more.
  }
}
