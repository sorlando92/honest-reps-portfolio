import type { ReactNode } from "react"

/** Screen title plus content, with the 16px side padding from the layout. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex flex-col gap-3 py-4">
      <h1 className="text-title">{title}</h1>
      {children}
    </main>
  )
}

/** DESIGN_SYSTEM.md "Empty states": one line of plain copy, no illustration. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-body text-text-muted">{children}</p>
}
