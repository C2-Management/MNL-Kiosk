# Mugznlugz — Portal

A sleek black luxury portal site for the **Mugznlugz** brand. Plain HTML, CSS,
and JavaScript — no frameworks, no build step. Ships directly to GitHub Pages.

Features:

- Left sidebar navigation (Home / Website / Gallery / Connect Drive)
- Top-right clickable logo that always returns Home
- Embedded view of `https://www.mugznlugz.com` with a polished fallback
- Premium 3D rolling coverflow gallery with keyboard, click, and drag support
- Google Drive-powered image source (OAuth via Google Identity Services)
- Fully responsive down to mobile

## File layout

```
.
├── index.html
├── styles.css
├── app.js
├── config.js              <- GENERATED from .env — do not edit by hand
├── build.js               <- reads .env, writes config.js
├── .env                   <- YOUR secrets (gitignored)
├── .env.example           <- template for collaborators
├── package.json
├── assets/
│   └── logo.png           <- drop your real logo here
├── .github/
│   └── workflows/
│       └── deploy.yml     <- auto-deploys to GitHub Pages
├── .gitignore
├── .nojekyll
└── README.md
```

## 1) Running locally

```bash
# 1. Create your local environment file
cp .env.example .env

# 2. Edit .env and fill in your real values

# 3. Generate config.js from .env
node build.js
# or: npm run build

# 4. Serve the static files
python3 -m http.server 8080
# or: npx serve .
# or one-shot:  npm start
```

Then open `http://localhost:8080`.

> Google Sign-In **requires HTTPS or `http://localhost`**. Opening `index.html`
> via `file://` will block OAuth.

### How `.env` + `config.js` work together

- **`.env`** is the source of truth for all configuration. It is listed in
  `.gitignore` and must never be committed.
- **`build.js`** reads `.env` and writes **`config.js`**, which is what the
  browser actually loads.
- For **local dev**, run `node build.js` whenever you change `.env`.
- For **production**, the GitHub Actions workflow generates `config.js` at
  deploy time using secrets from your repo settings — your real values never
  touch the filesystem (see section 5).

> **Security reality check:** this is a static site. Any value inside
> `config.js` is visible to anyone who views the page source. `CLIENT_ID`
> and `API_KEY` are *designed* to be public — real security comes from the
> **HTTP-referrer / authorized-origin restrictions** you set in Google Cloud
> Console. Don't put anything in `.env` that you wouldn't paste into a
> public webpage.

## 2) Logo

Place your logo at `./assets/logo.png`. Transparent PNG or SVG-exported-PNG
around **120–240px wide** looks best. If the logo file is missing, the top bar
gracefully falls back to a text chip.

## 3) Configure Google OAuth + Drive API

Open `.env` and fill in these three values, then run `node build.js`:

```ini
CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
API_KEY=YOUR_GOOGLE_API_KEY
FOLDER_ID=YOUR_DRIVE_FOLDER_ID
```

### a. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and create a project.
2. Enable **Google Drive API** under *APIs & Services → Library*.

### b. Create an API Key

1. *APIs & Services → Credentials → Create credentials → API key*.
2. Restrict it to the **Google Drive API** (Application restrictions: HTTP referrers,
   listing your GitHub Pages URL and `localhost`).

### c. Create an OAuth 2.0 Client ID

1. *Credentials → Create credentials → OAuth client ID → Web application*.
2. Add **Authorized JavaScript origins**, for example:
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`
   - `https://<your-github-username>.github.io`
   - If hosted from a project repo: `https://<your-github-username>.github.io`
     (origin is the base host — the repo path does not go here).
3. Copy the client ID into `CONFIG.CLIENT_ID`.

### d. Drive Folder ID

Open your Drive folder in the browser. The URL looks like:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv
```

Paste the trailing ID into `CONFIG.FOLDER_ID`.

Set folder sharing so your account (or anyone you intend to sign in) can
read the files.

## 4) Updating the embedded website URL

All editable values live in **`.env`** (or, for production, in your repo's
GitHub Actions secrets/variables). Edit `.env`, then run `node build.js`.

```ini
# .env
SITE_URL=https://www.mugznlugz.com
FORCE_EMBED_FALLBACK=false
EMBED_TIMEOUT_MS=3500
EMBED_PREVIEW_URL=https://s.wordpress.com/mshots/v1/{url}?w=1280&h=800
```

### Why embedding sometimes fails

Most modern websites block being loaded inside an iframe using
`X-Frame-Options: DENY` or a `Content-Security-Policy: frame-ancestors`
header. This is a **browser-level** block — no JavaScript or setting on our
side can override it.

Common sites that block embedding: Shopify storefronts, Squarespace, Wix,
Instagram, most CMSs, banks, and anything using Cloudflare's bot-protection.

### What this app does about it

When embedding fails, the app automatically shows a polished fallback card
with:

1. A **screenshot preview** of the target site (via WordPress's free mshots
   service — swap `EMBED_PREVIEW_URL` for thum.io or ApiFlash if you want
   higher-res images).
2. An **Open Mugznlugz** button that opens the site in a new tab (this
   always works).
3. A **Copy link** button.
4. A **Retry embed** button that re-attempts the iframe load.

### Tuning the embed behavior

- If you already know your site blocks embedding, set
  `FORCE_EMBED_FALLBACK: true` to skip the iframe attempt entirely — the
  fallback card appears instantly, no 3.5 s wait.
- If your site is slow, bump `EMBED_TIMEOUT_MS` higher.
- To disable the screenshot preview, set `EMBED_PREVIEW_URL: ''`.

### Making your own site embeddable

If **you own** the target site and want it to embed here, you have two options:

1. Remove `X-Frame-Options` entirely from the site's response headers.
2. Add a permissive CSP:
   `Content-Security-Policy: frame-ancestors 'self' https://<user>.github.io`

Shopify and Squarespace don't let you change these headers — for those
platforms the fallback card is the permanent solution.

## 5) Deploying to GitHub Pages

You have two options. **Option A (Actions) is strongly recommended** —
it keeps your real API keys out of the repo entirely.

### Option A — GitHub Actions (secrets-based, recommended)

1. Push this project to a GitHub repo (with `.env` **NOT** committed —
   `.gitignore` handles this).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions** and add:

   **Repository secrets** (encrypted):

   - `CLIENT_ID`
   - `API_KEY`
   - `FOLDER_ID`

   **Repository variables** (non-sensitive, optional overrides):

   - `SITE_URL`
   - `FORCE_EMBED_FALLBACK`
   - `EMBED_TIMEOUT_MS`
   - `EMBED_PREVIEW_URL`
   - `SCOPES`
   - `DEMO_IMAGES`

4. Push to `main`. The included workflow (`.github/workflows/deploy.yml`)
   runs `node build.js` with those values injected as env vars, generates
   `config.js`, and deploys.

Your real credentials never touch the repo — they live in GitHub's encrypted
secret store.

### Option B — Manual deploy (everything in the repo)

1. Run `node build.js` locally.
2. Commit the generated `config.js` (in this mode, remove `config.js` from
   `.gitignore` — or just leave it as-is; the sample `.gitignore` keeps
   `config.js` tracked by default).
3. Push to `main`, then **Settings → Pages → Deploy from a branch →
   `main` / `/ (root)`**.

Your site will be at `https://<user>.github.io/<repo>/` (project site) or
`https://<user>.github.io` (user site).

### After deploying

Add your live Pages URL to **Authorized JavaScript origins** in your Google
OAuth client (e.g. `https://<user>.github.io` — origin only, no repo path).

All internal paths are relative (`./styles.css`, `./app.js`,
`./assets/logo.png`) so the site works correctly from any base path. The
`.nojekyll` file disables Jekyll processing.

## 6) Customizing the look

All colors live in CSS custom properties at the top of `styles.css`:

```css
:root {
  --bg: #050505;
  --sidebar: #0b0b0b;
  --panel: #0a0a0a;
  --border: #1a1a1a;
  --btn: #111111;
  --btn-hover: #1a1a1a;
  --text: #ffffff;
  --text-dim: #b5b5b5;
  ...
}
```

Edit in one place — it propagates everywhere.

## 7) Gallery behavior

- **Click** a side image to bring it to center.
- **Prev / Next** buttons in the gallery header.
- **Floating arrows** on the stage (`‹` / `›`).
- **Keyboard:** ← / → when the gallery panel is visible.
- **Drag / swipe:** horizontal drag across the stage (pointer + touch).
- **Infinite loop:** the carousel wraps in both directions.
- **Autoplay** is intentionally off. To enable it later, add a `setInterval`
  around `coverflow.next()` inside `app.js` and clear it on user interaction.

## 8) Troubleshooting

- **“Drive is not configured.”** — Fill in `CLIENT_ID`, `API_KEY`, and
  `FOLDER_ID` in `app.js`.
- **Sign-in popup blocked** — The Connect Drive button must be clicked by the
  user; browsers block programmatic popups.
- **Images 404 after loading** — The Drive folder may not be shared with the
  signed-in account, or the OAuth scope was denied.
- **Iframe shows fallback immediately** — The target site disables embedding.
  Click **Open Mugznlugz** to open it in a new tab.

---

Made for Mugznlugz — minimal, black, premium.
