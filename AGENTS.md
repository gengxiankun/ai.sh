# AGENTS.md

## Commands
- `npm run dev` — start dev server (Vite HMR)
- `npm run build` — typecheck (`tsc -b`) then `vite build`
- `npm run lint` — oxlint (no step needed before build; `tsc` handles types separately)
- `npm run preview` — preview production build locally
- `npm run setup` — interactive init script (generates `.env` from prompts)

No tests, no formatter, no CI workflows exist (except `.github/workflows/setup.yml` for template init).

## Stack
- React 19 + TypeScript 6.0 + Vite 8
- Tailwind CSS v4 via `@tailwindcss/vite` plugin (configured in `vite.config.ts`, not PostCSS)
- Linter: oxlint (`.oxlintrc.json`), not ESLint
- Backend: Supabase (auth, Postgres + pgvector, RLS, Edge Functions)
- AI proxy: Supabase Edge Function (`supabase/functions/chat/index.ts`) — deployed via `supabase functions deploy chat`

## Deployment
- **Frontend** — Vite SPA, served as static files (`index.html`, `dist/`). Auto-deployed to GitHub Pages via `.github/workflows/deploy.yml` on push to main. Requires GitHub Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Edge Function** — `supabase/functions/chat/index.ts` → Supabase Edge Function. Deployed via `supabase functions deploy chat`. Proxies DeepSeek chat, Jina embeddings/scraping. API keys stored as Supabase secrets (`supabase secrets set DEEPSEEK_API_KEY=xxx JINA_API_KEY=xxx`)
- The edge function URL is derived from `VITE_SUPABASE_URL`: `${VITE_SUPABASE_URL}/functions/v1/chat`

## Project init
- `.github/workflows/setup.yml` — `workflow_dispatch` action for fork/template users to init config via GitHub UI
- `npm run setup` — local interactive init script (prompts for Supabase URL/key, writes `.env`)
- After init: `npm install` (installs `supabase` CLI as devDep), then:
  1. `npx supabase login` + `npx supabase link --project-ref <ref>` (link to Supabase project)
  2. Run `supabase-schema.sql` in Supabase SQL Editor
  3. `npx supabase secrets set DEEPSEEK_API_KEY=xxx JINA_API_KEY=xxx`
  4. `npx supabase functions deploy chat`
  5. `npm run dev`

## Architecture
- Single-page personal site with terminal-style UI
- Entrypoint: `src/main.tsx` → `src/App.tsx`
- `App.tsx` is the orchestration layer — command routing, auth, modals, AI chat
- Global styles + design tokens in `src/index.css` (CSS custom properties for light/dark theme)
- Component-scoped styles in `src/App.css`
- `src/lib/` — API wrappers (`supabase.ts`, `chat.ts`, `rag.ts`, `api.ts`)
- `src/lib/skills/` — Skill system loader + JS script runner
- `src/store/commands.ts` — fallback tool definitions (mostly empty; skills handle tools now)
- `src/components/` — UI components (`Terminal`, `Welcome`, modals)

## Skills system
- Skills live in `public/skills/<id>/` as static files: `SKILL.md` (front-matter + prompt) + `scripts/manifest.json` + `scripts/*.js`
- Skills are loaded at runtime via fetch, not bundled
- Public skills: `qa`, `job-matcher`, `scraper`
- Admin-only skill: `admin` (loaded only when logged in as admin)
- Skill scripts run in-browser via `new Function()` sandbox in `src/lib/skills/runner.ts`

## Env vars
- `.env` — frontend Vite env vars (`VITE_*`). Contains Supabase URL + anon key.
- Edge Function secrets — set via `supabase secrets set`. Contains `DEEPSEEK_API_KEY` and `JINA_API_KEY`.

## Tailwind v4 quirks
- No `tailwind.config.js` — config is done via CSS `@import "tailwindcss"` and `@theme` blocks
- Uses `@plugin "@tailwindcss/typography"` syntax (not JS config)
- The `@tailwindcss/vite` plugin handles extraction automatically; no `content` globs needed

## TypeScript
- `tsconfig.json` uses project references: `tsconfig.app.json` (src/) + `tsconfig.node.json` (vite.config.ts only)
- Strict flags: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`

## Conventions
- Chinese-language UI and inline comments throughout
- Admin role gated by email (checked via Supabase RLS and client-side `isAdmin` flag)
- All Supabase data access uses direct REST calls (not the JS client for queries), with auth token extracted from localStorage
