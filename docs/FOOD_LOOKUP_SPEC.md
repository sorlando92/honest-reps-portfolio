# Food lookup spec: unified search bar and barcode (PM, 2026-10-17)

Status: approved for build, ahead of step 4. Fixes Sean's testing: barcode returned the wrong product for Ascent protein, and text search could not find it either. Overrides earlier search and barcode notes in PRD F2, SCREENS_V2 and NAV_SPEC where they conflict.

## Root causes to confirm first
1. Coverage: Open Food Facts is thin on US sports nutrition brands. USDA FoodData Central Branded Foods (label data with `gtinUpc`) is the better US source and is not used for barcodes or search today.
2. Barcode normalization: UPC-A (12), EAN-13 (13), UPC-E (8) and GTIN-14 forms of one product must resolve to one key. A mismatch here returns no match or the wrong product.
3. Decoding: a misread digit returns a different real product. Reads must pass the check digit and be confirmed by a second identical read.
4. Search: today search queries the USDA API on submit and ranks generic foods; branded products like Ascent rank low or are missing.
Engineering: pull the scan and search events for Sean's Ascent attempts, report the raw barcode read, the normalized value, the source hit and the product returned, before building.

## 1. One bar, two functions
The floating log bar is both search and AI logging.
- Typing (2 or more characters, 150ms debounce) opens a results sheet above the bar, updating as the user types.
- Row 1 is always "Describe with AI: {typed text}". Tapping it, pressing Enter, or tapping send runs AI parsing (P1). Send always means AI. This is predictable.
- Below it, search results in sections:
  1. My foods: recents, favorites, the user's custom foods, copied meals
  2. Brands and restaurants: USDA Branded Foods and curated chains
  3. Basic foods: USDA Foundation, SR Legacy, FNDDS
- Tapping a result opens the confirmation card for that one item, with servings stepper and grams (Q48), skipping AI entirely.
- Each row: product name, brand, serving, calories per serving. Max 5 rows per section with "Show more".
- Empty state: "No match for 'ascent'. Describe it with AI, scan the label, or enter it yourself." with three buttons.
- The leading search glyph and "Search foods" quick action open the same sheet with the field focused.

## 2. Local food index (pulls Q40 forward)
Search as you type needs a local index; the USDA API's rate limits cannot support it.
- Import USDA FDC Foundation, SR Legacy, FNDDS and Branded Foods into Postgres. Keep `gtinUpc`, brand owner, brand name, description, serving size and unit, household serving text, and the core macros. Refresh monthly from FDC's published downloads.
- Search with Postgres full text plus `pg_trgm` for typos and prefixes.
- Ranking, in order of weight:
  1. user history (logged before, favorites)
  2. exact or prefix match on brand plus product tokens ("ascent chocolate" matches brand Ascent, product contains chocolate)
  3. data completeness (serving size and all four macros present)
  4. gym-wide popularity (count of logs across all users, test profiles excluded)
  5. fuzzy similarity
- Target: results in under 300ms after the last keystroke on a Pixel 6 over LTE.
- Curated chain items stay and rank inside the Brands section.

## 3. Barcode
### Decode
- Use the browser BarcodeDetector API where available (Android Chrome), else ZXing in a web worker.
- Accept only reads that pass the check digit. Require two identical consecutive reads before lookup.
- Torch toggle, haptic on success, "Hold steady" hint after 3 seconds without a read, manual digit entry option.

### Normalize
- Expand UPC-E to UPC-A. Convert all forms to a canonical GTIN-14 (left pad with zeros). Store the canonical value; query every equivalent form.

### Lookup order
1. The user's custom foods by GTIN
2. App `food_items` cache by GTIN
3. Local USDA Branded Foods by `gtinUpc`
4. Open Food Facts API
5. Not found
Cache every hit in `food_items` with source and fetched date.

### Confirm before logging
- Show product name, brand, image when available, and serving: "Ascent Native Fuel Whey, Chocolate. 1 scoop (34 g), 130 kcal."
- Buttons: "Log it" and "Not this".
- "Not this" opens search prefilled with the brand and product words. The food the user picks is saved as that user's match for the GTIN and the mismatch is logged for review.

### Not found
- "We don't have this barcode yet." with:
  - Scan the label (primary)
  - Search
  - Enter it yourself
- Scan the label: the user photographs the Nutrition Facts panel; the AI reads serving size, calories, protein, carbs and fat (P2 label mode, confidence high only when text is legible). The user confirms or edits the values. The result is saved as a custom food linked to that GTIN, so the next scan is instant.
- Label scan is free for all users. It is a barcode fallback, not meal photo logging, which stays paid and post-MVP.

### Data quality
- Flag "Check this" if the serving size is missing, or if calories differ from 4 x protein + 4 x carbs + 9 x fat by more than 20%.

## 4. Custom foods
- Created from label scan or Enter it yourself. Fields: name, brand, GTIN (optional), serving size and unit, calories, protein, carbs, fat.
- Private to the user in MVP; the coach can view them. Editable and deletable in More, then My foods.
- Post-MVP: promote a custom food to shared after coach review.

## 5. Paid data fallback (decision deferred)
No paid barcode provider in MVP. Measure the miss rate from the scan log. If misses exceed 15% after FDC Branded, Open Food Facts and label scan are live, evaluate FatSecret Premier or Nutritionix for US barcodes and bring cost and coverage to the PM.

## Events (standing approval)
- `search_performed` (chars, results_count, chosen_section, chosen_rank, chose_ai)
- `barcode_scanned` (result: hit or miss, source, normalized_gtin, reads_to_confirm, ms_to_result)
- `barcode_mismatch` (normalized_gtin, returned_food_id, chosen_food_id)
- `label_scanned` (success, edited_fields_count)
- `custom_food_created` (source: label, manual)

## Admin view for the coach
In Clients, a simple "Food lookups" list: last 50 barcode misses and mismatches with product, user and chosen replacement, so Sean can spot gaps. Read only in MVP.

## Test sets
- Search eval, `evals/search.jsonl`: 40 queries with expected top results, including "ascent protein", "ascent chocolate whey", typos ("ascnet protien"), chains ("chipotle chicken bowl"), generic foods ("banana", "chicken breast"). Pass: expected item in top 3 for 90%, top 5 for 100%.
- Barcode set: after this ships, Sean scans 25 real products from his kitchen and the gym (protein powders, bars, ready-to-drink shakes, yogurts, store brands). Each scan is marked correct or wrong in the scan log. Pass: 90% correct product on first scan; 100% of misses lead to label scan, and the next scan of that item is an instant hit.

## Acceptance criteria
1. Typing "ascent" shows Ascent products in the Brands section within 300ms.
2. Send or Enter always runs AI parsing; tapping a result never calls the model.
3. A UPC printed as 12 digits and its 13 digit EAN form return the same product.
4. A misread that fails the check digit is ignored; no product is shown until two identical valid reads.
5. Every barcode result asks for confirmation before logging; "Not this" saves the user's correction for that GTIN.
6. Not found offers Scan the label first; a label scan creates a custom food and the next scan of that barcode finds it instantly.
7. Calorie and macro mismatches over 20% show "Check this".
8. Search and barcode work at 375px in light and dark, 44pt targets, axe clean.
