'use client'

import { useState, useMemo } from 'react'
import type {
  ClientWithExperiences,
  ClientExperience,
  ExperienceStatus,
  DerivedStatus,
} from '@/lib/types'
import { EXPERIENCE_LABELS } from '@/lib/types'
import {
  getDueAt,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
  getUrgency,
  formatDuration,
  formatDurationParts,
  formatDueTime,
  formatDueTimeFull,
  type DurationPart,
} from '@/lib/deadlines'
import { updateExperience } from '@/lib/queries'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
} from 'lucide-react'
import { NotesModal } from './notes-modal'

interface ExperienceCardProps {
  client: ClientWithExperiences
  experience: ClientExperience
  now: Date
  variant: 'overview' | 'focus'
  isArchived: boolean
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

export function ExperienceCard({
  client,
  experience,
  now,
  variant,
  isArchived,
  updateClientLocal,
}: ExperienceCardProps) {
  const [notesOpen, setNotesOpen] = useState(false)

  const expType = experience.experience_type
  const label = EXPERIENCE_LABELS[expType]

  // Compute deadline and status
  const dueAt = useMemo(
    () => getDueAt(client.signed_on_date, expType),
    [client.signed_on_date, expType]
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

  const urgency =
    derivedStatus === 'pending'
      ? getUrgency(expType, secondsRemaining)
      : 'normal'

  // Status display
  const statusDisplay = getStatusDisplay(derivedStatus, secondsRemaining, experience)

  // Countdown display
  const countdownDisplay = getCountdownDisplay(
    derivedStatus,
    secondsRemaining,
    experience,
    dueAtEffective,
    variant
  )

  // Urgency border color
  const borderClass = getBorderClass(urgency, derivedStatus)

  async function handleStatusChange(value: string) {
    const newStatus = value as ExperienceStatus
    const updates: Record<string, unknown> = { status: newStatus }

    if (newStatus === 'yes') {
      updates.completed_at = new Date().toISOString()
    } else {
      updates.completed_at = null
    }

    // Optimistic update
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

  if (variant === 'focus') {
    return (
      <>
        <div className={`flex-1 p-4 border-l border-border ${borderClass}`}>
          {/* Title spanning full width — largest text */}
          <h3 className="text-xl font-semibold mb-2 text-center">{label}</h3>

          {/* Two-column body with vertical divider */}
          <div className="flex">
            {/* Left column: countdown + due date + status label */}
            <div className="flex-1 min-w-0 pr-3">
              <div className="mb-2">
                <p className={`text-2xl font-bold ${countdownDisplay.isNegative ? 'text-red-500' : ''}`}>
                  {countdownDisplay.primary}
                </p>
                <p className="text-base text-muted-foreground">
                  {formatDueTimeFull(dueAtEffective)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {statusDisplay.icon}
                <span className={`text-base font-medium ${statusDisplay.colorClass}`}>
                  {statusDisplay.label}
                </span>
              </div>
            </div>

            {/* Vertical divider */}
            <div className="w-px bg-border self-stretch" />

            {/* Right column: status dropdown + notes icon */}
            <div className="flex flex-col items-center justify-between pl-3 min-w-[120px]">
              {!isArchived && (
                <Select
                  value={experience.status}
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger className="w-[130px] h-9 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending" className="text-base">Achieved?</SelectItem>
                    <SelectItem value="yes" className="text-base">Yes</SelectItem>
                    <SelectItem value="no" className="text-base">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-16 w-16 mb-3"
                onClick={() => setNotesOpen(true)}
              >
                <FileText className="size-12" strokeWidth={0.75} />
              </Button>
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
      </>
    )
  }

  // Overview variant
  return (
    <>
      <div className={`flex-1 p-3 border-l border-border ${borderClass}`}>
        {/* Title spanning full width — largest text */}
        <h3 className="text-lg font-semibold mb-1.5 text-center">{label}</h3>

        {isArchived ? (
          <div className="flex items-center gap-1.5 mt-1">
            {statusDisplay.icon}
            <span className={`text-base ${statusDisplay.colorClass}`}>
              {statusDisplay.label}
            </span>
          </div>
        ) : (
          /* Two-column body with vertical divider */
          <div className="flex">
            {/* Left column: countdown + due date + status label */}
            <div className="flex-1 min-w-0 pr-2">
              {countdownDisplay.parts ? (
                <div className="space-y-0 leading-tight mb-1">
                  <p>
                    <span className={`text-base font-semibold ${countdownDisplay.isNegative ? 'text-red-500' : ''}`}>{countdownDisplay.parts.days.number}</span>
                    {' '}
                    <span className={`text-sm ${countdownDisplay.isNegative ? 'text-red-400' : 'text-muted-foreground'}`}>{countdownDisplay.parts.days.unit}</span>
                  </p>
                  <p>
                    <span className={`text-base font-semibold ${countdownDisplay.isNegative ? 'text-red-500' : ''}`}>{countdownDisplay.parts.hours.number}</span>
                    {' '}
                    <span className={`text-sm ${countdownDisplay.isNegative ? 'text-red-400' : 'text-muted-foreground'}`}>{countdownDisplay.parts.hours.unit}</span>
                  </p>
                  <p>
                    <span className={`text-base font-semibold ${countdownDisplay.isNegative ? 'text-red-500' : ''}`}>{countdownDisplay.parts.mins.number}</span>
                    <span className={`text-sm ${countdownDisplay.isNegative ? 'text-red-400' : 'text-muted-foreground'}`}>{countdownDisplay.parts.mins.unit}</span>
                    {' '}
                    <span className={`text-base font-semibold ${countdownDisplay.isNegative ? 'text-red-500' : ''}`}>{countdownDisplay.parts.secs.number}</span>
                    <span className={`text-sm ${countdownDisplay.isNegative ? 'text-red-400' : 'text-muted-foreground'}`}>{countdownDisplay.parts.secs.unit}</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-0 leading-tight mb-1">
                  {countdownDisplay.fallbackLines.map((line, i) => (
                    <p key={i} className="text-base font-medium">{line}</p>
                  ))}
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-1.5">
                {formatDueTime(dueAtEffective)}
              </p>
              <div className="flex items-center gap-1">
                {statusDisplay.icon}
                <span className={`text-sm ${statusDisplay.colorClass}`}>
                  {statusDisplay.label}
                </span>
              </div>
            </div>

            {/* Vertical divider */}
            <div className="w-px bg-border self-stretch" />

            {/* Right column: status dropdown + notes icon */}
            <div className="flex flex-col items-center justify-between pl-4 min-w-[100px]">
              <Select
                value={experience.status}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="w-[120px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending" className="text-sm">Achieved?</SelectItem>
                  <SelectItem value="yes" className="text-sm">Yes</SelectItem>
                  <SelectItem value="no" className="text-sm">No</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-14 w-14 mb-2"
                onClick={() => setNotesOpen(true)}
              >
                <FileText className="size-10" strokeWidth={0.75} />
              </Button>
            </div>
          </div>
        )}
      </div>

      <NotesModal
        open={notesOpen}
        onOpenChange={setNotesOpen}
        client={client}
        experience={experience}
        updateClientLocal={updateClientLocal}
      />
    </>
  )
}

function getStatusDisplay(
  derivedStatus: DerivedStatus,
  secondsRemaining: number,
  experience: ClientExperience
): { icon: React.ReactNode; label: string; colorClass: string } {
  switch (derivedStatus) {
    case 'done': {
      const earlyBy = secondsRemaining > 0 ? formatDuration(secondsRemaining) : ''
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
        label: earlyBy ? `Done (early by ${earlyBy})` : 'Done (on time)',
        colorClass: 'text-green-500',
      }
    }
    case 'done_late': {
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
        label: 'Done late',
        colorClass: 'text-amber-500',
      }
    }
    case 'failed': {
      if (experience.status === 'no') {
        return {
          icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
          label: 'Failed',
          colorClass: 'text-red-500',
        }
      }
      // Past due but still pending
      return {
        icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
        label: 'Past due',
        colorClass: 'text-red-500',
      }
    }
    case 'pending':
    default:
      return {
        icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
        label: 'Pending',
        colorClass: 'text-muted-foreground',
      }
  }
}

interface CountdownDisplay {
  /** Single-line summary for focus mode */
  primary: string
  /** Structured parts for split-size rendering (null when text-only) */
  parts: { days: DurationPart; hours: DurationPart; mins: DurationPart; secs: DurationPart } | null
  /** Fallback plain text lines for done/failed states */
  fallbackLines: string[]
  /** Whether the countdown has gone negative (past due) */
  isNegative: boolean
}

function getCountdownDisplay(
  derivedStatus: DerivedStatus,
  secondsRemaining: number,
  experience: ClientExperience,
  dueAtEffective: Date,
  variant: 'overview' | 'focus'
): CountdownDisplay {
  if (derivedStatus === 'done' || derivedStatus === 'done_late') {
    if (experience.completed_at) {
      const completedDate = new Date(experience.completed_at)
      const diff = (dueAtEffective.getTime() - completedDate.getTime()) / 1000
      const prefix = diff >= 0 ? 'Early by' : 'Late by'
      const duration = formatDuration(Math.abs(diff))
      return {
        primary: `${prefix} ${duration}`,
        parts: null,
        fallbackLines: [prefix, duration],
        isNegative: false,
      }
    }
    return { primary: 'Completed', parts: null, fallbackLines: ['Completed'], isNegative: false }
  }

  if (derivedStatus === 'failed' && experience.status === 'pending') {
    const overdue = Math.abs(secondsRemaining)
    const parts = formatDurationParts(overdue)
    // Negate the numbers to indicate past due
    const negativeParts = {
      days: { number: `-${parts.days.number}`, unit: parts.days.unit },
      hours: { number: `-${parts.hours.number}`, unit: parts.hours.unit },
      mins: { number: `-${parts.mins.number}`, unit: parts.mins.unit },
      secs: { number: `-${parts.secs.number}`, unit: parts.secs.unit },
    }
    return {
      primary: `Past due by ${formatDuration(overdue)}`,
      parts: negativeParts,
      fallbackLines: [],
      isNegative: true,
    }
  }

  if (derivedStatus === 'failed') {
    return { primary: 'Failed', parts: null, fallbackLines: ['Failed'], isNegative: false }
  }

  // Pending with time remaining
  const parts = formatDurationParts(secondsRemaining)
  return {
    primary: `Due in ${formatDuration(secondsRemaining)}`,
    parts,
    fallbackLines: [],
    isNegative: false,
  }
}

function getBorderClass(
  urgency: 'normal' | 'yellow' | 'red',
  derivedStatus: DerivedStatus
): string {
  if (derivedStatus === 'done') return 'border-l-2 border-l-green-500/30'
  if (derivedStatus === 'done_late') return 'border-l-2 border-l-amber-500/30'
  if (derivedStatus === 'failed') return 'border-l-2 border-l-red-500/50 bg-red-500/5'

  switch (urgency) {
    case 'red':
      return 'border-l-2 border-l-red-500/50 bg-red-500/5'
    case 'yellow':
      return 'border-l-2 border-l-amber-500/40 bg-amber-500/5'
    default:
      return ''
  }
}
