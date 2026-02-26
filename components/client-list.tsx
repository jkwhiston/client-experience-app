'use client'

import type { ClientWithExperiences, FocusTab, ActiveTab, SortOption } from '@/lib/types'
import { ClientRow } from './client-row'
import { CircleCheck } from 'lucide-react'

const DEADLINE_SORT_LABELS: Record<string, string> = {
  deadline_hour24: '24-Hour',
  deadline_day10: '10-Day',
  deadline_day30: '30-Day',
  next_monthly_deadline: 'Monthly',
}

interface ClientListProps {
  clients: ClientWithExperiences[]
  focusTab: FocusTab
  activeTab: ActiveTab
  sortOption: SortOption
  now: Date
  loading: boolean
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
  removeClientLocal: (clientId: string) => void
}

export function ClientList({
  clients,
  focusTab,
  activeTab,
  sortOption,
  now,
  loading,
  updateClientLocal,
  removeClientLocal,
}: ClientListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading clients...</p>
      </div>
    )
  }

  if (clients.length === 0) {
    const deadlineLabel = DEADLINE_SORT_LABELS[sortOption]
    const isDeadlineFilter = !!deadlineLabel || sortOption === 'next_active_deadline'
    const label = deadlineLabel || 'Active'

    if (isDeadlineFilter && activeTab !== 'archived') {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 px-10 py-8">
            <CircleCheck className="h-10 w-10 text-emerald-500" strokeWidth={1.5} />
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              All {label} Experiences Complete
            </p>
            <p className="text-sm text-muted-foreground">
              No active {label.toLowerCase()} deadlines remaining
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">
          {activeTab === 'archived'
            ? 'No archived clients.'
            : 'No clients found. Add your first client to get started.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground pb-3">
        {activeTab === 'archived' ? (
          <>
            Archived Clients{' '}
            <span className="text-xs font-normal">
              Unarchive to edit client details
            </span>
          </>
        ) : activeTab === 'lifecycle' ? (
          'Lifecycle Clients'
        ) : (
          'Onboarding Clients'
        )}
      </h2>
      <div className="space-y-5">
        {clients.map((client, index) => (
          <ClientRow
            key={client.id}
            index={index}
            client={client}
            focusTab={focusTab}
            activeTab={activeTab}
            now={now}
            updateClientLocal={updateClientLocal}
            removeClientLocal={removeClientLocal}
          />
        ))}
      </div>
    </div>
  )
}
