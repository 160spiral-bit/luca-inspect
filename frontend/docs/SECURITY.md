# Luca frontend — security notes

## Auth token storage (accepted risk, tracked)

`luca-auth-token` is a JWT held in `localStorage` (`src/lib/store.ts`).

This is readable by any script running on the origin, so it relies entirely on
the renderer never executing attacker-controlled markup (see "Markdown
pipeline" below). The correct fix is backend work:

- Issue the session as an `httpOnly; Secure; SameSite=Lax` cookie on login /
  OAuth callback instead of returning the raw token to JavaScript.
- Keep only non-sensitive user metadata (`id`, `name`, `username`, badges) in
  client state.
- Add a `POST /api/auth/logout` that clears the cookie server-side.

Until that ships, treat every `dangerouslySetInnerHTML` and every `srcDoc`
surface as a session-theft primitive and review accordingly.

## Markdown pipeline

As of Phase 1, model output renders through `react-markdown` +
`rehype-sanitize` with a tight schema (`src/components/Markdown.tsx`):
protocol-locked `href`/`src`, no event-handler attributes, KaTeX output only.
Citation links are emitted as real markdown links so the sanitiser — not string
interpolation — owns escaping.

`viz:svg` blocks go through DOMPurify with the SVG profile. Nothing else in the
app may call `dangerouslySetInnerHTML` with model-controlled input.

## Backend checklist (verified against server.js, 2026-09-19)

- `/api/test` — admin-only (`authMiddleware` + `requireAdmin`).
- `/api/name-chat`, `/api/followups` — require auth; clients send Bearer.
  Guests degrade gracefully (local titles, no chips).
- CORS locked to Pages / Vercel / localhost origins (no `*` with credentials).
- `POST /api/user/data` rejects payloads over 2 MB with 413.
- Still open: per-route rate limits on auth endpoints, JWT → cookie
  migration, CSP headers, secrets rotation (provider keys are committed in the
  private backend repo — move to env).
