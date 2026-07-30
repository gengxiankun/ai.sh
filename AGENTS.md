# AGENTS.md

## Commands
- `npm run dev` — start dev server (Vite HMR)
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — oxlint (`.oxlintrc.json`); `tsc` handles types separately, so `lint` is not a prerequisite for `build`
- `npm run preview` — preview production build locally
- `npm run setup` — interactive init script (prompts for Supabase project, LLM provider, keys; generates `.env`)

No tests, no formatter.

## CI
- `.github/workflows/deploy.yml` — deploys to GitHub Pages on push to `main`/`master`. Uses Node 24. Build step: `npx vite build --base="/${{ github.event.repository.name }}/"` (NOT `npm run build` — base path differs).
- Required GitHub Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`.
- No `setup.yml` workflow exists in this repo.

## Stack
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS v4 via `@tailwindcss/vite` plugin (config in `vite.config.ts` and `src/index.css`, not PostCSS)
- Linter: oxlint (`.oxlintrc.json`), not ESLint
- Backend: Supabase (auth, Postgres + pgvector, RLS, Edge Functions)

## Architecture
- Single-page personal site with terminal-style UI (`lang="zh-CN"`)
- Entrypoint: `src/main.tsx` → `src/App.tsx` (orchestration layer — command routing, auth, modals, AI chat)
- `src/lib/` — API wrappers: `supabase.ts` (client singleton), `chat.ts` (agent loop + streaming), `rag.ts` (embedding + vector search), `api.ts` (REST helpers + auth token extraction)
- `src/lib/skills/` — Skill loader (`index.ts`) + JS runner sandbox (`runner.ts`)
- `src/store/commands.ts` — fallback tool definitions (currently empty; skills provide all tools)
- `src/store/api.ts` — site data fetchers (about, projects, news, contact from Supabase REST)
- `src/components/` — UI: `Terminal`, `Welcome`, `InputBox`, `History`, `Suggestions`, `CommandDropdown`, modals/
- `src/hooks/` — `useAuth.ts`, `useSuggestions.ts`
- Global styles + design tokens in `src/index.css`; component-scoped styles in `src/App.css`

## Command / chat routing (critical behavior)
- Input starting with `/` is treated as a terminal command.
- Non-prefixed input is sent as AI chat via the agent loop.
- Commands: `/about`, `/projects`, `/news`, `/contact`, `/login`, `/register`, `/whoami`, `/logout`, `/clear`, `/skills`, `/knowledge-base`, `/update-log`
- `App.tsx` contains ALL command routing logic — do not split it out without understanding the ref-sync pattern used for keyboard handlers.

## Env vars
- `.env` — frontend Vite env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`
- Edge Function secrets (set via `supabase secrets set`): `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `JINA_API_KEY` (older `DEEPSEEK_API_KEY` is a fallback only)
- The edge function URL is `${VITE_SUPABASE_URL}/functions/v1/chat`

## Edge Function (`supabase/functions/chat/index.ts`)
- Multi-purpose proxy: chat completions, Jina embeddings (v3), web scraping (Jina Reader + WeChat special-case), PDF text extraction
- Deployed via `npx supabase functions deploy chat`
- Legacy `DEEPSEEK_API_KEY` env var is used as fallback when `LLM_API_KEY` is not set

## Supabase data access
- Auth operations use the Supabase JS client (`getSupabase().auth.signInWithPassword/signUp`)
- All data reads/writes use direct REST calls to `${VITE_SUPABASE_URL}/rest/v1/...` with auth token from localStorage
- Auth token extraction: `localStorage.getItem('sb-<project-ref>-auth-token')` → parse → `access_token`
- Admin role is gated by comparing `user.email` against `VITE_ADMIN_EMAIL` (client-side) and via Supabase RLS policies (server-side)

## Skills system
- Skills live in `public/skills/<id>/` as static files: `SKILL.md` (YAML front-matter + Markdown prompt) + `scripts/manifest.json` + `scripts/*.js`
- Loaded at runtime via fetch, not bundled
- Public skills: `general`, `scraper`
- Admin-only skill: `admin` (loaded only when `isAdmin` is true)
- Skill scripts execute in-browser via `new Function()` sandbox in `src/lib/skills/runner.ts`
- Skills define which LLM tools are available during AI chat

## Tailwind v4 quirks
- No `tailwind.config.js` — config via CSS `@import "tailwindcss"` and `@theme` blocks
- Uses `@plugin "@tailwindcss/typography"` (CSS syntax, not JS config)
- `@tailwindcss/vite` plugin handles extraction; no `content` globs

## TypeScript
- `tsconfig.json` uses project references: `tsconfig.app.json` (`src/`) + `tsconfig.node.json` (`vite.config.ts`, `scripts/setup.ts`)
- Strict flags: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`

## Conventions
- Chinese-language UI and inline comments throughout
- `eslint-disable` comment in `App.tsx` keyboard `useEffect` is intentional (empty deps + ref sync pattern)
- State is synced to refs (`useRef`) for stable event handler closures — a deliberate pattern; do not refactor without understanding why

## Project init flow
1. `npm run setup` (interactive: login, select/create Supabase project, choose LLM provider, set keys, writes `.env`, generates migration SQL, deploys edge function)
2. If setup skipped: manually run `npx supabase link --project-ref <ref>`, then run the migration from `supabase/migrations/20250706000002_init.sql.template` (replace `'ADMIN_EMAIL'` placeholder first)
3. `npx supabase secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=... JINA_API_KEY=...`
4. `npx supabase functions deploy chat`
5. `npm run dev`
