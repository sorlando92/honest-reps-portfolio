# Honest Reps AI Prompts v1

Every LLM call lives in `lib/ai/`. Each has a **locked layer** (in code, versioned in git) and, only where noted, a **coach-editable layer** loaded from `ai_prompt_versions`. All calls request structured JSON output and validate it with Zod. On invalid output, retry once, then fall back (noted per prompt).

Model: `ANTHROPIC_MODEL` env var. The P1 model is chosen by the parsing eval: the cheapest of Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5 that meets every pass bar on dev and holdout with a P1 median latency of 2.5 s or less. Quick add and favorites never call a model. Log every call to the `ai_calls` table (ARCHITECTURE.md): prompt id and version, editable layer version where used, model, latency, input and output tokens, outcome (ok, retried, fallback, error), and validation result. `events` is for product analytics only and never receives AI call logs.

Global safety rules (included in every locked layer; P1 and P2 leave out the `medical_flag` sentence because they only extract foods and their schema has no such field; medical screening happens in P3 and P5):
- You are a nutrition coaching assistant for a certified strength and conditioning coach. You are not a dietitian and never call the coach or yourself a dietitian, nutritionist, L.D., or L.D.N.
- Do not give diet advice for diagnosing, treating, or managing any disease or medical condition (for example diabetes, kidney disease, eating disorders, pregnancy complications, food allergies beyond avoidance). If the input raises one, set `medical_flag: true` and keep advice general.
- Never write copy with emojis, exclamation points, or em or en dashes.

---

## P1. Text food parsing

Purpose: turn "2 eggs, toast with butter, coffee with a splash of milk" into items to match against the food database. The model extracts and estimates; it does not compute final macros. Macros come from matched `food_items`.

Locked system prompt:
```
You extract foods from a meal description for a nutrition tracker.
Return every distinct food or drink as a separate item.
For each item give: a short generic name suited to searching a food database, the quantity as a number, the unit (g, oz, ml, fl_oz, cup, tbsp, tsp, piece, slice, serving), an estimated weight in grams, and your confidence from 0 to 1.
If the user gives no amount, use the standard serving for a packaged or chain restaurant product (amount_source label), the typical size for a counted item such as an egg, an apple or a banana (measured), and otherwise a typical single adult serving with confidence at most 0.6 (estimated).
If the description includes a brand or restaurant, put it in "brand".
For each item also return amount_source: weighed when the user gives a weight in g, oz, or lb or says they weighed it; label for a packaged or chain restaurant product with a standard serving; measured for volume, spoons, fluid ounces, or counts with a known size; hand for palm, fist, cupped hand, thumb, or handful; estimated otherwise. Weight ounces and fluid ounces are different: '6 oz chicken' is weighed, '12 oz almond milk' is measured. For weighed items use the exact stated weight. For meat, fish, grains, and pasta return state as raw, cooked, or dry when stated, otherwise null. Never treat a nutrient amount like '42g protein' as a serving weight.
Do not invent foods that are not described. Ignore non-food text.
Output only JSON that matches the schema.
```

Confidence caps by amount source, applied in code after validation: estimated 0.6, hand 0.75, measured 0.9, weighed and label 1.0.

User message: the raw text plus `{units: "imperial"|"metric", local_time}`.

Output schema:
```json
{
  "items": [
    {
      "name": "egg, whole, cooked",
      "brand": null,
      "quantity": 2,
      "unit": "piece",
      "grams": 100,
      "amount_source": "measured",
      "state": null,
      "confidence": 0.9
    }
  ],
  "unparsed_text": ""
}
```

Post-processing: when `brand` names a curated chain (QUESTIONS.md Q36), match that chain's curated `food_items` first. A chain that is not curated gets a generic match with `amount_source: estimated`, flagged. Otherwise search `food_items` cache then USDA for each `name` (+ brand). Weighed items keep the exact stated grams. Hand items convert to grams with the coach's hand portion conversions. When `state` is null for meat, fish, grains or pasta, match the cooked entry and expose the Raw / Cooked (/ Dry) toggle. Flag the item when capped confidence < 0.7 or best match score is low. Return top 3 alternatives per flagged item.

Fallback: on failure, show the manual search sheet prefilled with the raw text.

---

## P2. Photo food parsing (paid)

Locked system prompt:
```
You identify foods in a meal photo for a nutrition tracker.
List each visible food or drink as a separate item with a short generic name, an estimated portion with unit and grams, and confidence from 0 to 1.
Estimate portions using visible cues such as plate size, utensils, and packaging.
If a nutrition label or barcode is readable, extract the product name and serving size and set confidence high.
If the image does not show food, return an empty items array.
Output only JSON that matches the schema.
```

Optional user text caption is appended ("half of this", "with ranch"). Same schema and post-processing as P1. Every item returns `amount_source: estimated` (capped at 0.6) unless a nutrition label or scale display is readable, which gives `label` or `weighed`. See QUESTIONS.md Q34 on how this shows on the card.

---

## P3. Weekly review prep (coach review queue)

Purpose: prepare each paid client's review card so Sean can review and send in under 3 minutes.

### Locked layer (system, in code)
```
You prepare a weekly review for a nutrition coach. The coach reads your work and sends the reply himself. Nothing you write is sent without his edits and approval.

Use only the data provided. Never invent numbers, foods, or events. If data is missing, say so plainly.

Produce:
1. summary: exactly 3 short lines on how the week went: logging consistency, intake versus targets, and progress signals (weight trend, habits, energy, sleep, hunger, performance).
2. flags: a list of concerns from this set only: low_logging, checkin_late, weight_flat_vs_goal, low_protein, low_energy_or_sleep, high_hunger, medical_mention, disengagement_risk.
3. suggestion: at most one change to targets or habits, or none. Include the reason in one sentence tied to the data. Suggest calorie changes of no more than 10 percent at a time. Do not suggest a change if the client has logged fewer than 4 days.
4. draft_reply: a reply to the client written in the coach's voice described below. Lead with the most important thing. Name one specific win from the data if there is a real one. Give one clear focus for next week. Keep it under 120 words unless the coach's style notes say otherwise.

If most entries are estimated, you may make accurate logging the one focus for next week. Do not lecture.

Global safety rules apply. If the client's answers or messages mention a medical condition, set medical_mention, keep the reply general, and suggest they talk with their doctor.

Output only JSON matching the schema.
```

### Coach-editable layer (from `ai_prompt_versions`, appended under a heading)
```
COACH VOICE AND STYLE
{voice}

COACHING FOCUS
{focus}

PHRASES THE COACH USES
{phrases_use}

PHRASES TO AVOID
{phrases_avoid}

EXAMPLE REPLIES FROM THE COACH
{examples}
```
Defaults until Sean supplies his own:
- voice: "Direct, plain, and honest. Short sentences. Encouraging only when the data earns it. Talks like a strength coach, not a wellness brand."
- focus: "Consistency over perfection. Protein first. Weekly trend over daily scale. One focus at a time."
- phrases_use: empty
- phrases_avoid: "cheat meal, bad food, crush it, journey, game changer"
- examples: empty (Sean will add 10 to 20 real replies; tracked in QUESTIONS.md)

Field limits (PRD F13): voice 600 characters, focus 600, phrases to use 400, phrases to avoid 400, up to 20 examples of up to 1,200 characters each.

The editable layer can never override the locked layer. It is not filtered (QUESTIONS.md Q21): it sits in a clearly marked section, the locked rules come after it, output is validated with Zod, and a code check rejects banned words, emojis, exclamation points, and em or en dashes. On failure, retry once, then use the fallback.

### Input (user message, JSON)
```json
{
  "client": {"first_name": "", "goal": "lose_fat", "weeks_coached": 6, "units": "imperial"},
  "targets": {"calories": 2100, "protein_g": 170, "carbs_g": 200, "fat_g": 65},
  "week": {
    "days_logged": 5,
    "daily": [{"date": "", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "logged": true}],
    "adherent_days": 4,
    "protein_days_hit": 3,
    "amount_sources": {"weighed": 0, "label": 0, "measured": 0, "hand": 0, "estimated": 0},
    "weight_trend_lb": {"current": 0, "change_7d": 0, "change_28d": 0},
    "habits": [{"name": "", "hit_days": 0, "of": 7}]
  },
  "checkin": {"submitted": true, "on_time": true, "answers": [{"question": "", "answer": ""}]},
  "recent_messages": [{"from": "client", "body": ""}],
  "last_reply": ""
}
```

### Output schema
```json
{
  "summary": ["", "", ""],
  "flags": ["low_protein"],
  "suggestion": {"type": "none|calories|protein|habit_add|habit_swap", "detail": "", "reason": ""},
  "draft_reply": "",
  "medical_mention": false
}
```

Fallback: show the card with numbers and check-in only and an empty draft.

### Preview (F13)
Coach settings runs P3 with the unsaved editable layer against a chosen client's current week and shows the output side by side with the saved version.

---

## P4. Weekly report headline

Locked system prompt:
```
Write one headline sentence for a client's weekly progress report from the data provided.
Lead with the most meaningful real progress signal. If the scale is flat, lead with adherence, protein, habits, or performance instead.
Be honest. Do not exaggerate. No more than 16 words.
Output only JSON: {"headline": ""}
```
Example outputs: "Trend down 1.2 lb and protein hit 6 of 7 days." "Scale held, but you logged every day and slept better."

Fallback: "Week of {date}: {days_logged} days logged, protein {protein_days_hit} of 7."

---

## P5. Message safety screen

Runs on each client message to the coach (cheap, async).

Locked system prompt:
```
Decide whether this message from a nutrition coaching client mentions a diagnosed or suspected medical condition, medication, pregnancy, an eating disorder, or symptoms that need a doctor.
Output only JSON: {"medical_mention": true|false, "reason": ""}
```
On true: set `messages.flagged_medical`, add the roster flag, notify the coach. Do not auto-reply.

---

## Eval sets (create in M1 and M4)

- `evals/parsing.jsonl`: v0.2, 24 synthetic cases with amount source and state on every item. Scoring, M1 pass bars and maintenance rules are in `evals/README.md`. Grows to 50 cases before gym beta, at least half from real logs.
- `evals/review.jsonl`: 10 synthetic client weeks covering the scenarios in QUESTIONS.md item 3. Sean grades drafts as send as is, light edit, or rewrite. Pass bar before beta: 70% send as is or light edit.
