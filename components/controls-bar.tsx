'use client'

import { useState, useMemo } from 'react'
import type {
  StatusFilter,
  SortOption,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, Plus, Download, Upload, CalendarDays, MoreHorizontal } from 'lucide-react'
import { AddClientDialog } from './add-client-dialog'
import { ImportClientsDialog } from './import-clients-dialog'

interface ControlsBarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (f: StatusFilter) => void
  sortOption: SortOption
  onSortChange: (s: SortOption) => void
  activeTab: ActiveTab
  onAddClient: (client: ClientWithExperiences) => void
  onOpenCalendar?: () => void
  onImportComplete?: () => void
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
  { value: 'late', label: 'Late' },
  { value: 'failed', label: 'Failed' },
]

const ACTIVE_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'Name A→Z' },
  { value: 'name_desc', label: 'Name Z→A' },
  { value: 'next_active_deadline', label: 'Next Active Deadline' },
  { value: 'deadline_hour24', label: 'Next 24-Hour deadline' },
  { value: 'deadline_day10', label: 'Next 10-Day deadline' },
  { value: 'deadline_day30', label: 'Next 30-Day deadline' },
]

const ONGOING_SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'Name A→Z' },
  { value: 'name_desc', label: 'Name Z→A' },
  { value: 'next_monthly_deadline', label: 'Next Monthly Deadline' },
]

export function ControlsBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortOption,
  onSortChange,
  activeTab,
  onAddClient,
  onOpenCalendar,
  onImportComplete,
}: ControlsBarProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const isArchived = activeTab === 'archived'
  const isOngoing = activeTab === 'lifecycle'

  const sortOptions = useMemo(() => {
    if (isOngoing) return ONGOING_SORT_OPTIONS
    return ACTIVE_SORT_OPTIONS
  }, [isOngoing])

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isArchived ? 'Search archived clients...' : isOngoing ? 'Search lifecycle clients...' : 'Search clients...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {!isArchived && (
          <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Filter..." />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {!isArchived && (
            <Select value={sortOption} onValueChange={(v) => onSortChange(v as SortOption)}>
              <SelectTrigger className="w-[220px] h-9 text-xs">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
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
            <>
              <Button size="sm" className="text-xs" onClick={onOpenCalendar}>
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                Calendar View
              </Button>

              {!isOngoing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs">
                      <MoreHorizontal className="h-3.5 w-3.5 mr-1.5" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setAddDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Client
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Import JSON (Clients/Links)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      </div>

      <AddClientDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAddClient={onAddClient}
      />

      <ImportClientsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onAddClient={onAddClient}
        onImportComplete={onImportComplete}
      />
    </div>
  )
}

function handleExportCSV() {
  const event = new CustomEvent('export-csv')
  window.dispatchEvent(event)
}
