# Luca AI — frontend source (v2)

React 18 + Vite 6 + TypeScript + strict `tsc`, ESLint, vitest. Single-page app
with hash routes (`#/` home, `#/chat`, `#/about`) — one `index.html`,
no server rewrites needed. This repo is the source of truth.

## Layout

- `src/main.tsx` — single root, `HashRouter` + CSS route fade.
- `src/App.tsx` — all state: sessions, settings, tier, profile, auth, streaming, panels. Backend calls go through `src/lib/api.ts` named functions.
- `src/components/` — `Sidebar`, `ChatArea` (memoised thread, throttled streaming text, virtualised long threads, thinking indicator, citations, sources, follow-up chips), `Composer` (tall-mode input, attachments, voice), `Markdown` (sanitised react-markdown pipeline: GFM, KaTeX, shiki code, SVG charts, mermaid — all lazy), `Panels` (Settings/Profile/Admin behind Radix focus-trapped dialogs), `Auth` (split-screen sign in/up/verify/forgot/reset + owned SVG brand visual), `Logo` (brand spark, CSS twinkle).
- `src/lib/store.ts` — types + storage: small prefs in localStorage (`luca-*`), sessions + artifacts in IndexedDB.
- `src/index.css` — three-tier tokens (primitives → theme → components), dark luxe + light theme.
- `public/404.html` — bounces legacy `chat.html`/`about.html` URLs back to the app.

## Backend contract

`POST /api/chat` with `{ modelTier, messages, stream, tools, userSettings }` returns spec SSE (`content`, `reasoning`, `stage`+`label`, `sources`, `searchInfo`, `tool_calls`, `meta`, `[DONE]`). Auth is Bearer JWT (`luca-auth-token`). Per-account sync via `GET/POST /api/user/data`. Follow-ups via `POST /api/followups`, naming via `POST /api/name-chat` (both require auth). Security notes in `docs/SECURITY.md`.

## Scripts

`npm run dev` · `npm run build` (typecheck + bundle) · `npm run typecheck` · `npm run lint` · `npm test` (vitest). CI runs all four on push/PR.

## Build / deploy

`npm run build` → `dist/` (copied to the `luca-ai-web` GitHub Pages repo + Vercel — those hold build output only).
