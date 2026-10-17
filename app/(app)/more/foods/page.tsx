import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getCurrentUser } from "@/core/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import { Screen } from "@/components/screen"
import { toFoodResult, type FoodItemRow } from "@/modules/nutrition/foods/hits"
import { FOOD_ITEM_COLUMNS } from "@/modules/nutrition/foods/search"
import { MyFoods } from "./my-foods"

export const metadata: Metadata = { title: "My foods" }

/** More, My foods (docs/FOOD_LOOKUP_SPEC.md 4): the user's custom foods, to edit or delete. */
export default function MyFoodsPage() {
  return (
    <Screen title="My foods">
      <Link href="/more" className="-mt-2 inline-flex min-h-11 items-center gap-1 self-start text-body text-accent-strong">
        <ChevronLeft aria-hidden className="size-5" />
        More
      </Link>
      <Suspense fallback={<div className="h-48" />}>
        <List />
      </Suspense>
    </Screen>
  )
}

async function List() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const { data } = await supabase.from("food_items").select(FOOD_ITEM_COLUMNS).eq("source", "user").eq("owner_id", user.id).order("name")
  return <MyFoods initial={(data ?? []).map((row) => toFoodResult(row as FoodItemRow))} />
}
