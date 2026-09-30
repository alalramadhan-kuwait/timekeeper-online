# وجباتنا — kids-carb-app

Arabic, mobile-first carb & meal planner for a child with type 1 diabetes. It counts carbohydrates and organises
food. It never calculates or suggests insulin doses.

## Rules the code enforces
- Commercial carbs come only from a registered, approved label (Total Carbohydrate). Nothing is guessed; a recipe
  with an unregistered product shows "هذا المنتج غير مسجل…" and is never suggested.
- Rice/pasta are weighed cooked. A pasta label describes dry pasta, so its measured `cooked_yield` is required.
- Every number (max 60 g, preferred 40–55 g, tablespoon size, category targets) lives in `carb.settings`.
- Levels: up to preferred max normal, up to max near limit, above max warning (never blocked).

## Data
Own schema `carb` in the Supabase project (no foreign keys into other apps; access only for rows in `carb.members`).
Schema + seed: `supabase/migrations/`. First parent enters the one-time setup code; the second is added from "المزيد".

**One dashboard step:** Supabase > Settings > API > Exposed schemas > add `carb`.

## Run
    cp .env.example .env.local   # URL + anon key
    npm install && npm run dev
    npm test                     # carb engine, suggestions, shopping list

## Deploy
The app is static (`dist/`), works under any sub-path (hash routing), and is a home-screen app on a phone.
- **GitHub Pages:** put this folder at the root of its own repo, push to `main`, set Settings > Pages > Source to
  *GitHub Actions*. `.github/workflows/deploy.yml` tests, builds and publishes.
- **Fastest, no repo:** `npm run build`, then drag the `dist` folder onto app.netlify.com/drop.
Do not deploy it from the company `timekeeper-online` repo: that repo's Pages site is the live staff app and is
rebuilt from scratch on every push to `main`.
