# Connecting the Apply form to Google (Sheet + Drive + email)

The Apply page (`apply.html`) posts each application to a **Google Apps Script web app**, which:

1. saves the CV PDF to a **Google Drive folder**,
2. appends a row to a **Google Sheet** — your dashboard / backup, and
3. **emails the committee** on every submission.

Do this once, signed into the **society's** Google account (not a personal one, so it survives committee handover). ~10 minutes.

---

## 1. Create the Drive folder for CVs
1. Go to [drive.google.com](https://drive.google.com) → **New ▸ Folder** → name it e.g. `Div Head CVs 2026`.
2. Open the folder. Copy the **folder ID** from the URL — it's the part after `/folders/`:
   `https://drive.google.com/drive/folders/`**`1AbCdEf...XyZ`**

## 2. Create the Sheet + add the script
1. Go to [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet** → name it e.g. `Div Head Applications`.
   (The script adds the header row automatically on the first submission.)
2. In the Sheet: **Extensions ▸ Apps Script**.
3. Delete the placeholder code, paste the entire contents of **`Code.gs`** from this folder.
4. At the top of `Code.gs`, fill in `CONFIG`:
   - `CV_FOLDER_ID`  → the folder ID from step 1
   - `COMMITTEE_EMAIL` → where you want notifications (a shared committee inbox is ideal)
5. **Save** (💾).

## 3. Deploy as a Web App
1. **Deploy ▸ New deployment**.
2. Click the gear ⚙ next to "Select type" → **Web app**.
3. Set:
   - **Description:** `BTS applications`
   - **Execute as:** **Me** (the society account)
   - **Who has access:** **Anyone**  ← required so the public form can post
4. **Deploy**. Approve the permissions prompt (it needs Drive, Sheets, and send-email
   access — that's expected). You may have to click *Advanced ▸ Go to … (unsafe)* the
   first time; this is normal for your own scripts.
5. Copy the **Web app URL** — it ends in `/exec`.

## 4. Plug the URL into the site
1. Open **`js/apply.js`**.
2. Paste the URL into the first config line:
   ```js
   APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfyc.../exec',
   ```
3. Bump the cache version so visitors get the update: in `apply.html`, increment the
   number on the `js/apply.js?v=N` link (e.g. `?v=5` → `?v=6`). Bump the other `?v=`
   links too if you've edited any CSS.

## 5. Test it
1. Open `apply.html`, fill it in with a test CV, and submit.
2. Check: a new **row** appears in the Sheet, the **CV** is in the Drive folder, and a
   **notification email** arrives. 🎉

---

## Notes
- **Backup / duplication:** the Sheet *is* the durable record, and the committee email is
  a second copy of every application. If you also want a Microsoft/Excel copy, you can
  later add a step that posts to a Microsoft Form or use Sheets' *File ▸ Download*.
- **Dashboard:** sort/filter the Sheet, or share it **read-only** with the committee. For
  charts (applications per division, etc.), point a free **Looker Studio** report at it.
- **Privacy:** keep the Sheet and Drive folder private to the committee. The form only
  ever holds the `/exec` URL — no keys or credentials are exposed in the website.
- **Editing the script later:** after any change to `Code.gs`, do **Deploy ▸ Manage
  deployments ▸ ✏️ Edit ▸ Version: New version ▸ Deploy** to publish it (the URL stays
  the same).
- **Volume:** comfortably handles your 20–40 applicants on Google's free quotas.

---

# Analyst applications (separate sheet)

Analyst applications use their own script, **`AnalystCode.gs`**, so they land in their own
Sheet and Drive folder and never mix with Division Head or committee applications.

1. Create a new Drive folder (e.g. `Analyst CVs 2026`) and a new Sheet (e.g. `Analyst Applications 2026`).
2. In the Sheet: **Extensions ▸ Apps Script**, paste all of `AnalystCode.gs`.
3. Fill `CONFIG`: `CV_FOLDER_ID` (folder ID). No committee email to set — notifications go
   straight to each division's heads (see `DIVISION_HEADS` below).
   If the editor won't open from the Sheet, make a standalone project and set `SHEET_ID` instead.
4. **Deploy ▸ New deployment ▸ Web app** — Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
5. Paste it into `data-endpoint="…"` on the `<form id="applyForm">` in `apply/index.html`.
   Until this is set the form refuses to submit (it never silently drops an application).
6. Test with a dummy CV: a row appears in the new Sheet, the CV in the folder, and emails go out.
   `?demo=1` on `/apply` walks the success screen without sending anything.

## Division head notifications

Every analyst application emails that division's heads only (a FICC application never
reaches Equities/Macro/Quant heads, and vice versa) — there is no shared committee
inbox copied in, so applications for other divisions never land in a head's inbox.
See `DIVISION_HEADS` near the top of `AnalystCode.gs`. When a head changes, edit that
list and redeploy: **Deploy ▸ Manage deployments ▸ ✏️ Edit ▸ Version: New version ▸
Deploy** (the `/exec` URL stays the same, so nothing on the site needs to change).

The same list also controls **CV access**: each CV is set to "anyone at bristol.ac.uk
with the link can view" the moment it's saved to Drive (`shareCvWithDivisionHeads`), so
the "Open CV" link in the Sheet works immediately without anyone requesting access. It
also tries adding each head as a named viewer directly, but the domain-wide link is the
one that actually grants access — that step kept silently failing in testing. Sharing
the Sheet itself does **not** grant access to the CV files — they're separate Drive
permissions. This only applies to CVs saved *after* you deploy this version; any already
sitting in the Drive folder from earlier applications still need sharing by hand
(right-click the file in Drive ▸ Share ▸ change to "Anyone at bristol.ac.uk with the
link").
