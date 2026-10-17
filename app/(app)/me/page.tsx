import { redirect } from "next/navigation"

/** Me became More (NAV_SPEC 6); old links and bookmarks land there. */
export default function MePage() {
  redirect("/more")
}
