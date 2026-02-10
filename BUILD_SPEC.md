# Cursor Agent Build Spec — Client Experience Tracker (Supabase + Vercel)

## 0) Goal (what you are building)
Build a simple, elegant web app for a tax firm to track whether we delivered 3 time-based "client experience" milestones after a client signs on:

- **24‑Hour Experience**
- **14‑Day Experience**
- **30‑Day Experience**

Each client appears as a **row**, and each row has **three milestone cards** (24h / 14d / 30d). Each card has:
- a live countdown (days/hours/minutes/seconds)
- a status dropdown (Pending / Yes / No)
- a clean status label (Done / Done late / Failed)
- a notes icon that opens a **simple notes modal** (markdown supported, auto-save, copy)

Use **Supabase** as the database (+ optional Supabase Auth), and deploy on **Vercel** with a GitHub repo.

**Default theme = Dark mode.** Provide a theme toggle (Dark/Light), but default to Dark.

## 1) Reference layout (wireframes to match)
Follow these attached wireframes closely (do not invent a new layout):

- Main view (Option A / overview rows): `wireframe_option_A_clean_v2.png`
- Focus tabs / triage mode: `wireframe_focus_mode_clean.png`
- Notes modal (simple): `wireframe_notes_modal_simple.png`  
- Archived tab: `wireframe_archived_clean.png`

UI should be **simple + elegant**:
- clean spacing
- subtle borders
- minimal but clear color cues
- no clutter / no overlapping elements
- form and function should feel "calm and premium"

## 2) Tech stack (use this)
- **Next.js (App Router) + TypeScript**
- **Tailwind CSS**
- **shadcn/ui** components (Button, Card, Tabs, Dialog, DropdownMenu, Input, Badge, Popover, Calendar)
- **lucide-react** icons
- **next-themes** for light/dark (default: dark)
- **Supabase JS** client
- **date-fns + date-fns-tz** (timezone-safe deadlines)
- **react-markdown + remark-gfm** (markdown rendering in notes)

Avoid heavy editors unless necessary. Keep notes modal simple.

## 3) Core behaviors (must match)
### 3.1 Deadline calculations (IMPORTANT)
**Firm timezone matters.** Add a constant:
- `FIRM_TIMEZONE` from env `NEXT_PUBLIC_FIRM_TIMEZONE` (fallback `'America/New_York'`).
All due times are computed in this timezone.

**24-hour rule (special):**
- If a client signs on `11/24/2026`, the 24-hour deadline is **11:59:59 PM on 11/25/2026** (end of the next day).
- i.e. `due_24h = endOfDay(sign_on_date + 1 day)`.

For consistency:
- `due_14d = endOfDay(sign_on_date + 14 days)`
- `due_30d = endOfDay(sign_on_date + 30 days)`
where `endOfDay` means **23:59:59** in the firm timezone.

### 3.2 Status dropdown (Pending / Yes / No)
Each milestone has a dropdown:
- **Pending** (default)
- **Yes** (delivered)
- **No** (failed)

Derived display logic:
- If status = **Yes**:
  - if `completed_at <= due_at` → ✅ **Done** ("Early by X")
  - if `completed_at > due_at` → ⚠️ **Done late** ("Late by X")
- If status = **No** → ❌ **Failed**
- If status = **Pending**:
  - if `now > due_at` → ❌ **Failed (past due)** (auto-fail visually; do NOT force-write `No` to DB)
  - else → Pending

### 3.3 Countdown freeze behavior
- If status = **Yes**, the timer **freezes** and shows how early/late completion was.
- If status = Pending and not overdue, timer runs live.
- If overdue and still Pending, show "Past due by …" (and style as Failed).

### 3.4 Color logic (visual urgency)
Only apply urgency colors when the milestone is effectively **Pending** (not Yes/No).

- **24‑Hour**: turn **red** when remaining time <= **8 hours**
- **14‑Day**: turn **yellow** when remaining <= **5 days**, **red** when remaining <= **2 days**
- **30‑Day**: same as 14‑Day

Done: muted/gray  
Done late: warning/amber (subtle)  
Failed: red (persistent)

Use elegant styling: prefer **left border + soft tint** over fully saturated backgrounds.

### 3.5 Notes modal (simple like the provided example)
Modal requirements:
- Title includes both: **Client Name • Experience Type**
- Small helper text: "Click inside to edit (Markdown supported). Changes save automatically."
- Main content area:
  - markdown is supported and readable
  - editable by clicking into the content
  - auto-save (debounced) on change
  - show "Saved • just now"
- Copy icon copies the raw markdown to clipboard
- Close button

Keep it visually similar to the screenshot example:
- dark modal surface
- subtle border
- large readable content area
- scroll inside content panel

### 3.6 Inline editing
- Client **name** and **signed-on date** are editable in-place.
- Click → becomes input/date picker → blur/enter saves.
- Changes persist to Supabase immediately.

### 3.7 Focus tabs (triage mode)
Below filters, include tabs:
- Overview
- 24‑Hour Focus
- 14‑Day Focus
- 30‑Day Focus

Behavior:
- **Overview**: each row shows 3 cards (24h/14d/30d)
- **Focus**: each row shows only the focused milestone card, plus small "mini" indicators for the other 2 milestones.

In Focus mode, default sorting should be by the focused milestone due date (soonest first).

### 3.8 Filters + sorting
Filters:
- All / Pending / Done / Late / Failed
Search:
- search by client name
Sorting:
- Name A→Z
- Name Z→A
- Next 24‑Hour deadline
- Next 14‑Day deadline
- Next 30‑Day deadline

Summary boxes (24h/14d/30d) show counts for:
- Pending, Done, Late, Failed
Each count is clickable:
- Clicking a count should set:
  - Focus tab to that milestone
  - Status filter to that status

### 3.9 Pause/resume (per client row)
In each client row's `⋯` menu:
- Pause timers / Resume timers
- Archive / Unarchive

Pause behavior:
- Pausing freezes all 3 timers for that client.
- Resume extends deadlines by the paused duration.

Implementation requirement:
- Track pause start time and total paused seconds so deadlines shift correctly.

### 3.10 Archived tab
Top-level tab: Active / Archived
- Archived view lists archived clients
- Can unarchive
- Keep the same clean row layout (or a simplified row layout is acceptable)
- Archived clients do not appear in Active.

## 4) Database (Supabase) — schema + policies
### 4.1 Tables
Create 2 tables: `clients` and `client_experiences`

#### Postgres enums (recommended)
- `experience_type`: `hour24`, `day14`, `day30`
- `experience_status`: `pending`, `yes`, `no`

#### `clients`
Fields:
- `id` uuid PK default gen_random_uuid()
- `name` text NOT NULL
- `signed_on_date` date NOT NULL
- `is_archived` boolean NOT NULL default false
- `archived_at` timestamptz null
- `paused` boolean NOT NULL default false
- `pause_started_at` timestamptz null
- `paused_total_seconds` integer NOT NULL default 0
- `created_at` timestamptz NOT NULL default now()
- `updated_at` timestamptz NOT NULL default now()

#### `client_experiences`
Fields:
- `id` uuid PK default gen_random_uuid()
- `client_id` uuid NOT NULL references clients(id) on delete cascade
- `experience_type` enum NOT NULL
- `status` enum NOT NULL default 'pending'
- `completed_at` timestamptz null
- `notes` text NOT NULL default ''
- `created_at` timestamptz NOT NULL default now()
- `updated_at` timestamptz NOT NULL default now()

Constraints:
- unique `(client_id, experience_type)`

### 4.2 SQL (copy into Supabase SQL editor)
```sql
-- Enable UUID generation
create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type experience_type as enum ('hour24', 'day14', 'day30');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_status as enum ('pending', 'yes', 'no');
exception when duplicate_object then null; end $$;

-- Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  signed_on_date date not null,
  is_archived boolean not null default false,
  archived_at timestamptz,
  paused boolean not null default false,
  pause_started_at timestamptz,
  paused_total_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Experiences
create table if not exists public.client_experiences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  experience_type experience_type not null,
  status experience_status not null default 'pending',
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, experience_type)
);

-- Updated-at trigger function
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists trg_experiences_updated_at on public.client_experiences;
create trigger trg_experiences_updated_at
before update on public.client_experiences
for each row execute function public.set_updated_at();
```
