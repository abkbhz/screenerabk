// Base URL of the backend API.
// - Local dev: empty string -> requests are relative and hit the combined
//   Express + Vite dev server on the same origin.
// - Production (Vercel): set VITE_API_BASE to the Render backend URL, e.g.
//   VITE_API_BASE=https://abk-screener-api.onrender.com
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export const apiUrl = (path: string): string => `${API_BASE}${path}`;
