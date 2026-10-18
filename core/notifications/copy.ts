import type { PushMessage } from "./push"

// Push copy (PM 2026-10-18, QUESTIONS.md Q74). {coach} is the coach's first name.

export function checkinOpenPush(): PushMessage {
  return { title: "Check-in is open", body: "Takes under a minute.", url: "/checkin" }
}

export function checkinFollowupPush(coach: string): PushMessage {
  return { title: "Check-in still open", body: `A minute now and ${coach} can review your week.`, url: "/checkin" }
}

export function coachReplyPush(coach: string, reply: string): PushMessage {
  const flat = reply.replace(/\s+/g, " ").trim()
  return { title: `${coach} replied to your check-in`, body: flat.length > 80 ? flat.slice(0, 80) : flat, url: "/coach" }
}

export function newCheckinPush(clientFirstName: string, checkinId: string): PushMessage {
  return { title: "New check-in", body: `${clientFirstName} checked in.`, url: `/clients/checkin?id=${checkinId}` }
}
