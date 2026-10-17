import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createCast, deleteCast, PERMISSION_DENIED, type Cast } from "./fixtures"

// docs/FOOD_LOOKUP_SPEC.md: fdc_branded, food_words, custom foods in
// food_items, barcode_matches, barcode_scans, the popularity counter and
// search_food_index(). Test rows use the made up brand "Zzqxbrand" so they
// never meet real foods.

let cast: Cast
const BRANDED = [
  { fdc_id: 999_999_801, gtin: "00999999800018", description: "CHOCOLATE WHEY PROTEIN POWDER, CHOCOLATE", brand_name: "ZZQXBRAND", serving_size: 34, serving_unit: "g", household_serving: "1 SCOOP", per_100g: { kcal: 382, protein_g: 73.5, carbs_g: 8.8, fat_g: 4.4 } },
  { fdc_id: 999_999_802, gtin: "00999999800025", description: "VANILLA WHEY PROTEIN POWDER, VANILLA", brand_name: "ZZQXBRAND", serving_size: 34, serving_unit: "g", household_serving: "1 SCOOP", per_100g: { kcal: 382, protein_g: 73.5, carbs_g: 8.8, fat_g: 4.4 } },
  // The same product under a second GTIN (another package size): shown once.
  { fdc_id: 999_999_803, gtin: "00999999800032", description: "VANILLA WHEY PROTEIN POWDER, VANILLA", brand_name: "ZZQXBRAND", serving_size: 34, serving_unit: "g", household_serving: "1 SCOOP", per_100g: { kcal: 382, protein_g: 73.5, carbs_g: 8.8, fat_g: 4.4 } },
].map((r) => ({ ...r, brand_owner: "Zzqx Foods LLC", category: "test", release: "test" }))
const WORDS = [{ word: "zzqxbrand", n: 3 }]
const ids: string[] = []

function customFood(ownerId: string, over: Record<string, unknown> = {}) {
  return {
    source: "user",
    source_id: randomUUID(),
    owner_id: ownerId,
    name: "Zzqxbrand homemade bar",
    brand: null,
    data_type: "Custom food",
    per_100g: { kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 13 },
    serving: { label: "1 bar (50 g)", grams: 50, kcal: 200, protein_g: 15, carbs_g: 20, fat_g: 6.5 },
    barcode: null,
    ...over,
  }
}

async function search(client: Cast["a"]["client"], q: string) {
  const { data, error } = await client.rpc("search_food_index", { p_query: q, p_limit: 10 })
  expect(error).toBeNull()
  return (data ?? []) as { section: string; ref: string; name: string; source: string; food_item_id: string | null }[]
}

beforeAll(async () => {
  cast = await createCast()
  const b = await cast.admin.from("fdc_branded").upsert(BRANDED)
  if (b.error) throw b.error
  const w = await cast.admin.from("food_words").upsert(WORDS)
  if (w.error) throw w.error
})
afterAll(async () => {
  await cast.admin.from("fdc_branded").delete().in("fdc_id", BRANDED.map((r) => r.fdc_id))
  await cast.admin.from("food_words").delete().in("word", WORDS.map((w) => w.word))
  await cast.admin.from("food_items").delete().in("id", ids)
  await cast.admin.from("food_items").delete().eq("source", "usda").in("source_id", BRANDED.map((r) => String(r.fdc_id)))
  await deleteCast(cast)
})

describe("fdc_branded and food_words", () => {
  it("signed in users read; visitors read nothing; nobody but the server writes", async () => {
    const read = await cast.a.client.from("fdc_branded").select("gtin").eq("fdc_id", BRANDED[0].fdc_id)
    expect(read.data).toEqual([{ gtin: BRANDED[0].gtin }])
    expect((await cast.anon.from("fdc_branded").select("fdc_id").eq("fdc_id", BRANDED[0].fdc_id)).data ?? []).toEqual([])
    for (const user of [cast.a, cast.coach]) {
      expect((await user.client.from("fdc_branded").insert({ ...BRANDED[0], fdc_id: 999_999_899, gtin: "00999999899999" })).error?.code).toBe(PERMISSION_DENIED)
      expect((await user.client.from("fdc_branded").update({ description: "x" }).eq("fdc_id", BRANDED[0].fdc_id)).error?.code).toBe(PERMISSION_DENIED)
      expect((await user.client.from("food_words").insert({ word: "zzqxnope", n: 1 })).error?.code).toBe(PERMISSION_DENIED)
    }
  })

  it("refresh_food_words is for the server only", async () => {
    expect((await cast.a.client.rpc("refresh_food_words")).error).not.toBeNull()
    expect((await cast.anon.rpc("search_food_index", { p_query: "zzqxbrand" })).error).not.toBeNull()
  })
})

describe("search_food_index", () => {
  it("finds a brand's products in Brands, one row per product (acceptance 1)", async () => {
    const rows = await search(cast.a.client, "zzqxbrand")
    const brands = rows.filter((r) => r.section === "brands" && r.ref.startsWith("fdc:999999"))
    expect(brands.map((r) => r.name).sort()).toEqual(["CHOCOLATE WHEY PROTEIN POWDER, CHOCOLATE", "VANILLA WHEY PROTEIN POWDER, VANILLA"])
  })

  it("matches brand plus product words and prefixes", async () => {
    const rows = await search(cast.a.client, "zzqxbrand choc")
    expect(rows.filter((r) => r.ref.startsWith("fdc:999999")).map((r) => r.name)).toEqual(["CHOCOLATE WHEY PROTEIN POWDER, CHOCOLATE"])
  })

  it("corrects a typo to a known word", async () => {
    const rows = await search(cast.a.client, "zzqxbrnad")
    expect(rows.some((r) => r.ref === `fdc:${BRANDED[0].fdc_id}`)).toBe(true)
  })

  it("puts a user's own custom food in My foods, for them only", async () => {
    const { data, error } = await cast.a.client.from("food_items").insert(customFood(cast.a.id)).select("id").single()
    expect(error).toBeNull()
    ids.push(data!.id)
    const mine = await search(cast.a.client, "zzqxbrand bar")
    expect(mine.find((r) => r.food_item_id === data!.id)?.section).toBe("mine")
    // Not for another member, and not in the coach's own searches either.
    expect((await search(cast.b.client, "zzqxbrand bar")).some((r) => r.food_item_id === data!.id)).toBe(false)
    expect((await search(cast.coach.client, "zzqxbrand bar")).some((r) => r.food_item_id === data!.id)).toBe(false)
  })

  it("ranks what the user logged first and counts it as popularity", async () => {
    const { data: item } = await cast.admin
      .from("food_items")
      .insert({ source: "usda", source_id: String(BRANDED[1].fdc_id), name: "Vanilla Whey Protein Powder, Vanilla", brand: "Zzqxbrand", data_type: "Branded", per_100g: BRANDED[1].per_100g })
      .select("id")
      .single()
    const { data: entry } = await cast.b.client
      .from("food_entries")
      .insert({ user_id: cast.b.id, logged_at: new Date().toISOString(), meal: "snack", method: "search", client_uuid: randomUUID() })
      .select("id")
      .single()
    const saved = await cast.b.client.from("food_entry_items").insert({ entry_id: entry!.id, user_id: cast.b.id, food_item_id: item!.id, name: "vanilla whey", amount: 1, unit: "serving", grams: 34, amount_source: "label", calories: 130, protein_g: 25, carbs_g: 3, fat_g: 1.5 })
    expect(saved.error).toBeNull()

    const { data: counted } = await cast.admin.from("food_items").select("log_count").eq("id", item!.id).single()
    expect(counted?.log_count).toBe(1)
    const rows = await search(cast.b.client, "zzqxbrand")
    expect(rows[0]).toMatchObject({ section: "mine", food_item_id: item!.id })

    // A test profile's logs do not count.
    await cast.admin.from("profiles").update({ is_test: true }).eq("id", cast.b.id)
    await cast.b.client.from("food_entry_items").insert({ entry_id: entry!.id, user_id: cast.b.id, food_item_id: item!.id, name: "vanilla whey", amount: 1, unit: "serving", grams: 34, amount_source: "label", calories: 130, protein_g: 25, carbs_g: 3, fat_g: 1.5 })
    const { data: still } = await cast.admin.from("food_items").select("log_count").eq("id", item!.id).single()
    expect(still?.log_count).toBe(1)
    await cast.admin.from("profiles").update({ is_test: false }).eq("id", cast.b.id)
    ids.push(item!.id)
  })

  it("returns nothing for a query of only stop words or symbols", async () => {
    expect(await search(cast.a.client, "the and")).toEqual([])
    expect(await search(cast.a.client, "!!")).toBeInstanceOf(Array)
  })
})

describe("food_items custom foods", () => {
  it("only the owner writes their own custom foods; others cannot see them; the coach reads", async () => {
    const { data, error } = await cast.a.client.from("food_items").insert(customFood(cast.a.id, { name: "Zzqx shake" })).select("id").single()
    expect(error).toBeNull()
    ids.push(data!.id)

    expect((await cast.b.client.from("food_items").select("id").eq("id", data!.id)).data).toEqual([])
    expect((await cast.outsider.client.from("food_items").select("id").eq("id", data!.id)).data).toEqual([])
    expect((await cast.otherCoach.client.from("food_items").select("id").eq("id", data!.id)).data).toEqual([])
    expect((await cast.coach.client.from("food_items").select("id").eq("id", data!.id)).data).toEqual([{ id: data!.id }])

    const update = await cast.a.client.from("food_items").update({ name: "Zzqx shake, chocolate" }).eq("id", data!.id).select("name")
    expect(update.data).toEqual([{ name: "Zzqx shake, chocolate" }])
    // Others' updates and deletes touch nothing.
    expect((await cast.b.client.from("food_items").update({ name: "x" }).eq("id", data!.id).select("id")).data).toEqual([])
    expect((await cast.coach.client.from("food_items").delete().eq("id", data!.id).select("id")).data).toEqual([])
    // Popularity and ownership are not user writable.
    expect((await cast.a.client.from("food_items").update({ log_count: 99 }).eq("id", data!.id)).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.a.client.from("food_items").update({ owner_id: cast.b.id }).eq("id", data!.id)).error?.code).toBe(PERMISSION_DENIED)

    expect((await cast.a.client.from("food_items").delete().eq("id", data!.id).select("id")).data).toEqual([{ id: data!.id }])
  })

  it("refuses custom foods for someone else and shared rows from users", async () => {
    expect((await cast.a.client.from("food_items").insert(customFood(cast.b.id))).error).not.toBeNull()
    expect((await cast.a.client.from("food_items").insert({ ...customFood(cast.a.id), source: "custom", owner_id: null })).error).not.toBeNull()
    expect((await cast.a.client.from("food_items").insert({ ...customFood(cast.a.id), source: "usda" })).error).not.toBeNull()
    // Shared rows stay read only.
    const { data: shared } = await cast.a.client.from("food_items").select("id").is("owner_id", null).limit(1).single()
    expect((await cast.a.client.from("food_items").update({ name: "x" }).eq("id", shared!.id).select("id")).data).toEqual([])
    expect((await cast.a.client.from("food_items").delete().eq("id", shared!.id).select("id")).data).toEqual([])
  })

  it("keeps one custom food per barcode per user, in canonical form", async () => {
    const first = await cast.a.client.from("food_items").insert(customFood(cast.a.id, { barcode: "00999999800049" })).select("id").single()
    expect(first.error).toBeNull()
    ids.push(first.data!.id)
    expect((await cast.a.client.from("food_items").insert(customFood(cast.a.id, { barcode: "00999999800049" }))).error?.code).toBe("23505")
    expect((await cast.a.client.from("food_items").insert(customFood(cast.a.id, { barcode: "999999800049" }))).error).not.toBeNull()
    // Another user may save the same barcode.
    const other = await cast.b.client.from("food_items").insert(customFood(cast.b.id, { barcode: "00999999800049" })).select("id").single()
    expect(other.error).toBeNull()
    ids.push(other.data!.id)
  })
})

describe("barcode_matches", () => {
  it("the owner saves and changes their match; others cannot see or write it; the coach reads", async () => {
    const { data: food } = await cast.a.client.from("food_items").insert(customFood(cast.a.id, { name: "Zzqx match" })).select("id").single()
    ids.push(food!.id)
    const row = { user_id: cast.a.id, gtin: "00999999800056", food_item_id: food!.id }
    expect((await cast.a.client.from("barcode_matches").upsert(row, { onConflict: "user_id,gtin" })).error).toBeNull()
    expect((await cast.a.client.from("barcode_matches").upsert(row, { onConflict: "user_id,gtin" })).error).toBeNull()
    expect((await cast.b.client.from("barcode_matches").select("gtin").eq("user_id", cast.a.id)).data).toEqual([])
    expect((await cast.coach.client.from("barcode_matches").select("gtin").eq("user_id", cast.a.id)).data).toEqual([{ gtin: row.gtin }])
    expect((await cast.otherCoach.client.from("barcode_matches").select("gtin").eq("user_id", cast.a.id)).data).toEqual([])
    expect((await cast.b.client.from("barcode_matches").insert({ ...row, user_id: cast.a.id })).error).not.toBeNull()
    expect((await cast.anon.from("barcode_matches").select("gtin")).data ?? []).toEqual([])
  })
})

describe("barcode_scans", () => {
  it("the server writes the scan; the owner records only its outcome; the coach reads", async () => {
    expect((await cast.a.client.from("barcode_scans").insert({ user_id: cast.a.id, raw_read: "1", result: "miss" })).error?.code).toBe(PERMISSION_DENIED)
    const { data: scan, error } = await cast.admin.from("barcode_scans").insert({ user_id: cast.a.id, raw_read: "999999800063", gtin: "00999999800063", result: "miss" }).select("id").single()
    expect(error).toBeNull()

    const outcome = await cast.a.client.from("barcode_scans").update({ outcome: "not_this" }).eq("id", scan!.id).select("outcome")
    expect(outcome.data).toEqual([{ outcome: "not_this" }])
    expect((await cast.a.client.from("barcode_scans").update({ gtin: "00000000000000" }).eq("id", scan!.id)).error?.code).toBe(PERMISSION_DENIED)
    expect((await cast.b.client.from("barcode_scans").update({ outcome: "confirmed" }).eq("id", scan!.id).select("id")).data).toEqual([])
    expect((await cast.b.client.from("barcode_scans").select("id").eq("id", scan!.id)).data).toEqual([])
    expect((await cast.coach.client.from("barcode_scans").select("id").eq("id", scan!.id)).data).toEqual([{ id: scan!.id }])
    expect((await cast.otherCoach.client.from("barcode_scans").select("id").eq("id", scan!.id)).data).toEqual([])
    expect((await cast.a.client.from("barcode_scans").delete().eq("id", scan!.id)).error?.code).toBe(PERMISSION_DENIED)
  })

  it("a hit names its source; a miss has none", async () => {
    expect((await cast.admin.from("barcode_scans").insert({ user_id: cast.a.id, raw_read: "1", result: "hit" })).error).not.toBeNull()
    expect((await cast.admin.from("barcode_scans").insert({ user_id: cast.a.id, raw_read: "1", result: "miss", source: "off" })).error).not.toBeNull()
  })
})

describe("food_staples, fdc_import_runs and search_fdc_branded", () => {
  it("staples are read only reference data for signed in users", async () => {
    expect((await cast.a.client.from("food_staples").select("term").eq("term", "egg")).error).toBeNull()
    expect((await cast.anon.from("food_staples").select("term")).data ?? []).toEqual([])
    expect((await cast.coach.client.from("food_staples").insert({ term: "zzqx", fdc_id: 1 })).error?.code).toBe(PERMISSION_DENIED)
  })

  it("import runs: the server writes, the coach reads, members see nothing", async () => {
    const { data: run, error } = await cast.admin.from("fdc_import_runs").insert({ dataset: "Branded", release: "Branded test", imported: false, trigger: "manual" }).select("id").single()
    expect(error).toBeNull()
    expect((await cast.coach.client.from("fdc_import_runs").select("id").eq("id", run!.id)).data).toEqual([{ id: run!.id }])
    expect((await cast.a.client.from("fdc_import_runs").select("id").eq("id", run!.id)).data).toEqual([])
    expect((await cast.coach.client.from("fdc_import_runs").insert({ dataset: "Branded", release: "x", imported: false, trigger: "manual" })).error?.code).toBe(PERMISSION_DENIED)
    await cast.admin.from("fdc_import_runs").delete().eq("id", run!.id)
  })

  it("search_fdc_branded needs every brand word and any food word", async () => {
    const { data, error } = await cast.a.client.rpc("search_fdc_branded", { p_brand: "Zzqxbrand", p_query: "chocolate protein", p_limit: 5 })
    expect(error).toBeNull()
    expect((data as { fdc_id: number }[])[0].fdc_id).toBe(BRANDED[0].fdc_id)
    expect((await cast.a.client.rpc("search_fdc_branded", { p_brand: "Nobrandzzqx", p_query: "chocolate", p_limit: 5 })).data).toEqual([])
    expect((await cast.anon.rpc("search_fdc_branded", { p_brand: "Zzqxbrand", p_query: "chocolate" })).error).not.toBeNull()
  })
})
