'use client'

import { useState, useMemo } from 'react'
import type {
  ClientWithExperiences,
  ClientExperience,
  ExperienceStatus,
  DerivedStatus,
} from '@/lib/types'
import { EXPERIENCE_LABELS, EXPERIENCE_TYPES } from '@/lib/types'
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
  const label = EXPERIENCE_LABELS[expType]

  const dueAt = useMemo(
    () => getEffectiveDueDate(experience, client.signed_on_date),
    [client.signed_on_date, experience.custom_due_at, experience.experience_type]
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

  // Determine if this node is "future" (after the active stage)
  const activeStageIndex = useMemo(() => {
    const active = EXPERIENCE_TYPES.findIndex((t) => {
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
    return active >= 0 ? active : EXPERIENCE_TYPES.length
  }, [client, nowEffective])

  const thisIndex = EXPERIENCE_TYPES.indexOf(expType)
  const isFuture = thisIndex > activeStageIndex

  // Is this node the active one showing a live countdown?
  const isLiveNode = isActiveStage && (derivedStatus === 'pending' || derivedStatus === 'failed')
  const isDone = derivedStatus === 'done' || derivedStatus === 'done_late'

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

  // Future countdown (compact, for inside the small circle)
  const futureCountdown = useMemo((): { line1: string; line2: string } | null => {
    if (isFuture) return formatDurationCompact(secondsRemaining)
    return null
  }, [isFuture, secondsRemaining])

  async function handleStatusChange(newStatus: ExperienceStatus) {
    const updates: Record<string, unknown> = {
      status: newStatus,
      completed_at: newStatus === 'yes' ? new Date().toISOString() : null,
    }

    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) =>
        e.id === experience.id
          ? {
              ...e,
              status: newStatus,
              completed_at: newStatus === 'yes' ? new Date().toISOString() : null,
            }
          : e
      ),
    }))

    await updateExperience(experience.id, updates)
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
                isLiveNode && derivedStatus === 'failed' ? 'text-red-400' : '',
                isLiveNode && derivedStatus === 'pending' ? 'text-blue-400' : '',
                !isLiveNode && 'text-muted-foreground/50'
              )}>
                {label}
              </span>
            </div>

            {/* Middle zone: Circle + nearby text — flex-1 centers group at same midpoint */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative flex flex-col items-center">
                {isLiveNode ? (
                  /* ===== ACTIVE / LATE: Large circle ===== */
                  <div className={cn(
                    'relative rounded-full flex flex-col items-center justify-center transition-all duration-200',
                    'h-[110px] w-[110px] px-2 text-center overflow-hidden',
                    derivedStatus === 'failed'
                      ? 'border-2 border-red-500 bg-card animate-pulse-red group-hover:ring-[5px] group-hover:ring-red-500/50 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                      : 'border-2 border-blue-500 bg-card animate-pulse-blue group-hover:ring-[5px] group-hover:ring-blue-500/50 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                  )}>
                    {/* Timer (two lines) */}
                    {timerLines && (
                      <div className="flex flex-col items-center leading-tight">
                        <span className={cn(
                          'text-sm font-mono font-bold',
                          derivedStatus === 'failed' ? 'text-red-500' : 'text-blue-500'
                        )}>
                          {timerLines.line1}
                        </span>
                        <span className={cn(
                          'text-sm font-mono font-bold',
                          derivedStatus === 'failed' ? 'text-red-500' : 'text-blue-500'
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
                ) : (
                  /* ===== FUTURE: Small circle with countdown ===== */
                  <div className={cn(
                    'relative rounded-full flex items-center justify-center transition-all duration-200',
                    'h-12 w-12',
                    'border-2 border-border bg-card',
                    'group-hover:ring-1 group-hover:ring-muted-foreground/30 group-hover:shadow-[0_0_8px_rgba(150,150,150,0.15)]'
                  )}>
                    {futureCountdown && (
                      <div className="flex flex-col items-center leading-tight">
                        <span className="text-[11px] font-mono text-muted-foreground font-medium">
                          {futureCountdown.line1}
                        </span>
                        {futureCountdown.line2 && (
                          <span className="text-[11px] font-mono text-muted-foreground font-medium">
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
                  {isFuture && (
                    <span className="text-[10px] text-muted-foreground block">
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
        onOpenNotes={() => setNotesOpen(true)}
        updateClientLocal={updateClientLocal}
      />
    </>
  )
}
