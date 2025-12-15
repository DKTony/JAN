# Deployment Report

## Goal

Deploy JAN (Just Another Neuralnet) from [GitHub](https://github.com/DKTony/JAN) to [Netlify](https://app.netlify.com/projects/jan-neuralnet) with a reproducible configuration and documented operational steps.

## Current Deployment

### GitHub

- **Repository**: [https://github.com/DKTony/JAN](https://github.com/DKTony/JAN)
- **Default branch**: `main`

### Netlify

- **Site name**: `jan-neuralnet`
- **Site ID**: `1732bfb5-b69f-40f3-89d2-fcf96db6b30a`
- **Primary URL**: [https://jan-neuralnet.netlify.app](https://jan-neuralnet.netlify.app)
- **Netlify project dashboard**: [https://app.netlify.com/projects/jan-neuralnet](https://app.netlify.com/projects/jan-neuralnet)

### Deploy Reference

- **Deploy ID**: `693f7b56e0ced0fd3e765609`
- **Deploy monitor URL**: [https://app.netlify.com/sites/1732bfb5-b69f-40f3-89d2-fcf96db6b30a/deploys/693f7b56e0ced0fd3e765609](https://app.netlify.com/sites/1732bfb5-b69f-40f3-89d2-fcf96db6b30a/deploys/693f7b56e0ced0fd3e765609)

## Deployment Configuration Added

### `netlify.toml`

Added `netlify.toml` at repo root with:

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: `20`
- **SPA routing fallback**: redirect all routes to `/index.html`
- **Security headers**:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(self), geolocation=()`
- **Static asset caching**:
  - `/assets/*` cached for 1 year with `immutable`

## Required Environment Variables

### Netlify (Build-time)

Set the following in Netlify:

- **Key**: `GEMINI_API_KEY`
- **Value**: your Gemini API key

Netlify path:

- Project: **jan-neuralnet**
- **Site configuration** -> **Environment variables**

Notes:

- The client code expects `process.env.API_KEY` at runtime.
- `vite.config.ts` maps `GEMINI_API_KEY` into the bundle via `define: { 'process.env.API_KEY': ... }`.
- Therefore, **the build must have `GEMINI_API_KEY` set**, otherwise the deployed site will have an empty key.

### Local Development

Use `.env.local` (not committed):

- `GEMINI_API_KEY=...`

A template is available at `.env.example`.

## Verification

After setting `GEMINI_API_KEY`, trigger a redeploy and verify:

- [https://jan-neuralnet.netlify.app](https://jan-neuralnet.netlify.app) loads.
- Screen share permission flow works.
- Chat works in text mode.
- Live API connection can be established (mic).
- Image/video generation endpoints function (requires valid Gemini access).

If you need authoritative build logs, use the **Deploy monitor URL** above.

## Rollback

### Netlify Rollback

- Netlify UI: **Deploys** -> select a previous successful deploy -> **Publish deploy**.

### GitHub Rollback

- Revert the last change on `main`:
  - `git revert <sha>`
  - `git push origin main`
- Netlify will redeploy from the updated `main`.

## Operational Notes / Known Limitations

- If Netlify API calls return `401` when attempting to query deploy status programmatically, use the Netlify UI links above for verification and logs.
