'use client'

import type { ClientWithExperiences, FocusTab, ActiveTab } from '@/lib/types'
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
  removeClientLocal: (clientId: string) => void
}

export function ClientList({
  clients,
  focusTab,
  activeTab,
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
        ) : (
          'Active Clients'
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
