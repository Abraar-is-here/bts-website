# BTS Website — Onboarding (for Hristyan)

Hey Hristyan 👋 — this gets you everything you need to edit and maintain the
Bristol Trading Society website. You already live in LLM-land and know Claude
chat inside out, so the new bits for you are really just: **(a) Claude Code**
(Claude that can touch real files on your machine), and **(b) how this
particular site is wired together.** Both are covered below.

**Live site:** https://bristoltradingsoc.co.uk (DNS may still be propagating)
**Repo:** https://github.com/Abraar-is-here/bts-website

---

## 0. The 30-second mental model

- The website is just a folder of **plain HTML/CSS/JavaScript files** — *no
  framework, no build step, no Node, no compiling.* What's in the repo *is* the
  site.
- It's hosted free on **GitHub Pages**. When you `push` to the repo, the live
  site updates itself in ~1 minute. That's the whole deployment story.
- You edit it by talking to **Claude Code** in a terminal, the same way you'd
  prompt Claude chat — except it reads and rewrites the actual files for you.

So the loop is: **tell Claude Code what to change → it edits the files → review →
push → live.** That's it.

---

## 1. Claude Code crash course (you've never used it)

### What it is (in Claude-chat terms)
Claude chat talks. **Claude Code acts** — it runs in your terminal, can read
every file in the project, edit them, run commands (git, etc.), and even spin up
a local preview of the site. Think "Claude with hands, sitting inside the
project folder." Same conversation skills you're used to; it just *does* things.

### One-time setup
1. **Install Claude Code** — follow https://claude.com/code (there's a one-line
   installer for Windows/Mac). Sign in with your Anthropic account — your **Pro**
   plan works.
2. **Git** — Claude Code uses `git` to sync with GitHub. On Windows, install
   "Git for Windows" if you don't have it (it bundles the login helper, so you
   won't fight with tokens — your first `git push` just pops a browser login).
3. **Clone the repo to your computer:**
   ```bash
   git clone https://github.com/Abraar-is-here/bts-website.git
   ```
   ⚠️ **Clone it somewhere normal like `Documents`, NOT inside OneDrive.** Git +
   OneDrive sync fight each other and corrupt things. (Abraar's working copy is
   in OneDrive for historical reasons — yours doesn't need to be.)
4. **Open Claude Code in the folder:**
   ```bash
   cd bts-website
   claude
   ```
   Now just talk to it.

### The daily edit loop
```
git pull          ← ALWAYS pull first, to grab Abraar's latest changes
… make changes with Claude Code (just describe what you want) …
git push          ← sends your changes; site goes live ~1 min later
```
Claude Code can run the `pull`/`commit`/`push` for you — just say
*"pull the latest"* or *"commit and push these changes."*

### Two-person etiquette (you + Abraar)
- **Always `git pull` before you start**, and **push when you finish.**
- Try not to *both* edit the **same file at the same time**. If you do and git
  complains about a "merge conflict," don't panic — paste the message to Claude
  Code and it'll resolve it.
- Every change is logged with who made it (`git log`), so nothing's ever lost.

### Seeing your changes before they go live
Two easy options:
- **Local preview:** ask Claude Code to *"start a local preview server"* (or run
  `python -m http.server 5500` and open `http://localhost:5500`).
- **Just push and look:** the live site rebuilds in ~1 min. (After editing an
  `.html` file you may need a **hard refresh** — Ctrl+Shift+R — see Gotchas.)

---

## 2. How the website is built (architecture)

### Stack & philosophy
Plain **HTML + CSS + vanilla JS**, deliberately **no build step**. Why: it's
free to host on GitHub Pages, dead simple to maintain, and there's nothing to
"compile" or break. The trade-off is we hand-write things a framework might
generate — but for a site this size that's a win.

### File map
| Path | What it is |
|------|------------|
| `index.html` | **Home** — animated aurora hero + closing panel with the dot-globe |
| `contact.html` | Contact details (email + social icons) |
| `apply.html` | **Division Head application form** |
| `styles/tokens/fonts.css` | `@font-face` declarations (self-hosted fonts) |
| `styles/tokens/colors.css` | The colour palette + shadows + overlays |
| `styles/tokens/spacing.css` | Spacing scale, radii, motion timing/easing |
| `styles/tokens/typography.css` | Font sizes, line-heights, the type scale |
| `styles/main.css` | All the layout + component styles |
| `js/aurora.js` | The animated WebGL background |
| `js/globe.js` | The rotating dot-matrix globe |
| `js/apply.js` | Application-form validation + submission |
| `assets/fonts/` | The actual font files (`.woff2`) |
| `assets/img/bull.svg` | The brand bull mark |
| `apps-script/` | The Google backend for the form (`Code.gs` + `SETUP.md`) |
| `CNAME` | Tells GitHub Pages the custom domain is `bristoltradingsoc.co.uk` |

### The design system (this is the important bit)
Everything visual is driven by **design tokens** — CSS variables defined once in
`styles/tokens/` and reused everywhere. **Change a token, and it updates across
the whole site.** Don't hard-code colours/sizes in components; use the tokens.

- **Palette** (`colors.css`): deep navy `#0a1a3f` (ground), deep royal `#0d2b6b`,
  electric royal `#2563eb` (the accent — buttons/links), sky `#38bdf8` (sharp
  highlight), off-white `#f4f7fb`, slate `#8da2c4` (muted text). Institutional,
  unmistakably blue — that's the brand.
- **Fonts** (`fonts.css`): **Syne** (chunky display — the big headlines + "BTS"),
  **DM Sans** (everything else — body, nav, buttons). *(We originally used Space
  Mono for labels/buttons but removed it — it read as "AI slop." Its font-face is
  still defined but unused; don't reintroduce it.)*
- **Spacing/motion** (`spacing.css`): a 4/8/16/32/64 spacing rhythm, pill + card
  radii, and the shared easing curve + durations for animations.

### The two custom showpieces
These are hand-built (not libraries) and both **read their colours from the CSS
tokens**, so re-theming the palette re-themes them automatically:

- **`js/aurora.js` — the liquid blue background.** It's a hand-written **WebGL
  shader** that draws a domain-warped noise field morphing through the palette.
  (We *wanted* to use the `shadergradient` library, but it needs React + a build
  step, which this no-build site doesn't have — so we wrote the equivalent shader
  natively.) It has a CSS-gradient fallback if WebGL is unavailable, and it
  freezes under "reduced motion."
- **`js/globe.js` — the rotating dot-globe** on the home page's closing panel.
  Pure 2D canvas (no library): points scattered on a sphere, filtered to land via
  continent outlines, spun slowly. *(Tip: add `?globe=flat` to the URL to see the
  world map it's drawing — handy if you ever tweak the continents.)*

### Accessibility & responsiveness (already baked in — keep it)
The site is mobile-responsive, keyboard-navigable (focus rings, a skip-link),
respects `prefers-reduced-motion`, and the form announces errors to screen
readers. If you add things, ask Claude Code to "keep it accessible and
responsive" and it'll hold the line.

### ⭐ The cache-buster system (don't skip this)
Look at the `<link>`/`<script>` tags in the HTML — they end in `?v=7`, `?v=8`,
etc. That number forces browsers to fetch the **new** CSS/JS instead of a cached
old copy. **Rule: whenever you edit a `.css` or `.js` file, bump that number**
(e.g. `?v=8` → `?v=9`) on the pages that use it. Claude Code knows this rule —
if you forget, just say "bump the cache version."

---

## 3. The application form & where the data lives

The **Apply page** (`apply.html`) is a real form that stores submissions. Here's
the pipeline:

```
applicant submits apply.html
        │  (js/apply.js validates, then POSTs the data + CV)
        ▼
Google Apps Script web app   ← lives in the committee's Google account
        ├─ saves the CV PDF  → a Google Drive folder
        ├─ adds a row        → a Google Sheet   ← this is your applicant database
        └─ emails            → the committee inbox
```

- **Where applicant data lives:** in the **committee Google account** — a
  **Google Sheet** (one row per applicant, with a link to each CV in Drive) plus
  an email per submission. *None of that is in this repo* — the repo only holds
  the public form. The Sheet/Drive are private to the committee.
- **What's in the repo:** `js/apply.js` holds the script's web-app URL
  (`APPS_SCRIPT_URL`) — that's public by design and safe to expose; it can only
  *receive* submissions, not read your data.
- **The backend code + setup guide:** `apps-script/Code.gs` (the script) and
  `apps-script/SETUP.md` (how it was deployed). If you ever need to change what
  data is collected or re-deploy, read `SETUP.md`.
- **Editing the form's fields/questions** → `apply.html` (the fields) and
  `js/apply.js` (the validation). If you add a field, it also needs adding to
  `Code.gs` so it gets written to the Sheet. Ask Claude Code — it'll do all three.

> Ask Abraar for access to the committee Google account (the Sheet, Drive folder,
> and Gmail) — that's where you'll actually read applications.

---

## 4. The "skills" we used

**Claude Code skills** are reusable expert modules you can invoke with a
`/command`. They load specialised knowledge (and sometimes scripts) into Claude
Code for a specific job. We used three, all for **design review / killing "AI
slop"** — they're why the site doesn't look generic:

| Skill | What it does | Invoke |
|-------|--------------|--------|
| **impeccable** | Frontend design-craft reviewer with a real anti-pattern ("slop") detector — audit, critique, polish, harden, etc. | `/impeccable audit` |
| **ui-ux-pro-max** | A searchable database of UI/UX guidelines (accessibility, forms, colour, motion…) it checks your code against | `/ui-ux-pro-max` |
| **emil-design-eng** | Emil Kowalski's animation/interaction-craft philosophy (easing, press feedback, the small details) | `/emil-design-eng` |

We ran all three over the site to find and remove slop (e.g. they're why we
ditched Space Mono, removed `01/02` section numbers, added proper focus states,
and tuned the button press feedback).

**Heads-up:** these skills are **not in the repo** (they're dev tooling, kept out
to keep the repo clean). To use them on your machine, the easiest path is to ask
your Claude Code to install them, e.g.:

> *"Install the impeccable skill from github.com/pbakaus/impeccable project-locally."*

…and the same for `github.com/nextlevelbuilder/ui-ux-pro-max-skill` and
`github.com/emilkowalski/skill`. They're **optional** — the site works fine
without them; they're just great for keeping design quality high. (There are also
strong built-in design skills like `/design` and `/ui-ux-pro-max` available by
default.)

*(One more we only researched, didn't ship: `ruucm/shadergradient` — the gradient
library we'd have used if the site had a build step. We wrote a custom shader
instead, see §2.)*

---

## 5. "Where do I change…?" cheat-sheet

| You want to… | Edit |
|--------------|------|
| Change a brand colour | `styles/tokens/colors.css` (updates aurora + globe too) |
| Change a font / size | `styles/tokens/fonts.css` / `typography.css` |
| Edit home page text (e.g. the headline, the "September 2026" line) | `index.html` |
| Edit contact email / socials | `contact.html` |
| Edit the application questions | `apply.html` (+ `js/apply.js`, + `apps-script/Code.gs`) |
| Change buttons / nav / layout | `styles/main.css` |
| Tweak the background animation | `js/aurora.js` |
| Tweak the globe | `js/globe.js` |

Honestly, for most of these you don't need to know the file — just tell Claude
Code *"change the home page headline to X"* and it finds the right spot.

---

## 6. Golden rules / gotchas

1. **`git pull` before editing, `git push` after.** Keeps you and Abraar in sync.
2. **Bump the `?v=` cache number** after editing any CSS/JS (or ask Claude Code to).
3. After editing an **`.html`** file, do a **hard refresh** (Ctrl+Shift+R) to see
   it — the HTML files themselves aren't cache-busted, so browsers hold them
   briefly. (Live visitors get the update within ~10 min automatically.)
4. **Don't clone into OneDrive.** (See §1.)
5. **Use the design tokens**, don't hard-code colours/sizes in components.
6. **Don't expose secrets.** The repo is public. The form's web-app URL is fine
   (public by design); never commit passwords or the committee account login.
7. When in doubt, **describe the goal to Claude Code and let it figure out the
   files** — that's the whole point of it.

---

## 7. Status of the launch (as of handover)

- ✅ Site built (home, contact, application form) and pushed to GitHub
- ✅ Live on GitHub Pages
- ✅ Application form connected to the Google backend (Sheet + Drive + email) and
  tested end-to-end
- ⏳ Custom domain `bristoltradingsoc.co.uk` — DNS configured, propagating; once
  GitHub's Pages "DNS check" goes green, "Enforce HTTPS" gets ticked and it's
  fully live
- ◻️ You being added as a repo collaborator (Abraar does this so you can push)

Welcome aboard — any of this is fuzzy, just ask your Claude Code to explain a
file or concept; it can read the whole project and walk you through it. 🚀
