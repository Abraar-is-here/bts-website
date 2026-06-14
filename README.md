# Bristol Trading Society — Website

Marketing site, contact page, and Division Head application form for the
**Bristol Trading Society** (University of Bristol).

Plain HTML / CSS / vanilla JS — **no build step**. Hosted on **GitHub Pages**
at [bristoltradingsoc.co.uk](https://bristoltradingsoc.co.uk).

## Structure

| Path | What it is |
|------|------------|
| `index.html` | Home — animated aurora hero + closing panel with the dot-globe |
| `contact.html` | Contact details (email + socials) |
| `apply.html` | Division Head application form |
| `styles/tokens/` | Design tokens — `fonts`, `colors`, `spacing`, `typography` |
| `styles/main.css` | Layout + components |
| `js/aurora.js` | WebGL gradient background |
| `js/globe.js` | Canvas dot-matrix globe |
| `js/apply.js` | Application-form validation + submission |
| `assets/` | Self-hosted fonts + brand bull mark |
| `apps-script/` | Google Apps Script backend for the application form (see `SETUP.md`) |

## Editing the site

Edit the files, then commit and push — GitHub Pages redeploys automatically
(usually within a minute). The `?v=N` query on the stylesheet/script links is a
cache-buster: **bump the number** whenever you change a CSS or JS file so
returning visitors get the update.

## Application-form backend

The apply form posts to a Google Apps Script web app that writes each
application to a Google Sheet, stores the CV in Drive, and emails the committee.
It is **not connected until you complete the steps in
[`apps-script/SETUP.md`](apps-script/SETUP.md)** (paste the deployed URL into
`js/apply.js`).
