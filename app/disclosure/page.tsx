import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { needsDisclosure } from "@/core/compliance/disclosure"
import { createClient } from "@/lib/supabase/server"
import { DisclosureForm } from "./disclosure-form"

export const metadata: Metadata = { title: "About your coaching" }

/** State disclosure for invited paid clients (PRD F16, Q73). Text from coach_settings. */
export default function DisclosurePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <Suspense fallback={null}>
        <Disclosure />
      </Suspense>
    </main>
  )
}

async function Disclosure() {
  const user = await getCurrentUser()
  if (!user.onboardingCompleted) redirect("/onboarding")
  const supabase = await createClient()
  if (!(await needsDisclosure(supabase, user))) redirect("/today")
  const { data: profile } = await supabase.from("profiles").select("coach_id").eq("id", user.id).single()
  const { data: settings } = await supabase
    .from("coach_settings")
    .select("disclosure_title, disclosure_text")
    .eq("coach_id", profile?.coach_id ?? "")
    .maybeSingle()
  const title = (settings?.disclosure_title as string | null) ?? "About your coaching"
  const paragraphs = ((settings?.disclosure_text as string | null) ?? "").split(/\n\s*\n/).filter((p) => p.trim())

  return (
    <>
      <h1 className="text-title">{title}</h1>
      <div className="flex flex-col gap-3 text-body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <DisclosureForm />
    </>
  )
}
