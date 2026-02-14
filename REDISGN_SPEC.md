# Design Spec: Timeline "Stepper" Layout Refactor

## 1. Objective

Refactor the `ClientRow` and `ExperienceCard` components to replace the current "3-Box" layout with a sleek, horizontal **Timeline/Stepper** visualization.

**Current Problem:** Information density is too high; rows are too tall; repetition of labels ("24-Hour", etc.) creates noise.
**Target Look:** A horizontal line connecting three circular nodes (24h → 14d → 30d).

* **Overview Mode:** Shows the full timeline.
* **Focus Mode:** Highlights the focused node while keeping the others visible but dimmed.

## 2. Visual Style & Behavior

### The Timeline Track

* A horizontal line (`h-0.5 bg-border`) running vertically centered through the right column.
* The line should be behind the nodes (`z-0`).
* **Progress Logic:** The line should be colored (green/primary) *up to* the completed stages, and gray for future stages.

### The Nodes (Milestones)

Each milestone (24h, 14d, 30d) is a "Node" on the track.

* **Shape:** Circular badge.
* **States:**
1. **Done:** Solid Green circle with a Checkmark icon.
2. **Active (Pending):** Large "Halo" ring (pulsing optional). Shows the live countdown text *next to* or *under* it.
3. **Future:** Small Gray dot/circle.
4. **Failed/Late:** Red/Amber styling similar to Done.


* **Hover Interaction (Progressive Disclosure):**
* The "Status Dropdown" and "Notes Icon" should be **hidden by default**.
* **On Hover** of a Node: A small "Action Menu" (Popover or floating div) appears above/below the node containing:
* The `Achieved?` status toggle (small icons).
* The `Notes` button.





## 3. Component Architecture

### A. Create `components/timeline-node.tsx`

This replaces `experience-card.tsx` for this view.
**Props:**

* `experience`: The `ClientExperience` object.
* `client`: The `Client` object (for dates/pausing).
* `isFocused`: Boolean (is this the active tab?).
* `isActiveStage`: Boolean (is this the currently running clock?).

**UI Structure:**

```tsx
<div className="relative group flex flex-col items-center">
  {/* 1. Floating Actions (Visible on Group Hover) */}
  <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
     <StatusToggle /> {/* Compact Check/X icons */}
     <NotesButton />  {/* Open NotesModal */}
  </div>

  {/* 2. The Node Circle */}
  <div className={cn("z-10 rounded-full border bg-background", statusStyles)}>
     {/* Icon: Check, Clock, or X */}
  </div>

  {/* 3. The Label & Timer (Below) */}
  <div className="mt-2 text-center">
    <span className="text-xs font-bold text-muted-foreground">24-Hour</span>
    {/* Show Countdown ONLY if Active or Late/Failed */}
    {shouldShowTimer && <div className="text-sm font-mono">{timerString}</div>}
    {/* Show Date ONLY if Future */}
    {isFuture && <div className="text-xs text-muted-foreground">{dateString}</div>}
  </div>
</div>

```

### B. Refactor `components/client-row.tsx`

* **Left Column:** Keep as is (Name/Date editing).
* **Right Column:** Replace the flex-row of cards with a relative container.
* **Layout:**
* Render the `<div className="absolute top-1/2 left-0 w-full h-0.5 bg-border -z-0" />` (The Track).
* Render a Flex row (`justify-between` or `justify-around`) containing the 3 `TimelineNode` components.



## 4. Specific Logic Requirements

### 1. "Active" Logic

Use `lib/deadlines.ts` to determine which stage is "current".

* If 24h is Pending -> 24h is Active Node.
* If 24h is Done AND 14d is Pending -> 14d is Active Node.
* **Visuals:** The Active Node should be larger (e.g., `h-10 w-10` vs `h-6 w-6` for future).

### 2. Focus Mode Handling

* **Old Behavior:** Hid other cards completely or showed "MiniIndicators".
* **New Behavior:**
* Always show all 3 nodes.
* If `focusTab === 'day14'`, visually highlight the 14d node (100% opacity) and dim the others (50% opacity).
* Auto-scroll or center if necessary (likely not needed for 3 items).



### 3. "Status Toggle" Redesign

Inside the `TimelineNode` hover state, replace the large `<Select>` with a compact UI:

* **Pending:** Show a "Check" button (Mark Done) and "X" button (Mark Fail).
* **Done:** Show a generic "Undo/Edit" icon or the current status color.

### 4. Notes Indicator

* If `experience.notes` is not empty, show a small "dot" indicator attached to the Node circle (like a notification badge), so the user knows notes exist without hovering.

## 5. Implementation Steps for Cursor

1. **Extract Logic:** Reuse `getDerivedStatus`, `getDueAtEffective` from `lib/deadlines.ts`.
2. **Create `TimelineNode`:** Implement the hover-reveal logic using Tailwind `group` and `group-hover`.
3. **Update `ClientRow`:** Remove the `ExperienceCard` mapping. Implement the horizontal track layout.
4. **Clean Up:** Remove `components/experience-card.tsx` (or keep it as a fallback if you want, but the goal is replacement). `components/mini-indicator.tsx` can likely be deleted.

## 6. CSS / Tailwind Hints

* **Track Line:** `absolute left-4 right-4 top-[1.5rem] h-0.5 bg-muted` (Adjust top to align with center of nodes).
* **Node Container:** `relative z-10 bg-background px-2` (To mask the line behind the text if needed, or just let the node sit on top).
* **Hover Menu:** `absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover border shadow-md rounded-md p-1 flex gap-1`.

---