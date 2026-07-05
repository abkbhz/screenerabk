# ABK Screener — Indian Stock Screener & Technical Filter

Live NSE screener tracking the **full ~2,000-company NSE equity universe**, filtering on
technical rules (EMA / RSI / volume breakouts) with Gemini AI entry/exit analysis.

- **Frontend:** React + Vite → deploy to **Vercel**
- **Backend:** Express (`server.ts`) with a live-data cache + background warmer → deploy to **Render** (free)

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set your `GEMINI_API_KEY` (get one free at https://aistudio.google.com/apikey)
3. Run the app:
   `npm run dev`  → open http://localhost:3000

Leave `VITE_API_BASE` empty locally (frontend + backend share one server in dev).

## Deploy (free)

See **[DEPLOY.md](DEPLOY.md)** for step-by-step Vercel + Render deployment, including how to
get and configure the Gemini API key.

## How "live" works

The backend keeps an in-memory cache and warms it in the background from Yahoo Finance
(weekly candles) in small batches. `GET /api/stocks` returns instantly — cached live data
where available, a synthetic placeholder otherwise — so the list is always full and flips
to LIVE as the warmer catches up. The selected/added stock is always fetched fresh-live.
