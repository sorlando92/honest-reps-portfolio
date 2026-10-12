import { z } from "zod"
import { isEventName } from "./names"

const propValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()])

export const trackRequestSchema = z.object({
  name: z.string().refine(isEventName, { message: "Unknown event name" }),
  props: z
    .record(z.string().max(64), propValue)
    .refine((p) => Object.keys(p).length <= 20, { message: "Too many props" })
    .default({}),
})

export type TrackRequest = z.infer<typeof trackRequestSchema>
