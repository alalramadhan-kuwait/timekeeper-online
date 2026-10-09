#!/usr/bin/env python3
"""Builds review.html (the approval page) from the same data as the markdown documents."""
import html, json, os, re, runpy
HERE = os.path.dirname(os.path.abspath(__file__))
N = runpy.run_path(os.path.join(HERE, 'narration.py'))   # also refreshes 05-NARRATION-AR.md
EP, HOOKS, TAGS, words = N['EP'], N['HOOKS'], N['TAGS'], N['words']
e = html.escape
ST = {'F': ('st-founder', 'Founder'), 'P': ('st-public', 'Public, to confirm'), 'M': ('st-meta', 'Metaphor'), '?': ('st-warn', 'Needs founder detail')}

TIMELINE = [
 ('Student years', 'Ali Al-Ramadhan and Ali Al-Yousifi meet in Boulder, Colorado.', 'F', 'Year, real photo'),
 ('Student years', 'They meet Mohammad bin Wail Al-Yousifi in Los Angeles, California. Three become one group.', 'F', 'Year, real photo'),
 ('Student years', 'Watch interest grows. They are discovering, not yet experts.', 'F', 'Early photos'),
 ('After graduation', 'Back in Kuwait, careers not yet started, they keep meeting. The gap shows: plenty of English watch content, little useful Arabic. They decide to simplify it.', 'F', 'Year of return, gathering photo'),
 ('2018', 'Time Keeper begins as an educational platform.', 'F+P', 'First posts with dates, first logo'),
 ('2018 on', 'Viewers ask where to buy the watches shown. Time Keeper starts supplying selected watches it believes in. Content, trust, demand, then commerce.', 'F', 'Year of first sale, first order'),
 ('2019', 'Time Keeper Podcast launches. Public listing shows season 1 episode 2 on 12 Dec 2019, about 71 episodes from 2019 to 2025.', 'F+P', 'First episode date. Do not call it ongoing'),
 ('2021', 'A collectors session at Dubai Watch Week, listed on the event site.', 'P', 'Founder confirmation, photos'),
 ('Years ?', 'Geneva, Watches & Wonders, manufacture visits, meetings.', 'F', 'Years, badge or invitation, which manufactures'),
 ('2022', 'Time Keeper Lounge opens, by appointment: conversation, collectors, watches.', 'F+P', 'Opening date, photos'),
 ('Years ?', 'Limited editions and collaborations. Public examples: Lebois & Co Heritage Chronograph Time Keeper Edition (50 pieces) and Bairak Kuwait Limited Edition with West End (150 pieces).', 'P', 'What Time Keeper contributed, permission to show'),
 ('Date ?', 'Time Gallery, Salhiya Complex. A public launch article calls it Time Keeper’s first store and lists independent brands as authorized dealers.', 'F+P', 'Opening date, current brand list'),
 ('Date ?', 'Time Keeper at The Avenues, described publicly as the second boutique.', 'F+P', 'Opening date, photos'),
 ('Oct 2025', 'The Rarest in Kuwait, Salhiya: rare watches owned by Kuwaiti collectors, with talks including independent watchmaking.', 'P', 'Founder confirmation, photos, collector permission'),
]
CONFLICTS = [
 ('Order of Lounge, Time Gallery and The Avenues.', 'Your brief puts the Lounge (2022) first. A public article calls Time Gallery the first store, and the About page describes a lounge inside the Salhiya boutique. I need the three opening dates before the order is locked.'),
 ('Education first or retail first.', 'The company’s public text says it soon became an authorized retailer. Your testimony says education first and the audience pulled it into selling. The film follows your account.'),
 ('Founder names.', 'One public source credits only Ali Al-Yousifi; the official site names Mohammad Al-Yousifi and Ali Al-Ramadhan. The film uses your three. I need exact Arabic spellings and titles.'),
 ('Watches & Wonders.', 'No public record found of Time Keeper at the fair, only the About page saying it covers major shows. The scene stays founder-confirmed until a badge, invitation or photo exists.'),
 ('Major houses.', 'Nothing public links Time Keeper to Rolex, Patek Philippe, Audemars Piguet, Hublot or Bulgari. The narration names no house until you tell me what happened with each.'),
 ('The Rarest in Kuwait.', 'The pieces belong to collectors. The film says hosted and exhibited, never "Time Keeper’s rare watches".'),
]
SWATCH = [('Logo paper', '#F9F6F3', 'Measured', True), ('Logo ink', '#1B1B1A', 'Measured', True), ('Brand black', '#111111', 'Brand template', True), ('Brand white', '#FFFFFF', 'Brand template', True),
          ('Bone', '#E4DFD3', 'Derived', False), ('Linen', '#CFC7B5', 'Derived', False), ('Graphite', '#34373E', 'Derived', False), ('Ink', '#16181C', 'Derived', False)]
HAVE = ['Photo: Time Gallery storefront, five men', 'Photo: occasion with Tudor and Saddik & Mohamed Attar signage (relationship class needed)', 'Three group photos with no caption or sign (label them to use them)', 'Logo: the app icon, 512 px (official file needed)']
REQ = [('R1', 'Labelled photos of each founder: front, three-quarter, side, in two periods'), ('R2', 'Official logo, brand guideline, fonts and licences'), ('R3', 'Three or more real early posts with dates, plus the first logo'),
       ('R4', 'Podcast: first episode cover and two recording photos'), ('R5', 'Watches & Wonders and Geneva: three or more photos, plus a badge or invitation'), ('R6', 'Time Keeper Lounge: three or more photos with people'),
       ('R7', 'Time Gallery: interior and display (one photo in hand)'), ('R8', 'The Avenues: two or more photos'), ('R9', 'Two documented limited editions: photos and permission'),
       ('R10', 'The Rarest in Kuwait: three or more photos and collectors’ permission'), ('R11', 'For every watch house shown: the relationship class and its evidence'),
       ('R12', 'Dates: US studies, the return, what 2018 marks, opening dates of Lounge, Time Gallery, Avenues'), ('R13', 'Narration recorded in Kuwaiti Arabic'), ('R14', 'Consent from everyone shown, and from each founder to be made a paper character')]
PREF = 'Boulder and university photos. Los Angeles photos. Early photos of Mohammad. The three together, early. Graduation. The return to Kuwait. Early gatherings. The watches they owned at the start. First customer or order. Early website or app screenshots. Follower milestones. Podcast guests. Manufacture visits. Independent watchmakers. Interviews. Brand meetings. Events and trunk shows. The Avenues under construction. Current team, store and community.'
OPT = 'Material tied to Rolex, Patek Philippe, Audemars Piguet, Hublot or Bulgari, only if real and classified. Gerald Charles documents. Video from manufactures and fairs. Boarding passes and passport pages from real documents. Early voice notes.'
POSES = [('Front, standing', 1), ('Three-quarter', 0), ('Side', 1), ('Sitting', 1), ('Walking', 1), ('Talking', 1), ('Looking at a watch', 1), ('Holding a watch', 1), ('Holding a phone', 1), ('Using a laptop', 0), ('Holding a microphone', 1), ('Traveling', 0), ('Pointing', 1), ('Celebrating', 1), ('Interacting together', 1)]
STEPS = [('You send labelled photos and consent', 'You'), ('One trial figure for one founder, cost quoted first', 'You approve the method'), ('Master sheet per character: front, three-quarter, side', 'You approve likeness and lock'),
         ('Lock. Faces are never regenerated', ''), ('Separate into 8 transparent parts per view', 'Joint check'), ('Pose library in the rig', 'Pose reel'), ('Generate only what the rig cannot do, as isolated transparent assets', 'Per asset'), ('Composite inside paper-story', 'Storyboard onward')]
DECISIONS = ['Approve the voice rule: "they" until 2018, "we" from 2018, "they" again for the look back.', 'Pick a hook for each episode (A, B or C).', 'Tell me what 2018 marks and give the opening dates of the Lounge, Time Gallery and The Avenues.',
             'Send labelled founder photos, each founder’s consent, and approve the real-head, paper-body method.', 'Send the official logo, the Bahij font files, and access or screenshots of the website and Instagram.', 'Say what happened with each watch house, so each can be classified.']

def pill(code):
    if code == 'F+P': return '<span class="pill st-founder">Founder</span><span class="pill st-public">Public, to confirm</span>'
    c, t = ST[code]; return f'<span class="pill {c}">{t}</span>'
tl = ''.join(f'<li><span class="when">{e(w)}</span><div><p>{e(t)}</p><div class="meta">{pill(s)}<span class="need">Needed: {e(n)}</span></div></div></li>' for w, t, s, n in TIMELINE)
conf = ''.join(f'<li><b>{e(a)}</b> {e(b)}</li>' for a, b in CONFLICTS)
sw = ''.join(f'<div class="sw"><div class="chip" style="background:{h}" role="img" aria-label="{n} {h}"></div><div><b>{n}</b><span class="hex">{h}</span><span class="src">{s}</span></div></div>' for n, h, s, _ in SWATCH)
have = ''.join(f'<li>{e(x)}</li>' for x in HAVE)
req = ''.join(f'<li><span class="rid">{i}</span><span>{e(t)}</span></li>' for i, t in REQ)
poses = ''.join(f'<li class="{"ok" if ok else "todo"}"><span>{e(n)}</span><i>{"In the rig" if ok else "To build"}</i></li>' for n, ok in POSES)
steps = ''.join(f'<li><span>{e(a)}</span>{f"<em>{e(b)}</em>" if b else ""}</li>' for a, b in STEPS)
dec = ''.join(f'<li><label><input type="checkbox" id="dec{i}" data-k="dec{i}"><span>{e(t)}</span></label></li>' for i, t in enumerate(DECISIONS))
eps_html, copy_data = '', {}
for k, (title, lines) in EP.items():
    sp = sum(words(l[1]) / 2.3 for l in lines); ps = sum(l[2] for l in lines)
    hooks = ''.join(f'<li class="{"rec" if "recommended" in o else ""}"><b>{e(o)}</b><span class="ar" dir="rtl" lang="ar">{e(t)}</span><small>{e(w)}</small></li>' for o, t, w in HOOKS[k])
    rows = ''.join(f'<li><div class="lh"><span class="lid">{i}</span>{pill(s)}<span class="pause">{p:.1f} s pause</span></div><p class="ar" dir="rtl" lang="ar">{e(t)}</p><p class="intent">{e(v)}</p></li>' for i, t, p, v, s in lines)
    copy_data[f'ep{k}'] = '\n'.join(l[1] for l in lines)
    eps_html += f'<article class="ep" id="ep{k}"><header><span class="epn">Episode {k}</span><h3 class="ar" dir="rtl" lang="ar">{e(title)}</h3><p class="est">{len(lines)} lines, {sum(words(l[1]) for l in lines)} words, about {sp + ps:.0f} seconds</p><button class="copy" type="button" data-copy="ep{k}">Copy narration</button></header><h4>Hook options</h4><ol class="hooks">{hooks}</ol><h4>Narration</h4><ol class="lines">{rows}</ol></article>'

PAGE = '''<title>Time Keeper Success Story</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one calm reading column, a sticky section rail, status pills carry the meaning. Palette is the brand's own paper and ink; no invented accent. */
:root{--bg:#F9F6F3;--surface:#FFFFFF;--fg:#1B1B1A;--muted:#6B675F;--line:#E4DFD6;--ink:#111111;--on-ink:#FFFFFF;--warn:#85490A;--warn-bg:#F5E6CE;--ok:#245C43;--ok-bg:#DDEBE2;
--f-body:"IBM Plex Sans",system-ui,sans-serif;--f-ar:"IBM Plex Sans Arabic","Cairo",system-ui,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#16181C;--surface:#1E2025;--fg:#F3F0E8;--muted:#A8A498;--line:#2D3037;--ink:#F3F0E8;--on-ink:#111111;--warn:#F2BC70;--warn-bg:#3A2D16;--ok:#9AD3B5;--ok-bg:#1F3329;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#16181C;--surface:#1E2025;--fg:#F3F0E8;--muted:#A8A498;--line:#2D3037;--ink:#F3F0E8;--on-ink:#111111;--warn:#F2BC70;--warn-bg:#3A2D16;--ok:#9AD3B5;--ok-bg:#1F3329;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font:400 1rem/1.6 var(--f-body);padding-inline:max(16px,env(safe-area-inset-left,0px)) max(16px,env(safe-area-inset-right,0px));padding-block:0 4rem;-webkit-text-size-adjust:100%}
main{max-width:46rem;margin-inline:auto}
h1,h2,h3,h4{text-wrap:balance;margin:0;line-height:1.15;letter-spacing:-.015em}
h1{font-size:clamp(2rem,7vw,2.9rem);font-weight:600;letter-spacing:-.03em}
h2{font-size:1.6rem;font-weight:600;margin-bottom:.4rem}
h4{font-size:.74rem;font-weight:600;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:1.6rem 0 .6rem}
p{margin:0}
a{color:inherit}
:focus-visible{outline:2px solid var(--fg);outline-offset:2px;border-radius:3px}
.rail{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--line);margin-inline:calc(-1*max(16px,env(safe-area-inset-left,0px)));padding-inline:max(16px,env(safe-area-inset-left,0px))}
.rail nav{display:flex;gap:.4rem;overflow-x:auto;padding-block:.65rem;scrollbar-width:none;max-width:46rem;margin-inline:auto}
.rail nav::-webkit-scrollbar{display:none}
.rail a{flex:none;font-size:.82rem;font-weight:500;text-decoration:none;padding:.35rem .75rem;border:1px solid var(--line);border-radius:99px;color:var(--fg);background:var(--surface)}
.rail a:hover{border-color:var(--fg)}
.hero{padding-block:2.2rem 1.6rem;display:flex;flex-direction:column;gap:.9rem}
.eyebrow{font:500 .74rem var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.lede{color:var(--muted);max-width:38rem}
.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.6rem;margin-top:.4rem}
.status div{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:.7rem .85rem;min-width:0}
.status b{display:block;font-size:.84rem}.status span{font-size:.78rem;color:var(--muted)}
.status .done{border-color:var(--ok)}.status .done span{color:var(--ok)}
section{padding-block:2.4rem;border-top:1px solid var(--line)}
.sub{color:var(--muted);margin-bottom:1.2rem;max-width:38rem}
.pill{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.02em;padding:.18rem .55rem;border-radius:99px;line-height:1.3;white-space:nowrap}
.st-founder{background:var(--ink);color:var(--on-ink)}
.st-public{border:1px solid var(--fg);color:var(--fg)}
.st-meta{background:var(--line);color:var(--muted)}
.st-warn{background:var(--warn-bg);color:var(--warn)}
.decisions{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
.decisions label{display:flex;gap:.75rem;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:.8rem .9rem;cursor:pointer}
.decisions input{margin-top:.3rem;width:1.05rem;height:1.05rem;flex:none;accent-color:var(--ink)}
.decisions input:checked+span{color:var(--muted);text-decoration:line-through}
.note{font-size:.8rem;color:var(--muted);margin-top:.6rem}
.tl{list-style:none;margin:0;padding:0;position:relative}
.tl::before{content:"";position:absolute;inset-block:.4rem;inset-inline-start:5.1rem;width:1px;background:var(--line)}
.tl li{display:grid;grid-template-columns:4.5rem 1fr;gap:1.2rem;padding-block:.85rem;position:relative}
.tl li::after{content:"";position:absolute;inset-inline-start:calc(4.5rem + .6rem - 4px + .1rem);top:1.35rem;width:9px;height:9px;border-radius:50%;background:var(--bg);border:2px solid var(--fg)}
.when{font:500 .78rem/1.3 var(--f-mono);color:var(--fg);padding-top:.25rem}
.tl p{margin-bottom:.4rem}
.meta{display:flex;flex-wrap:wrap;gap:.35rem .4rem;align-items:center}
.need{font-size:.78rem;color:var(--muted)}
.conf{list-style:none;padding:0;margin:0;display:grid;gap:.6rem}
.conf li{background:var(--warn-bg);color:var(--fg);border-radius:10px;padding:.8rem .95rem;font-size:.94rem}
.conf b{color:var(--warn)}
.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.7rem}
.sw{display:flex;gap:.8rem;align-items:center;min-width:0}
.chip{width:3.2rem;height:3.2rem;border-radius:8px;flex:none;border:1px solid var(--line);box-shadow:inset 0 0 0 1px rgba(128,128,128,.12)}
.sw b{display:block;font-size:.9rem}.hex{font:500 .8rem var(--f-mono);margin-right:.5rem}.src{font-size:.78rem;color:var(--muted)}
.kv{display:grid;gap:.5rem;list-style:none;padding:0;margin:0}
.kv li{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:.7rem .9rem;font-size:.94rem}
.kv b{display:block;font-size:.78rem;color:var(--muted);font-weight:500;margin-bottom:.1rem}
.req{list-style:none;margin:0;padding:0;display:grid;gap:.45rem}
.req li{display:grid;grid-template-columns:2.6rem 1fr;gap:.6rem;align-items:baseline;padding:.6rem 0;border-bottom:1px solid var(--line)}
.rid{font:500 .78rem var(--f-mono);color:var(--muted)}
.have{padding-left:1.1rem;margin:0;display:grid;gap:.3rem}
.poses{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:.45rem}
.poses li{display:flex;justify-content:space-between;gap:.6rem;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.5rem .75rem;font-size:.9rem;min-width:0}
.poses i{font-style:normal;font-size:.72rem;font-weight:600;padding:.12rem .5rem;border-radius:99px;white-space:nowrap}
.poses .ok i{background:var(--ok-bg);color:var(--ok)}.poses .todo i{background:var(--warn-bg);color:var(--warn)}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.steps li{display:flex;flex-wrap:wrap;gap:.2rem .8rem;justify-content:space-between;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:.6rem .8rem;font-size:.92rem;counter-increment:s}
.steps{counter-reset:s}.steps li::before{content:counter(s);font:500 .78rem var(--f-mono);color:var(--muted);flex:none;width:1.2rem}
.steps li span{flex:1 1 14rem;min-width:0}.steps em{font-style:normal;font-size:.78rem;color:var(--muted)}
.ep{margin-top:2rem;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:1.2rem 1.1rem 1.4rem}
.ep>header{display:grid;gap:.35rem}
.epn{font:500 .74rem var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ar{font-family:var(--f-ar);line-height:1.85}
.ep h3{font-size:1.9rem;font-weight:700;line-height:1.4;letter-spacing:0;text-align:right}
.est{font-size:.84rem;color:var(--muted)}
.copy{justify-self:start;font:500 .84rem var(--f-body);color:var(--on-ink);background:var(--ink);border:0;border-radius:99px;padding:.5rem 1rem;cursor:pointer}
.copy:active{transform:translateY(1px)}
.hooks,.lines{list-style:none;margin:0;padding:0}
.hooks{display:grid;gap:.5rem}
.hooks li{display:grid;gap:.15rem;padding:.7rem .85rem;border:1px solid var(--line);border-radius:10px}
.hooks .rec{border-color:var(--fg);border-width:1.5px}
.hooks b{font-size:.8rem}.hooks .ar{font-size:1.15rem;text-align:right}.hooks small{color:var(--muted);font-size:.8rem}
.lines li{padding-block:1rem;border-top:1px solid var(--line);display:grid;gap:.35rem}
.lines li:first-child{border-top:0}
.lh{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.lid{font:500 .74rem var(--f-mono);color:var(--muted);margin-right:.2rem}
.pause{font:400 .74rem var(--f-mono);color:var(--muted);margin-inline-start:auto}
.lines .ar{font-size:1.4rem;font-weight:600;text-align:right}
.intent{font-size:.84rem;color:var(--muted)}
.limits{display:grid;gap:.5rem;padding-left:1.1rem;margin:0}
.toast{position:fixed;inset-inline:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));max-width:22rem;margin-inline:auto;background:var(--ink);color:var(--on-ink);padding:.7rem 1rem;border-radius:10px;font-size:.88rem;text-align:center}
@media (max-width:30rem){.tl::before{display:none}.tl li::after{display:none}.tl li{grid-template-columns:1fr;gap:.2rem}}
@media (prefers-reduced-motion:no-preference){.copy{transition:transform .08s}}
</style>
<main>
<div class="rail"><nav aria-label="Sections"><a href="#decisions">Decisions</a><a href="#timeline">1 Timeline</a><a href="#brand">2 Brand</a><a href="#assets">3 Assets</a><a href="#characters">4 Characters</a><a href="#narration">5 Narration</a></nav></div>
<header class="hero">
<span class="eyebrow">Gate 1 · for approval</span>
<h1>Time Keeper Success Story</h1>
<p class="lede">Three connected paper-cut episodes about how three friends who loved watches built knowledge, then a community, then a place inside the watch world. Nothing has been animated yet. These five items come first, as the brief asks.</p>
<div class="status">
<div><b>Timeline</b><span>Drafted, dates missing</span></div>
<div><b>Brand</b><span>From logo and template</span></div>
<div><b>Assets</b><span>Checklist ready</span></div>
<div><b>Characters</b><span>Plan only, none made</span></div>
<div><b>Narration</b><span>Full draft, 3 episodes</span></div>
</div>
</header>

<section id="decisions"><h2>What I need from you</h2><p class="sub">Tick items as you settle them. Ticks stay on this device only.</p><ul class="decisions">__DEC__</ul></section>

<section id="timeline"><h2>1 · Verified timeline</h2><p class="sub">Founder testimony is primary and is never overwritten. Public facts come from search results only: this environment cannot open time-keeper.com, the App Store, Apple Podcasts or the Time Gallery launch article, so nothing is marked verified until someone opens the link.</p>
<ol class="tl">__TL__</ol>
<h4>Conflicts and risks</h4><ul class="conf">__CONF__</ul><p class="note">The full fact table, 24 rows with sources, is in the project as FACTS.csv.</p></section>

<section id="brand"><h2>2 · Brand system</h2><p class="sub">The identity is monochrome: black ink on warm paper. So the film has no accent colour. Emphasis comes from black and white inversion and from the real photographs.</p>
<div class="swatches">__SW__</div>
<h4>Type</h4><ul class="kv"><li><b>Arabic headlines, brand template</b>Bahij Helvetica Neue Bold. Licensed and not available here, so the draft uses Cairo ExtraBold until the files arrive.</li><li><b>English</b>Unknown. The draft uses Inter Tight. Needs the website or guideline.</li></ul>
<h4>Logo and motifs</h4><ul class="kv"><li><b>Logo</b>Black script "tk" inside a faint dial ring with four tick marks. Shown as a paper tile at the end of Episode 1, the end of Episode 3 and on the covers. Never first.</li><li><b>Motifs from the logo</b>The ring and ticks become a minute-track timeline with the year in a date window, and a hand-style radial wipe. No gears.</li><li><b>Paper</b>Warm neutral paper for light scenes, graphite and ink for night and museum scenes. Captions are black on light and white on dark, the same inversion as the brand&rsquo;s carousel boxes.</li></ul>
<h4>Could not inspect</h4><p class="sub">The website, Instagram and packaging. Send the official logo file, the font files, a packaging photo, and either access or screenshots.</p></section>

<section id="assets"><h2>3 · Missing assets</h2><p class="sub">Required means the film cannot honestly be finished without it. A missing Optional never stops production. A missing Required blocks only the scenes that need it, which stay as labelled placeholders.</p>
<h4>In hand</h4><ul class="have">__HAVE__</ul>
<h4>Required</h4><ul class="req">__REQ__</ul>
<h4>Preferred</h4><p>__PREF__</p>
<h4>Optional</h4><p>__OPT__</p></section>

<section id="characters"><h2>4 · Founder characters</h2><p class="sub">Nothing is generated and no credits are spent. No labelled founder photos have arrived, and I do not match faces to names.</p>
<ul class="kv"><li><b>Six characters, not three</b>Each founder in two periods, student years and today, because the ending cuts back to the young friends.</li><li><b>Method</b>The head is cut from the founder&rsquo;s own photograph, so likeness is guaranteed. Body, arms and legs are generated paper-craft pieces. If it looks wrong, the whole figure is generated from the photo and checked. One founder is tested first.</li><li><b>Tools</b>Image generation is connected with 141 credits. Nano Banana Pro takes reference images. One trial is quoted before more are run.</li></ul>
<h4>Steps and gates</h4><ol class="steps">__STEPS__</ol>
<h4>The 15 poses</h4><ul class="poses">__POSES__</ul></section>

<section id="narration"><h2>5 · Arabic narration</h2><p class="sub">Kuwaiti dialect, short sentences, pauses. No house is named. Years used: 2018, 2019, 2022. Voice rule: the story is told about the friends ("they") until 2018, then the founders take over ("we"), then it looks back as "they". Timing is an estimate.</p>
__EPS__</section>

<section id="limits"><h2>Limits of this package</h2><ul class="limits"><li>Time-keeper.com, apps.apple.com, podcasts.apple.com and 248am.com are blocked here. Every public fact is from search summaries.</li><li>I cannot identify people in photographs or match faces to names.</li><li>Brand colours come only from the logo and the brand template. Nothing is guessed.</li><li>Earlier draft renders made before this brief are exploratory and will be rebuilt after approval.</li></ul></section>
</main>
<div class="toast" id="toast" hidden></div>
<script>
var COPY = __COPY__;
(function(){
  var toast=document.getElementById('toast'),t;
  function say(m){toast.textContent=m;toast.hidden=false;clearTimeout(t);t=setTimeout(function(){toast.hidden=true},2200)}
  function fallback(text){var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(ta);return ok}
  document.querySelectorAll('.copy').forEach(function(b){b.addEventListener('click',function(){
    var text=COPY[b.getAttribute('data-copy')];
    function done(ok){say(ok?'Narration copied':'Select the text and copy it by hand')}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true)},function(){done(fallback(text))})}else{done(fallback(text))}
  })});
  document.querySelectorAll('.decisions input').forEach(function(c){
    try{c.checked=localStorage.getItem('tk-gate1-'+c.getAttribute('data-k'))==='1'}catch(e){}
    c.addEventListener('change',function(){try{localStorage.setItem('tk-gate1-'+c.getAttribute('data-k'),c.checked?'1':'0')}catch(e){}})
  });
})();
</script>
'''
for k, v in {'__DEC__': dec, '__TL__': tl, '__CONF__': conf, '__SW__': sw, '__HAVE__': have, '__REQ__': req, '__PREF__': e(PREF), '__OPT__': e(OPT), '__STEPS__': steps, '__POSES__': poses, '__EPS__': eps_html, '__COPY__': json.dumps(copy_data, ensure_ascii=False)}.items():
    PAGE = PAGE.replace(k, v)
open(os.path.join(HERE, 'review.html'), 'w').write(PAGE)
print('review.html', len(PAGE) // 1024, 'KB')
