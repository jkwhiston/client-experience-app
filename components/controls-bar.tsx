'use client'

import { useState } from 'react'
import type {
  StatusFilter,
  SortOption,
  FocusTab,
  ActiveTab,
  ClientWithExperiences,
} from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, Download } from 'lucide-react'
import { AddClientDialog } from './add-client-dialog'

interface ControlsBarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (f: StatusFilter) => void
  sortOption: SortOption
  onSortChange: (s: SortOption) => void
  focusTab: FocusTab
  activeTab: ActiveTab
  onAddClient: (client: ClientWithExperiences) => void
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
  { value: 'late', label: 'Late' },
  { value: 'failed', label: 'Failed' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'Name A→Z' },
  { value: 'name_desc', label: 'Name Z→A' },
  { value: 'deadline_hour24', label: 'Next 24-Hour deadline' },
  { value: 'deadline_day14', label: 'Next 14-Day deadline' },
  { value: 'deadline_day30', label: 'Next 30-Day deadline' },
]

export function ControlsBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortOption,
  onSortChange,
  focusTab,
  activeTab,
  onAddClient,
}: ControlsBarProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const isArchived = activeTab === 'archived'

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isArchived ? 'Search archived clients...' : 'Search clients...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1">
          {isArchived ? (
            <>
              <FilterChip
                label="All"
                active={statusFilter === 'all'}
                onClick={() => onStatusFilterChange('all')}
              />
              <FilterChip
                label="Archived"
                active={statusFilter !== 'all'}
                onClick={() => onStatusFilterChange('all')}
              />
            </>
          ) : (
            STATUS_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                label={f.label}
                active={statusFilter === f.value}
                onClick={() => onStatusFilterChange(f.value)}
              />
            ))
          )}
        </div>

        {/* Sort + Add/Export */}
        <div className="flex items-center gap-2 ml-auto">
          {!isArchived && (
            <Select value={sortOption} onValueChange={(v) => onSortChange(v as SortOption)}>
              <SelectTrigger className="w-[220px] h-9 text-xs">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isArchived ? (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => handleExportCSV()}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          ) : (
            <Button size="sm" className="text-xs" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Client
            </Button>
          )}
        </div>
      </div>

      <AddClientDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAddClient={onAddClient}
      />
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="h-7 text-xs px-3"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function handleExportCSV() {
  // This is a placeholder — the actual implementation needs client data.
  // We'll trigger a custom event that the dashboard can listen to.
  const event = new CustomEvent('export-csv')
  window.dispatchEvent(event)
}
