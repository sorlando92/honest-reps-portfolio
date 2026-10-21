"use client"

import { useId, useMemo, useState, useTransition, type ReactNode } from "react"
import { Grab, Hand, HandFist, ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { ageOn, computeTargets, MINIMUM_AGE, type Goal, type Sex, type TargetDefaults } from "@/modules/nutrition/targets/formula"
import { signOut } from "../(app)/more/actions"
import { closeUnderageAccount, finishOnboarding, type OnboardingAnswers } from "./actions"

const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54

type Units = "imperial" | "metric"
type Activity = OnboardingAnswers["activityLevel"]

const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "lose_fat", label: "Lose fat", hint: "Lean out while keeping muscle" },
  { value: "maintain", label: "Maintain", hint: "Hold your weight, eat for training" },
  { value: "build_muscle", label: "Build muscle", hint: "Gain slowly with a small surplus" },
  { value: "performance", label: "Performance", hint: "Fuel training first" },
]

const ACTIVITY: { value: Activity; label: string; hint: string }[] = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk job, little or no training" },
  { value: "light", label: "Light", hint: "Train 1 to 3 days a week" },
  { value: "moderate", label: "Moderate", hint: "Train 3 to 5 days a week" },
  { value: "very_active", label: "Very active", hint: "Train 6 or 7 days a week" },
  { value: "extra_active", label: "Extra active", hint: "Hard training plus a physical job" },
]

const STEPS = ["units", "goal", "sex", "birth", "height", "weight", "activity", "scale", "medical", "consents", "targets"] as const
type Step = (typeof STEPS)[number] | "no_scale" | "underage"

interface Draft {
  units: Units
  goal: Goal | null
  sex: Sex | null
  dateOfBirth: string
  heightFt: string
  heightIn: string
  heightCm: string
  weight: string
  goalWeight: string
  activityLevel: Activity | null
  hasScale: boolean | null
  medical: boolean | null
  consents: { terms: boolean; privacy: boolean; disclaimer: boolean }
}

/**
 * Onboarding, one question per screen (PRD F1, DESIGN_SYSTEM "Onboarding").
 * Answers stay on this screen until the last step saves them all.
 */
export function OnboardingFlow({ initialUnits, today, targetDefaults }: { initialUnits: Units; today: string; targetDefaults: TargetDefaults | null }) {
  const [step, setStep] = useState<Step>("units")
  /** Under 18: true once the server has deleted the account. */
  const [closed, setClosed] = useState(false)
  /** The account is gone: drop this phone's session too, so no page treats it as signed in. */
  function accountClosed(deleted: boolean) {
    setClosed(deleted)
    if (deleted) void createClient().auth.signOut({ scope: "local" }).catch(() => {})
  }
  const [d, setD] = useState<Draft>({
    units: initialUnits,
    goal: null,
    sex: null,
    dateOfBirth: "",
    heightFt: "",
    heightIn: "",
    heightCm: "",
    weight: "",
    goalWeight: "",
    activityLevel: null,
    hasScale: null,
    medical: null,
    consents: { terms: false, privacy: false, disclaimer: false },
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, start] = useTransition()
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))

  const heightCm = d.units === "metric" ? Number(d.heightCm) : (Number(d.heightFt) * 12 + Number(d.heightIn || 0)) * CM_PER_IN
  const weightKg = d.units === "metric" ? Number(d.weight) : Number(d.weight) / LB_PER_KG
  const goalWeightKg = d.goalWeight.trim() ? (d.units === "metric" ? Number(d.goalWeight) : Number(d.goalWeight) / LB_PER_KG) : null

  const valid: Record<(typeof STEPS)[number], boolean> = {
    units: true,
    goal: d.goal !== null,
    sex: d.sex !== null,
    birth: /^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth) && d.dateOfBirth < today && d.dateOfBirth > "1900-01-01",
    height: heightCm >= 120 && heightCm <= 230,
    weight: weightKg >= 30 && weightKg <= 300 && (goalWeightKg === null || (goalWeightKg >= 30 && goalWeightKg <= 300)),
    activity: d.activityLevel !== null,
    scale: d.hasScale !== null,
    medical: d.medical !== null,
    consents: d.consents.terms && d.consents.privacy && d.consents.disclaimer,
    targets: true,
  }

  const targets = useMemo(() => {
    if (!targetDefaults || !d.goal || !d.sex || !d.activityLevel || !valid.birth || !valid.height || !valid.weight) return null
    try {
      return computeTargets({ sex: d.sex, ageYears: ageOn(d.dateOfBirth, today), heightCm, weightKg, goalWeightKg, activityLevel: d.activityLevel, goal: d.goal }, targetDefaults)
    } catch {
      return null
    }
  }, [targetDefaults, d, today, heightCm, weightKg, goalWeightKg, valid.birth, valid.height, valid.weight])

  const index = STEPS.indexOf(step as (typeof STEPS)[number])
  // The scale explainer counts as the scale step.
  const progress = step === "no_scale" ? STEPS.indexOf("scale") : index

  function next() {
    setError(null)
    if (step === "birth" && ageOn(d.dateOfBirth, today) < MINIMUM_AGE) {
      // Q61 and security audit L2: the account is deleted, not just stopped.
      void closeUnderageAccount(d.dateOfBirth).then((r) => accountClosed(r.deleted), () => accountClosed(false))
      return setStep("underage")
    }
    if (step === "scale" && d.hasScale === false) return setStep("no_scale")
    if (step === "no_scale") return setStep("medical")
    if (step === "targets") return finish()
    setStep(STEPS[index + 1])
  }

  function back() {
    setError(null)
    if (step === "no_scale") return setStep("scale")
    if (step === "medical" && d.hasScale === false) return setStep("no_scale")
    if (index > 0) setStep(STEPS[index - 1])
  }

  function finish() {
    if (!d.goal || !d.sex || !d.activityLevel || d.hasScale === null || d.medical === null) return
    start(async () => {
      const result = await finishOnboarding({
        units: d.units,
        goal: d.goal!,
        sex: d.sex!,
        dateOfBirth: d.dateOfBirth,
        heightCm: Math.round(heightCm * 10) / 10,
        weightKg: Math.round(weightKg * 100) / 100,
        goalWeightKg: goalWeightKg === null ? null : Math.round(goalWeightKg * 100) / 100,
        activityLevel: d.activityLevel!,
        hasScale: d.hasScale!,
        medical: d.medical!,
        consents: { terms: true, privacy: true, disclaimer: true },
      }).catch(() => ({ ok: false as const, error: "network" as const }))
      // Success redirects to Today; anything returned is a problem.
      // The server deleted the account too (its own age check).
      if (result?.error === "underage") {
        accountClosed(true)
        return setStep("underage")
      }
      setError(
        result?.error === "network"
          ? "Could not reach Honest Reps. Check your connection and try again. Nothing is saved twice."
          : result?.error === "invalid"
            ? "Some answers need another look. Go back and check them."
            : "Your answers were not saved because of a problem on our side. Try again in a moment. Nothing is saved twice."
      )
    })
  }

  if (step === "underage") {
    return (
      <Screen title="Honest Reps is for adults 18 and over for now.">
        {closed && (
          <p role="status" className="text-body">
            We deleted this account and kept none of your answers.
          </p>
        )}
        {closed ? (
          // Already signed out here, so a plain link: a server action would hit the sign in redirect.
          <Button asChild className="mt-auto w-full">
            <a href="/sign-in">Done</a>
          </Button>
        ) : (
          <form action={signOut} className="mt-auto">
            <Button type="submit" className="w-full">
              Sign out
            </Button>
          </form>
        )}
      </Screen>
    )
  }

  // PRD F1: targets are shown before the user can finish.
  const canGoOn = step === "no_scale" || (step === "targets" ? targets !== null : valid[step as (typeof STEPS)[number]])

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-1.5 pb-6" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= progress ? "bg-accent-strong" : "bg-border"}`} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {`Step ${progress + 1} of ${STEPS.length}`}
      </p>

      {step === "units" && (
        <Screen title="Pounds or kilograms?">
          <Choices
            label="Units"
            value={d.units}
            onChange={(units) => set({ units })}
            options={[
              { value: "imperial", label: "Pounds and feet" },
              { value: "metric", label: "Kilograms and centimeters" },
            ]}
          />
        </Screen>
      )}
      {step === "goal" && (
        <Screen title="What is your goal?">
          <Choices label="Goal" value={d.goal} onChange={(goal) => set({ goal })} options={GOALS} />
        </Screen>
      )}
      {step === "sex" && (
        <Screen title="Sex" hint="Used only for the calorie formula.">
          <Choices
            label="Sex"
            value={d.sex}
            onChange={(sex) => set({ sex })}
            options={[
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
            ]}
          />
        </Screen>
      )}
      {step === "birth" && (
        <Screen title="Date of birth">
          <Field label="Date of birth">{(id) => <input id={id} type="date" max={today} value={d.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} className={INPUT} />}</Field>
        </Screen>
      )}
      {step === "height" && (
        <Screen title="Height">
          {d.units === "imperial" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Feet">{(id) => <input id={id} type="number" inputMode="numeric" min={3} max={7} value={d.heightFt} onChange={(e) => set({ heightFt: e.target.value })} className={INPUT} />}</Field>
              <Field label="Inches">{(id) => <input id={id} type="number" inputMode="numeric" min={0} max={11} value={d.heightIn} onChange={(e) => set({ heightIn: e.target.value })} className={INPUT} />}</Field>
            </div>
          ) : (
            <Field label="Centimeters">{(id) => <input id={id} type="number" inputMode="decimal" value={d.heightCm} onChange={(e) => set({ heightCm: e.target.value })} className={INPUT} />}</Field>
          )}
        </Screen>
      )}
      {step === "weight" && (
        <Screen title="Weight">
          <Field label={`Current weight (${d.units === "metric" ? "kg" : "lb"})`}>
            {(id) => <input id={id} type="number" inputMode="decimal" value={d.weight} onChange={(e) => set({ weight: e.target.value })} className={INPUT} />}
          </Field>
          <Field label={`Goal weight (${d.units === "metric" ? "kg" : "lb"}), optional`}>
            {(id) => <input id={id} type="number" inputMode="decimal" value={d.goalWeight} onChange={(e) => set({ goalWeight: e.target.value })} className={INPUT} />}
          </Field>
        </Screen>
      )}
      {step === "activity" && (
        <Screen title="How active are you?">
          <Choices label="Activity" value={d.activityLevel} onChange={(activityLevel) => set({ activityLevel })} options={ACTIVITY} />
        </Screen>
      )}
      {step === "scale" && (
        <Screen title="Do you have a food scale?">
          <Choices
            label="Food scale"
            value={d.hasScale === null ? null : d.hasScale ? "yes" : "no"}
            onChange={(v) => set({ hasScale: v === "yes" })}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "Not yet" },
            ]}
          />
        </Screen>
      )}
      {step === "no_scale" && (
        <Screen title="A food scale is the biggest upgrade to your accuracy." hint="Most cost less than lunch. Until then, use hand portions.">
          <ul aria-label="Hand portions" className="flex flex-col gap-3">
            {[
              { icon: Hand, name: "Palm", what: "Protein: meat, fish, tofu" },
              { icon: HandFist, name: "Fist", what: "Vegetables and fruit" },
              { icon: Grab, name: "Cupped hand", what: "Carbs: rice, pasta, potatoes" },
              { icon: ThumbsUp, name: "Thumb", what: "Fats: oil, butter, nut butter" },
            ].map(({ icon: Icon, name, what }) => (
              <li key={name} className="flex min-h-11 items-center gap-3 rounded-lg bg-surface px-4 py-3">
                <Icon aria-hidden className="size-6 shrink-0" strokeWidth={1.75} />
                <span className="flex flex-col">
                  <span className="text-headline">{name}</span>
                  <span className="text-caption text-text-muted">{what}</span>
                </span>
              </li>
            ))}
          </ul>
        </Screen>
      )}
      {step === "medical" && (
        <Screen title="Do you have a medical condition that affects what you eat?">
          <Choices
            label="Medical condition"
            value={d.medical === null ? null : d.medical ? "yes" : "no"}
            onChange={(v) => set({ medical: v === "yes" })}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
          />
          {d.medical && (
            <p role="status" className="text-body">
              Talk with your doctor before changing your diet. Your coach will be notified.
            </p>
          )}
        </Screen>
      )}
      {step === "consents" && (
        <Screen title="Before you start">
          <Consent checked={d.consents.disclaimer} onChange={(v) => set({ consents: { ...d.consents, disclaimer: v } })} href="/legal/disclaimer">
            I understand this is general nutrition information, not medical advice.
          </Consent>
          <Consent checked={d.consents.terms} onChange={(v) => set({ consents: { ...d.consents, terms: v } })} href="/legal/terms">
            I accept the terms.
          </Consent>
          <Consent checked={d.consents.privacy} onChange={(v) => set({ consents: { ...d.consents, privacy: v } })} href="/legal/privacy">
            I accept the privacy policy.
          </Consent>
        </Screen>
      )}
      {step === "targets" && (
        <Screen title="Your starting targets" hint="From your answers. Your coach can adjust them.">
          {targets ? (
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Protein", `${targets.proteinG} g`],
                ["Carbs", `${targets.carbsG} g`],
                ["Fat", `${targets.fatG} g`],
                ["Calories", `${targets.calories}`],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 rounded-lg bg-surface p-4">
                  <dt className="text-label text-text-muted uppercase">{label}</dt>
                  <dd className="text-number-lg tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p role="alert" className="text-body">
              We could not work out your targets. Go back and check your answers.
            </p>
          )}
        </Screen>
      )}

      {error && (
        <p role="alert" className="pt-4 text-body">
          {error}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Button onClick={next} disabled={!canGoOn || saving}>
          {step === "targets" ? (saving ? "Saving" : "Start logging") : step === "no_scale" ? "Got it" : "Next"}
        </Button>
        {index > 0 || step === "no_scale" ? (
          <Button variant="text" onClick={back} disabled={saving}>
            Back
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const INPUT = "h-12 w-full rounded-md border border-border bg-surface px-4 text-body text-text tabular-nums"

function Screen({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-title">{title}</h1>
      {hint && <p className="text-body text-text-muted">{hint}</p>}
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-text-muted uppercase">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

function Choices<T extends string>({ label, value, onChange, options }: { label: string; value: T | null; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="flex min-h-14 flex-col items-start justify-center rounded-lg border border-border bg-surface px-4 py-3 text-left aria-checked:border-accent-strong aria-checked:bg-accent aria-checked:text-on-accent"
        >
          <span className="text-headline">{o.label}</span>
          {o.hint && <span className="text-caption opacity-80">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

function Consent({ checked, onChange, href, children }: { checked: boolean; onChange: (v: boolean) => void; href: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface p-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-11 shrink-0 accent-[var(--accent-strong)]" />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-body">
          {children}
        </label>
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-body text-accent-strong underline">
          Read it
        </a>
      </div>
    </div>
  )
}
