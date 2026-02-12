# Developer Documentation — Client Experience Tracking App

> Last updated: February 10, 2026

## Overview

A Next.js web app for tracking three time-based client milestones: **24-Hour**, **14-Day**, and **30-Day** experiences. Each client has deadlines calculated from their signed-on date. The UI shows a horizontal timeline stepper per client with live countdowns, status indicators, and interactive modals for managing status and notes.

---

## Tech Stack

| Layer       | Technology                                       |
|-------------|--------------------------------------------------|
| Framework   | Next.js 16 (App Router, Turbopack)               |
| Language    | TypeScript 5                                     |
| Styling     | Tailwind CSS 4, tw-animate-css                   |
| Components  | shadcn/ui (Radix UI primitives)                  |
| Backend/DB  | Supabase (PostgreSQL, auth, SSR client)          |
| Date/Time   | date-fns, date-fns-tz                            |
| Markdown    | react-markdown, remark-gfm                       |
| Icons       | lucide-react                                     |
| Theming     | next-themes (dark/light)                         |

---

## Directory Structure

```
├── app/
│   ├── api/auth/route.ts        # POST login / DELETE logout
│   ├── globals.css              # Tailwind + CSS theme variables
│   ├── layout.tsx               # Root layout (ThemeProvider, fonts)
│   ├── login/page.tsx           # Password auth page
│   └── page.tsx                 # Home — renders ClientDashboard
├── components/
│   ├── add-client-dialog.tsx    # Dialog to add a new client
│   ├── client-dashboard.tsx     # Top-level dashboard (state, filters, sorting, focus tabs)
│   ├── client-list.tsx          # Renders list of ClientRow components
│   ├── client-row.tsx           # Single client row: info + timeline stepper
│   ├── controls-bar.tsx         # Search, filters, sort dropdown, add/export
│   ├── dashboard-header.tsx     # Header: title, Active/Archived tabs, theme toggle, sign out
│   ├── experience-detail-modal.tsx  # Detail modal: countdown hero, editable sign-on date, status dropdown
│   ├── focus-tabs.tsx           # Focus tabs (Overview, 24-Hour, 14-Day, 30-Day)
│   ├── notes-modal.tsx          # Markdown notes editor with auto-save
│   ├── summary-row.tsx          # Summary cards showing counts per experience type
│   ├── theme-provider.tsx       # next-themes wrapper
│   ├── theme-toggle.tsx         # Dark/light toggle button
│   ├── timeline-node.tsx        # Timeline node: circle + countdown + hover actions
│   └── ui/                      # shadcn/ui primitives (badge, button, calendar, card,
│                                #   dialog, dropdown-menu, input, label, popover,
│                                #   select, tabs, textarea, tooltip)
├── lib/
│   ├── deadlines.ts             # All deadline math, formatting, status derivation
│   ├── queries.ts               # Supabase CRUD (fetchClients, createClient, updateClient, updateExperience)
│   ├── types.ts                 # TypeScript types & constants
│   ├── utils.ts                 # cn() utility (clsx + tailwind-merge)
│   └── supabase/
│       ├── client.ts            # Browser Supabase client
│       ├── middleware.ts        # Session refresh middleware
│       └── server.ts            # Server Supabase client
├── middleware.ts                # Next.js middleware (Supabase session)
├── BUILD_SPEC.md                # Original build specification
├── REDISGN_SPEC.md              # Timeline redesign specification
└── package.json
```

---

## Data Model

### Database Tables (Supabase/PostgreSQL)

**`clients`**
| Column               | Type        | Notes                          |
|----------------------|-------------|--------------------------------|
| id                   | uuid (PK)   | Default gen_random_uuid()      |
| name                 | text         |                                |
| signed_on_date       | date         | YYYY-MM-DD                     |
| is_archived          | boolean      | Default false                  |
| archived_at          | timestamptz  | Nullable                       |
| paused               | boolean      | Default false                  |
| pause_started_at     | timestamptz  | Nullable                       |
| paused_total_seconds | int          | Default 0                      |
| created_at           | timestamptz  |                                |
| updated_at           | timestamptz  |                                |

**`client_experiences`**
| Column           | Type                          | Notes                          |
|------------------|-------------------------------|--------------------------------|
| id               | uuid (PK)                     |                                |
| client_id        | uuid (FK -> clients)          |                                |
| experience_type  | 'hour24' \| 'day14' \| 'day30' |                               |
| status           | 'pending' \| 'yes' \| 'no'   | DB-level status                |
| completed_at     | timestamptz                   | Nullable; set on completion    |
| notes            | text                          | Markdown content               |
| created_at       | timestamptz                   |                                |
| updated_at       | timestamptz                   |                                |

### TypeScript Types (`lib/types.ts`)

```typescript
type ExperienceType = 'hour24' | 'day14' | 'day30'
type ExperienceStatus = 'pending' | 'yes' | 'no'        // DB values
type DerivedStatus = 'pending' | 'done' | 'done_late' | 'failed'  // Display values

interface ClientWithExperiences extends Client {
  client_experiences: ClientExperience[]
}
```

### Status Derivation Logic (`getDerivedStatus` in `lib/deadlines.ts`)

The DB stores simple status values. The UI derives display status:

| DB status | completed_at | now vs dueAt   | Derived Status |
|-----------|-------------|-----------------|----------------|
| pending   | null        | now < dueAt     | `pending`      |
| pending   | null        | now >= dueAt    | `failed`       |
| yes       | <= dueAt    | —               | `done`         |
| yes       | > dueAt     | —               | `done_late`    |
| no        | null        | —               | `failed`       |

---

## Core Architecture

### Deadline Calculations (`lib/deadlines.ts`)

All deadline logic is centralized here. Key concepts:

- **Firm Timezone**: All calculations use a configured timezone constant (`America/Chicago`).
- **`getDueAt(signedOnDate, expType)`**: Returns the raw deadline Date for a given experience type.
- **`getDueAtEffective(dueAt, pausedTotalSeconds)`**: Adjusts the deadline forward by the total paused seconds.
- **`getNowEffective(client, now)`**: If the client is paused, freezes "now" at the pause start time.
- **`getActiveStage(client, now)`**: Returns the first experience type that is `pending` or `failed` (the current active milestone).

#### Formatting Functions

| Function                    | Returns                     | Used For                        |
|-----------------------------|-----------------------------|---------------------------------|
| `formatDuration(secs)`      | `"2d 5h 30m"`              | General duration display        |
| `formatDurationCompact(secs)` | `"2d 5h"` or `"30m"`     | Small circle countdown (future) |
| `formatDurationWithSeconds(secs)` | `{ line1, line2 }`  | Active node two-line timer      |
| `formatLateCompactTwoLine(secs)` | `{ line1, line2 }`   | Late node two-line timer        |
| `formatCompletedShort(at)`  | `"Completed Feb 9"`        | Below done circles              |
| `formatDueShort(due, time?)` | `"Feb 16"` / `"Feb 3, 11:59 PM"` | Due date labels        |
| `formatDueTimeFull(due)`    | Full date/time string       | Detail modal deadline display   |

### Component Hierarchy

```
app/page.tsx
  └── ClientDashboard
        ├── DashboardHeader (Active/Archived tabs, theme toggle, sign out)
        ├── ControlsBar (search, filters, sort, add client)
        ├── SummaryRow (aggregate counts)
        ├── FocusTabs (Overview / 24-Hour / 14-Day / 30-Day)
        └── ClientList
              └── ClientRow (one per client)
                    ├── [Client info: name, date, pause/archive controls]
                    ├── [Timeline track: dotted bg line + colored progress overlay]
                    └── TimelineNode × 3 (one per experience type)
                          ├── [Circle with status indicator]
                          ├── [Hover actions: Notes icon, Mark done]
                          ├── NotesModal (opened via Notes icon)
                          └── ExperienceDetailModal (opened via circle click)
```

### Timeline Visualization (`client-row.tsx` + `timeline-node.tsx`)

The timeline is a horizontal stepper with three nodes connected by a track:

- **Track**: Two overlapping divs — a dotted gray background line and a solid colored overlay. The overlay uses a CSS `linear-gradient` computed by `getTrackGradient()` based on each segment's derived status:
  - Green = done (on time)
  - Amber = done_late
  - Red = failed
  - Transparent = pending/future

- **Node Types** (in `timeline-node.tsx`):
  - **Active/Late** (110px circle): Live two-line countdown with seconds, due date inside, blue glow (pending) or red glow (failed/late) with intensifying hover effect.
  - **Done** (44px circle): Green checkmark (on-time) or amber checkmark (done late), "Completed [date]" below.
  - **Future** (44px circle): Compact countdown inside, gray border, "Due: [date]" below.
  - All circle backgrounds use opaque `bg-card` (not semi-transparent tints) so the track line does not show through. Borders are fully opaque as well.

### Modal System

There are two modals per timeline node, triggered differently:

#### 1. Experience Detail Modal (`experience-detail-modal.tsx`)

**Trigger**: Clicking the timeline circle.

**Contents**:
- Header: `{Client Name} • {Experience Type}` with Notes icon and close button (`showCloseButton={false}` on DialogContent since it has a custom close button)
- **Countdown Hero**: Large `text-2xl font-mono font-bold` countdown with status-colored text, icon, colored left border (`border-l-4`), and tinted background. This is the dominant visual element.
- **Metadata Grid**: Two-column grid with uppercase labels (`text-[10px] font-semibold uppercase tracking-wider`):
  - **Signed On**: Clickable date that opens a `Popover` with `Calendar` component for inline editing. Muted text (`text-muted-foreground`). On selection, updates via `updateClientLocal` + `updateClient`.
  - **Deadline**: Semibold text (`font-semibold`) to visually outrank the signed-on date.
- Pause status indicator (if paused)
- Status dropdown with four options:

| User Selection | DB `status` | `completed_at`                     |
|----------------|-------------|-------------------------------------|
| Pending        | `pending`   | `null`                              |
| Done           | `yes`       | `min(now, dueAt)` — marks on-time  |
| Late           | `yes`       | `now` — marks after deadline        |
| Failed         | `no`        | `null`                              |

The Notes icon in the header closes the detail modal and opens the Notes Modal.

#### 2. Notes Modal (`notes-modal.tsx`)

**Trigger**: Notes icon on hover actions, or Notes icon inside the Detail Modal header.

**Contents**: Markdown editor with auto-save, copy functionality. No status controls. Uses `showCloseButton={false}` on DialogContent since it has a custom close button.

### Hover Actions (`timeline-node.tsx`)

Visible below the circle on hover:

| Node Status       | Actions Shown                           |
|--------------------|-----------------------------------------|
| Pending / Failed   | Notes icon + green checkmark (mark done) |
| Done / Done Late   | Notes icon only                         |

The Undo (RotateCcw) button was removed from hover — status changes for completed items are done through the Detail Modal's dropdown.

---

## State Management

- **Client data**: Fetched via `fetchClients()` from Supabase, stored in `ClientDashboard` state.
- **Optimistic updates**: `updateClientLocal` callback passed down the tree. Updates local state immediately, then fires async Supabase mutation (`updateExperience`, `updateClient`).
- **Live countdowns**: The dashboard passes a `now` Date prop that ticks every second, causing timer re-renders.
- **Focus mode**: `FocusTabs` control which experience type is focused. When focused, non-matching nodes are dimmed via `isFocusMode` + `isFocused` props.
- **Filters/Sort**: Managed in `ClientDashboard`, applied before rendering `ClientList`.

---

## Authentication

Simple password-based auth (no user accounts):
- `app/login/page.tsx` — login form
- `app/api/auth/route.ts` — POST validates password, sets session cookie; DELETE clears it
- `middleware.ts` — Supabase session refresh on every request

---

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Any auth-related secrets per your setup

---

## Recent Changes (Timeline Redesign)

### What Changed

1. **Replaced 3-box card layout with horizontal timeline stepper** — each client row now shows three circle nodes connected by a colored track instead of individual experience cards.

2. **Deleted old components**: `experience-card.tsx` and `mini-indicator.tsx` removed.

3. **Created `timeline-node.tsx`** — new component handling three visual modes (active/done/future) with:
   - Size-differentiated circles (110px active, 44px done/future)
   - Two-line countdown with seconds for active nodes
   - Hover glow effects (blue for pending, red for late)
   - Hover action icons below the circle

4. **Created `experience-detail-modal.tsx`** — new modal for detailed experience info and status management with a 4-option dropdown (Pending, Done, Late, Failed).

5. **Updated `client-row.tsx`** — timeline track with dynamic gradient coloring (green/red/transparent segments based on status).

6. **Updated `lib/deadlines.ts`** — added `getActiveStage()`, `formatDurationWithSeconds()`, `formatLateCompactTwoLine()`, `formatLateCompact()`, `formatCompletedShort()`, `formatDueShort()`, `formatDueTimeFull()`.

7. **Interaction model**:
   - Circle click → Experience Detail Modal (status management)
   - Notes icon (hover or detail modal header) → Notes Modal
   - Quick mark-done checkmark on hover for pending/failed nodes

### UI Polish Pass (Feb 10, 2026)

1. **Fixed double X close button** on modals — Both `notes-modal.tsx` and `experience-detail-modal.tsx` now pass `showCloseButton={false}` to `DialogContent` since they render their own custom close buttons in the header.

2. **Fixed track line bleeding through circles** (`timeline-node.tsx`) — All circle backgrounds changed from semi-transparent tints (`bg-red-500/10`, `bg-blue-500/10`, `bg-green-500/10`, `bg-amber-500/10`, `bg-muted/30`) to opaque `bg-card`. All circle borders changed from semi-transparent (`/60`, `/50`) to fully opaque. Track line left edge shifted from `left-8` to `left-12` in `client-row.tsx`.

3. **Redesigned Experience Detail Modal** (`experience-detail-modal.tsx`) — Large countdown hero section with colored left border, 2-column metadata grid (Signed On / Deadline) with clear visual hierarchy, and editable signed-on date via Calendar popover.

4. **Amber track line for late achievements** (`client-row.tsx`) — `getSegmentStatuses()` now returns `done_late` as a distinct status (previously collapsed into `done`). `getTrackGradient()` maps it to `rgb(245,158,11)` (amber-500).

5. **Client name column improvements** (`client-row.tsx`) — Client name bumped from `text-sm` to `text-base` for more prominence. Removed "Click name/date to edit" hint text.

---

## Running Locally

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3002` (configured in `package.json` via `--port 3002`). Requires Supabase credentials in `.env.local`.

---

## Build

```bash
npm run build
```

Uses Turbopack. Google Fonts (Geist, Geist Mono) are fetched at build time — requires network access.
