# C-Street Dump Dev Notes

This file is an agent-focused handoff log for implementation details that are easy to miss when only reading product docs.

## Scope

- Feature root: `features/task-dump/`
- Route: `app/c-street-dump/`
- API: `app/api/task-dump/route.ts`
- Client data layer: `lib/task-dump-queries.ts`
- Types/constants: `lib/task-dump-types.ts`
- Schema migration: `supabase/migrations/20260306_create_c_street_dump.sql`

## Current Editing Model (Important)

- Main editor component is `features/task-dump/markdown-composer.tsx`.
- Editor now uses a native `textarea` in default mode (not `contentEditable`).
- Default mode is **Edit** (raw markdown/plain text while typing).
- `MD` mode is **Preview** (rendered markdown, read-only) using `marked`.
- Persisted data remains markdown text; no HTML->markdown conversion path exists now.
- Modal composer instances currently use `toolbarVariant="inline"` from `features/task-dump/task-dump-app.tsx` (static toolbar).

## Toolbar Behavior

- The old floating/right-click formatting menu is intentionally replaced by an inline toolbar for modal fields.
- Toolbar is static/always visible for modal fields (`inline`), not focus-only.
- Toolbar action set is:
  - bold
  - italic
  - underline
  - bullet list
  - numbered list
  - checkbox list
  - divider
- Toolbar actions insert markdown syntax into the textarea selection.
- The right-side `MD` button includes an eye icon and toggles Edit <-> Preview mode.

## Autosave and Sync Guardrails

Autosave behavior is distributed between:

- `features/task-dump/task-dump-app.tsx` (queueing/debouncing/API save orchestration)
- `features/task-dump/markdown-composer.tsx` (local edit buffer + blur flush)

Key protections already in place:

- Debounced save queues for task/thought/block updates.
- Version guards (`*SaveVersionRef`) to ignore stale API responses that return after newer edits.
- Composer no longer syncs parent state during keystrokes; modal text flushes on blur (and on MD toggle to Preview).
- Temporary blank-state deferral for task/thought saves:
  - If both title and body/content are empty, autosave is deferred.
  - This prevents validation churn while user clears text and rewrites from scratch.

## Validation Constraint to Remember

Server/API logic enforces non-empty task/thought content:

- A task needs at least title or body.
- A thought needs at least title or content.

If touching validation flow:

- Coordinate changes across:
  - `app/api/task-dump/route.ts`
  - DB check constraints in `supabase/migrations/20260306_create_c_street_dump.sql`

## UI Changes Already Landed

- Columns/cards have per-status visual differentiation.
- Task cards use cleaned body preview text (markdown markers stripped for column card display).
- Collapsed Thoughts panel was redesigned to a cleaner rail-style collapsed state.

## Known Fragility Areas

1. **Preview rendering safety**
   - `MD` preview uses `dangerouslySetInnerHTML` with `marked` output.
   - If preview behavior changes, validate link and checkbox rendering paths in all editors.

2. **Textarea selection transforms**
   - Toolbar operations depend on `selectionStart/selectionEnd` + `setRangeText`.
   - If shortcut/insert behavior regresses, verify cursor restore offsets and selected-range handling.

3. **Debounce interplay**
   - Editor-local debounce was removed; save queue debounce remains in app-level orchestration.
   - If edits feel laggy or revert, check stale response apply paths and queue version guards first.

## Practical Rules for Future Agents

- Prefer minimal edits in `markdown-composer.tsx`; small selection/cursor changes can regress insertion behavior.
- If changing toolbar UX, verify in all three modal editors:
  - task description
  - workspace block content
  - thought content
- Keep docs in sync:
  - `features/task-dump/README.md`
  - `features/task-dump/ARCHITECTURE.md`
  - this file

## Manual Smoke Test Checklist

After editing this feature, run through:

1. Open task modal -> type plain text quickly (no cursor jumps).
2. Toggle bold/italic/underline on and off with caret in same line.
3. Apply list formats and move between lines.
4. Paste markdown text (`**bold**`, lists, links) in Edit mode and confirm raw syntax is visible while editing.
5. Click `MD` and confirm rendered markdown preview (no raw syntax shown).
6. Return to Edit mode and confirm cursor/focus still behave normally.
7. Clear task body completely with empty title, then rewrite text from scratch (no forced modal close/errors while rewriting).
8. Repeat quick edits in thought modal and workspace block editor.
9. Confirm task card previews do not show raw markdown markers.

## Notes Log (Latest)

- Inline/static toolbar mode is now the expected modal experience.
- Legacy right-click hidden formatting guidance is outdated and should not be reintroduced without strong reason.
- `execCommand` path has been removed from the composer; current editor model is textarea-based.
- If a future refactor reintroduces rich DOM editing, document the migration details here before merging.

## Update Log - 2026-03-10 (Task Flow + Context Menu Controls)

### Task card interactions (overview columns)

- Drag-and-drop remains intentionally absent.
- Task delete is now context-menu only on cards:
  - Right-click a task card to open actions.
  - `Delete task` lives in the context menu (red action).
  - No always-visible trash icon on card chrome.
- Status stepping is still one-click on card edge controls:
  - skinny tail arrows (`ArrowLeft` / `ArrowRight`) remain on the card.
  - move forward/backward between `Pending` -> `In Progress` -> `Done`.
  - status change shows toast with `Undo`.

### In-column ordering (new)

- Right-click task card menu now includes in-column move controls:
  - up/down arrows displayed side-by-side (not stacked).
  - controls are disabled at column boundaries.
  - hover state is intentional (`hover:bg-accent` + brighter icon) for click affordance.
- Reorder persistence path:
  - UI updates optimistically for same-column order.
  - persisted through `reorderTaskDumpTasks(...)` in `lib/task-dump-queries.ts`.
  - failure path shows toast and reloads snapshot.

### Workspace panel behavior in task modal

- Workspace section now defaults to expanded when opening a task that already has one or more workspace blocks.
- Tasks with zero workspace blocks still open with Workspace collapsed.

### URL handling in editable text fields

- `MarkdownComposer` now linkifies plain `http/https` URLs in editable content.
- Clicking links in editor content opens a new window/tab (`_blank`) with `noopener,noreferrer`.
- Preview-mode anchors are normalized to also open in new tab/window.

### Workspace note placeholder

- Workspace note editor placeholder is now `Write a note...`.
- Placeholder is intentionally dimmer (`text-foreground/45`) to provide a clear but low-noise click target cue.

## Update Log - 2026-03-09 (Radical Minimal Pass)

This section captures the latest redesign decisions now live on `main` and deployed to Vercel.

### Route scope and visual language

- Scope remains strictly `/c-street-dump`.
- Theme for this route is forced via `html.cstreet-mono` and removed on unmount.
- Monochrome tokens are route-specific overrides in `app/globals.css` using explicit black/white values.
- Typography for this route:
  - body: `"Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif`
  - body weight: `400`
  - heading weight: `500`

### Core interaction model changes

- Drag-and-drop has been fully removed from the task board.
  - No `DndContext`, `useSortable`, `useDroppable`, or reorder API flow.
  - No drag handles on cards.
  - Status changes are expected to happen in task modal controls.
- Do not reintroduce drag-drop without explicit product request.

### Quick Dump control strip (current canonical behavior)

- Quick dump row structure is intentionally:
  - `Flag | Due | Formatting cluster` with attach icon pushed to far right.
- Formatting icons are a single grouped cluster (no separators between each icon).
- Attach action is icon-first and right-aligned; file count appears only when attachments exist.

#### Flag selector specifics (easy to regress)

- Trigger shows icon + `SelectValue`.
- Chevron is hidden only for the trigger icon (`[&>svg]:hidden`), not all nested SVGs.
- Display semantics:
  - `none` value displays as `Flag`
  - selected values display only `Low` / `Medium` / `High`
- Priority color cue on quick-dump selector:
  - text changes color by selected priority
  - icon stays neutral
- Dropdown options map `none` to label `Flag` in this control context.

### Cards/columns status signaling

- Column rails are ultra-thin pseudo-element hairlines (`before:w-px` + `before:scale-x-50`) with status color.
- Per-card top status bars are removed.
- Status at-a-glance now comes from:
  - column rail color
  - priority text color on cards

### Thoughts panel behavior

- Thoughts panel collapse/expand is removed for now.
- Panel is always open in desktop layout.
- Any previous `thoughtsOpen` toggle/collapse rail behavior is obsolete.

### Modal readability decisions

- Modal border contrast intentionally brighter than earlier passes:
  - `border-foreground/28` on task/thought/attachment dialogs.
- Header timestamp semantics are explicit and intentionally weighted:
  - `Created ...` brighter (`text-foreground/65`)
  - separator dot (`•`)
  - `Updated ...` dimmer (`text-foreground/25`)
- This labeling is present in both task and thought dialogs.

### Composer surface decisions (still current)

- `MarkdownComposer` remains `contentEditable`-based in this branch state.
- Surfaces are borderless/transparent in task-dump contexts.
- Inline toolbar retained for modal editors.
- Quick dump uses `toolbarVariant="hidden"` and external formatting buttons.

### Placeholder and microcopy decisions

- Quick dump body placeholder is `Write a task...` (not `Drop a task here...`).
- Quick dump due button label is `Due` (not `Due date`).
- Thoughts quick input placeholder remains `Drop a thought here...`.

### Agent guardrails for future edits

- If touching quick-dump select/trigger classes, verify:
  1. Flag icon remains visible.
  2. Dropdown opens/closes reliably.
  3. Trigger label does not duplicate (`Flag No flag` regression).
  4. Separator spacing rhythm matches adjacent controls.
- If touching modal header metadata, preserve explicit `Created` vs `Updated` labels unless requested otherwise.
- Before merging future visual passes, smoke-test in both light and dark route modes because `cstreet-mono` overrides both.

## Update Log - 2026-03-08

### Performance fixes (modal typing choppiness)

- Root cause identified: body updates were propagating to global task snapshot while typing, causing broad list/card rerenders.
- In `task-dump-app.tsx`:
  - Wrapped `TaskCard` in `React.memo`.
  - Wrapped `TaskColumn` in `React.memo`.
  - Stabilized delete handler with `useCallback`.
  - Removed per-card inline open/delete closures by passing stable handlers and task IDs.
- In `markdown-composer.tsx`:
  - Removed controlled-typing state loop for the editor text.
  - Switched editor input to an uncontrolled `textarea` for native typing performance.
  - Parent sync now happens on blur (and when switching to Preview), not during keystrokes.

### Markdown UX mode changes

- Composer now has two explicit modes:
  - **Edit**: raw markdown/plain text visible while typing.
  - **Preview (MD)**: rendered markdown view.
- Toolbar buttons insert markdown syntax at selection using native textarea APIs.
- Added eye icon next to `MD` toggle for preview affordance.

## Task Modal Finalized UX Notes (Mar 2026)

These are the key outcomes from the long modal redesign thread. Read this before changing `TaskDialog`.

- Header/title:
  - Title is inline-editable in the modal header (not a standard boxed `Input` control by default).
  - Header actions are in a kebab menu (quick links + delete).
  - "Created" and "Updated" metadata remain under title, with `Updated` visually muted.
- Main body editor:
  - Section label above main editor is removed; placeholder text is `Task Details...`.
  - Placeholder visibility was fixed to update from editor DOM state on input, so it should disappear immediately on first keystroke (no overlay lag while typing).
  - Main body editor has max-height scroll behavior; it should not grow forever.
- Workspace structure:
  - `Workspace blocks` was renamed to `Workspace`.
  - Add action is `Add Note`.
  - Notes use `Note 1`, `Note 2`, etc. as labels.
  - Per-note delete icon was removed from always-visible chrome and moved into a per-note dropdown action menu.
  - Workspace note titles were removed from the UI.
- Formatting toolbar:
  - Editor toolbar is inline/static (`toolbarVariant="inline"`), and remains visible in modal editors.
  - This applies to task body, workspace note body, and thought content.
- Copy UX:
  - Copy controls exist for main task body and each workspace note body.
  - Copy icon flips to a checkmark on success.
- Scrollbars:
  - Custom scrollbar treatment is centralized under `.subtle-scrollbar` in `app/globals.css`.
  - Keep scrollbars neutral so they do not conflict with workspace rail semantics.
- Rails and status theming:
  - Workspace notes use full-height square-ended rails (`border-l-2`, no rounded marker tips).
  - Modal status theme is now intended to be literal to card family (pending / in_progress / done):
    - header + border + rails are status-aware
    - divider should remain neutral
    - scrollbar remains neutral
    - interior reading surfaces should stay readable and not be heavily washed.

## Critical Regression Fixed During Modal Work

- Workspace block partial update bug (`app/api/task-dump/route.ts`):
  - `updateTaskBlock` previously overwrote unspecified fields, causing title/content to appear to "disappear" depending on edit order.
  - Behavior now preserves existing values when a field is omitted (same pattern as thought update flow).
  - If this regresses, users will report: "when I edit title, body disappears; when I edit body, title disappears."

## Critical Backend Notes (Mar 2026)

These changes were made after repeated runtime errors and are easy to regress if someone "cleans up" names later.

### 1) Do NOT use custom Supabase schema access for this feature

- Previous approach used `supabase.schema('task_dump')` and `task_dump.*` tables.
- This caused runtime errors like `Invalid schema: task_dump` in this project environment.
- Current stable approach uses **public table namespace** with prefixed names:
  - `public.task_dump_tasks`
  - `public.task_dump_task_workspace_blocks`
  - `public.task_dump_task_attachments`
  - `public.task_dump_thoughts`
  - `public.task_dump_thought_attachments`

### 2) API route must use prefixed table constants everywhere

- `app/api/task-dump/route.ts` now defines table constants and should only call `.from(TABLE_CONSTANT)`.
- A real bug occurred where one leftover `.from('tasks')` path remained in update flow, causing:
  - `Could not find the table 'public.tasks' in the schema cache`
- If you touch this route, grep for raw `.from('tasks')` / `.from('thoughts')` etc before finishing.

### 3) Migration assumptions

- The migration file `supabase/migrations/20260306_create_c_street_dump.sql` now creates **public prefixed tables** (not custom schema objects).
- If app errors mention missing `public.task_dump_*` tables, migration likely has not been applied or PostgREST cache has not refreshed.

### 4) DATABASE_URL requirement was removed for task-dump API

- Earlier implementation used a `pg` helper and required `DATABASE_URL`.
- Task-dump route now uses existing server Supabase client path instead.
- Avoid reintroducing a direct Postgres path unless there is a hard requirement and a full migration plan.

## Cross-Feature Notes Added (Mar 2026)

These are outside `task-dump`, but worth keeping here for future agent context during broad repo work:

- Added note-only timestamp support for experience-node notes:
  - Migration: `supabase/migrations/20260306_add_notes_updated_at.sql`
  - New column: `client_experiences.notes_updated_at timestamptz`
  - Backfill behavior: existing non-empty notes get `notes_updated_at = updated_at`
- Updated client types:
  - `lib/types.ts` -> `ClientExperience` now includes `notes_updated_at: string | null`
- Notes modal now writes note timestamp on note saves:
  - `components/notes-modal.tsx` saves `{ notes, notes_updated_at }`
  - Footer now shows `Last saved: ...` (fallback `Not yet`)
- Important rollout compatibility fix:
  - `lib/queries.ts` `updateExperience()` now retries without `notes_updated_at` when DB has not run the migration yet.
  - This prevents the user-facing error: `Could not save notes` on partially migrated environments.


## Update Log - 2026-03-08 (Evening UI Pass)

### Composer + formatting model (current reality)

- `features/task-dump/markdown-composer.tsx` is now a `contenteditable`-based rich editor for formatting actions.
- Formatting actions are visual/WYSIWYG (via `document.execCommand`) and are no longer markdown-syntax insertion for toolbar actions.
- `MD` toggle behavior still exists in modal editors and renders markdown preview when selected.
- Checkbox handling in editor content is custom (`data-task-check` + icon toggles), not native `<input type="checkbox">` behavior.
- Legacy checkbox HTML using native checkbox inputs is migrated on load to the current `data-task-check` structure.

### Quick Dump panel updates

- Quick dump header label was removed for a cleaner top panel.
- Subtitle updated to: `A messy hub for Tasks and Thoughts.`
- Quick dump `Dump Task` helper text updated to: `Cmd/Ctrl + Enter`.
- Quick dump button now appears active/bright at all times (no disabled visual state), while create guard still prevents empty submits.
- Quick dump editor no longer shows the animated/focus-only toolbar.
- Quick dump now uses a static inline formatting control group on the same row as:
  - Priority
  - Due date
  - Attach
- A subtle divider separates those controls from the quick-dump formatting group.
- Quick dump `MD` toggle is intentionally hidden (markdown preview retained for modal editors).

### Kanban/overview card updates

- Column header layout now shows:
  - status badge on the left
  - task counter on the right
- Counter label now pluralizes correctly (`1 task` / `N tasks`).
- Removed top summary counter strip above the board (the 3 status summary boxes).
- Card metadata no longer shows `Updated ...` on overview cards.
- Due date metadata on cards is right-aligned.
- Card delete icon now:
  - appears only on hover/focus
  - fades in with a smoother transition
  - uses a more muted icon color by default
- When priority is `none`, the priority line on cards is blank (instead of showing `Task`).

### Header icon updates

- Added custom dump-truck icon next to `C-Street Dump` title.
- Icon was iterated to a larger silhouette style and then set to `text-foreground` so it matches title text brightness.

### Modal status accent/glow updates

- Task modal accent styling was updated to remove the hard left accent line and use a softer top-left corner glow approach.
- Overlay z-layer was corrected so content renders in front of glow (`z-0`), preventing glow wash over header/body text fields.
- Top accent and header accent gradients were softened for less harsh edge contrast.

### Notes for future agents

- If working on modal accents, verify z-index layering first; visual "muddy text" reports are usually overlay stacking, not color values.
- Do not assume toolbar behavior is uniform between quick dump and modal editors.
- Before changing checkbox behavior, validate old-content migration + new-content insertion + Enter-key continuation in all editors.
