'use client'

import type {
  ClientWithExperiences,
  FocusTab,
  ActiveTab,
  ExperienceType,
  DerivedStatus,
} from '@/lib/types'
import { ClientRow } from './client-row'

interface ClientListProps {
  clients: ClientWithExperiences[]
  focusTab: FocusTab
  activeTab: ActiveTab
  now: Date
  loading: boolean
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
  getExpDerivedStatus: (
    client: ClientWithExperiences,
    expType: ExperienceType
  ) => DerivedStatus
}

export function ClientList({
  clients,
  focusTab,
  activeTab,
  now,
  loading,
  updateClientLocal,
  getExpDerivedStatus,
}: ClientListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading clients...</p>
      </div>
    )
  }

  if (clients.length === 0) {
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
              Read-only by default &bull; Unarchive to edit
            </span>
          </>
        ) : (
          'Active Clients'
        )}
      </h2>
      <div className="space-y-3">
        {clients.map((client) => (
          <ClientRow
            key={client.id}
            client={client}
            focusTab={focusTab}
            activeTab={activeTab}
            now={now}
            updateClientLocal={updateClientLocal}
            getExpDerivedStatus={getExpDerivedStatus}
          />
        ))}
      </div>
    </div>
  )
}
