# Developer Documentation — Client Experience Tracking App

> Last updated: February 13, 2026

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
│   ├── globals.css              # Tailwind + CSS theme variables + pulse animations
│   ├── layout.tsx               # Root layout (ThemeProvider, fonts)
│   ├── login/page.tsx           # Password auth page
│   └── page.tsx                 # Home — renders ClientDashboard
├── components/
│   ├── add-client-dialog.tsx    # Dialog to add a new client
    │   ├── client-dashboard.tsx     # Top-level dashboard (state, filters, sorting, focus tabs)
    │   ├── client-list.tsx          # Renders list of ClientRow components
    │   ├── client-row.tsx           # Single client row: info + timeline stepper + delete
    │   ├── controls-bar.tsx         # Search, filters, sort dropdown, add/import/export
    │   ├── import-clients-dialog.tsx # JSON import dialog with schema copy + validation
│   ├── dashboard-header.tsx     # Header: title, Active/Archived tabs, theme toggle, sign out
│   ├── experience-detail-modal.tsx  # Detail modal: countdown hero, editable sign-on date, status dropdown
│   ├── focus-tabs.tsx           # Focus tabs (Overview, 24-Hour, 14-Day, 30-Day)
│   ├── notes-modal.tsx          # Markdown notes editor with auto-save
│   ├── summary-row.tsx          # Summary cards showing counts per experience type
│   ├── theme-provider.tsx       # next-themes wrapper
│   ├── theme-toggle.tsx         # Dark/light toggle button
│   ├── timeline-node.tsx        # Timeline node: circle + countdown + hover actions
│   └── ui/                      # shadcn/ui primitives (alert-dialog, badge, button,
    │                                #   calendar, card, dialog, dropdown-menu, input,
    │                                #   label, popover, select, tabs, textarea, tooltip)
├── lib/
│   ├── deadlines.ts             # All deadline math, formatting, status derivation
│   ├── client-fonts.ts           # Per-client Google Font assignment (hash-based)
    │   ├── queries.ts               # Supabase CRUD (fetchClients, createClient, updateClient, updateExperience, deleteClient)
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
| custom_due_at    | timestamptz                   | Nullable; overrides default computed deadline |
| notes            | text                          | Markdown content               |
| todos            | jsonb                         | Default `'[]'`; array of `{ id, text, done }` |
| created_at       | timestamptz                   |                                |
| updated_at       | timestamptz                   |                                |

### TypeScript Types (`lib/types.ts`)

```typescript
type ExperienceType = 'hour24' | 'day14' | 'day30'
type ExperienceStatus = 'pending' | 'yes' | 'no'        // DB values
type DerivedStatus = 'pending' | 'done' | 'done_late' | 'failed'  // Display values

interface TodoItem { id: string; text: string; done: boolean }

interface ClientWithExperiences extends Client {
  client_experiences: ClientExperience[]  // each has notes: string, todos: TodoItem[]
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
- **`getNextActiveDeadline(client)`**: Returns the nearest effective deadline `Date` across all experience types where `exp.status === 'pending'` (DB status, not derived). Returns `null` if no active deadlines remain. Used by the "Next Active Deadline" sort option.

#### Formatting Functions

| Function                    | Returns                     | Used For                        |
|-----------------------------|-----------------------------|---------------------------------|
| `formatDuration(secs)`      | `"2d 5h 30m"`              | General duration display        |
| `formatDurationCompact(secs)` | `{ line1, line2 }`       | Future node stacked countdown   |
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

- **Row Container** (`client-row.tsx`): `min-h-[200px]`, `py-5 pl-10 pr-14`. Uses `items-stretch` so all `TimelineNode` components stretch to the same height.

- **Track**: Two overlapping absolutely-positioned divs — a dotted gray background line and a solid colored overlay. Positioned at `left-[72px] right-[88px] top-[calc(50%+10px)]` to align with circle centers and stay within circle edges. The overlay uses a CSS `linear-gradient` computed by `getTrackGradient()` based on each segment's derived status:
  - Green = done (on time)
  - Amber = done_late
  - Red = failed
  - Transparent = pending/future

- **Node Layout** (in `timeline-node.tsx`): Each node uses a 3-zone vertical flex layout (`h-full flex-col`) for consistent alignment:
  - **Top zone** (`h-9 mb-3`): Experience type label. Fixed height ensures labels align across all nodes regardless of circle size. Labels are `text-xl font-bold` — blue for active pending, red for active late, `text-muted-foreground/50` for inactive.
  - **Middle zone** (`flex-1 flex items-center justify-center`): Circle centered within. The `flex-1` absorbs remaining height, so the circle midpoint is consistent across nodes. Below-circle text (completed date, due date) is positioned `absolute top-full` so it stays close to the circle without affecting centering.
  - **Bottom zone** (`min-h-[28px]`): Hover action icons only.

- **Node Types**:
  - **Active/Late** (110px circle): Live two-line countdown with seconds, due date inside. Blue border + pulse animation (pending) or red border + pulse animation (late). CSS `animate-pulse-blue` / `animate-pulse-red` provides a subtle breathing glow effect; animation is removed on hover (`animation: none`) so the static `group-hover` ring/shadow takes over.
  - **Done** (44px circle): Green checkmark (on-time) or amber checkmark (done late), "Completed [date]" below.
  - **Future** (48px circle, `h-12 w-12`): Stacked two-line countdown inside (`formatDurationCompact` returns `{ line1, line2 }`), `border-2 border-border`, "Due: [date]" below.
  - All circle backgrounds use opaque `bg-card` so the track line does not show through. Borders are fully opaque.

- **Pulse Animation** (in `app/globals.css`): Two `@keyframes` (`pulse-blue`, `pulse-red`) animate `box-shadow` with ring spread (3px–5px) and outer glow. Applied via `.animate-pulse-blue` / `.animate-pulse-red` classes on active node circles. A `.group:hover` CSS rule sets `animation: none` to cleanly hand off to the static Tailwind hover glow.

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

**Contents**: Collapsible todo list (above) and markdown notes editor (below) with auto-save, copy functionality. No status controls. Uses `showCloseButton={false}` on DialogContent since it has a custom close button.

**Todo list**: "Add Todo" button in the header creates items. Each item is a row with checkbox, inline text input, and hover-visible delete button. Completed items show an animated strikethrough (CSS `scaleX` transition on a measurement span). Keyboard: Enter inserts new item below, Backspace on empty deletes and re-focuses, Arrow Up/Down navigates. Collapsible via chevron toggle showing `(done/total)` count. Todos are stored as JSONB in the `todos` column and auto-saved with the same debounce pattern as notes (500ms).

### Hover Actions (`timeline-node.tsx`)

Visible in the bottom zone on hover (opacity transition):

| Node Status       | Actions Shown                           |
|--------------------|-----------------------------------------|
| Pending / Failed   | Notes icon + green checkmark (mark done) |
| Done / Done Late   | Notes icon only                         |

Status changes for completed items are done through the Detail Modal's dropdown. The tooltip ("Click to expand details & notes") was removed — circles are clickable without hint text.

---

## State Management

- **Client data**: Fetched via `fetchClients()` from Supabase, stored in `ClientDashboard` state.
- **Optimistic updates**: `updateClientLocal` callback passed down the tree. Updates local state immediately, then fires async Supabase mutation (`updateExperience`, `updateClient`).
- **Live countdowns**: The dashboard passes a `now` Date prop that ticks every second, causing timer re-renders.
- **Focus mode**: `FocusTabs` control which experience type is focused. When focused, non-matching nodes are dimmed via `isFocusMode` + `isFocused` props.
- **Filters/Sort**: Managed in `ClientDashboard`, applied before rendering `ClientList`. Deadline sort options (`deadline_hour24`, `deadline_day14`, `deadline_day30`, `next_active_deadline`) both filter and sort — they remove clients with no active (DB `pending`) deadline for that experience type, then sort by deadline nearest-first. `sortOption` is passed to `ClientList` so it can display context-aware empty states.

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

2. **Fixed track line bleeding through circles** (`timeline-node.tsx`) — All circle backgrounds changed from semi-transparent tints (`bg-red-500/10`, `bg-blue-500/10`, `bg-green-500/10`, `bg-amber-500/10`, `bg-muted/30`) to opaque `bg-card`. All circle borders changed from semi-transparent (`/60`, `/50`) to fully opaque.

3. **Redesigned Experience Detail Modal** (`experience-detail-modal.tsx`) — Large countdown hero section with colored left border, 2-column metadata grid (Signed On / Deadline) with clear visual hierarchy, and editable signed-on date via Calendar popover.

4. **Amber track line for late achievements** (`client-row.tsx`) — `getSegmentStatuses()` now returns `done_late` as a distinct status (previously collapsed into `done`). `getTrackGradient()` maps it to `rgb(245,158,11)` (amber-500).

5. **Client name column improvements** (`client-row.tsx`) — Client name bumped from `text-sm` to `text-base` for more prominence. Removed "Click name/date to edit" hint text.

### Timeline Layout Redesign (Feb 11, 2026)

1. **3-zone node layout** (`timeline-node.tsx`) — Restructured each `TimelineNode` into three vertical zones (top label / middle circle / bottom actions) inside a full-height flex column. This ensures experience type headers align consistently across all nodes regardless of circle size (110px active vs 48px future).

2. **Enlarged experience type headers** — Labels increased from `text-xs`/`text-sm` to `text-xl font-bold`. Active pending headers are blue, active late headers are red, inactive headers use `text-muted-foreground/50` for stronger visual hierarchy.

3. **Increased row height** (`client-row.tsx`) — Container `min-h` increased from `140px` to `200px` with `py-5` padding. Changed from `items-center` to `items-stretch` so all nodes stretch to the same height.

4. **Track line alignment** (`client-row.tsx`) — Track positioned at `top-[calc(50%+10px)]` to align with circle centers in the 3-zone layout. Insets changed to `left-[72px] right-[88px]` to prevent the track from poking past circle edges.

5. **Future nodes enlarged** (`timeline-node.tsx`) — Increased from `h-11 w-11` (44px) to `h-12 w-12` (48px) with `border-2` (matching done nodes).

6. **Stacked countdown display** (`lib/deadlines.ts`) — `formatDurationCompact()` now returns `{ line1, line2 }` (e.g., `{ line1: "5d", line2: "9h" }`) instead of a single string, so values are always vertically stacked inside future node circles.

7. **Below-circle text positioning** (`timeline-node.tsx`) — Completed dates and due dates are now `absolute top-full` so they stay close to their circle without affecting flex centering.

8. **Breathing pulse animation** (`app/globals.css` + `timeline-node.tsx`) — Active node circles have a CSS keyframe animation (`pulse-blue` for pending, `pulse-red` for late) that gently oscillates the ring glow (3px–5px spread, varying opacity) over 3 seconds. On hover, the animation is removed via `.group:hover { animation: none }` so the static Tailwind ring/shadow hover effect takes over cleanly.

9. **Removed tooltip** (`timeline-node.tsx`) — The "Click to expand details & notes" tooltip wrapper was removed from timeline nodes. Tooltip/TooltipContent/TooltipTrigger imports cleaned up.

### Feature & Polish Pass (Feb 12, 2026)

1. **Timeline track gradient alignment** (`client-row.tsx`) — `getTrackGradient()` color stops changed from equal thirds (33%/66%) to true midpoints (25%/75%) matching `justify-between` node positions. Additionally, hard color stops replaced with soft 4%-wide transition zones (23%–27%, 73%–77%) so adjacent segment colors blend smoothly instead of flipping abruptly.

2. **JSON import feature** (`components/import-clients-dialog.tsx`, `controls-bar.tsx`) — New "Import JSON" button in the controls bar opens a dialog with a monospaced textarea for pasting a JSON array of `{ name, signed_on_date }` objects. Includes validation (JSON syntax, array structure, per-item field checks), a "Copy Schema" button that copies the expected format to clipboard, and sequential import via `createClientWithExperiences` with success/failure count summary.

3. **Fixed name column width** (`client-row.tsx`) — Left column changed from variable `min-w-[180px] max-w-[220px]` to fixed `w-[240px] shrink-0`, ensuring all rows have identical border alignment. Name text uses `text-wrap break-words` instead of `truncate` so full names are always visible.

4. **Negative overdue counters everywhere** (`experience-detail-modal.tsx`, `lib/deadlines.ts`) — Overdue countdown in the detail modal hero now displays with a `-` prefix (was showing absolute value). `formatDurationCompact()` also prefixes `-` when `totalSeconds` is negative, so inactive/future nodes past their deadline show negative countdowns on the timeline.

5. **Alternating row styling** (`client-list.tsx`, `client-row.tsx`) — Row index passed to `ClientRow`. Even/odd rows alternate between `bg-card/60`/`bg-card/40` backgrounds. A `w-1` vertical bar at the left edge of each row alternates between `bg-muted-foreground/30` (even) and `bg-muted-foreground/15` (odd).

6. **Delete client feature** (`lib/queries.ts`, `client-row.tsx`, `client-list.tsx`, `client-dashboard.tsx`) — New `deleteClient()` query deletes experiences then client record. `removeClientLocal` callback filters client from state. Active rows show a red "Delete" option in the `...` dropdown (separated by a divider). Archived rows show a "Delete" button next to "Unarchive". Both trigger an `AlertDialog` confirmation: "This will permanently delete {name} and all associated experience data. This action cannot be undone."

7. **Collapsible experience summaries** (`client-dashboard.tsx`) — Summary cards wrapped in a collapsible section with a clickable "Experience Summaries" header and chevron icon toggle. Defaults to open.

8. **Summary card visual differentiation** (`summary-row.tsx`) — Each experience type card now has a unique left-border accent and subtle background tint: 24-Hour (blue), 14-Day (violet), 30-Day (teal). Font sizes increased: title `text-sm` → `text-base`, counts `text-xs` → `text-sm`, hint `text-[10px]` → `text-xs`.

9. **Unique Google Font per client name** (`lib/client-fonts.ts`, `client-row.tsx`) — New utility assigns each client a deterministic font from a curated pool of 20 Google Fonts (Playfair Display, Raleway, Merriweather, Oswald, etc.) by hashing `client.id`. Fonts are loaded on-demand via `<link>` tags (bold weight only). Applied via inline `fontFamily` style to the name display button and editing input. Only client names are affected; all other text uses the default app font.

### UX & Feature Updates (Feb 12, 2026 — afternoon)

1. **Notes modal: fixed autosave kicking out of edit mode** (`notes-modal.tsx`) — The `useEffect` that synced content from `experience.notes` was resetting `isEditing` to false on every autosave. Changed the effect to only fire when the modal opens/closes (not on `experience.notes` changes). Also fixed `onBlur` to always exit edit mode (previously only exited when content was empty).

2. **Sort option persists across refreshes** (`client-dashboard.tsx`) — `sortOption` is now initialized from `localStorage` and written back via a `useEffect` whenever it changes. Refreshing the page no longer resets to "Name A→Z".

3. **Calendar UX improvements** (`experience-detail-modal.tsx`) — All three calendar popovers (Signed On, Deadline, Completion) now have:
   - `fixedWeeks` prop so the calendar always renders 6 week rows, preventing height jumps when navigating between months.
   - Controlled `month`/`onMonthChange` state for programmatic navigation.
   - A date text input (`MM/DD/YYYY`) at the top of each popover with auto-formatting (`formatDateInput` strips non-digits and inserts slashes as you type). On valid input, the calendar navigates to that month. Enter key saves/confirms the date.

4. **Notes modal: todo list feature** (`notes-modal.tsx`, `lib/types.ts`, `supabase/migrations/20260212_add_todos.sql`) — New `todos` JSONB column on `client_experiences` (migration required). `TodoItem` type: `{ id, text, done }`. Notes modal now has:
   - "Add Todo" button in the header.
   - Collapsible "To-dos (done/total)" section above the notes area.
   - Each item: custom checkbox, inline text input, hover-visible delete (X) button.
   - Animated strikethrough on completed items: an invisible measurement `<span>` mirrors the text width; a `scaleX` CSS transition draws a 2px line across just the text (not the full input width).
   - Keyboard: Enter inserts new item below, Backspace on empty deletes and refocuses, Arrow Up/Down navigates.
   - Debounced autosave (500ms) via `updateExperience` with optimistic local updates.

5. **Modal border styling** (`components/ui/dialog.tsx`) — Border changed from `border` (1px, default color) to `border-[1.5px] border-muted-foreground/35` for better visibility against the dark background.

### Active Deadline Filtering & Sort (Feb 13, 2026)

1. **Deadline sort options now filter to active-only experiences** (`components/client-dashboard.tsx`) — The sort options `deadline_hour24`, `deadline_day14`, and `deadline_day30` now filter clients to only those whose experience for that type has DB `status === 'pending'`. This removes completed (`yes`) and explicitly failed (`no`) experiences from the list, but keeps overdue deadlines that are still active (DB `pending` but past due, which derive as `failed`). The remaining clients are sorted by deadline nearest-first.

2. **New "Next Active Deadline" sort option** (`lib/types.ts`, `lib/deadlines.ts`, `components/controls-bar.tsx`, `components/client-dashboard.tsx`) — Added `next_active_deadline` to the `SortOption` type. New `getNextActiveDeadline(client)` helper in `deadlines.ts` finds the nearest active deadline across all three experience types. When selected, filters to clients with at least one active deadline and sorts by the nearest one, regardless of experience type.

3. **Context-aware "All Complete" empty state** (`components/client-list.tsx`) — When a deadline sort filter results in zero clients, instead of the generic "No clients found" message, a prominent green indicator is shown with a large checkmark icon, bold heading ("All 24-Hour Experiences Complete", etc.), and subtitle ("No active 24-hour deadlines remaining"). Uses a dashed emerald border card with tinted background so it's immediately recognizable as a "done" state. `ClientList` now receives the `sortOption` prop to determine which empty message to display.

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
