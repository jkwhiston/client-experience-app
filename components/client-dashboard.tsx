'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  ClientWithExperiences,
  ActiveTab,
  FocusTab,
  StatusFilter,
  SortOption,
  ExperienceType,
  DerivedStatus,
} from '@/lib/types'
import { EXPERIENCE_TYPES } from '@/lib/types'
import {
  getEffectiveDueDate,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
} from '@/lib/deadlines'
import { fetchClients } from '@/lib/queries'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { DashboardHeader } from './dashboard-header'
import { SummaryRow } from './summary-row'
import { ControlsBar } from './controls-bar'
import { FocusTabs } from './focus-tabs'
import { ClientList } from './client-list'

export function ClientDashboard() {
  const [clients, setClients] = useState<ClientWithExperiences[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('active')
  const [focusTab, setFocusTab] = useState<FocusTab>('overview')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('name_asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [now, setNow] = useState(new Date())

  // Tick every second for live countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch clients on mount
  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const data = await fetchClients()
    setClients(data)
    setLoading(false)
  }

  // Optimistic update helper
  const updateClientLocal = useCallback(
    (clientId: string, updater: (c: ClientWithExperiences) => ClientWithExperiences) => {
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? updater(c) : c))
      )
    },
    []
  )

  const addClientLocal = useCallback((client: ClientWithExperiences) => {
    setClients((prev) => [client, ...prev])
  }, [])

  const removeClientLocal = useCallback((clientId: string) => {
    setClients((prev) => prev.filter((c) => c.id !== clientId))
  }, [])

  // Get derived status for a specific experience
  const getExpDerivedStatus = useCallback(
    (client: ClientWithExperiences, expType: ExperienceType): DerivedStatus => {
      const exp = client.client_experiences.find(
        (e) => e.experience_type === expType
      )
      if (!exp) return 'pending'

      const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
      const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
      const nowEff = getNowEffective(client, now)

      return getDerivedStatus({
        status: exp.status,
        completed_at: exp.completed_at,
        dueAt: dueAtEff,
        now: nowEff,
      })
    },
    [now]
  )

  // Compute summary counts
  const computeSummaryCounts = useCallback(
    (expType: ExperienceType) => {
      const activeClients = clients.filter((c) => !c.is_archived)
      const counts = { pending: 0, done: 0, late: 0, failed: 0 }

      for (const client of activeClients) {
        const status = getExpDerivedStatus(client, expType)
        if (status === 'pending') counts.pending++
        else if (status === 'done') counts.done++
        else if (status === 'done_late') counts.late++
        else if (status === 'failed') counts.failed++
      }

      return counts
    },
    [clients, getExpDerivedStatus]
  )

  // Filter and sort clients
  const getFilteredClients = useCallback(() => {
    let filtered = clients.filter((c) =>
      activeTab === 'active' ? !c.is_archived : c.is_archived
    )

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((c) =>
        c.name.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((client) => {
        if (focusTab !== 'overview') {
          // Focus mode: filter by focused milestone
          const status = getExpDerivedStatus(client, focusTab as ExperienceType)
          return matchesFilter(status, statusFilter)
        } else {
          // Overview: include if ANY milestone matches
          return EXPERIENCE_TYPES.some((expType) => {
            const status = getExpDerivedStatus(client, expType)
            return matchesFilter(status, statusFilter)
          })
        }
      })
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'name_asc':
          return a.name.localeCompare(b.name)
        case 'name_desc':
          return b.name.localeCompare(a.name)
        case 'deadline_hour24':
        case 'deadline_day14':
        case 'deadline_day30': {
          const expType = sortOption.replace('deadline_', '') as ExperienceType
          const expA = a.client_experiences.find(e => e.experience_type === expType)
          const expB = b.client_experiences.find(e => e.experience_type === expType)
          const dueA = expA
            ? getDueAtEffective(getEffectiveDueDate(expA, a.signed_on_date), a.paused_total_seconds)
            : new Date(0)
          const dueB = expB
            ? getDueAtEffective(getEffectiveDueDate(expB, b.signed_on_date), b.paused_total_seconds)
            : new Date(0)
          return dueA.getTime() - dueB.getTime()
        }
        default:
          return 0
      }
    })

    return filtered
  }, [clients, activeTab, searchQuery, statusFilter, focusTab, sortOption, getExpDerivedStatus])

  // When switching to a focus tab, auto-set sort to that deadline
  const handleFocusTabChange = useCallback((tab: FocusTab) => {
    setFocusTab(tab)
    if (tab !== 'overview') {
      setSortOption(`deadline_${tab}` as SortOption)
    }
  }, [])

  // Handle summary count click
  const handleSummaryClick = useCallback(
    (expType: ExperienceType, filter: StatusFilter) => {
      setFocusTab(expType as FocusTab)
      setStatusFilter(filter)
      setSortOption(`deadline_${expType}` as SortOption)
    },
    []
  )

  const filteredClients = getFilteredClients()

  // Export CSV handler
  useEffect(() => {
    function handleExport() {
      const archivedClients = clients.filter((c) => c.is_archived)
      if (archivedClients.length === 0) return

      const headers = ['Name', 'Signed On', 'Archived At', '24h Status', '14d Status', '30d Status']
      const rows = archivedClients.map((c) => {
        const getStatus = (type: ExperienceType) => {
          const exp = c.client_experiences.find((e) => e.experience_type === type)
          return exp ? getExpDerivedStatus(c, type) : 'unknown'
        }
        return [
          c.name,
          c.signed_on_date,
          c.archived_at || '',
          getStatus('hour24'),
          getStatus('day14'),
          getStatus('day30'),
        ]
      })

      const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'archived_clients.csv'
      a.click()
      URL.revokeObjectURL(url)
    }

    window.addEventListener('export-csv', handleExport)
    return () => window.removeEventListener('export-csv', handleExport)
  }, [clients, getExpDerivedStatus])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 lg:px-8">
        <DashboardHeader activeTab={activeTab} onActiveTabChange={setActiveTab} />

        {activeTab === 'active' && (
          <div className="pb-4">
            <button
              onClick={() => setSummaryOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              {summaryOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Experience Summaries
            </button>
            {summaryOpen && (
              <SummaryRow
                computeCounts={computeSummaryCounts}
                onCountClick={handleSummaryClick}
              />
            )}
          </div>
        )}

        <ControlsBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortOption={sortOption}
          onSortChange={setSortOption}
          focusTab={focusTab}
          activeTab={activeTab}
          onAddClient={addClientLocal}
        />

        {activeTab === 'active' && (
          <FocusTabs focusTab={focusTab} onFocusTabChange={handleFocusTabChange} />
        )}

        <ClientList
          clients={filteredClients}
          focusTab={focusTab}
          activeTab={activeTab}
          now={now}
          loading={loading}
          updateClientLocal={updateClientLocal}
          removeClientLocal={removeClientLocal}
        />
      </div>
    </div>
  )
}

function matchesFilter(status: DerivedStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case 'pending':
      return status === 'pending'
    case 'done':
      return status === 'done'
    case 'late':
      return status === 'done_late'
    case 'failed':
      return status === 'failed'
    default:
      return true
  }
}
