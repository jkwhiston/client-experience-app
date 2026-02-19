'use client'

import { useState, useMemo } from 'react'
import type {
  ClientWithExperiences,
  ClientExperience,
  ExperienceStatus,
  DerivedStatus,
} from '@/lib/types'
import { EXPERIENCE_TYPES, getExperienceLabel } from '@/lib/types'
import {
  getEffectiveDueDate,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
  formatDurationCompact,
  formatDurationWithSeconds,
  formatLateCompactTwoLine,
  formatCompletedShort,
  formatDueShort,
} from '@/lib/deadlines'
import { updateExperience } from '@/lib/queries'
import { trackAutoFails, clearAutoFails } from '@/lib/auto-fail-tracker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Check,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotesModal } from './notes-modal'
import { ExperienceDetailModal } from './experience-detail-modal'

interface TimelineNodeProps {
  experience: ClientExperience
  client: ClientWithExperiences
  now: Date
  isFocused: boolean
  isFocusMode: boolean
  isActiveStage: boolean
  isArchived: boolean
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

export function TimelineNode({
  experience,
  client,
  now,
  isFocused,
  isFocusMode,
  isActiveStage,
  isArchived,
  updateClientLocal,
}: TimelineNodeProps) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const expType = experience.experience_type
  const label = getExperienceLabel(experience)

  const dueAt = useMemo(
    () => getEffectiveDueDate(experience, client.signed_on_date),
    [client.signed_on_date, experience.custom_due_at, experience.experience_type, experience.month_number]
  )
  const dueAtEffective = useMemo(
    () => getDueAtEffective(dueAt, client.paused_total_seconds),
    [dueAt, client.paused_total_seconds]
  )
  const nowEffective = getNowEffective(client, now)
  const secondsRemaining = (dueAtEffective.getTime() - nowEffective.getTime()) / 1000

  const derivedStatus: DerivedStatus = getDerivedStatus({
    status: experience.status,
    completed_at: experience.completed_at,
    dueAt: dueAtEffective,
    now: nowEffective,
  })

  // Determine if this node is "future" (after the active stage).
  // For initial experiences: compare index in EXPERIENCE_TYPES.
  // For monthly experiences: a node is future if derivedStatus is pending and it's not the active stage.
  const isFuture = useMemo(() => {
    if (expType === 'monthly') {
      return !isActiveStage && derivedStatus === 'pending'
    }
    const activeStageIdx = EXPERIENCE_TYPES.findIndex((t) => {
      const exp = client.client_experiences.find((e) => e.experience_type === t)
      if (!exp) return false
      const d = getEffectiveDueDate(exp, client.signed_on_date)
      const dEff = getDueAtEffective(d, client.paused_total_seconds)
      const status = getDerivedStatus({
        status: exp.status,
        completed_at: exp.completed_at,
        dueAt: dEff,
        now: nowEffective,
      })
      return status === 'pending' || status === 'failed'
    })
    const thisIdx = EXPERIENCE_TYPES.indexOf(expType)
    return thisIdx > (activeStageIdx >= 0 ? activeStageIdx : EXPERIENCE_TYPES.length)
  }, [client, nowEffective, expType, isActiveStage, derivedStatus])

  // Distinguish overdue-pending from explicitly-failed
  const isOverdue = derivedStatus === 'failed' && experience.status === 'pending'
  const isExplicitlyFailed = derivedStatus === 'failed' && experience.status === 'no'

  // Is this node the active one showing a live countdown?
  const isLiveNode = isActiveStage && (derivedStatus === 'pending' || isOverdue)
  const isDone = derivedStatus === 'done' || derivedStatus === 'done_late'
  const isFailed = isExplicitlyFailed
  const isInactiveOverdue = !isActiveStage && isOverdue

  // Timer lines (two-line format for active/late nodes)
  const timerLines = useMemo((): { line1: string; line2: string } | null => {
    if (derivedStatus === 'failed' && experience.status === 'pending') {
      return formatLateCompactTwoLine(Math.abs(secondsRemaining))
    }
    if (derivedStatus === 'pending' && isActiveStage) {
      return formatDurationWithSeconds(secondsRemaining)
    }
    return null
  }, [derivedStatus, experience.status, secondsRemaining, isActiveStage])

  // Completed text
  const completedString = useMemo(() => {
    if (isDone && experience.completed_at) {
      return formatCompletedShort(experience.completed_at)
    }
    return ''
  }, [isDone, experience.completed_at])

  // Due string
  const dueString = useMemo(() => {
    const includeTime = isLiveNode
    return `Due: ${formatDueShort(dueAtEffective, includeTime)}`
  }, [dueAtEffective, isLiveNode])

  // Compact countdown for small circles (future nodes and inactive overdue nodes)
  const futureCountdown = useMemo((): { line1: string; line2: string } | null => {
    if (isFuture || isInactiveOverdue) return formatDurationCompact(secondsRemaining)
    return null
  }, [isFuture, isInactiveOverdue, secondsRemaining])

  async function handleStatusChange(newStatus: ExperienceStatus) {
    const newCompletedAt = newStatus === 'yes' ? new Date().toISOString() : null

    // Snapshot previous state for undo
    const prevSnapshot: { id: string; status: ExperienceStatus; completed_at: string | null }[] = [
      { id: experience.id, status: experience.status, completed_at: experience.completed_at },
    ]

    // When marking as done, find earlier pending nodes to auto-fail
    let earlierPending: ClientExperience[] = []
    if (newStatus === 'yes') {
      if (expType === 'monthly') {
        earlierPending = client.client_experiences.filter((e) =>
          e.experience_type === 'monthly' &&
          e.month_number != null &&
          experience.month_number != null &&
          e.month_number < experience.month_number &&
          e.status === 'pending'
        )
      } else {
        const thisIdx = EXPERIENCE_TYPES.indexOf(expType)
        earlierPending = client.client_experiences.filter((e) => {
          const eIdx = EXPERIENCE_TYPES.indexOf(e.experience_type)
          return eIdx >= 0 && eIdx < thisIdx && e.status === 'pending'
        })
      }
    }

    // Add earlier pending to snapshot before they are changed
    for (const ep of earlierPending) {
      prevSnapshot.push({ id: ep.id, status: ep.status, completed_at: ep.completed_at })
    }

    // Apply changes locally
    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) => {
        if (e.id === experience.id) {
          return { ...e, status: newStatus, completed_at: newCompletedAt }
        }
        if (earlierPending.some((ep) => ep.id === e.id)) {
          return { ...e, status: 'no' as ExperienceStatus, completed_at: null }
        }
        return e
      }),
    }))

    // Track auto-fails
    if (earlierPending.length > 0) {
      trackAutoFails(experience.id, earlierPending.map((ep) => ep.id))
    }

    // Persist to DB
    await updateExperience(experience.id, { status: newStatus, completed_at: newCompletedAt })
    for (const ep of earlierPending) {
      await updateExperience(ep.id, { status: 'no', completed_at: null })
    }

    // Show undo toast
    toast.dismiss()
    toast(`${label} marked as Done`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          // Restore all snapshots locally
          updateClientLocal(client.id, (c) => ({
            ...c,
            client_experiences: c.client_experiences.map((e) => {
              const snap = prevSnapshot.find((s) => s.id === e.id)
              if (snap) return { ...e, status: snap.status, completed_at: snap.completed_at }
              return e
            }),
          }))
          // Clear tracker
          clearAutoFails(experience.id)
          // Persist to DB
          for (const snap of prevSnapshot) {
            await updateExperience(snap.id, { status: snap.status, completed_at: snap.completed_at })
          }
        },
      },
    })
  }

  const hasNotes = experience.notes?.trim().length > 0
  const dimmed = isFocusMode && !isFocused

  const handleNodeClick = () => {
    setDetailModalOpen(true)
  }

  return (
    <>
          <div
            role="button"
            tabIndex={0}
            onClick={handleNodeClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleNodeClick()
              }
            }}
            className={cn(
              'relative group flex flex-col items-center z-10 h-full transition-all duration-200 cursor-pointer',
              dimmed && 'opacity-50'
            )}
          >
            {/* Top zone: Label — fixed height so labels align across nodes */}
            <div className="flex items-end justify-center h-9 mb-3">
              <span className={cn(
                'text-xl font-bold',
                isLiveNode && isOverdue ? 'text-red-400' : '',
                isLiveNode && !isOverdue ? 'text-blue-400' : '',
                isFailed ? 'text-red-400' : '',
                isInactiveOverdue ? 'text-red-400/70' : '',
                !isLiveNode && !isFailed && !isInactiveOverdue && 'text-muted-foreground/50'
              )}>
                {label}
              </span>
            </div>

            {/* Middle zone: Circle + nearby text — flex-1 centers group at same midpoint */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative flex flex-col items-center">
                {isLiveNode ? (
                  /* ===== ACTIVE / OVERDUE: Large circle with countdown ===== */
                  <div className={cn(
                    'relative rounded-full flex flex-col items-center justify-center transition-all duration-200',
                    'h-[110px] w-[110px] px-2 text-center overflow-hidden',
                    isOverdue
                      ? 'border-2 border-red-500 bg-card animate-pulse-red group-hover:ring-[5px] group-hover:ring-red-500/50 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                      : 'border-2 border-blue-500 bg-card animate-pulse-blue group-hover:ring-[5px] group-hover:ring-blue-500/50 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                  )}>
                    {/* Timer (two lines) */}
                    {timerLines && (
                      <div className="flex flex-col items-center leading-tight">
                        <span className={cn(
                          'text-sm font-mono font-bold',
                          isOverdue ? 'text-red-500' : 'text-blue-500'
                        )}>
                          {timerLines.line1}
                        </span>
                        <span className={cn(
                          'text-sm font-mono font-bold',
                          isOverdue ? 'text-red-500' : 'text-blue-500'
                        )}>
                          {timerLines.line2}
                        </span>
                      </div>
                    )}
                    {/* Due date inside circle */}
                    <span className="text-[9px] text-muted-foreground mt-1 leading-tight">
                      {dueString}
                    </span>

                    {hasNotes && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                ) : isDone ? (
                  /* ===== DONE: Medium circle with checkmark ===== */
                  <div className={cn(
                    'relative rounded-full flex items-center justify-center transition-all duration-200',
                    'h-11 w-11',
                    derivedStatus === 'done'
                      ? 'border-2 border-green-500 bg-card group-hover:ring-2 group-hover:ring-green-500/30 group-hover:shadow-[0_0_12px_rgba(34,197,94,0.25)]'
                      : 'border-2 border-amber-500 bg-card group-hover:ring-2 group-hover:ring-amber-500/30 group-hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  )}>
                    <svg className={cn(
                      'h-6 w-6',
                      derivedStatus === 'done' ? 'text-green-500' : 'text-amber-500'
                    )} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>

                    {hasNotes && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                ) : isFailed ? (
                  /* ===== FAILED: Small circle with red X ===== */
                  <div className={cn(
                    'relative rounded-full flex items-center justify-center transition-all duration-200',
                    'h-11 w-11',
                    'border-2 border-red-500 bg-card group-hover:ring-2 group-hover:ring-red-500/30 group-hover:shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                  )}>
                    <svg className="h-6 w-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>

                    {hasNotes && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                ) : (
                  /* ===== FUTURE / INACTIVE OVERDUE: Small circle with countdown ===== */
                  <div className={cn(
                    'relative rounded-full flex items-center justify-center transition-all duration-200',
                    'h-12 w-12',
                    isInactiveOverdue
                      ? 'border-2 border-red-500/60 bg-card group-hover:ring-1 group-hover:ring-red-500/30 group-hover:shadow-[0_0_8px_rgba(239,68,68,0.15)]'
                      : 'border-2 border-border bg-card group-hover:ring-1 group-hover:ring-muted-foreground/30 group-hover:shadow-[0_0_8px_rgba(150,150,150,0.15)]'
                  )}>
                    {futureCountdown && (
                      <div className="flex flex-col items-center leading-tight">
                        <span className={cn(
                          'text-[11px] font-mono font-medium',
                          isInactiveOverdue ? 'text-red-500/70' : 'text-muted-foreground'
                        )}>
                          {futureCountdown.line1}
                        </span>
                        {futureCountdown.line2 && (
                          <span className={cn(
                            'text-[11px] font-mono font-medium',
                            isInactiveOverdue ? 'text-red-500/70' : 'text-muted-foreground'
                          )}>
                            {futureCountdown.line2}
                          </span>
                        )}
                      </div>
                    )}

                    {hasNotes && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    )}
                  </div>
                )}

                {/* Text directly below circle — absolute so it doesn't shift circle centering */}
                <div className="absolute top-full mt-1.5 text-center whitespace-nowrap">
                  {isDone && (
                    <span className={cn(
                      'text-xs font-medium block',
                      derivedStatus === 'done' ? 'text-green-500' : 'text-amber-500'
                    )}>
                      {completedString}
                    </span>
                  )}
                  {isFailed && (
                    <span className="text-xs font-medium block text-red-500">
                      Failed
                    </span>
                  )}
                  {(isFuture || isInactiveOverdue) && (
                    <span className={cn(
                      'text-[10px] block',
                      isInactiveOverdue ? 'text-red-500/60' : 'text-muted-foreground'
                    )}>
                      {dueString}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom zone: hover actions only */}
            <div className="flex flex-col items-center min-h-[28px]">
              {/* Action icons: below, visible on hover */}
                <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => { e.stopPropagation(); setNotesOpen(true) }}
                    title="Notes"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  {(derivedStatus === 'pending' || derivedStatus === 'failed') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-green-600 hover:text-green-500"
                      onClick={(e) => { e.stopPropagation(); handleStatusChange('yes') }}
                      title="Mark done"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
            </div>
          </div>

      <NotesModal
        open={notesOpen}
        onOpenChange={setNotesOpen}
        client={client}
        experience={experience}
        updateClientLocal={updateClientLocal}
      />

      <ExperienceDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        client={client}
        experience={experience}
        now={now}
        isActiveStage={isActiveStage}
        onOpenNotes={() => setNotesOpen(true)}
        updateClientLocal={updateClientLocal}
      />
    </>
  )
}
