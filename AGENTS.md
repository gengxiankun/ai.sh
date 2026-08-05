# AGENTS.md

## Commands
- `npm run dev` — start dev server (Vite HMR)
- `npm run build` — `tsc -b && vite build` (typecheck + build)
- `npm run lint` — oxlint only (`.oxlintrc.json`); no typecheck, so `lint` is not a prerequisite for `build`
- `npm run preview` — preview production build locally
- `npm run setup` — interactive init: Supabase login/project, writes `.env`, generates migration SQL, sets secrets, deploys edge function, installs skill plugins
- `npm run plugin-skill` — interactive skill plugin manager (install/update/uninstall from remote registry, sets `SKILL_*` secrets)

No tests, no formatter.

## CI
- `.github/workflows/deploy.yml` — GitHub Pages deploy on push to `main`/`master`. Node 24. Build step is `npx vite build --base="/${{ github.event.repository.name }}/"` (NOT `npm run build` — the `--base` path differs and `tsc -b` is skipped).
- Required GitHub Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`.
- No `setup.yml` workflow exists.

## Stack
- React 19 + TypeScript 6 + Vite 8, Tailwind CSS v4 via `@tailwindcss/vite` plugin (config in `vite.config.ts` + CSS, no `tailwind.config.js`, no PostCSS)
- Linter: oxlint, not ESLint
- Backend: Supabase (auth, Postgres + pgvector, RLS, Edge Functions)
- Deploys to GitHub Pages (a static site); all "backend" work happens through Supabase REST + one Edge Function

## Architecture
- Single-page personal site, terminal-style UI, Chinese UI + Chinese comments (`lang="zh-CN"`)
- Entrypoint: `src/main.tsx` → `src/App.tsx` — orchestration layer holding command routing, auth, modals, AI chat
- `src/lib/` — API wrappers:
  - `supabase.ts` — Supabase JS client singleton (auth ops only)
  - `api.ts` — `getAuthToken()` (localStorage → `access_token`, falls back to anon key) + `fetchREST()`
  - `chat.ts` — agent loop (skill routing → tool calls → streaming)
  - `rag.ts` — embeddings + vector search (`search_rag_docs` RPC) + document CRUD
  - `chunk.ts` — recursive text chunking (paragraph → sentence → char, 1024/128 overlap)
  - `tasks.ts` — tasks table CRUD + recurrence
  - `invite.ts` — invite codes + `consume_invite` RPC
  - `skills/` — skill loader (`index.ts`) + JS runner sandbox (`runner.ts`)
- `src/store/api.ts` — site data fetchers: about, posts, categories, tags (posts replaced the old news feature)
- `src/store/commands.ts` — fallback tool definitions (currently empty; skills provide all tools)
- `src/components/` — Terminal, Welcome, InputBox, History, CommandDropdown, ActionButton, StatusBar, SkillIcon, modals/ (PostForm, KBForm, InviteForm, TaskForm, AboutEdit, SkillsList, ...)
- `src/hooks/` — `useAuth.ts`
- Design tokens + global styles in `src/index.css`; component-scoped styles in `src/App.css`

## Command routing (critical behavior)
- Input starting with `/` is a terminal command; anything else goes to AI chat.
- Slash commands are handled in `src/App.tsx` `runCommand` + the `COMMANDS` record — ALL routing lives in App.tsx. Do not split it out without understanding the ref-sync pattern used by keyboard handlers.
- Current commands (autocomplete source of truth is `ALL_COMMANDS` in App.tsx):
  - `/login <email>` / `/register <email>` — password entered interactively afterward
  - `/logout`
  - `/posts` (list), `/posts add` (admin), `/posts delete <title>` (admin)
  - `/knowledge-base` (list), `/knowledge-base upload` (admin), `/knowledge-base search <query>`
  - `/invite-code` (list, admin), `/invite-code add` (admin), `/invite-code verify`
  - `/tasks` (list), `/tasks add`, `/tasks edit <id>`, `/tasks delete <id>`, `/tasks history <title>`
  - Anything else → `command not found: /<name>`
- `about` / `skills` / `contact` are NOT slash commands — they are surfaced via AI chat and UI buttons.
- Non-admin users on AI chat consume invite-code tokens (unless `invite_token` present, chat is blocked).

## AI chat loop
- Two-stage progressive disclosure in `chat.ts`: (1) a router LLM call picks the best skill by name/description; (2) only the matched skill's full prompt + tool definitions are sent. `MAX_ROUNDS = 5`, context trimmed to `MAX_CONTEXT_TOKENS = 6000` (~3 chars/token).
- Tool calls execute in-browser via `new Function()` sandbox; results stream back as SSE (`data:` lines, `[DONE]` terminator).

## Skills system
- Plugins installed under `public/skills/<id>/` — `SKILL.md` (YAML front-matter: name/description/triggers/secrets) + `scripts/manifest.json` + `scripts/*.js`. Loaded at runtime via fetch, not bundled.
- `public/skills/registry.json` is the local installed-skill manifest (icon/version/source/admin flags). The loader `src/lib/skills/index.ts` iterates this registry, so a skill dir without a registry entry is invisible.
- Remote plugin registry: `https://raw.githubusercontent.com/gengxiankun/plugins.ai.sh/main/index.json`; `npm run plugin-skill` syncs to it.
- Public skills: `general` (knowledge-base search + login/register), `scraper` (URL fetch), `tavily-search` (web search, needs `SKILL_TAVILY_SEARCH_AUTHORIZATION` secret). Admin-only: `admin` (site CRUD, loaded only when `isAdmin`), `task-manager` (tasks CRUD + complete, loaded only when `isAdmin`).
- Skill scripts export `execute(args, context)` and are executed by `src/lib/skills/runner.ts` (`new Function()`). External API calls from scripts should go through the Edge Function `proxy` mode, which replaces `__SECRET__` header values with `SKILL_<id>_<key>` secrets.

## Edge Function (`supabase/functions/chat/index.ts`)
- Multi-purpose proxy, mode-switched by request body fields:
  - chat completions (`messages`/`tools`/`stream`), uses `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`
  - Jina embeddings v3 (single `embedding` / batch `embedding_batch`, 1024-dim)
  - web scraping (`scrape` + `url`): WeChat special-case (UA + regex parsing) or Jina Reader
  - PDF text extraction (`parse_pdf` + base64 `pdf_data`)
  - generic fetch proxy (`proxy` + `proxy_url` + `proxy_headers`) for skill external calls
  - GET returns `{ provider, model }` (shown in the UI status bar)
- Deployed via `npx supabase functions deploy chat`
- Secrets (via `npx supabase secrets set`): `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER`, `LLM_MAX_TOKENS`, `JINA_API_KEY`, and `SKILL_<id>_<key>` per skill. Legacy `DEEPSEEK_API_KEY` is a fallback when `LLM_API_KEY` is unset.
- Edge function URL is `${VITE_SUPABASE_URL}/functions/v1/chat`

## Supabase data access
- Auth ops use the Supabase JS client (`getSupabase().auth.signInWithPassword/signUp`); logout hits `/auth/v1/logout` REST directly.
- All data reads/writes use direct REST to `${VITE_SUPABASE_URL}/rest/v1/...` with `apikey` + `Authorization: Bearer <token>` (token from `getAuthToken()`; anon key used for public reads). Never switch to the JS client for data.
- Tables: `chat_messages`, `invite_codes`, `site_categories`, `site_tags`, `site_posts`, `site_post_tags`, `rag_documents`, `rag_chunks`, `tasks`
- RPCs: `search_rag_docs` (vector search), `consume_invite` (atomic token consumption)
- Admin is gated by `user.email === VITE_ADMIN_EMAIL` client-side AND by RLS policies server-side.

## Migrations
- `supabase/migrations/20250706000002_init.sql.template` is the base schema; `npm run setup` copies it to `20250706000002_init.sql` and replaces the `'ADMIN_EMAIL'` placeholder with the configured admin email. `*_init.sql` is gitignored — never edit the generated file, edit the `.template`.
- RLS admin policies compare `auth.email() = 'ADMIN_EMAIL'` — the placeholder must be replaced before `supabase db push`. Newer migrations (e.g. `20260803105750_tasks.sql`) hardcode the admin email directly; keep this in mind when adding tables/policies.

## Env vars
- `.env` (gitignored, Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`
- Edge Function secrets are separate from `.env` — set via `supabase secrets set` (not `.env`).

## TypeScript
- `tsconfig.json` uses project references: `tsconfig.app.json` (`src/`) + `tsconfig.node.json` (`vite.config.ts`, `scripts/*.ts`)
- Strict flags: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no enums/namespaces), `verbatimModuleSyntax` (type-only imports must use `import type`)

## Conventions
- Chinese-language UI and inline comments throughout
- `eslint-disable` comment in `App.tsx` keyboard `useEffect` is intentional (empty deps + ref sync pattern)
- State is synced to refs (`useRef`) for stable event handler closures — a deliberate pattern; do not refactor without understanding why
- `chat_messages` are persisted for logged-in users on every user/assistant message

## Project init flow
1. `npm run setup` (login → select/create project → admin email → LLM provider + Jina keys → writes `.env` → runs migration → sets secrets → deploys edge function → installs skills)
2. If setup skipped: `npx supabase link --project-ref <ref>`, then run the migration from `20250706000002_init.sql.template` (replace `'ADMIN_EMAIL'` first), then `npx supabase db push --yes`
3. `npx supabase secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=... JINA_API_KEY=...`
4. `npx supabase functions deploy chat`
5. `npm run dev`
