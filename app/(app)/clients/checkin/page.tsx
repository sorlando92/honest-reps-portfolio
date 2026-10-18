import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { toQuestion } from "@/core/checkins/questions"
import { firstName } from "@/core/people"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { Screen } from "@/components/screen"
import { ReplyForm } from "./reply-form"

export const metadata: Metadata = { title: "Check-in" }

const KG_PER_LB = 0.45359237

export default function CheckinDetailPage({ searchParams }: PageProps<"/clients/checkin">) {
  return (
    <Suspense fallback={null}>
      <Detail searchParams={searchParams} />
    </Suspense>
  )
}

/** One client's check-in for the coach (PRD F5): weight, photos, answers, then the reply. */
async function Detail({ searchParams }: { searchParams: PageProps<"/clients/checkin">["searchParams"] }) {
  const { id: param } = await searchParams
  const id = typeof param === "string" && /^[0-9a-f-]{36}$/.test(param) ? param : null
  if (!id) notFound()
  const user = await getCurrentUser()
  if (user.role !== "coach") notFound()
  const supabase = await createClient()
  // RLS: only the assigned coach reads it.
  const { data: checkin } = await supabase
    .from("checkins")
    // The "!" in the select names a foreign key for PostgREST; it is not copy.
    // eslint-disable-next-line honest-reps/copy-rules
    .select("id, user_id, week_of, submitted_at, on_time, weight_kg, answers, person:profiles!checkins_user_id_fkey(display_name, units)")
    .eq("id", id)
    .maybeSingle()
  if (!checkin?.submitted_at) notFound()

  const [{ data: rows }, { data: photos }, { data: replies }] = await Promise.all([
    supabase.from("checkin_questions").select("id, position, type, prompt, low_label, high_label, optional, report_tag").eq("coach_id", user.id).order("position"),
    supabase.from("checkin_photos").select("position, storage_path").eq("checkin_id", id).order("position"),
    supabase.from("messages").select("id, body, created_at").eq("checkin_id", id).order("created_at"),
  ])
  const signed = photos?.length
    ? (await createAdminClient().storage.from("checkin-photos").createSignedUrls(photos.map((p) => p.storage_path as string), 3600)).data ?? []
    : []

  const person = checkin.person as unknown as { display_name: string | null; units: string } | null
  const name = firstName(person?.display_name) ?? "Client"
  const metric = person?.units === "metric"
  const kg = checkin.weight_kg === null ? null : Number(checkin.weight_kg)
  const weight = kg === null ? "Not given" : metric ? `${Math.round(kg * 10) / 10} kg` : `${Math.round((kg / KG_PER_LB) * 10) / 10} lb`
  const answers = (checkin.answers ?? {}) as Record<string, number | string>
  const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: user.timezone })

  return (
    <Screen title={`${name}'s check-in`}>
      <Link href="/clients" className="inline-flex min-h-11 items-center text-body text-accent-strong underline">
        Back to Clients
      </Link>
      <p className="text-caption text-text-muted">{`Sent ${when.format(new Date(checkin.submitted_at as string))}${checkin.on_time === false ? ", late" : ""}`}</p>
      <dl className="flex flex-col gap-3 rounded-lg bg-surface px-4 py-3">
        {(rows ?? []).map(toQuestion).map((q) => {
          if (q.type === "photos") return null
          const value = q.type === "weight" ? weight : answers[q.id]
          const shown =
            value === undefined ? "No answer" : q.type === "scale" ? `${value} of 5 (${q.lowLabel} to ${q.highLabel})` : String(value)
          return (
            <div key={q.id} className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">{q.prompt}</dt>
              <dd className="text-body whitespace-pre-line">{shown}</dd>
            </div>
          )
        })}
      </dl>
      {signed.length > 0 && (
        <ul aria-label="Progress photos" className="grid grid-cols-3 gap-2">
          {signed.map((s, i) =>
            s.signedUrl ? (
              <li key={i}>
                <a href={s.signedUrl} target="_blank" rel="noreferrer" aria-label={`Open progress photo ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- short lived signed URL from a private bucket */}
                  <img src={s.signedUrl} alt={`Progress photo ${i + 1}`} className="aspect-[3/4] w-full rounded-md object-cover" />
                </a>
              </li>
            ) : null
          )}
        </ul>
      )}
      {replies?.map((r) => (
        <section key={r.id as string} className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
          <p className="text-caption text-text-muted">{`Your reply, ${when.format(new Date(r.created_at as string))}`}</p>
          <p className="text-body whitespace-pre-line">{r.body as string}</p>
        </section>
      ))}
      <ReplyForm checkinId={id} name={name} />
    </Screen>
  )
}
