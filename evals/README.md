# Parsing eval set (v0.3, synthetic starting point)

`parsing.jsonl` holds 29 synthetic meal descriptions covering how people actually log. It replaces the "Sean supplies 20 real meals" task for M1. Real, anonymized meals from the alpha replace or extend it later.

Product principle behind this set: **precision first.** A food scale is the standard. Measured amounts (cups, spoons, counts) and labels are next. Hand portions are the accepted fallback when there is no scale. Anything else is an estimate, is flagged, and nudges the user to weigh it.

## Amount source (every expected item has one)

| Source | When | Expected confidence | Flagged |
|---|---|---|---|
| weighed | Weight in g, oz, or lb, or "weighed", "scale said" | up to 1.0 | No |
| label | Packaged or chain item with a standard serving | up to 1.0 | No |
| measured | Volume, spoons, fluid ounces, or counts with a known size | up to 0.9 | No |
| hand | Palm, fist, cupped hand, thumb, handful | up to 0.75 | No, tagged "hand portion" |
| estimated | No usable amount | up to 0.6 | Yes, with "Weigh it" hint |

Weight ounces vs fluid ounces: "6 oz chicken" is weighed; "12 oz almond milk" is measured.

## Coverage

| Category | Cases |
|---|---|
| Weighed | p002 (chicken), p013, p017, p021, p023, p024 |
| Hand portions | p008, p022 |
| Natural servings and counts | p001, p004, p010, p012 |
| Explicit measured amounts | p005, p016 |
| Restaurant and brand (label) | p003, p004, p009, p010, p012, p015 |
| Vague portions (estimated) | p006, p007, p011, p014, p019, p020 |
| Raw, cooked, dry state | p013, p021, p024 |
| Modifiers ("no rice", "no bun") | p003, p019 |
| Typos, shorthand, noise | p003, p011, p015, p023 |
| Multi-meal in one line | p014 |
| Metric | p017 |
| Negative (no food) | p018 |
| Beverages, alcohol, zero calorie | p006, p010, p019 |

Split: 17 dev cases for tuning, 12 holdout (p004, p007, p011, p013, p017, p020, p023, p025 to p029) never used while tuning. p017 was used once for a matcher fix in v0.2; p025 to p029 are fresh and are the trusted holdout until real alpha meals are added.

## Scoring (per run)

1. **Item recall:** each expected item matched by name or alias (`decomposed_ok` counts if all listed parts appear).
2. **Grams:** weighed items within 3% of the stated weight. All others inside the expected range.
3. **Amount source correct:** returned source matches `amount_source`.
4. **State correct:** where `state` is given (raw, cooked, dry), the matched food entry has that state.
5. **Meal calories in range:** final calories after database matching fall inside `meal_kcal`.
6. **No invented foods:** any `must_not_include` item, or for p018 any item at all, is a hard fail.
7. **Flag calibration:** items in `expect_flagged` come back under 0.7 confidence; nothing else is flagged.

## Pass bars for M1

- Item recall 90% or higher
- Weighed items 100% within 3%
- Other grams in range 85% or higher
- Amount source correct 90% or higher
- State correct 100% on state cases
- Meal calories in range 80% or higher
- Zero `must_not_include` violations
- Flag calibration 80% or higher
- Holdout within 5 points of dev on each metric

Run each case 3 times; report the median and any case that flips between pass and fail.

## Maintenance

- Restaurant numbers come from published nutrition pages. Re-verify before each release.
- Stable IDs. Never edit a case silently: change the expected value with a note and bump the set version.
- During alpha, every user correction to a parsed entry is a candidate case. Promote anonymized ones weekly, plus a paraphrase and a counterexample.
- Target: 50 cases before gym beta, at least half from real logs, at least a third weighed.
