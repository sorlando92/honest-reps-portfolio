import type { Metadata } from "next"
import { notFound } from "next/navigation"

// Q55: the signup consents link here before Sean approves the final legal
// text (MVP step 6). Each page says plainly that it is a draft.
const DOCS = {
  terms: { title: "Terms", body: [] as string[] },
  privacy: { title: "Privacy policy", body: [] as string[] },
  disclaimer: {
    title: "Disclaimer",
    body: ["Honest Reps gives general nutrition information, not medical advice. Talk with your doctor before changing your diet, especially if you have a medical condition."],
  },
} as const

type Doc = keyof typeof DOCS

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }))
}

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params
  return { title: doc in DOCS ? DOCS[doc as Doc].title : "Not found" }
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params
  if (!(doc in DOCS)) notFound()
  const page = DOCS[doc as Doc]
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-8">
      <h1 className="text-title">{page.title}</h1>
      <p className="rounded-lg bg-surface p-4 text-body">Draft. The final version will be shared with you before the alpha starts, and you will be asked to accept it.</p>
      {page.body.map((p) => (
        <p key={p} className="text-body">
          {p}
        </p>
      ))}
    </main>
  )
}
