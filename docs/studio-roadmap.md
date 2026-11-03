# Studio roadmap

The long-term loop: **choose a watch → research → recommend content → create → review → publish → learn.**
Timekeeper (`timekeeperkw`) is the priority account throughout. `timegallerykw` comes second, and the other accounts
get basic tracking only. Every screen is built for the iPhone first: one main number, one chart, the gist, and
details closed until opened.

## Phase 1: Learn from Instagram (now)

| Part | State |
|------|-------|
| Instagram capture, 3-hourly reads, watchdog, alerts | done (3 Nov 2026) |
| Graph API v26.0 | done (3 Nov 2026; v21.0 ends 21 Jan 2027) |
| Film reports at early / 48 h / 7 d with evidence levels | done |
| Post-ID linking, confirmed in the studio | done |
| Per-account prediction models: expected 7-day reach, range, model history, weekly validation | in progress |
| Before publishing: one number, a range, 2–3 suggestions; after: expected against actual | in progress |
| Simple numbers screen (Timekeeper first), gist of one note and one recommendation | in progress |
| Weekly check of official Instagram/Meta updates; shown only when it affects us | in progress |
| Account change detection (before/after, by content type) | in progress |

## Phase 2: Product-to-Content Creator (later; not started)

Workflow on the iPhone:

1. **Choose a watch.** Pick a product from the Shopify catalogue by brand and exact model.
2. **Collect.** The studio gathers the product's details:
   - specifications and price
   - stock (Lightspeed)
   - approved images
   - the brand's history
3. **Research.** Facts are checked against reliable sources, each with its source.
4. **Recommend.** Three content ideas, each with its format (Reel, Carousel or Story) and one line on why.
   - The ranking comes from our own Instagram results.
5. **Create.** The chosen idea is produced with the existing studio pipeline (scripts, styles, voices, carousel kit).
6. **Review.** The owner edits and approves before anything is published. Nothing is published automatically.
7. **Learn.** After publishing, the Phase 1 analytics measure the result and improve the next recommendations.

### What Phase 1 already gives Phase 2

| Phase 2 step | Already in place |
|--------------|------------------|
| Choose a watch | `shopify_products` (3,995 products: brand, title, series, case, dial, movement, crystal, water resistance, price, SKUs), linked to `lightspeed_products` for stock (1,917 linked); refreshed daily by `shopify-sync`, read-only |
| Recommend content | `studio_predict(film)` scores any film description, including one not made yet, so three draft ideas can be ranked by expected reach per format; `ig_recipe` / `ig_brief` give the reasons |
| Create, review | films, versions, the approval flow, the carousel text editor, «تعديل» requests to Claude |
| Choose in the page | the bottom sheet built for «أي منشور هو؟» is reused as the product picker |
| Learn by product | a film can carry `product` `{shopify_id, handle, brand, model, sku}`; `studio_film_attrs` turns `product.brand` into the learning dimension «البراند» |

### Prerequisites for Phase 2 (to do when it starts)

- Product images: `shopify-sync` exports product data but not image URLs. Add the featured and gallery images (still
  read-only).
- Stories: the sync does not read Stories. Their insights disappear after 24 hours, so the 3-hourly run would need to
  capture them before Stories can be recommended with evidence.
- A read-only `studio_products(query)` for the page's product picker, through the same Supabase connector.
- Fact-checked research stays with Claude in the conversation, with sources recorded on the film.
