# Health OS — Dashboard v2

Next.js rebuild of the Health OS dashboard. Mobile-first PWA-ready frontend that reads
from the existing Supabase backend (same edge functions, DB, sync pipeline as v1).

## Stack
- Next.js (App Router) + React + TypeScript
- Reads the live `health-dashboard` API on Supabase

## Local dev
```bash
npm install
npm run dev
```

## Deploy
Auto-deploys on push via Vercel. Optional env vars (public, RLS-protected — baked
fallbacks exist so it works without them):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> v2 runs in parallel with the v1 GitHub Pages dashboard. Both read the same backend;
> v1 stays live until v2 reaches parity.
