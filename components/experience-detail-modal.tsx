'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import type { ClientWithExperiences, ClientExperience, ExperienceStatus } from '@/lib/types'
import { EXPERIENCE_LABELS } from '@/lib/types'
import {
  getDueAt,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
  formatDuration,
  formatDueTimeFull,
  formatCompletedShort,
} from '@/lib/deadlines'
import { updateExperience, updateClient } from '@/lib/queries'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { X, CheckCircle2, XCircle, AlertTriangle, Clock, Calendar as CalendarIcon, Timer, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DerivedStatus } from '@/lib/types'

interface ExperienceDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: ClientWithExperiences
  experience: ClientExperience
  now: Date
  onOpenNotes: () => void
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

export function ExperienceDetailModal({
  open,
  onOpenChange,
  client,
  experience,
  now,
  onOpenNotes,
  updateClientLocal,
}: ExperienceDetailModalProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)

  const expType = experience.experience_type
  const label = EXPERIENCE_LABELS[expType]

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

  // Map derived status to a user-facing select value
  const selectValue = useMemo(() => {
    switch (derivedStatus) {
      case 'done':
        return 'done'
      case 'done_late':
        return 'late'
      case 'failed':
        if (experience.status === 'no') return 'failed'
        return 'pending' // Past due but still pending in DB
      case 'pending':
      default:
        return 'pending'
    }
  }, [derivedStatus, experience.status])

  // Hero countdown info
  const heroInfo = useMemo(() => {
    switch (derivedStatus) {
      case 'done': {
        const earlyBy = secondsRemaining > 0 ? formatDuration(secondsRemaining) : null
        return {
          countdown: earlyBy ?? 'On time',
          subtitle: earlyBy ? 'Completed early' : 'Completed on time',
          statusLabel: 'Done',
          colorClass: 'text-green-500',
          borderClass: 'border-green-500',
          bgClass: 'bg-green-500/5',
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        }
      }
      case 'done_late':
        return {
          countdown: experience.completed_at
            ? formatCompletedShort(experience.completed_at)
            : 'Late',
          subtitle: 'Completed after deadline',
          statusLabel: 'Done Late',
          colorClass: 'text-amber-500',
          borderClass: 'border-amber-500',
          bgClass: 'bg-amber-500/5',
          icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        }
      case 'failed':
        if (experience.status === 'no') {
          return {
            countdown: 'Failed',
            subtitle: 'Marked as not delivered',
            statusLabel: 'Failed',
            colorClass: 'text-red-500',
            borderClass: 'border-red-500',
            bgClass: 'bg-red-500/5',
            icon: <XCircle className="h-5 w-5 text-red-500" />,
          }
        }
        return {
          countdown: `-${formatDuration(Math.abs(secondsRemaining))}`,
          subtitle: 'Overdue',
          statusLabel: 'Past Due',
          colorClass: 'text-red-500',
          borderClass: 'border-red-500',
          bgClass: 'bg-red-500/5',
          icon: <XCircle className="h-5 w-5 text-red-500" />,
        }
      case 'pending':
      default:
        return {
          countdown: formatDuration(secondsRemaining),
          subtitle: 'Time remaining',
          statusLabel: 'Pending',
          colorClass: 'text-blue-500',
          borderClass: 'border-blue-500',
          bgClass: 'bg-blue-500/5',
          icon: <Clock className="h-5 w-5 text-blue-500" />,
        }
    }
  }, [derivedStatus, secondsRemaining, experience.status, experience.completed_at])

  function formatSignedDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  async function handleDateSelect(date: Date | undefined) {
    if (!date) return
    const dateStr = format(date, 'yyyy-MM-dd')
    if (dateStr === client.signed_on_date) {
      setCalendarOpen(false)
      return
    }

    updateClientLocal(client.id, (c) => ({ ...c, signed_on_date: dateStr }))
    setCalendarOpen(false)
    await updateClient(client.id, { signed_on_date: dateStr })
  }

  async function handleSelectChange(value: string) {
    let newStatus: ExperienceStatus
    let newCompletedAt: string | null = null

    switch (value) {
      case 'done':
        // Done on time: completed_at = now (or clamp to dueAt if already past)
        newStatus = 'yes'
        newCompletedAt = new Date(
          Math.min(Date.now(), dueAtEffective.getTime())
        ).toISOString()
        break
      case 'late':
        // Late: completed_at = now (implies after deadline)
        newStatus = 'yes'
        newCompletedAt = new Date().toISOString()
        break
      case 'failed':
        newStatus = 'no'
        newCompletedAt = null
        break
      case 'pending':
      default:
        newStatus = 'pending'
        newCompletedAt = null
        break
    }

    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) =>
        e.id === experience.id
          ? { ...e, status: newStatus, completed_at: newCompletedAt }
          : e
      ),
    }))

    await updateExperience(experience.id, {
      status: newStatus,
      completed_at: newCompletedAt,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[480px] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              {client.name} &bull; {label}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { onOpenChange(false); onOpenNotes() }}
                title="Open notes"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Countdown Hero */}
          <div className={cn(
            'rounded-lg border-l-4 p-4',
            heroInfo.borderClass,
            heroInfo.bgClass
          )}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{heroInfo.icon}</div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-2xl font-mono font-bold tracking-tight leading-tight', heroInfo.colorClass)}>
                  {heroInfo.countdown}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {heroInfo.subtitle} &middot; {heroInfo.statusLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Signed On */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Signed On
                </span>
              </div>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    {formatSignedDate(client.signed_on_date)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseISO(client.signed_on_date)}
                    onSelect={handleDateSelect}
                    defaultMonth={parseISO(client.signed_on_date)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Deadline */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Deadline
                </span>
              </div>
              <p className="text-sm font-semibold">
                {formatDueTimeFull(dueAtEffective)}
              </p>
            </div>
          </div>

          {client.paused && (
            <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-1.5">
              Timers are paused for this client
            </div>
          )}

          {/* Status dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Update Status
            </label>
            <Select value={selectValue} onValueChange={handleSelectChange}>
              <SelectTrigger className="w-full h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Pending
                  </span>
                </SelectItem>
                <SelectItem value="done">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    Done
                  </span>
                </SelectItem>
                <SelectItem value="late">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Late
                  </span>
                </SelectItem>
                <SelectItem value="failed">
                  <span className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    Failed
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
