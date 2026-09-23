# Luca — inspect mirror (TEMPORARY)
Public, temporary copy of the Luca AI codebase for agent inspection. Will be deleted on request.

## Layout
- `backend/` — Node/Express API (`server.js`): routing, provider failover, tool calling (web_search, run_code, fetch_page), MCP client, identity guard, admin APIs. Run: `npm install && node server.js` (needs provider keys in `.env`, see `backend/env.example`).
- `frontend/` — React + Vite chat UI (`src/`). Run: `npm install && npm run dev`. Deploys to GitHub Pages from built output.

## Notes for reviewers
- Secrets redacted: provider keys in `backend/server.js` are env-only here (`MCP_SERVERS`, `*_KEY` via `.env`).
- No user data, no `.env`, no build output included.
