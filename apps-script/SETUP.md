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
