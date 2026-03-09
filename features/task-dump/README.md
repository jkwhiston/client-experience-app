# C-Street Dump

`C-Street Dump` is a deliberately isolated mini-app that lives inside this repository for convenience, but should be treated as separate from the Client Experience Tracker domain.

## What It Is

- A fast task dump board with kanban columns: `Pending`, `In Progress`, `Done`
- A separate `Thoughts` area for miscellaneous notes that may not belong to any task
- Rich markdown-friendly editing with focus-only inline formatting controls in modal editors
- Task attachments, thought attachments, and per-task workspace blocks

## Where It Lives

- Route: `app/c-street-dump`
- Main UI: `features/task-dump/task-dump-app.tsx`
- Editor helpers: `features/task-dump/markdown-composer.tsx`
- Markdown utilities: `features/task-dump/markdown-utils.ts`
- Client-side data layer: `lib/task-dump-queries.ts`
- Shared types/constants: `lib/task-dump-types.ts`
- API entry point: `app/api/task-dump/route.ts`
- Migration: `supabase/migrations/20260306_create_c_street_dump.sql`

## Separation Rules

- Do not add task-dump state or task-dump queries to `components/client-dashboard.tsx`, `lib/queries.ts`, or `lib/types.ts`.
- Prefer adding new code under `features/task-dump/*` or `lib/task-dump-*` instead of reusing tracker-specific modules.
- Keep shared touchpoints minimal:
  - existing app password middleware
  - root layout/theme/toaster providers
  - header kebab link in `components/dashboard-header.tsx`
- If this feature is ever extracted into another app, the goal is that the task-dump files can move with only shallow edits to routing and environment setup.

## Operational Notes

- The task-dump API uses the existing server-side Supabase client against isolated `public` tables with a `task_dump_` prefix.
- Attachments use the `c-street-dump` Supabase Storage bucket created by the migration.
- If the database migration has not been applied yet, the route will fail until the `task_dump_*` tables and storage policies exist.
- Modal editors (`task.body`, workspace block content, and thought content) use `MarkdownComposer` with `toolbarVariant=\"focus-inline\"`.
- `MarkdownComposer` stores markdown but renders rich text while editing; pasted markdown is parsed into formatted content.
- Autosave uses debounced queueing plus version checks to ignore stale save responses and reduce text-jump regressions during editing.
- Task/thought autosave intentionally defers persistence when both title and body/content are blank, so users can clear and rewrite text without immediate validation errors.
