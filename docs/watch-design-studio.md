# Watch Design Studio

A parametric watch dial and case design studio. It is one self-contained page —
engine, UI, artwork and case photograph all live inside a single `index.html`.
No build step, no server, no database, nothing sent anywhere.

It is unrelated to the operations app, and only shares this repository because
this repository already owns a GitHub Pages site.

| | |
|---|---|
| Lives at | `public/studio/` |
| Served from | `https://alalramadhan-kuwait.github.io/timekeeper-online/studio/` |
| Page weight | ~1.7 MB on first load |

## How it gets published

`public/` is copied into `dist/` verbatim by Vite, so `public/studio/` becomes
`dist/studio/` and `npm run deploy` ships it alongside the operations app. There
is nothing extra to run, and no separate pipeline to keep in step.

Two things make the two apps safe to co-host:

- The studio uses no root-absolute paths, so it works under any subpath.
- `sw.js` registers no `fetch` handler — it only handles push and notification
  clicks — so the operations service worker never intercepts studio requests.

## Updating it

Replace `public/studio/index.html` with the new build and deploy. Everything
else stays as it is.

## Things to know before sharing the link

**Anyone with the link can download everything.** The case photograph, the
traced numerals, the wordmark and the whole parametric engine are inside
`index.html`. `<meta name="robots" content="noindex, nofollow">` keeps the page
out of search results, but that is obscurity, not access control.

A `robots.txt` cannot help here: crawlers only read it at the domain root, and
the root of `alalramadhan-kuwait.github.io` belongs to a different repository.
That is why the directive travels in the page itself.

If the design work needs to stay private, GitHub Pages is the wrong host — it
has no access control on a free plan. Move the folder to Cloudflare Pages
(Access → self-hosted application → one-time PIN by email) or Netlify (Site
settings → Access control → password protection). `public/studio/_headers` is
already written in the format both of those read; GitHub Pages ignores it.

## Saved designs live in the browser

Save design, the saved-version list and "open with this design" all write to
`localStorage` on the visitor's own device. That means:

- Designs **do not follow you between devices**. Same browser, same device only.
- Clearing browsing data deletes them, and so does Private/Incognito browsing.
- iOS Safari clears them after about seven days of not visiting the site.

Saving is only committed once the naming panel is confirmed — closing that panel
cancels the save.

To move a design between devices, use **Export → Save design file (JSON)**.
Designs that sync properly would need accounts and a backend, which is a project
rather than a setting.

## Performance

The renderer is CPU-heavy. It is smooth on a current phone or laptop; an older
Android will feel slower, particularly while dragging a slider.
