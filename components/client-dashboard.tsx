'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  ClientWithExperiences,
  ActiveTab,
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
  getNextActiveDeadline,
  getMonthlyExperiences,
  getNextMonthlyDeadline,
} from '@/lib/deadlines'
import { fetchClients, backfillMonthlyExperiences, checkMonthlyMigration } from '@/lib/queries'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { DashboardHeader } from './dashboard-header'
import { SummaryRow } from './summary-row'
import { OngoingSummaryRow, type OngoingSummaryCounts } from './ongoing-summary-row'
import { ControlsBar } from './controls-bar'
import { ClientList } from './client-list'
import { CalendarModal } from './calendar-modal'

export function ClientDashboard() {
  const [clients, setClients] = useState<ClientWithExperiences[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('onboarding')
  const focusTab = 'overview' as const
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('sortOption') as SortOption) || 'name_asc'
    }
    return 'name_asc'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [ongoingSummaryOpen, setOngoingSummaryOpen] = useState(true)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    localStorage.setItem('sortOption', sortOption)
  }, [sortOption])

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const migrationOk = await checkMonthlyMigration()
    setMigrationNeeded(!migrationOk)
    let data = await fetchClients()
    if (migrationOk) {
      data = await backfillMonthlyExperiences(data)
    }
    setClients(data)
    setLoading(false)
  }

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

  const getExpDerivedStatus = useCallback(
    (client: ClientWithExperiences, expType: ExperienceType): DerivedStatus => {
      const exp = client.client_experiences.find(
        (e) => e.experience_type === expType
      )
      if (!exp) return 'pending'

      const dueAt = getEffectiveDueDate(exp, client.signed_on_date, undefined, client.initial_intake_date)
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

  const computeOngoingSummaryCounts = useMemo((): OngoingSummaryCounts => {
    const activeClients = clients.filter((c) => !c.is_archived)
    let upToDate = 0
    let dueSoon = 0
    let overdue = 0
    let totalDue = 0
    let totalCompleted = 0

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

    for (const client of activeClients) {
      const monthlyExps = getMonthlyExperiences(client)
      const nowEff = getNowEffective(client, now)
      let clientHasOverdue = false
      let clientHasDueSoon = false
      let clientAllDueDone = true

      for (const exp of monthlyExps) {
        const dueAt = getEffectiveDueDate(exp, client.signed_on_date, undefined, client.initial_intake_date)
        const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)

        // Only count experiences that are currently due (deadline is in the past or within now)
        const isDue = nowEff >= dueAtEff
        const isDueSoon = !isDue && (dueAtEff.getTime() - nowEff.getTime()) <= sevenDaysMs

        if (isDue) {
          totalDue++
          if (exp.status === 'yes') {
            totalCompleted++
          } else if (exp.status === 'pending') {
            clientHasOverdue = true
            clientAllDueDone = false
          } else if (exp.status === 'no') {
            clientAllDueDone = false
          }
        }

        if (isDueSoon && exp.status === 'pending') {
          clientHasDueSoon = true
        }
      }

      if (monthlyExps.length > 0) {
        const hasAnyDue = monthlyExps.some((exp) => {
          const dueAt = getEffectiveDueDate(exp, client.signed_on_date, undefined, client.initial_intake_date)
          const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
          return getNowEffective(client, now) >= dueAtEff
        })
        if (hasAnyDue && clientAllDueDone) upToDate++
      }
      if (clientHasOverdue) overdue++
      if (clientHasDueSoon) dueSoon++
    }

    const completionRate = totalDue > 0 ? Math.round((totalCompleted / totalDue) * 100) : 100

    return { upToDate, dueSoon, overdue, completionRate, totalDue, totalCompleted }
  }, [clients, now])

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab)
    setStatusFilter('all')
    if (tab === 'onboarding') {
      setSortOption('next_active_deadline')
    } else if (tab === 'lifecycle') {
      setSortOption('next_monthly_deadline')
    } else if (tab === 'archived') {
      setSortOption('name_asc')
    }
  }, [])

  const getFilteredClients = useCallback(() => {
    let filtered = clients.filter((c) => {
      if (activeTab === 'archived') return c.is_archived
      return !c.is_archived
    })

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((c) =>
        c.name.toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((client) => {
        if (activeTab === 'lifecycle') {
          const monthlyExps = getMonthlyExperiences(client)
          const nowEff = getNowEffective(client, now)
          return monthlyExps.some((exp) => {
            const dueAt = getEffectiveDueDate(exp, client.signed_on_date, undefined, client.initial_intake_date)
            const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
            const derived = getDerivedStatus({
              status: exp.status,
              completed_at: exp.completed_at,
              dueAt: dueAtEff,
              now: nowEff,
            })
            return matchesFilter(derived, statusFilter)
          })
        }

        if (focusTab !== 'overview') {
          const status = getExpDerivedStatus(client, focusTab as ExperienceType)
          return matchesFilter(status, statusFilter)
        } else {
          return EXPERIENCE_TYPES.some((expType) => {
            const status = getExpDerivedStatus(client, expType)
            return matchesFilter(status, statusFilter)
          })
        }
      })
    }

    if (activeTab === 'lifecycle') {
      if (sortOption === 'next_monthly_deadline') {
        filtered = filtered.filter(
          (client) => getNextMonthlyDeadline(client) !== null
        )
      }
    } else if (activeTab === 'onboarding') {
      if (
        sortOption === 'deadline_hour24' ||
        sortOption === 'deadline_day10' ||
        sortOption === 'deadline_day30'
      ) {
        const expType = sortOption.replace('deadline_', '') as ExperienceType
        filtered = filtered.filter((client) => {
          const exp = client.client_experiences.find(
            (e) => e.experience_type === expType
          )
          return exp != null && exp.status === 'pending'
        })
      } else if (sortOption === 'next_active_deadline') {
        filtered = filtered.filter(
          (client) => getNextActiveDeadline(client) !== null
        )
      }
    }

    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'name_asc':
          return a.name.localeCompare(b.name)
        case 'name_desc':
          return b.name.localeCompare(a.name)
        case 'deadline_hour24':
        case 'deadline_day10':
        case 'deadline_day30': {
          const expType = sortOption.replace('deadline_', '') as ExperienceType
          const expA = a.client_experiences.find(e => e.experience_type === expType)
          const expB = b.client_experiences.find(e => e.experience_type === expType)
          const dueA = expA
            ? getDueAtEffective(getEffectiveDueDate(expA, a.signed_on_date, undefined, a.initial_intake_date), a.paused_total_seconds)
            : new Date(0)
          const dueB = expB
            ? getDueAtEffective(getEffectiveDueDate(expB, b.signed_on_date, undefined, b.initial_intake_date), b.paused_total_seconds)
            : new Date(0)
          return dueA.getTime() - dueB.getTime()
        }
        case 'next_active_deadline': {
          const dueA = getNextActiveDeadline(a)
          const dueB = getNextActiveDeadline(b)
          return (dueA?.getTime() ?? 0) - (dueB?.getTime() ?? 0)
        }
        case 'next_monthly_deadline': {
          const dueA = getNextMonthlyDeadline(a)
          const dueB = getNextMonthlyDeadline(b)
          return (dueA?.getTime() ?? Infinity) - (dueB?.getTime() ?? Infinity)
        }
        default:
          return 0
      }
    })

    return filtered
  }, [clients, activeTab, searchQuery, statusFilter, focusTab, sortOption, now, getExpDerivedStatus])

  const handleSummaryClick = useCallback(
    (expType: ExperienceType, filter: StatusFilter) => {
      setStatusFilter(filter)
      setSortOption(`deadline_${expType}` as SortOption)
    },
    []
  )

  const handleOngoingSummaryFilterClick = useCallback(
    (filter: StatusFilter) => {
      setStatusFilter(filter)
    },
    []
  )

  const filteredClients = getFilteredClients()

  useEffect(() => {
    function handleExport() {
      const archivedClients = clients.filter((c) => c.is_archived)
      if (archivedClients.length === 0) return

      const headers = ['Name', 'Signed On', 'Archived At', '24h Status', '10d Status', '30d Status']
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
          getStatus('day10'),
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
        <DashboardHeader activeTab={activeTab} onActiveTabChange={handleTabChange} />

        {migrationNeeded && activeTab === 'lifecycle' && (
          <MigrationBanner onMigrationApplied={() => { setMigrationNeeded(false); loadClients() }} />
        )}

        {activeTab === 'onboarding' && (
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

        {activeTab === 'lifecycle' && (
          <div className="pb-4">
            <button
              onClick={() => setOngoingSummaryOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              {ongoingSummaryOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Lifecycle Summaries
            </button>
            {ongoingSummaryOpen && (
              <OngoingSummaryRow
                counts={computeOngoingSummaryCounts}
                onFilterClick={handleOngoingSummaryFilterClick}
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
          activeTab={activeTab}
          onAddClient={addClientLocal}
          onOpenCalendar={() => setCalendarOpen(true)}
        />

        <ClientList
          clients={filteredClients}
          focusTab={focusTab}
          activeTab={activeTab}
          sortOption={sortOption}
          now={now}
          loading={loading}
          updateClientLocal={updateClientLocal}
          removeClientLocal={removeClientLocal}
        />
      </div>

      <CalendarModal
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        clients={clients}
        now={now}
        updateClientLocal={updateClientLocal}
        activeTab={activeTab}
      />
    </div>
  )
}

function MigrationBanner({ onMigrationApplied }: { onMigrationApplied: () => void }) {
  const [copiedStep, setCopiedStep] = useState<1 | 2 | null>(null)
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null)

  const step1Sql = `ALTER TYPE experience_type ADD VALUE IF NOT EXISTS 'monthly';
ALTER TABLE client_experiences ADD COLUMN IF NOT EXISTS month_number integer;`

  const step2Sql = `DELETE FROM client_experiences WHERE experience_type = 'monthly';

ALTER TABLE client_experiences DROP CONSTRAINT IF EXISTS client_experiences_client_id_experience_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS client_experiences_client_id_experience_type_key
ON client_experiences (client_id, experience_type, COALESCE(month_number, 0));

INSERT INTO client_experiences (client_id, experience_type, month_number, status, notes, todos)
SELECT c.id, 'monthly', m.month_number, 'pending', '', '[]'::jsonb
FROM clients c
CROSS JOIN generate_series(2, 18) AS m(month_number)
WHERE NOT EXISTS (
  SELECT 1 FROM client_experiences ce
  WHERE ce.client_id = c.id
    AND ce.experience_type = 'monthly'
    AND ce.month_number = m.month_number
);`

  async function handleCopy(step: 1 | 2) {
    await navigator.clipboard.writeText(step === 1 ? step1Sql : step2Sql)
    setCopiedStep(step)
    setTimeout(() => setCopiedStep(null), 2000)
  }

  async function handleCheckStatus() {
    const ok = await checkMonthlyMigration()
    if (ok) {
      setResult({ success: true, message: 'Migration detected! Reloading...' })
      setTimeout(onMigrationApplied, 1000)
    } else {
      setResult({ error: 'Step 1 not yet applied. The month_number column was not found.' })
    }
  }

  return (
    <div className="mb-4 rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-amber-500">Database Migration Required</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The Lifecycle tab needs a two-step database migration. Each step must be run separately in the Supabase SQL Editor (new enum values must be committed before they can be referenced).
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">1</span>
              <p className="text-sm text-muted-foreground flex-1">Add the enum value and column</p>
              <button
                onClick={() => handleCopy(1)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 shrink-0"
              >
                {copiedStep === 1 ? 'Copied!' : 'Copy Step 1 SQL'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">2</span>
              <p className="text-sm text-muted-foreground flex-1">Backfill monthly experience rows</p>
              <button
                onClick={() => handleCopy(2)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 shrink-0"
              >
                {copiedStep === 2 ? 'Copied!' : 'Copy Step 2 SQL'}
              </button>
            </div>

            <div className="border-t border-border pt-3">
              <button
                onClick={handleCheckStatus}
                className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Check Migration Status
              </button>
            </div>
          </div>

          {result && (
            <div className={`text-sm rounded-md px-3 py-2 ${result.success ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
              {result.success ? result.message : result.error}
            </div>
          )}
        </div>
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
