# Local setup (macOS)

Portable steps for Intel and Apple Silicon Macs. Homebrew installs to `/opt/homebrew` on Apple Silicon and `/usr/local` on Intel; you do not need Rosetta for this project.

## Prerequisites

- macOS with **Git** and **Node.js** (see [Brewfile](../Brewfile) or install from [nodejs.org](https://nodejs.org/)).
- **Xcode Command Line Tools** if you need a compiler for native npm deps: `xcode-select --install`
- **Homebrew** (optional but recommended): [https://brew.sh/](https://brew.sh/)
- A **Supabase** project: URL and anon key from the Supabase dashboard.

## First-time bootstrap

From the repository root:

```bash
brew bundle          # optional: installs git + node from Brewfile
./bin/bootstrap-mac    # npm ci; creates .env.local from .env.example if missing
```

Edit `.env.local` with your real `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `APP_PASSWORD`. See [.env.example](../.env.example) for all variables.

## Run the app

```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) (port is set in `package.json`).

## Sanity check

```bash
bin/smoke-test
```

Runs `npm run lint` and `npm run build`. Requires `node_modules` (from bootstrap or `npm ci`).

## Optional: database migrations

- **In-app / API**: `DATABASE_URL` in `.env.local` supports `/api/migrate` (see [DEVELOPER.md](../DEVELOPER.md)).
- **CLI helper**: `DB_PASSWORD=... node scripts/apply-migration.mjs` — that script targets a specific Supabase project ref baked into the file; for other projects use the dashboard or `DATABASE_URL` flows documented in DEVELOPER.md.

## Local-only directories

Machine-specific or throwaway data can live under (all git-ignored at repo root):

| Path | Use |
|------|-----|
| `.local/` | Per-machine notes, extra env files, tool caches |
| `tmp/` | Short-lived exports or scratch files |
| `var/` | Local logs or PID files if you add tooling |
| `data-local/` | Optional local DB files or dumps |

Use **`.git/info/exclude`** for paths only you need ignored (not shared with the team).

## More context

Product architecture, schema, and features: [DEVELOPER.md](../DEVELOPER.md).
