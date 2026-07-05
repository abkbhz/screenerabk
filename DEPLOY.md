# Deploy ABK Screener (free) — Vercel + Render

This app has two parts:

- **Frontend** (React/Vite) → hosted on **Vercel** (free)
- **Backend** (`server.ts`, Express — fetches live prices + runs Gemini AI) → hosted on **Render** (free)

They talk to each other over HTTPS. Total cost: **₹0**. Follow the steps in order.

---

## Step 1 — Get a free Gemini API key

The AI analysis panel needs a Google Gemini API key.

1. Go to **https://aistudio.google.com/apikey** and sign in with your Google account.
2. Click **"Create API key"** (choose "Create API key in new project" if asked).
3. Copy the key (looks like `AIza...`). **Keep it private** — don't commit it or share it.

> Free tier is enough for personal use. You'll paste this key into Render in Step 3 (never into the code).

---

## Step 2 — Push this project to GitHub

Both Vercel and Render deploy from a GitHub repo.

```bash
cd "indian-stock-screener-&-technical-filter"
git init
git add .
git commit -m "ABK Screener: full NSE list + live data + deploy configs"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/abk-screener.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `dist`, and any `.env` files, so nothing secret is pushed.

---

## Step 3 — Deploy the backend on Render

1. Go to **https://render.com** and sign up (free) with GitHub.
2. Click **New → Web Service** and select your repo.
   - (You can also use **New → Blueprint** — this repo includes `render.yaml` which pre-fills the settings.)
3. Settings (if not auto-filled from `render.yaml`):
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Instance Type:** Free
4. Under **Environment / Environment Variables**, add:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `GEMINI_API_KEY` | *(paste the key from Step 1)* |
   | `FRONTEND_ORIGIN` | `*` *(tighten later — see Step 5)* |
5. Click **Create Web Service** and wait for the build to finish.
6. Copy your backend URL — it looks like **`https://abk-screener-api.onrender.com`**. You'll need it next.

> **Note on Render Free:** the service sleeps after ~15 min of inactivity and takes ~30–60s to wake on the next request. Also, the live stock list **warms up progressively** — expect the big names to go LIVE within a minute and the full ~2,000-stock universe to fill in over several minutes. Until a stock is warmed, it shows a "SIMULATED FEED" badge.

---

## Step 4 — Deploy the frontend on Vercel

1. Go to **https://vercel.com** and sign up (free) with GitHub.
2. Click **Add New → Project** and import the same repo.
3. Vercel reads `vercel.json` automatically (build command `vite build`, output `dist`).
4. Before deploying, open **Environment Variables** and add:
   | Key | Value |
   |-----|-------|
   | `VITE_API_BASE` | *(your Render URL from Step 3, e.g. `https://abk-screener-api.onrender.com`)* |
5. Click **Deploy**. When it finishes you'll get a URL like **`https://abk-screener.vercel.app`** — that's your live app.

> If you set `VITE_API_BASE` **after** the first deploy, trigger a **Redeploy** (Vercel bakes env vars in at build time).

---

## Step 5 — Lock down CORS (recommended)

Once you know your Vercel URL, go back to **Render → your service → Environment**, change
`FRONTEND_ORIGIN` from `*` to your exact Vercel URL (e.g. `https://abk-screener.vercel.app`),
and save. Render redeploys automatically.

---

## Run locally (optional)

```bash
npm install
# create a .env file (copy from .env.example) and set GEMINI_API_KEY
npm run dev
# open http://localhost:3000
```

Locally, frontend and backend run from the **same** server, so leave `VITE_API_BASE` empty.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App loads but AI panel says "Gemini API key not configured" | Set `GEMINI_API_KEY` in Render → redeploy. |
| Stocks list is empty / network error in browser console | Check `VITE_API_BASE` in Vercel matches your Render URL exactly (no trailing slash), then redeploy Vercel. |
| First request is slow | Render free tier is waking from sleep (~30–60s). Normal. |
| Most stocks show "SIMULATED FEED" for a while | The live warmer is still filling the cache. Wait a few minutes; refresh. |
| CORS error in console | Set `FRONTEND_ORIGIN` in Render to `*` (testing) or your exact Vercel URL. |
