# Developer Documentation — Client Experience Tracking App

> Last updated: February 26, 2026

## Overview

A Next.js web app for tracking time-based client milestones. The **Onboarding** tab tracks three initial onboarding milestones: **24-Hour**, **10-Day**, and **30-Day** experiences. The **Lifecycle** tab tracks recurring **monthly** post-30-day experiences (months 2–18, i.e. 1.5 years from sign-on). Clients now have both a **signed-on date** and an optional **initial intake date**. By default, 24-Hour and 10-Day anchor to initial intake when present (otherwise sign-on), while other nodes stay sign-on anchored. The UI shows a horizontal timeline stepper per client with live countdowns, status indicators, and interactive modals for managing status and notes.

### Page vs. Node Naming Convention

The three main tabs are **Onboarding**, **Lifecycle**, and **Archived** (previously named "Active", "Ongoing", and "Archived"). The term **"Active"** is still used to describe experience *nodes* — i.e., the current pending/in-progress experience node on a client's timeline is called the "active" node, regardless of which page it appears on. So a client on the Lifecycle page still has an "active" monthly experience node. In code:

- **Tab/page values**: `ActiveTab = 'onboarding' | 'lifecycle' | 'archived'` — these are the page identifiers.
- **Experience node terminology**: "Active stage", "active deadline", `isActiveStage`, `getActiveStage()`, `getNextActiveDeadline()` — these refer to the currently-pending experience node, not the page.
- **Internal variable names**: Some internal variables still use legacy naming (e.g., `isOngoing`, `ongoingSummaryOpen`, `OngoingSummaryRow`, `computeOngoingSummaryCounts`) for the Lifecycle tab. These are code-internal and do not appear in the UI. The `ongoing-summary-row.tsx` filename and component name are also unchanged.

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
│   ├── api/
│   │   ├── auth/route.ts          # POST login / DELETE logout
│   │   └── migrate/route.ts       # GET migration info / POST apply migration via pg
│   ├── globals.css                # Tailwind + CSS theme variables + pulse animations
│   ├── layout.tsx                 # Root layout (ThemeProvider, fonts)
│   ├── login/page.tsx             # Password auth page
│   └── page.tsx                   # Home — renders ClientDashboard
├── components/
│   ├── add-client-dialog.tsx      # Dialog to add a new client
│   ├── calendar-day-cell.tsx      # Calendar day cell with status-colored deadline chips
│   ├── calendar-modal.tsx         # Calendar modal: monthly grid, navigation, detail modal integration
│   ├── client-dashboard.tsx       # Top-level dashboard (state, filters, sorting, MigrationBanner)
│   ├── client-list.tsx            # Renders list of ClientRow components
│   ├── client-row.tsx             # Single client row: info + timeline stepper + delete
│   ├── controls-bar.tsx           # Search, filter dropdown, sort dropdown, Calendar View, Actions dropdown
│   ├── import-clients-dialog.tsx  # JSON import dialog with schema copy + validation
│   ├── manage-person-links-dialog.tsx # Row-level dialog to edit external person links
│   ├── dashboard-header.tsx       # Header: title, Onboarding/Lifecycle tabs, dropdown menu (Archived, theme toggle, sign out)
│   ├── experience-detail-modal.tsx # Detail modal: countdown hero, editable sign-on date, status dropdown
│   ├── focus-tabs.tsx             # (unused) Focus tabs — removed from UI, file retained
│   ├── monthly-history-modal.tsx  # Modal listing all experiences: 3 onboarding + 17 monthly (months 2–18)
│   ├── notes-modal.tsx            # Markdown notes editor with auto-save
│   ├── ongoing-summary-row.tsx    # Summary cards for Lifecycle tab (Up to Date, Due Soon, Overdue, Completion Rate)
│   ├── summary-row.tsx           # Summary cards showing counts per experience type (Onboarding tab)
│   ├── theme-provider.tsx         # next-themes wrapper
│   ├── theme-toggle.tsx           # Dark/light toggle button
│   ├── timeline-node.tsx          # Timeline node: circle + countdown + hover actions
│   └── ui/                        # shadcn/ui primitives (alert-dialog, badge, button, calendar,
│                                  #   card, context-menu, dialog, dropdown-menu, input, label,
│                                  #   popover, select, tabs, textarea, tooltip)
├── lib/
│   ├── deadlines.ts               # All deadline math, formatting, status derivation
│   ├── client-fonts.ts            # Per-client Google Font assignment (hash-based)
│   ├── queries.ts                 # Supabase CRUD + migration check + monthly backfill
│   ├── types.ts                   # TypeScript types & constants
│   ├── utils.ts                   # cn() utility (clsx + tailwind-merge)
│   └── supabase/
│       ├── client.ts              # Browser Supabase client
│       ├── middleware.ts          # Session refresh middleware
│       └── server.ts             # Server Supabase client
├── scripts/
│   └── apply-migration.mjs       # CLI script to apply monthly migration via direct pg connection
├── supabase/
│   └── migrations/
│       ├── 20260219_add_monthly_experiences.sql  # Two-step migration for monthly experiences
│       ├── 20260219_add_flag_color.sql           # Add flag_color column to clients
│       ├── 20260226_add_initial_intake_and_day10.sql # Add intake columns + day14 -> day10 migration
│       └── 20260227_add_client_people_links.sql # Add per-client person links for external workspace routing
├── middleware.ts                  # Next.js middleware (Supabase session)
├── BUILD_SPEC.md                  # Original build specification
├── REDISGN_SPEC.md                # Timeline redesign specification
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
| initial_intake_date  | date         | Nullable; optional intake anchor date |
| initial_intake_pulse_enabled | boolean | Default true; controls blank-intake pulse reminder |
| is_archived          | boolean      | Default false                  |
| archived_at          | timestamptz  | Nullable                       |
| paused               | boolean      | Default false                  |
| pause_started_at     | timestamptz  | Nullable                       |
| paused_total_seconds | int          | Default 0                      |
| flag_color           | text         | Nullable; color key for row flag (e.g. 'red', 'blue') |
| created_at           | timestamptz  |                                |
| updated_at           | timestamptz  |                                |

**`client_experiences`**
| Column           | Type                                          | Notes                          |
|------------------|-----------------------------------------------|--------------------------------|
| id               | uuid (PK)                                     |                                |
| client_id        | uuid (FK -> clients)                          |                                |
| experience_type  | 'hour24' \| 'day10' \| 'day30' \| 'monthly'  |                                |
| month_number     | integer                                       | Nullable; 2–18 for monthly experiences, null for initial types |
| status           | 'pending' \| 'yes' \| 'no'                   | DB-level status                |
| completed_at     | timestamptz                                   | Nullable; set on completion    |
| custom_due_at    | timestamptz                                   | Nullable; overrides default computed deadline |
| notes            | text                                          | Markdown content               |
| todos            | jsonb                                         | Default `'[]'`; array of `{ id, text, done }` |
| created_at       | timestamptz                                   |                                |
| updated_at       | timestamptz                                   |                                |

Each client has **20 experience rows** total: 3 initial (hour24, day10, day30) + 17 monthly (months 2–18). Monthly rows use `experience_type = 'monthly'` with `month_number` set to the month ordinal.

**Unique constraint**: The `client_experiences` table has a unique index on `(client_id, experience_type, COALESCE(month_number, 0))`. This allows one row per initial experience type (where `month_number` is NULL → coalesced to 0) and one row per monthly month_number per client.

**`client_people_links`**
| Column       | Type         | Notes                                                 |
|--------------|--------------|-------------------------------------------------------|
| id           | uuid (PK)    |                                                       |
| client_id    | uuid (FK -> clients) | Cascades on delete                           |
| display_name | text         | Name shown in right-click menu                        |
| person_id    | text         | External workspace identifier appended to URL         |
| sort_order   | integer      | Controls ordering in menus/dialog                     |
| created_at   | timestamptz  |                                                       |
| updated_at   | timestamptz  |                                                       |

**Unique constraint**: `client_people_links` enforces one row per `(client_id, display_name)` to support import upsert-by-name behavior.

### TypeScript Types (`lib/types.ts`)

```typescript
type ExperienceType = 'hour24' | 'day10' | 'day30' | 'monthly'
type ExperienceStatus = 'pending' | 'yes' | 'no'        // DB values
type DerivedStatus = 'pending' | 'done' | 'done_late' | 'failed'  // Display values
type ActiveTab = 'onboarding' | 'lifecycle' | 'archived'

interface TodoItem { id: string; text: string; done: boolean }

interface Client {
  // ...standard fields (id, name, signed_on_date, is_archived, paused, etc.)...
  initial_intake_date: string | null
  initial_intake_pulse_enabled: boolean
  flag_color: string | null     // color key from FLAG_COLORS, e.g. 'red', 'blue'
}

interface ClientExperience {
  // ...standard fields...
  experience_type: ExperienceType
  month_number: number | null  // 2–18 for monthly, null for initial
}

interface ClientPersonLink {
  id: string
  client_id: string
  display_name: string
  person_id: string
  sort_order: number
}

interface ClientWithExperiences extends Client {
  client_experiences: ClientExperience[]
  client_people_links: ClientPersonLink[]
}

// Constants
const EXPERIENCE_TYPES: ExperienceType[] = ['hour24', 'day10', 'day30']          // Initial types only
const INITIAL_EXPERIENCE_TYPES: ExperienceType[] = ['hour24', 'day10', 'day30']  // Alias for clarity
const MONTHLY_MONTH_RANGE = { min: 2, max: 18 }                                  // 17 months (1.5 years)
const FLAG_COLORS: { key: string; label: string; rgb: string }[]                 // 7-color palette for row flags

// Helpers
getMonthlyLabel(monthNumber) => "2-Month", "3-Month", etc.
getExperienceLabel(experience) => label for any experience (initial or monthly)
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

- **Firm Timezone**: All calculations use a configured timezone constant (defaults to `America/New_York`, configurable via `NEXT_PUBLIC_FIRM_TIMEZONE`).
- **`getDueAt(signedOnDate, expType, firmTz, monthNumber?)`**: Returns the raw deadline Date for a given experience type. For `'monthly'` type, uses `addMonths(baseDate, monthNumber)` from date-fns for proper month-length handling (e.g. Jan 31 + 1 month = Feb 28). All deadlines are 11:59 PM in the firm timezone.
- **`getEffectiveDueDate(experience, signedOnDate, firmTz?, initialIntakeDate?)`**: Uses `custom_due_at` if set, otherwise resolves an anchor date and calls `getDueAt`. Anchor rules: `hour24`/`day10` use `initial_intake_date` when present, else `signed_on_date`; all other types use `signed_on_date`. Reads `month_number` from the experience object for monthly types.
- **`getDueAtEffective(dueAt, pausedTotalSeconds)`**: Adjusts the deadline forward by the total paused seconds.
- **`getNowEffective(client, now)`**: If the client is paused, freezes "now" at the pause start time.
- **`getActiveStage(client, now)`**: Returns the first *initial* experience type that is `pending` or `failed` (the current active milestone). Only checks hour24/day10/day30.
- **`getActiveStageMonthly(client, now)`**: Returns the `month_number` of the first *monthly* experience that is `pending` or `failed`, or null if all are done. **Gated**: returns `null` immediately if the client's `day30` experience still has DB status `'pending'`, so lifecycle nodes stay inactive until onboarding is resolved.
- **`getNextActiveDeadline(client)`**: Returns the nearest effective deadline `Date` across initial experience types where `exp.status === 'pending'`. Used by the "Next Active Deadline" sort option.
- **`getNextMonthlyDeadline(client)`**: Same as above but for monthly experiences. Used by the "Next Monthly Deadline" sort option.
- **`getMonthlyExperiences(client)`**: Returns all monthly experiences for a client sorted by `month_number` ascending.
- **`getVisibleMonthlyExperiences(client, now)`**: Fixed-group window — returns the 3 monthly experiences to display in the Lifecycle tab. Monthly experiences are chunked into fixed groups of 3 in `month_number` order ([2,3,4], [5,6,7], [8,9,10], ...). Returns the first group that still has at least one pending/failed node. Completing a node within a group keeps it visible (shown as complete); the window only advances to the next group when all 3 nodes in the current group are done. If all groups are complete, returns the last group.

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
        ├── DashboardHeader (Onboarding/Lifecycle tabs, dropdown menu: Archived, theme toggle, sign out)
        ├── SummaryRow (aggregate counts — Onboarding tab only)
        ├── OngoingSummaryRow (Up to Date / Due Soon / Overdue / Completion Rate — Lifecycle tab only)
        ├── ControlsBar (search, filter dropdown, sort dropdown, Calendar View, Actions dropdown)
        │     Sort options adapt per tab: Onboarding has deadline sorts, Lifecycle has "Next Monthly Deadline"
        ├── ClientList
│     └── ClientRow (one per client, wrapped in ContextMenu for flag colors)
│           ├── [Client info: name, date, pause/archive controls]
│           ├── [History button — Lifecycle tab only, opens MonthlyHistoryModal]
│           ├── [Flag gradient background — optional, set via right-click context menu]
│           ├── [Timeline track: dotted bg line + colored progress overlay]
        │           └── TimelineNode × 3
        │           │     Onboarding tab: one per initial type (hour24, day10, day30)
        │           │     Lifecycle tab: 3 monthly experiences from getVisibleMonthlyExperiences()
        │           │     ├── [Circle with status indicator]
        │           │     ├── [Hover actions: Notes icon, Mark done]
        │           │     ├── NotesModal (opened via Notes icon)
        │           │     └── ExperienceDetailModal (opened via circle click)
        │           └── MonthlyHistoryModal (Lifecycle tab only)
        │                 ├── [Onboarding section: 3 initial experiences with left accent bar]
        │                 ├── [Divider line]
        │                 ├── [Lifecycle section: all 17 monthly experiences with status indicators]
        │                 └── [Clickable rows open ExperienceDetailModal]
        └── CalendarModal (opened via Calendar button in ControlsBar)
              ├── [Header: month/year, prev/next/today nav, show-completed toggle, show-lifecycle toggle, close]
              └── CalendarDayCell × 28-42 (7-column grid, dynamic row count)
                    ├── [Day number with today highlight pulse]
                    └── [Deadline chips: clickable, status-colored]
                    │     Initial chips: "24h", "10d", "30d"
                    │     Monthly chips: "2mo", "5mo", etc. (dynamic based on month_number)
                          ├── ExperienceDetailModal (reused, opened on chip click)
                          └── NotesModal (reused, opened from detail modal)
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
  - **Active/Late** (110px circle): Live two-line countdown with seconds, due date inside. Blue border + pulse animation (pending) or red border + pulse animation (late). When a pending node is within 24 hours of its deadline, the outer pulse ring switches to yellow while the inner circle border stays blue (see "24-Hour Warning Border" below). A separate `<span>` overlay with CSS class `pulse-ring-blue` / `pulse-ring-red` provides a subtle breathing glow effect by animating `opacity` on a static `box-shadow` (see "GPU-Safe Pulse Animation" below). For the yellow 24-hour variant, the `pulse-ring-blue` class is kept for animation/hover behavior and the box-shadow color is overridden via inline `style` (see "24-Hour Warning Border" for rationale). Animation is removed on hover (`animation: none; opacity: 0`) so the static `group-hover` ring/shadow takes over.
  - **Done** (44px circle): Green checkmark (on-time) or amber checkmark (done late), "Completed [date]" below.
  - **Future** (48px circle, `h-12 w-12`): Stacked two-line countdown inside (`formatDurationCompact` returns `{ line1, line2 }`), `border-2 border-border`, "Due: [date]" below.
  - **Inactive Overdue** (48px circle): Overdue nodes that are not the active stage — e.g., unarchived clients returning to the pipeline. Red border (`border-red-500/60`), compact late duration inside in muted red, due date below in `text-red-500/60`. Label styled `text-red-400/70`.
  - All circle backgrounds use opaque `bg-card` so the track line does not show through. Borders are fully opaque.

- **Pulse Animation** (in `app/globals.css`): Uses a single `@keyframes pulse-ring` that animates `opacity` (0.3 → 0.85) over 3 seconds. Applied via `.pulse-ring-blue` / `.pulse-ring-red` / `.pulse-ring-yellow` classes on a `<span>` overlay element inside the circle (positioned `absolute -inset-1`). Each class has a *static* `box-shadow` (ring spread + outer glow) that fades in and out via the opacity animation. A `.group:hover` CSS rule sets `animation: none; opacity: 0` to cleanly hand off to the static Tailwind hover glow. **Note**: The 24-hour warning yellow variant uses `pulse-ring-blue` for animation/hover and overrides the box-shadow color via inline `style` rather than relying solely on the `pulse-ring-yellow` class (see "24-Hour Warning Border" section for details). **Important**: The `box-shadow` values are never animated — only `opacity` changes. This is critical for GPU performance; see "GPU-Safe Pulse Animation" below.

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
- **Focus mode** (removed): `FocusTabs` were removed from the UI. `focusTab` is now a constant `'overview'` in `ClientDashboard`. The `isFocusMode` / `isFocused` props still exist on child components but `isFocusMode` is always `false`.
- **Filters/Sort**: Managed in `ClientDashboard`, applied before rendering `ClientList`. Status filter is a `Select` dropdown in `ControlsBar` (All, Pending, Done, Late, Failed). On the **Onboarding** tab, deadline sort options (`deadline_hour24`, `deadline_day10`, `deadline_day30`, `next_active_deadline`) both filter and sort — they remove clients with no active (DB `pending`) deadline for that experience type, then sort by deadline nearest-first. On the **Lifecycle** tab, available sorts are Name A→Z, Name Z→A, and "Next Monthly Deadline" (`next_monthly_deadline`). `sortOption` resets to `name_asc` when switching tabs if the current sort is invalid for the new tab. `sortOption` is passed to `ClientList` so it can display context-aware empty states.
- **Lifecycle tab state**: When `activeTab === 'lifecycle'`, the dashboard shows non-archived clients (same as Onboarding), but each `ClientRow` renders in "lifecycle mode" — using `getVisibleMonthlyExperiences()` for the 3-node sliding window instead of the initial 3 types. Lifecycle summary counts (`OngoingSummaryRow`) are computed via `computeOngoingSummaryCounts` (a `useMemo`) which iterates monthly experiences to derive Up to Date / Due Soon / Overdue / Completion Rate.
- **Client backfill**: On initial load, `backfillMonthlyExperiences()` is called after `fetchClients()` to create missing monthly experience rows for clients created before the Lifecycle feature was added. This is gated behind `checkMonthlyMigration()`, which probes for the `month_number` column; if the migration hasn't been applied, the backfill is skipped and a `MigrationBanner` is shown on the Lifecycle tab instead.

---

## Authentication

Simple password-based auth (no user accounts):
- `app/login/page.tsx` — login form
- `app/api/auth/route.ts` — POST validates password, sets session cookie; DELETE clears it
- `middleware.ts` — Supabase session refresh on every request

---

## Zapier Webhook Integration

- Source Zap flow: `https://zapier.com/editor/350956403/published/350956405/sample`
- Endpoint: `POST /api/webhooks/zapier/client-signed` (`app/api/webhooks/zapier/client-signed/route.ts`)
- Access: webhook routes are allowlisted in middleware (`/api/webhooks/*`) so Zapier can call them without app login cookies

Expected payload from Zapier:

```json
{
  "source": "zapier",
  "event": "client_signed",
  "payload_version": 1,
  "client_name": "Jane Doe",
  "taxdome_slug": "my-taxdome-slug",
  "occurred_at_utc": "2026-02-24T22:40:00Z"
}
```

Normalization and behavior:
- `occurred_at_utc` is converted to Los Angeles time (`America/Los_Angeles`)
- `signed_on_date` in `clients` is derived from the LA-local date
- client + initial experiences are created; monthly rows are attempted if monthly migration exists
- duplicate retries are deduped by `name + signed_on_date`

If the Zapier flow field mapping changes, update this section and `validatePayload()` in the webhook route together.

---

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_PASSWORD` — password for the simple auth system

Optional:
- `DATABASE_URL` — PostgreSQL connection string for the `/api/migrate` endpoint (can also be provided at runtime via the request body)
- `NEXT_PUBLIC_FIRM_TIMEZONE` — timezone for deadline calculations (defaults to `America/New_York`)
- `ZAPIER_WEBHOOK_SECRET` — if set, `/api/webhooks/zapier/client-signed` requires this exact value in the `x-webhook-secret` request header

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

8. **Breathing pulse animation** (`app/globals.css` + `timeline-node.tsx`) — Active node circles have a breathing glow effect using a `<span>` overlay with a static `box-shadow` and an `opacity`-only CSS keyframe animation (`pulse-ring`) over 3 seconds. On hover, the animation is removed and opacity set to 0 so the static Tailwind ring/shadow hover effect takes over cleanly. See "GPU-Safe Pulse Animation" section for details on why `box-shadow` values must never be animated.

9. **Removed tooltip** (`timeline-node.tsx`) — The "Click to expand details & notes" tooltip wrapper was removed from timeline nodes. Tooltip/TooltipContent/TooltipTrigger imports cleaned up.

### Feature & Polish Pass (Feb 12, 2026)

1. **Timeline track gradient alignment** (`client-row.tsx`) — `getTrackGradient()` color stops changed from equal thirds (33%/66%) to true midpoints (25%/75%) matching `justify-between` node positions. Additionally, hard color stops replaced with soft 4%-wide transition zones (23%–27%, 73%–77%) so adjacent segment colors blend smoothly instead of flipping abruptly.

2. **JSON import feature** (`components/import-clients-dialog.tsx`, `controls-bar.tsx`) — New "Import JSON" button in the controls bar opens a dialog with a monospaced textarea for pasting a JSON array of `{ name, signed_on_date, initial_intake_date? }` objects. Includes validation (JSON syntax, array structure, per-item field checks), a "Copy Schema" button that copies the expected format to clipboard, and sequential import via `createClientWithExperiences` with success/failure count summary.

3. **Fixed name column width** (`client-row.tsx`) — Left column changed from variable `min-w-[180px] max-w-[220px]` to fixed `w-[240px] shrink-0`, ensuring all rows have identical border alignment. Name text uses `text-wrap break-words` instead of `truncate` so full names are always visible.

4. **Negative overdue counters everywhere** (`experience-detail-modal.tsx`, `lib/deadlines.ts`) — Overdue countdown in the detail modal hero now displays with a `-` prefix (was showing absolute value). `formatDurationCompact()` also prefixes `-` when `totalSeconds` is negative, so inactive/future nodes past their deadline show negative countdowns on the timeline.

5. **Alternating row styling** (`client-list.tsx`, `client-row.tsx`) — Row index passed to `ClientRow`. Even/odd rows alternate between `bg-card/60`/`bg-card/40` backgrounds. A `w-1` vertical bar at the left edge of each row alternates between `bg-muted-foreground/30` (even) and `bg-muted-foreground/15` (odd).

6. **Delete client feature** (`lib/queries.ts`, `client-row.tsx`, `client-list.tsx`, `client-dashboard.tsx`) — New `deleteClient()` query deletes experiences then client record. `removeClientLocal` callback filters client from state. Active rows show a red "Delete" option in the `...` dropdown (separated by a divider). Archived rows show a "Delete" button next to "Unarchive". Both trigger an `AlertDialog` confirmation: "This will permanently delete {name} and all associated experience data. This action cannot be undone."

7. **Collapsible experience summaries** (`client-dashboard.tsx`) — Summary cards wrapped in a collapsible section with a clickable "Experience Summaries" header and chevron icon toggle. Defaults to open.

8. **Summary card visual differentiation** (`summary-row.tsx`) — Each experience type card now has a unique left-border accent and subtle background tint: 24-Hour (blue), 10-Day (violet), 30-Day (teal). Font sizes increased: title `text-sm` → `text-base`, counts `text-xs` → `text-sm`, hint `text-[10px]` → `text-xs`.

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

1. **Deadline sort options now filter to active-only experiences** (`components/client-dashboard.tsx`) — The sort options `deadline_hour24`, `deadline_day10`, and `deadline_day30` now filter clients to only those whose experience for that type has DB `status === 'pending'`. This removes completed (`yes`) and explicitly failed (`no`) experiences from the list, but keeps overdue deadlines that are still active (DB `pending` but past due, which derive as `failed`). The remaining clients are sorted by deadline nearest-first.

2. **New "Next Active Deadline" sort option** (`lib/types.ts`, `lib/deadlines.ts`, `components/controls-bar.tsx`, `components/client-dashboard.tsx`) — Added `next_active_deadline` to the `SortOption` type. New `getNextActiveDeadline(client)` helper in `deadlines.ts` finds the nearest active deadline across all three experience types. When selected, filters to clients with at least one active deadline and sorts by the nearest one, regardless of experience type.

3. **Context-aware "All Complete" empty state** (`components/client-list.tsx`) — When a deadline sort filter results in zero clients, instead of the generic "No clients found" message, a prominent green indicator is shown with a large checkmark icon, bold heading ("All 24-Hour Experiences Complete", etc.), and subtitle ("No active 24-hour deadlines remaining"). Uses a dashed emerald border card with tinted background so it's immediately recognizable as a "done" state. `ClientList` now receives the `sortOption` prop to determine which empty message to display.

### Calendar Modal Feature (Feb 18, 2026)

1. **Calendar modal** (`components/calendar-modal.tsx`, `components/calendar-day-cell.tsx`) — New full-screen modal (max-w-6xl, h-[85vh]) accessible via a "Calendar" button in the controls bar. Displays a monthly grid of all experience deadlines. Key features:
   - **Monthly navigation**: Prev/next month buttons and a "Today" button to jump to the current month.
   - **Show/hide completed**: Toggle button (defaults to hidden) filters out `done` and `done_late` experiences.
   - **Data transformation**: Iterates all non-archived clients, computes effective deadlines via `getEffectiveDueDate` + `getDueAtEffective`, derives status via `getDerivedStatus`, and builds a `Map<string, CalendarEvent[]>` keyed by `YYYY-MM-DD` date strings.
   - **Detail modal integration**: Clicking any deadline chip opens the existing `ExperienceDetailModal` (and `NotesModal` via its Notes button). Edits propagate back via `updateClientLocal` in real-time.
   - **Future-proofed**: Data transformation works off generic `ClientExperience[]` arrays, not hard-coded to the three current types, so adding new experience types later requires no calendar changes.

2. **Calendar day cell** (`components/calendar-day-cell.tsx`) — Each cell renders:
   - Day number with a `bg-primary` circle highlight for today.
   - Scrollable list of status-colored deadline chips. Each chip is a flex row with a `shrink-0` experience type badge ("24h", "10d", "30d") at the leading edge, followed by a truncating client name. This ensures the type is always visible regardless of name length.
   - Color scheme matches the dashboard: blue (pending), red (failed/past due), green (done), amber (done late).

3. **Dynamic grid rows** (`components/calendar-modal.tsx`) — The grid computes `numRows = calendarDays.length / 7` (4, 5, or 6 depending on month) and sets `gridTemplateRows: repeat(N, 1fr)` so rows stretch evenly to fill the modal. This eliminates blank space at the bottom for short months like February.

4. **Weekend column shading** (`components/calendar-modal.tsx`, `components/calendar-day-cell.tsx`) — Sunday and Saturday columns have a slightly lighter background (`bg-muted/25` on day cells, `bg-muted/60` on headers) compared to weekday columns, making weekends visually distinguishable.

5. **Today cell pulse animation** (`app/globals.css`, `components/calendar-day-cell.tsx`) — Today's entire cell has a slow breathing pulse (`today-cell-pulse` keyframe, 4s cycle) that fades between fully transparent and a warm amber/gold tint (`rgba(251,191,36,0.18)`), making it stand out at a glance against the dark calendar background.

6. **Outside-month cell styling** (`app/globals.css`, `components/calendar-day-cell.tsx`) — Days from adjacent months use a `.calendar-outside-month` CSS class with a dark background overlay (`rgba(6,10,20,0.75)`) and an inset box-shadow (`inset 0 0 30px 14px rgba(0,0,0,0.85)`) that darkens from the edges inward, giving a recessed/sunken look clearly distinct from both weekday and weekend cells.

7. **Dashboard wiring** (`components/client-dashboard.tsx`, `components/controls-bar.tsx`) — `calendarOpen` state in `ClientDashboard` controls the modal. `ControlsBar` receives an `onOpenCalendar` prop and renders a prominent "Calendar View" button (primary variant).

### Controls Bar Cleanup (Feb 18, 2026)

1. **Removed Focus Tabs** (`components/client-dashboard.tsx`) — `FocusTabs` component is no longer rendered. `focusTab` is now a constant `'overview'` instead of state. `handleFocusTabChange` removed. `handleSummaryClick` no longer sets `focusTab` (still sets status filter and sort). The `focus-tabs.tsx` file is retained but unused.

2. **Status filter dropdown** (`components/controls-bar.tsx`) — Replaced the 5 inline `FilterChip` buttons (All, Pending, Done, Late, Failed) with a compact `Select` dropdown (`w-[130px]`), matching the sort dropdown's style. Removed the `FilterChip` helper component.

3. **Actions dropdown** (`components/controls-bar.tsx`) — Combined "Add Client" and "Import JSON" into a single `DropdownMenu` with a trigger button labeled "Actions" (with `MoreHorizontal` icon). Uses the existing `DropdownMenu` / `DropdownMenuItem` from `components/ui/dropdown-menu.tsx`.

4. **Prominent Calendar View button** (`components/controls-bar.tsx`) — Changed from `variant="outline"` to `variant="default"` (primary/filled) and renamed label from "Calendar" to "Calendar View" so it stands out from the other controls.

5. **Removed `focusTab` prop from ControlsBar** (`components/controls-bar.tsx`) — The `FocusTab` type import and `focusTab` prop were removed from the `ControlsBarProps` interface since the component never used it internally.

### Ongoing Experiences Feature (Feb 18, 2026)

Added a full **"Lifecycle"** tab (originally named "Ongoing", renamed Feb 19) for tracking monthly post-30-day experiences (months 2–18 = 1.5 years from sign-on). The tab sits between Onboarding and Archived: **Onboarding | Lifecycle | Archived**. Monthly experience labels are "2-Month", "3-Month", ... "18-Month".

#### Database & Migration

1. **Migration** (`supabase/migrations/20260219_add_monthly_experiences.sql`) — A two-step migration (must be run as separate transactions in the Supabase SQL Editor because PostgreSQL requires new enum values to be committed before they can be referenced in queries):
   - **Step 1**: `ALTER TYPE experience_type ADD VALUE IF NOT EXISTS 'monthly'` + `ALTER TABLE client_experiences ADD COLUMN IF NOT EXISTS month_number integer`.
   - **Step 2**: Drops the old unique constraint `client_experiences_client_id_experience_type_key` (which was on `(client_id, experience_type)` and only allowed one row per type per client), creates a new unique index on `(client_id, experience_type, COALESCE(month_number, 0))` to allow 17 monthly rows per client, then backfills 17 monthly rows (months 2–18) for all existing clients via `INSERT ... SELECT ... CROSS JOIN generate_series(2, 18)`.

1b. **Migration API** (`app/api/migrate/route.ts`) — A Next.js API route that can apply the migration programmatically. `GET` returns the SQL and instructions. `POST` with `{ "databaseUrl": "postgresql://..." }` connects via the `pg` library, runs Step 1 in one connection (so the enum value is committed), then Step 2 in a second connection.

1c. **Migration CLI script** (`scripts/apply-migration.mjs`) — A standalone Node.js script that tries multiple Supabase connection endpoints (pooler session/transaction across regions, direct connection) to find a working database connection. Usage: `DB_PASSWORD=xxx node scripts/apply-migration.mjs`.

1d. **Migration banner** (`MigrationBanner` in `client-dashboard.tsx`) — An in-app banner shown on the Lifecycle tab when `checkMonthlyMigration()` (in `lib/queries.ts`) detects the `month_number` column is missing. The banner provides "Copy Step 1 SQL" and "Copy Step 2 SQL" buttons for manual execution in the Supabase SQL Editor, plus a "Check Migration Status" button. Once the migration is detected as applied, the banner disappears and `loadClients()` is re-triggered.

#### Data Layer

2. **Types** (`lib/types.ts`) — `ExperienceType` extended with `'monthly'`. `ClientExperience` now has `month_number: number | null`. `ActiveTab` extended with `'lifecycle'` (originally `'ongoing'`). `SortOption` extended with `'next_monthly_deadline'`. New constants: `INITIAL_EXPERIENCE_TYPES`, `MONTHLY_MONTH_RANGE`. New helpers: `getMonthlyLabel(monthNumber)` and `getExperienceLabel(experience)` (returns the display label for any experience type, initial or monthly).

3. **Deadlines** (`lib/deadlines.ts`) — `getDueAt()` now accepts optional `monthNumber` param; for `'monthly'` type, uses `addMonths()` from date-fns instead of `addDays()`. `getEffectiveDueDate()` reads `month_number` from the experience object. `getUrgency()` has a new `'monthly'` case with more relaxed thresholds (red <= 3 days, yellow <= 7 days vs red <= 2 days for initial types). New functions: `getMonthlyExperiences()`, `getActiveStageMonthly()`, `getVisibleMonthlyExperiences()` (sliding 3-node window), `getNextMonthlyDeadline()`.

4. **Queries** (`lib/queries.ts`) — `createClientWithExperiences()` now inserts 17 additional monthly rows (months 2–18) alongside the initial 3 (monthly inserts are done separately so they fail silently if the migration hasn't been applied). New `backfillMonthlyExperiences(clients)` function creates missing monthly rows for pre-existing clients at runtime (called on initial load, gated behind `checkMonthlyMigration()`). New `checkMonthlyMigration()` function probes for the `month_number` column to determine if the migration has been applied.

#### UI Components

5. **Tab system** (`components/dashboard-header.tsx`) — Added "Lifecycle" button between Onboarding and Archived in the segmented control.

6. **Dashboard state** (`components/client-dashboard.tsx`) — Handles `'lifecycle'` tab: shows `OngoingSummaryRow` instead of `SummaryRow`, checks migration status on load and conditionally calls `backfillMonthlyExperiences`, shows `MigrationBanner` if migration is pending, computes lifecycle summary counts via `computeOngoingSummaryCounts` (useMemo), passes `activeTab` to `CalendarModal` for default toggle state, resets sort option on tab switch if invalid for the new tab.

7. **Lifecycle summary** (`components/ongoing-summary-row.tsx`) — New component with 4 cards reflecting relationship health rather than strict urgency:
   - **Up to Date** (emerald): Clients with all due monthly experiences completed.
   - **Due Soon** (blue): Clients with a monthly experience due within 7 days.
   - **Overdue** (red): Clients with at least one overdue pending monthly experience.
   - **Completion Rate** (violet/amber/red depending on %, based on 80%/50% thresholds): Aggregate percentage of completed monthly experiences across all clients.
   Each count is clickable to filter the client list.

8. **Client row** (`components/client-row.tsx`) — Detects `activeTab === 'lifecycle'` to switch between initial mode (3 fixed types) and lifecycle mode (3 monthly experiences from `getVisibleMonthlyExperiences()`). Renders a History button (clock icon) in the left column when in lifecycle mode, which opens `MonthlyHistoryModal`. Track gradient and segment statuses now take an `exps` array parameter rather than always using `EXPERIENCE_TYPES`, so they adapt to whichever 3 experiences are displayed.

9. **Timeline node** (`components/timeline-node.tsx`) — Uses `getExperienceLabel(experience)` instead of `EXPERIENCE_LABELS[expType]` for the top-zone label, so monthly nodes display "5-Month" etc. `isFuture` determination updated: for monthly, a node is future if it's pending but not the active stage (instead of comparing indices in `EXPERIENCE_TYPES`). Auto-fail logic (marking earlier pending as failed when a later node is marked done) now handles monthly experiences by comparing `month_number` values instead of `EXPERIENCE_TYPES` indices.

10. **Monthly history modal** (`components/monthly-history-modal.tsx`) — New Dialog modal listing all 17 monthly experiences for a client in a scrollable vertical list. Each row shows: status icon (colored: blue pending, green done, amber late, red overdue), month label ("2-Month", "3-Month", ...), status text, due date, and completion date if done. A notes dot indicator appears if the experience has notes. Clicking any row opens `ExperienceDetailModal` for that month, with `NotesModal` accessible from within. Opened via the History button on client rows in the Lifecycle tab.

11. **Experience detail modal** (`components/experience-detail-modal.tsx`) — Uses `getExperienceLabel(experience)` for the header. Auto-fail logic updated to handle monthly experiences (by `month_number` comparison). `dueAt` useMemo dependencies include `experience.month_number` and `client.initial_intake_date` so intake-date anchor changes recalculate immediately.

12. **Notes modal** (`components/notes-modal.tsx`) — Uses `getExperienceLabel(experience)` for the header instead of `EXPERIENCE_LABELS[experience.experience_type]`.

13. **Calendar** (`components/calendar-modal.tsx`, `components/calendar-day-cell.tsx`) — Calendar now accepts an `activeTab` prop. Monthly experiences are included in the event data (alongside initial types). New **"Lifecycle visible/hidden"** toggle button in the calendar header (violet highlight when visible) — defaults to visible when opened from the Lifecycle tab, hidden when opened from Onboarding tab. `CalendarEvent` interface now has optional `monthNumber` field. `CalendarDayCell` generates dynamic short labels for monthly chips (e.g. "5mo") and uses `getExperienceLabel()` for the full tooltip label. Event keys changed from `clientId-experienceType` to `clientId-experienceId` to avoid collisions with multiple monthly experiences.

14. **Controls bar** (`components/controls-bar.tsx`) — Sort options are now tab-aware: Onboarding tab shows the original 6 sort options; Lifecycle tab shows Name A→Z, Name Z→A, and "Next Monthly Deadline". The Actions dropdown (Add Client, Import JSON) is hidden on the Lifecycle tab since clients are managed from the Onboarding tab. Search placeholder adapts per tab ("Search lifecycle clients...").

15. **Client list** (`components/client-list.tsx`) — Added "Monthly" to the deadline sort labels for the "All Complete" empty state. Section heading shows "Lifecycle Clients" when on the Lifecycle tab.

16. **Summary row** (`components/summary-row.tsx`) — `CARD_STYLES` record type narrowed from `Record<ExperienceType, ...>` to `Record<InitialExperienceType, ...>` to avoid a type error now that `ExperienceType` includes `'monthly'`.

#### Migration Notes

The two-step migration is required because of two PostgreSQL constraints:

1. **Enum commit requirement**: `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that references the new value. The Supabase SQL Editor runs all statements in a single transaction, so Step 1 (DDL) must be committed before Step 2 (DML referencing `'monthly'`).

2. **Unique constraint conflict**: The original unique constraint on `(client_id, experience_type)` only allowed one row per experience type per client, which blocked inserting 17 monthly rows. Step 2 replaces it with a composite index including `COALESCE(month_number, 0)`.

After the migration is applied, `backfillMonthlyExperiences()` handles any future gaps automatically on page load, and `createClientWithExperiences()` creates all 20 experience rows (3 initial + 17 monthly) for new clients. No manual SQL is needed going forward.

### Tab Rename: Active → Onboarding, Ongoing → Lifecycle (Feb 19, 2026)

Renamed the two main tabs for clarity:
- **"Active" → "Onboarding"** — reflects that this tab tracks the initial onboarding milestones (24-Hour, 10-Day, 30-Day).
- **"Ongoing" → "Lifecycle"** — reflects that this tab tracks the longer-term monthly relationship milestones.

**What changed**:
- `ActiveTab` type values in `lib/types.ts`: `'active'` → `'onboarding'`, `'ongoing'` → `'lifecycle'`.
- All string comparisons across 6 components updated to match the new values.
- All user-facing labels updated: tab buttons, section headings ("Onboarding Clients", "Lifecycle Clients"), summary headers ("Lifecycle Summaries"), search placeholders, calendar toggle ("Lifecycle visible/hidden"), migration banner text.

**What did NOT change**:
- The `ActiveTab` type *name* is unchanged (it refers to "which tab is active", not the page called "Active").
- Experience-node terminology: "active stage", "active deadline", `isActiveStage`, `getActiveStage()`, `getNextActiveDeadline()`, "Next Active Deadline" sort option — all still use "active" to mean the currently-pending experience node.
- Internal variable names: `isOngoing`, `ongoingSummaryOpen`, `OngoingSummaryRow`, `computeOngoingSummaryCounts`, `ongoing-summary-row.tsx` — these still reference the legacy "ongoing" name. They are code-internal and never appear in the UI.

**Potential confusion points**: If a future change introduces new string comparisons for tab values, use `'onboarding'` / `'lifecycle'` / `'archived'` (not the old `'active'` / `'ongoing'`). The internal variable `isOngoing` checks `activeTab === 'lifecycle'`, which may read oddly but is correct.

### Lifecycle Active Node Gating & Color Consistency (Feb 19, 2026)

1. **Lifecycle nodes gated behind 30-day completion** (`lib/deadlines.ts`) — `getActiveStageMonthly()` now checks whether the client's `day30` experience has been resolved (DB status is `'yes'` or `'no'`, not still `'pending'`) before returning an active monthly stage. If the 30-day experience is still pending, the function returns `null`, causing all monthly nodes on the Lifecycle page to render as small greyed-out inactive/future nodes. Once the 30-day is resolved (completed on time or explicitly failed), the first pending monthly node becomes the active blue node.

2. **Calendar event pills follow active/inactive color logic** (`components/calendar-day-cell.tsx`, `components/calendar-modal.tsx`) — `CalendarEvent` interface now includes `isActive: boolean`. A new `pending_inactive` chip style (grey background, muted text, border-border) is used when `derivedStatus === 'pending' && !isActive`. The calendar modal computes `isActive` per event by calling `getActiveStage()` for onboarding experiences and `getActiveStageMonthly()` for monthly experiences. This means inactive pending nodes (both onboarding and lifecycle) appear grey in the calendar instead of blue.

3. **Detail modal respects active/inactive state** (`components/experience-detail-modal.tsx`) — New optional `isActiveStage` prop (defaults to `true`). When `derivedStatus === 'pending'` and `isActiveStage` is `false`, the countdown hero section uses grey/muted styling instead of blue. This prop is now passed from all three call sites:
   - `timeline-node.tsx` — passes its existing `isActiveStage` prop through.
   - `calendar-modal.tsx` — tracks the clicked event's `isActive` flag in state and passes it.
   - `monthly-history-modal.tsx` — computes from `getActiveStageMonthly()` and passes it.

4. **Monthly history modal active/inactive styling** (`components/monthly-history-modal.tsx`) — `STATUS_STYLES` and `StatusIcon` now support a `pending_inactive` variant with grey styling and a grey clock icon, using the same `getStyleKey(derived, isActive)` pattern. Each row's `isActive` is computed by comparing `exp.month_number` to `getActiveStageMonthly(client, now)`.

5. **Experience history modal includes onboarding** (`components/monthly-history-modal.tsx`) — The modal (still named `MonthlyHistoryModal` internally) now shows all experiences, not just monthly ones. The three initial onboarding experiences (24-Hour, 10-Day, 30-Day) are rendered at the top in a group with a left accent border (`border-l-2 border-muted-foreground/25`), followed by a horizontal divider, then the lifecycle rows. Active/inactive coloring is applied to onboarding rows using `getActiveStage()`. Modal title changed from "Monthly History" to "Experience History". Labels use `EXPERIENCE_LABELS[exp.experience_type]` for onboarding rows and `getMonthlyLabel(exp.month_number)` for lifecycle rows.

### Inactive Overdue Node Display Fix (Feb 19, 2026)

Fixed timeline nodes for experiences that are overdue but not the "active" stage — e.g., when unarchiving clients who were archived before the Lifecycle page existed, their past-due nodes appeared as empty circles with no date or countdown.

1. **New `isInactiveOverdue` state** (`components/timeline-node.tsx`) — A boolean computed as `!isActiveStage && isOverdue`. Previously, these nodes fell through all rendering branches and appeared as blank small circles. With this flag, they now have explicit rendering:
   - **Circle**: Small (48px) with a red border (`border-red-500/60`) and red hover glow, using opaque `bg-card` background.
   - **Countdown inside circle**: Shows compact late duration (e.g., "-3mo 12d") in `text-red-500/70` via `formatDurationCompact(secondsRemaining)`.
   - **Label**: Experience type header styled `text-red-400/70` (muted red) to indicate overdue-but-inactive status.
   - **Due date below circle**: Shows the due date string in `text-red-500/60`.

2. **`futureCountdown` memo extended** (`components/timeline-node.tsx`) — The memo that computes stacked countdown text (`{ line1, line2 }`) now fires for both `isFuture` and `isInactiveOverdue` nodes, so overdue-inactive nodes display their late duration inside the circle.

### Client Row Flag Colors (Feb 19, 2026)

Added the ability to "flag" a client row with a color, making it visually stand out. The flag color persists across Onboarding and Lifecycle tabs and survives page refreshes (stored in DB).

#### Database

1. **Migration** (`supabase/migrations/20260219_add_flag_color.sql`) — Single statement: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS flag_color text DEFAULT NULL`. Apply via Supabase SQL Editor.

#### Types

2. **`Client` interface** (`lib/types.ts`) — Added `flag_color: string | null`.

3. **`FLAG_COLORS` constant** (`lib/types.ts`) — Array of 7 color options, each with `key` (stored in DB), `label` (display name), and `rgb` (CSS RGB triplet for styling):
   - Red (`239,68,68`), Orange (`249,115,22`), Amber (`245,158,11`), Green (`34,197,94`), Blue (`59,130,246`), Purple (`168,85,247`), Pink (`236,72,153`).

#### UI

4. **Context menu component** (`components/ui/context-menu.tsx`) — New Shadcn-style wrapper around Radix UI `ContextMenu` primitives, following the same pattern as `dropdown-menu.tsx`. Exports `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`.

5. **Client row flagging** (`components/client-row.tsx`) — Right-clicking a client row opens a context menu with:
   - A "Flag Color" label and a row of 7 color swatches (small circles styled with the `rgb` value from `FLAG_COLORS`). The active flag shows a white `Check` icon overlay.
   - A "Clear Flag" option (with `X` icon) that appears when a flag is active.
   - `handleFlagChange(color)` updates the local state optimistically via `updateClientLocal` and persists to Supabase via `updateClient`.

6. **Row flag styling** (`components/client-row.tsx`) — When a flag is active, the row gets a solid semi-transparent background applied via inline `backgroundColor: rgba(R,G,B,0.13)`. The left `w-1` accent strip is also tinted with the flag color at 50% opacity. **Note**: This was originally a 5-stop `linear-gradient` on `backgroundImage`, but was simplified to a solid `backgroundColor` to avoid GPU texture exhaustion — see "GPU-Safe Pulse Animation" section.

### Monthly Node Fixed-Group Windowing (Feb 19, 2026)

1. **Fixed-group window replaces sliding window** (`lib/deadlines.ts`) — `getVisibleMonthlyExperiences()` previously anchored a 3-node window to the first pending/failed monthly experience. When a node was completed, it immediately disappeared as the window slid forward. Now, monthly experiences are chunked into fixed groups of 3 in `month_number` order: [2,3,4], [5,6,7], [8,9,10], [11,12,13], [14,15,16], [17,18]. The function returns the first group containing at least one pending/failed node. Completing a node within a group keeps it visible as complete until all 3 are done, then the window advances to the next group.

### Header Restructure: Dropdown Menu & Color-Coded Tabs (Feb 19, 2026)

1. **Color-coded inactive tab buttons** (`components/dashboard-header.tsx`) — Inactive tab buttons now have distinct muted background colors: Onboarding is soft green (`bg-green-100 text-green-700` / dark: `bg-green-900/40 text-green-300`), Lifecycle is soft blue (`bg-blue-100 text-blue-700` / dark: `bg-blue-900/40 text-blue-300`). Active tab remains the default solid style (unchanged).

2. **Header dropdown consolidation** (`components/dashboard-header.tsx`) — The Archived tab button, standalone `ThemeToggle`, and sign-out icon button were removed from the top-level header. They are now consolidated into a single `DropdownMenu` triggered by a `MoreHorizontal` (three dots) icon button. The dropdown contains: "Archived" menu item (with `Archive` icon, highlighted with `bg-accent` when active), a theme toggle item (shows "Dark mode" / "Light mode" with Sun/Moon icon using `useTheme` from `next-themes` directly), a separator, and "Sign out" (with `LogOut` icon). The `ThemeToggle` component import was removed; `useTheme` is now called directly in `DashboardHeader`. Only the Onboarding and Lifecycle buttons remain in the visible tab pill group.

### GPU-Safe Pulse Animation Fix (Feb 19, 2026)

Fixed a critical Chrome GPU crash that turned the entire browser solid red (`rgb(239,68,68)`) when multiple client rows were flagged red on the Lifecycle tab. The crash only occurred on the Vercel production deployment, not locally.

**Root cause**: The combination of three factors overwhelmed Chrome's GPU compositor:
1. **Animated `box-shadow` values** — The old `animate-pulse-red` / `animate-pulse-blue` CSS keyframes animated `box-shadow` spread and blur values at 60fps. Each animated `box-shadow` triggers a full GPU repaint every frame. With 8+ overdue nodes running this animation simultaneously, that's ~480 full GPU repaints per second.
2. **Complex flag gradients** — Red-flagged rows used a 5-stop `linear-gradient` as `backgroundImage`, requiring GPU texture interpolation for each row.
3. **1-second React re-render cycle** — The `setNow()` timer updates state every second, causing React to re-render all rows and invalidate GPU-cached textures. The GPU never got time to reclaim memory.

In production (Vercel), all elements render simultaneously on page load, creating a GPU texture spike that dev mode's incremental HMR loading avoids.

**What changed**:

1. **`app/globals.css`** — Replaced `@keyframes pulse-blue` / `pulse-red` (which animated `box-shadow` values) with `@keyframes pulse-ring` (which animates only `opacity`). New `.pulse-ring-blue` / `.pulse-ring-red` classes have a *static* `box-shadow` and use the `opacity` animation. Old `.animate-pulse-blue` / `.animate-pulse-red` classes were removed entirely.

2. **`components/timeline-node.tsx`** — The pulse effect is now applied via a separate `<span className="pulse-ring-red">` overlay element (positioned `absolute -inset-1 rounded-full`) inside the circle, instead of directly on the circle div. Removed `overflow-hidden` from the active circle (not needed for small text in a 110px circle, and it would clip the ring overlay's box-shadow).

3. **`components/client-row.tsx`** — Replaced the 5-stop `linear-gradient` on `backgroundImage` with a simple `backgroundColor: rgba(R,G,B,0.13)`. A solid color is trivially GPU-cached vs. a gradient requiring interpolation.

**Why `opacity` is safe but `box-shadow` is not**: In Chrome's rendering pipeline, `opacity` changes are handled entirely by the compositor thread — no repaint, no layout, no GPU texture reallocation. Animated `box-shadow` values require the browser to repaint the element's layer every frame (recalculating blur, spread, and color blending from scratch), which is extremely GPU-intensive when multiplied across many elements.

**Rules for future changes**:
- **NEVER animate `box-shadow` values** in CSS keyframes. Animate `opacity` or `transform` instead (both are compositor-only properties).
- **Avoid complex `linear-gradient` on frequently-rerendered elements**. The 1-second timer means every visible element is repainted every second; prefer solid `backgroundColor` with alpha transparency.
- **Test on Vercel (production) before considering animation changes safe**. Dev mode (Turbopack + HMR) loads elements incrementally, hiding GPU issues that only appear when everything renders simultaneously.

### Calendar Today Pulse Color Change (Feb 19, 2026)

1. **Amber/gold pulse** (`app/globals.css`) — The `today-cell-pulse` keyframe animation was changed from blue (`rgba(59,130,246,0.12)`) to amber/gold (`rgba(251,191,36,0.18)`) for better contrast against the dark calendar background. The 4-second cycle and `ease-in-out` timing remain the same.

### 24-Hour Warning Border for Pending Nodes (Feb 23, 2026)

Active pending nodes that are within 24 hours of their deadline now show a **yellow** outer pulse ring instead of blue, providing an at-a-glance urgency indicator. The inner node circle border remains blue (`border-blue-500`).

1. **New `isWithin24Hours` boolean** (`components/timeline-node.tsx`) — Computed as `!isOverdue && derivedStatus === 'pending' && secondsRemaining <= 86400` (24 × 60 × 60). This is `true` only for non-overdue pending nodes with 24 hours or less remaining.

2. **Yellow pulse ring via inline style override** (`components/timeline-node.tsx`) — The pulse ring `<span>` always uses the `pulse-ring-blue` CSS class (for its animation keyframe reference and `.group:hover` hide behavior). When `isWithin24Hours` is true, an inline `style={{ boxShadow: '0 0 0 3px rgba(234,179,8,0.45), 0 0 14px rgba(234,179,8,0.2)' }}` overrides the blue box-shadow with yellow. Inline styles take CSS precedence over class styles, so the yellow shadow renders while the animation and hover behavior from `pulse-ring-blue` remain intact.

3. **`pulse-ring-yellow` CSS class** (`app/globals.css`) — A `.pulse-ring-yellow` class is also defined alongside `.pulse-ring-blue` and `.pulse-ring-red`, and included in the `.group:hover` hide rule. However, the inline style approach in the component is the primary mechanism because Turbopack's CSS processing does not reliably pick up newly-added custom CSS classes without a dev server restart.

4. **No changes to overdue or non-pending nodes** — Overdue nodes (red) and non-active/future nodes are unaffected. The yellow ring only applies to the active pending node when `secondsRemaining <= 86400`.

### Intake Date Anchoring + 10-Day Migration Hardening (Feb 26, 2026)

1. **Initial intake data model** (`lib/types.ts`, `supabase/migrations/20260226_add_initial_intake_and_day10.sql`) — Added `clients.initial_intake_date` and `clients.initial_intake_pulse_enabled` (default `true`). The migration also adds enum value `day10` and migrates `client_experiences.experience_type` rows from `day14` to `day10`.

2. **Default due-date anchor rules** (`lib/deadlines.ts`) — `getEffectiveDueDate()` now enforces:
   - `custom_due_at` always wins (never overridden)
   - `hour24` and `day10` anchor to `initial_intake_date` when set, fallback to `signed_on_date`
   - all other experience types stay anchored to `signed_on_date`

3. **Legacy DB compatibility** (`lib/queries.ts`) — Added fallback behavior for partially migrated databases:
   - `fetchClients()` normalizes legacy `day14` rows to `day10` in app state
   - `createClientWithExperiences()` falls back when intake columns and/or `day10` enum are not yet available
   - `updateClient()` falls back for missing intake columns and returns `false` for intake-only updates against non-migrated schemas

4. **Intake reminder toggle placement** (`components/client-row.tsx`, `components/experience-detail-modal.tsx`) — For blank intake values, `Pulse reminder: On/Off` is now hidden in row actions instead of inline in the date column, reducing visual clutter. It is available in:
   - row `...` dropdown (with bell icon state: `BellRing` / `BellOff`)
   - Experience Detail modal (`Intake reminder pulse when blank`)

5. **Three-state intake display semantics** (`components/client-row.tsx`, `app/globals.css`) — The Initial Intake row now uses explicit states:
   - `set`: blue text
   - `missing_warn` (blank + pulse enabled): amber text with pulse reminder treatment
   - `missing_muted` (blank + pulse disabled): muted slate text, no pulse, and value label `N/A` (instead of `Not set`)
   Pulse reminder styling keeps an amber-tinted background with a blue pulse border.

6. **Date-row visual polish** (`components/client-row.tsx`) — Signed-on and initial-intake rows are aligned on the same left edge, with distinct text weight/shade for quick scanning.

7. **Name/date divider polish** (`components/client-row.tsx`) — Added a subtle divider between client name and date metadata. Divider width now follows measured rendered name width (including wrapped names) via `ResizeObserver`, rather than fixed-width buckets.

8. **Persistence failure feedback** (`components/client-row.tsx`, `components/experience-detail-modal.tsx`) — Intake date and pulse toggles now show toasts and rollback optimistic local state if DB persistence fails.

9. **Migration execution note** — In Supabase SQL editor, the `day10` migration must be run in two executions due to PostgreSQL enum commit requirements:
   - Step 1: add intake columns + add enum value `day10`
   - Step 2: update `client_experiences` rows from `day14` to `day10`

### Person Links + Bulk Import (Feb 27, 2026)

1. **New table for external links** (`supabase/migrations/20260227_add_client_people_links.sql`) — Added `client_people_links` with `client_id`, `display_name`, `person_id`, `sort_order`, timestamps, `(client_id, display_name)` uniqueness, and `updated_at` trigger.

2. **Client fetch now includes person links** (`lib/types.ts`, `lib/queries.ts`) — `ClientWithExperiences` now includes `client_people_links`. `fetchClients()` loads person links via a dedicated `client_people_links` query and merges by `client_id` (instead of relying on embedded relation selects), then normalizes sort order by `sort_order`.

3. **Row right-click links** (`components/client-row.tsx`) — Existing row context menu now shows an **Open in C-Street Brain** section above **Flag Color**. Each person entry opens `https://cstreet-brain.vercel.app/?personId=<person_id>` in a new tab/window. This works from right-click anywhere on the row because it reuses the existing row-wide `ContextMenuTrigger`.

4. **Hidden row-level editor** (`components/client-row.tsx`, `components/manage-person-links-dialog.tsx`) — Added `Person ID Links` to the row kebab menu (`...`). Dialog title is `Person ID Links`; it supports add/edit/delete/reorder and saves via optimistic local update plus Supabase CRUD helpers (`createClientPersonLink`, `updateClientPersonLink`, `deleteClientPersonLink`).

5. **Import JSON supports person-link mode** (`components/import-clients-dialog.tsx`, `lib/queries.ts`, `components/controls-bar.tsx`, `components/client-dashboard.tsx`) — Existing Import modal now has two modes: `Clients` and `Person Links`. Person-link imports use payload shape `{ client_name, people[] }` and apply Option A merge semantics: match exact `client_name`, upsert by `display_name`, update `person_id` when changed, preserve unspecified existing people.

6. **Import modal overflow handling** (`components/import-clients-dialog.tsx`) — Dialog now uses a fixed max height (`max-h-[85vh]`) with a scrollable body region and sticky footer actions so large pasted JSON arrays remain usable.

7. **Import reliability + diagnostics** (`lib/queries.ts`, `components/import-clients-dialog.tsx`) — Person-link imports now write with bulk `upsert(..., { onConflict: 'client_id,display_name' })` and report failed-client counts in the modal summary. If `client_people_links` migration is missing, Supabase returns `PGRST205` (`table not in schema cache`), and imports cannot proceed until migration SQL is applied.

8. **Context-menu accidental-open guard** (`components/client-row.tsx`) — Added a short timing guard after context-menu open to prevent immediate accidental navigation caused by the same right-click gesture selecting the first menu item on some systems.

---

## Running Locally

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000` (configured in `package.json` via `--port 3000`). Requires Supabase credentials in `.env.local`.

---

## Build

```bash
npm run build
```

Uses Turbopack. Google Fonts (Geist, Geist Mono) are fetched at build time — requires network access.
