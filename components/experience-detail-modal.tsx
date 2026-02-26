'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import type { ClientWithExperiences, ClientExperience, ExperienceStatus } from '@/lib/types'
import { EXPERIENCE_TYPES, getExperienceLabel } from '@/lib/types'
import {
  getEffectiveDueDate,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
  formatDuration,
  formatDueTime,
  formatCompletedDateFull,
  formatRelativeTiming,
} from '@/lib/deadlines'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { updateExperience, updateClient } from '@/lib/queries'
import { trackAutoFails, getAutoFails, clearAutoFails } from '@/lib/auto-fail-tracker'
import { toast } from 'sonner'
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
  isActiveStage?: boolean
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
  isActiveStage = true,
  onOpenNotes,
  updateClientLocal,
}: ExperienceDetailModalProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [intakeCalendarOpen, setIntakeCalendarOpen] = useState(false)
  const [completionCalendarOpen, setCompletionCalendarOpen] = useState(false)

  // Staged date+time for the completion date picker
  const [stagedDate, setStagedDate] = useState<Date | null>(null)
  const [stagedHour, setStagedHour] = useState(12)
  const [stagedMinute, setStagedMinute] = useState(0)
  const [stagedAmPm, setStagedAmPm] = useState<'AM' | 'PM'>('PM')

  // Staged date+time for the deadline picker
  const [deadlineCalendarOpen, setDeadlineCalendarOpen] = useState(false)
  const [stagedDeadlineDate, setStagedDeadlineDate] = useState<Date | null>(null)
  const [stagedDeadlineHour, setStagedDeadlineHour] = useState(11)
  const [stagedDeadlineMinute, setStagedDeadlineMinute] = useState(59)
  const [stagedDeadlineAmPm, setStagedDeadlineAmPm] = useState<'AM' | 'PM'>('PM')

  // Controlled calendar months for stable navigation
  const [signedOnMonth, setSignedOnMonth] = useState<Date>(() => parseISO(client.signed_on_date))
  const [intakeMonth, setIntakeMonth] = useState<Date>(() => client.initial_intake_date ? parseISO(client.initial_intake_date) : new Date())
  const [deadlineMonth, setDeadlineMonth] = useState<Date>(() => new Date())
  const [completionMonth, setCompletionMonth] = useState<Date>(() => new Date())

  // Direct date entry text inputs
  const [signedOnInput, setSignedOnInput] = useState('')
  const [intakeInput, setIntakeInput] = useState('')
  const [deadlineInput, setDeadlineInput] = useState('')
  const [completionInput, setCompletionInput] = useState('')

  const expType = experience.experience_type
  const label = getExperienceLabel(experience)

  const dueAt = useMemo(
    () => getEffectiveDueDate(experience, client.signed_on_date, undefined, client.initial_intake_date),
    [client.signed_on_date, client.initial_intake_date, experience.custom_due_at, experience.experience_type, experience.month_number]
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
  // Both 'done' and 'done_late' map to 'done' — late is derived from completion date
  const selectValue = useMemo(() => {
    switch (derivedStatus) {
      case 'done':
      case 'done_late':
        return 'done'
      case 'failed':
        if (experience.status === 'no') return 'failed'
        return 'pending' // Past due but still pending in DB
      case 'pending':
      default:
        return 'pending'
    }
  }, [derivedStatus, experience.status])

  // Relative timing for completed experiences
  const relativeTiming = useMemo(() => {
    if ((derivedStatus === 'done' || derivedStatus === 'done_late') && experience.completed_at) {
      return formatRelativeTiming(experience.completed_at, dueAtEffective)
    }
    return null
  }, [derivedStatus, experience.completed_at, dueAtEffective])

  // Hero countdown info
  const heroInfo = useMemo(() => {
    switch (derivedStatus) {
      case 'done': {
        return {
          countdown: relativeTiming?.label === 'On time' ? 'On time' : relativeTiming?.label ?? 'On time',
          subtitle: relativeTiming?.label === 'On time' ? 'Completed on schedule' : 'ahead of schedule',
          statusLabel: 'Done',
          colorClass: 'text-green-500',
          borderClass: 'border-green-500',
          bgClass: 'bg-green-500/5',
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        }
      }
      case 'done_late':
        return {
          countdown: relativeTiming?.label ?? 'Late',
          subtitle: 'behind schedule',
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
        if (!isActiveStage) {
          return {
            countdown: formatDuration(secondsRemaining),
            subtitle: 'Time remaining',
            statusLabel: 'Pending',
            colorClass: 'text-muted-foreground',
            borderClass: 'border-muted-foreground/50',
            bgClass: 'bg-muted/30',
            icon: <Clock className="h-5 w-5 text-muted-foreground" />,
          }
        }
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
  }, [derivedStatus, secondsRemaining, experience.status, relativeTiming, isActiveStage])

  function parseDateInput(value: string): Date | null {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!match) return null
    const [, m, d, y] = match
    const month = parseInt(m) - 1
    const day = parseInt(d)
    const year = parseInt(y)
    const date = new Date(year, month, day)
    if (isNaN(date.getTime()) || date.getMonth() !== month || date.getDate() !== day) return null
    return date
  }

  function formatDateInput(prev: string, raw: string): string {
    // Strip everything except digits
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    // Auto-insert slashes: MM/DD/YYYY
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  }

  function handleSignedOnCalendarOpen(open: boolean) {
    if (open) {
      setSignedOnMonth(parseISO(client.signed_on_date))
      setSignedOnInput('')
    }
    setCalendarOpen(open)
  }

  function handleIntakeCalendarOpen(open: boolean) {
    if (open) {
      const intakeDate = client.initial_intake_date ? parseISO(client.initial_intake_date) : new Date()
      setIntakeMonth(intakeDate)
      setIntakeInput('')
    }
    setIntakeCalendarOpen(open)
  }

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

  async function handleIntakeDateSelect(date: Date | undefined) {
    if (!date) return
    const dateStr = format(date, 'yyyy-MM-dd')
    if (dateStr === client.initial_intake_date) {
      setIntakeCalendarOpen(false)
      return
    }

    const prev = client.initial_intake_date
    updateClientLocal(client.id, (c) => ({ ...c, initial_intake_date: dateStr }))
    setIntakeCalendarOpen(false)
    const ok = await updateClient(client.id, { initial_intake_date: dateStr })
    if (!ok) {
      updateClientLocal(client.id, (c) => ({ ...c, initial_intake_date: prev }))
      toast('Could not save initial intake date.')
    }
  }

  async function handleIntakePulseToggle() {
    const previous = client.initial_intake_pulse_enabled
    const nextValue = !previous
    updateClientLocal(client.id, (c) => ({ ...c, initial_intake_pulse_enabled: nextValue }))
    const ok = await updateClient(client.id, { initial_intake_pulse_enabled: nextValue })
    if (!ok) {
      updateClientLocal(client.id, (c) => ({ ...c, initial_intake_pulse_enabled: previous }))
      toast('Could not update intake pulse setting.')
    }
  }

  const firmTz = process.env.NEXT_PUBLIC_FIRM_TIMEZONE || 'America/New_York'

  function handleCompletionCalendarOpen(open: boolean) {
    if (open && experience.completed_at) {
      // Parse existing completed_at into firm-timezone staged values
      const zoned = toZonedTime(new Date(experience.completed_at), firmTz)
      setStagedDate(zoned)
      setCompletionMonth(zoned)
      setCompletionInput('')
      const h24 = zoned.getHours()
      const ampm = h24 >= 12 ? 'PM' : 'AM'
      const h12 = h24 % 12 || 12
      setStagedHour(h12)
      setStagedMinute(zoned.getMinutes())
      setStagedAmPm(ampm)
    }
    setCompletionCalendarOpen(open)
  }

  function handleStagedDateSelect(date: Date | undefined) {
    if (!date) return
    setStagedDate(date)
    setCompletionMonth(date)
  }

  async function handleCompletionSave() {
    if (!stagedDate) return
    // Combine staged date + time into a firm-timezone datetime, then convert to UTC
    const year = stagedDate.getFullYear()
    const month = stagedDate.getMonth()
    const day = stagedDate.getDate()
    const hours24 = stagedAmPm === 'AM' ? stagedHour % 12 : (stagedHour % 12) + 12
    const localInFirmTz = new Date(year, month, day, hours24, stagedMinute, 0, 0)
    const utcDate = fromZonedTime(localInFirmTz, firmTz)
    const newCompletedAt = utcDate.toISOString()

    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) =>
        e.id === experience.id
          ? { ...e, completed_at: newCompletedAt }
          : e
      ),
    }))

    setCompletionCalendarOpen(false)
    await updateExperience(experience.id, { completed_at: newCompletedAt })
  }

  function handleDeadlineCalendarOpen(open: boolean) {
    if (open) {
      // Initialize staged values from the current effective deadline
      const zoned = toZonedTime(dueAtEffective, firmTz)
      setStagedDeadlineDate(zoned)
      setDeadlineMonth(zoned)
      setDeadlineInput('')
      const h24 = zoned.getHours()
      const ampm = h24 >= 12 ? 'PM' : 'AM'
      const h12 = h24 % 12 || 12
      setStagedDeadlineHour(h12)
      setStagedDeadlineMinute(zoned.getMinutes())
      setStagedDeadlineAmPm(ampm)
    }
    setDeadlineCalendarOpen(open)
  }

  function handleStagedDeadlineDateSelect(date: Date | undefined) {
    if (!date) return
    setStagedDeadlineDate(date)
    setDeadlineMonth(date)
  }

  async function handleDeadlineSave() {
    if (!stagedDeadlineDate) return
    const year = stagedDeadlineDate.getFullYear()
    const month = stagedDeadlineDate.getMonth()
    const day = stagedDeadlineDate.getDate()
    const hours24 = stagedDeadlineAmPm === 'AM' ? stagedDeadlineHour % 12 : (stagedDeadlineHour % 12) + 12
    const localInFirmTz = new Date(year, month, day, hours24, stagedDeadlineMinute, 0, 0)
    const utcDate = fromZonedTime(localInFirmTz, firmTz)
    const newCustomDueAt = utcDate.toISOString()

    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) =>
        e.id === experience.id
          ? { ...e, custom_due_at: newCustomDueAt }
          : e
      ),
    }))

    setDeadlineCalendarOpen(false)
    await updateExperience(experience.id, { custom_due_at: newCustomDueAt })
  }

  async function handleDeadlineReset() {
    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) =>
        e.id === experience.id
          ? { ...e, custom_due_at: null }
          : e
      ),
    }))

    setDeadlineCalendarOpen(false)
    await updateExperience(experience.id, { custom_due_at: null })
  }

  async function handleSelectChange(value: string) {
    let newStatus: ExperienceStatus
    let newCompletedAt: string | null = null

    switch (value) {
      case 'done':
        // Done: completed_at = now; user can adjust via the completion date picker
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

    // Add earlier pending to snapshot before changes
    for (const ep of earlierPending) {
      prevSnapshot.push({ id: ep.id, status: ep.status, completed_at: ep.completed_at })
    }

    // When changing FROM done, auto-revert earlier auto-failed nodes
    const autoFailedIds = experience.status === 'yes' && newStatus !== 'yes'
      ? getAutoFails(experience.id)
      : []
    const toRevert = autoFailedIds.length > 0
      ? client.client_experiences.filter((e) => autoFailedIds.includes(e.id) && e.status === 'no')
      : []

    // Add auto-reverted nodes to snapshot
    for (const r of toRevert) {
      prevSnapshot.push({ id: r.id, status: r.status, completed_at: r.completed_at })
    }

    // Save auto-failed IDs for undo re-population
    const prevAutoFailedIds = [...autoFailedIds]

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
        if (toRevert.some((r) => r.id === e.id)) {
          return { ...e, status: 'pending' as ExperienceStatus, completed_at: null }
        }
        return e
      }),
    }))

    // Track auto-fails (when marking done)
    if (earlierPending.length > 0) {
      trackAutoFails(experience.id, earlierPending.map((ep) => ep.id))
    }

    // Clear auto-fails (when changing from done)
    if (prevAutoFailedIds.length > 0) {
      clearAutoFails(experience.id)
    }

    // Persist to DB
    await updateExperience(experience.id, { status: newStatus, completed_at: newCompletedAt })
    for (const ep of earlierPending) {
      await updateExperience(ep.id, { status: 'no', completed_at: null })
    }
    for (const r of toRevert) {
      await updateExperience(r.id, { status: 'pending', completed_at: null })
    }

    // Show undo toast
    const statusLabel = value === 'done' ? 'Done' : value === 'failed' ? 'Failed' : 'Pending'
    toast.dismiss()
    toast(`${label} set to ${statusLabel}`, {
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
          // Re-populate tracker if we cleared it (undoing a revert)
          if (prevAutoFailedIds.length > 0) {
            trackAutoFails(experience.id, prevAutoFailedIds)
          } else {
            // If we tracked new auto-fails, clear them on undo
            clearAutoFails(experience.id)
          }
          // Persist to DB
          for (const snap of prevSnapshot) {
            await updateExperience(snap.id, { status: snap.status, completed_at: snap.completed_at })
          }
        },
      },
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
              <Popover open={calendarOpen} onOpenChange={handleSignedOnCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    {formatSignedDate(client.signed_on_date)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="px-3 pt-3 pb-1">
                    <input
                      type="text"
                      placeholder="MM/DD/YYYY"
                      value={signedOnInput}
                      onChange={(e) => {
                        const v = formatDateInput(signedOnInput, e.target.value)
                        setSignedOnInput(v)
                        const parsed = parseDateInput(v)
                        if (parsed) setSignedOnMonth(parsed)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const parsed = parseDateInput(signedOnInput)
                          if (parsed) handleDateSelect(parsed)
                        }
                      }}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  </div>
                  <Calendar
                    mode="single"
                    fixedWeeks
                    selected={parseISO(client.signed_on_date)}
                    onSelect={handleDateSelect}
                    month={signedOnMonth}
                    onMonthChange={setSignedOnMonth}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Initial Intake */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Initial Intake
                </span>
              </div>
              <Popover open={intakeCalendarOpen} onOpenChange={handleIntakeCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    {client.initial_intake_date ? formatSignedDate(client.initial_intake_date) : 'Not set'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="px-3 pt-3 pb-1">
                    <input
                      type="text"
                      placeholder="MM/DD/YYYY"
                      value={intakeInput}
                      onChange={(e) => {
                        const v = formatDateInput(intakeInput, e.target.value)
                        setIntakeInput(v)
                        const parsed = parseDateInput(v)
                        if (parsed) setIntakeMonth(parsed)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const parsed = parseDateInput(intakeInput)
                          if (parsed) handleIntakeDateSelect(parsed)
                        }
                      }}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  </div>
                  <Calendar
                    mode="single"
                    fixedWeeks
                    selected={client.initial_intake_date ? parseISO(client.initial_intake_date) : undefined}
                    onSelect={handleIntakeDateSelect}
                    month={intakeMonth}
                    onMonthChange={setIntakeMonth}
                  />
                  <div className="border-t border-border px-3 py-2 flex items-center justify-between">
                    <button
                      onClick={async () => {
                        const prev = client.initial_intake_date
                        updateClientLocal(client.id, (c) => ({ ...c, initial_intake_date: null }))
                        setIntakeCalendarOpen(false)
                        const ok = await updateClient(client.id, { initial_intake_date: null })
                        if (!ok) {
                          updateClientLocal(client.id, (c) => ({ ...c, initial_intake_date: prev }))
                          toast('Could not clear initial intake date.')
                        }
                      }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                    <span />
                  </div>
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
                {experience.custom_due_at && (
                  <span className="text-[9px] font-medium text-amber-500 uppercase tracking-wider">
                    Custom
                  </span>
                )}
              </div>
              <Popover open={deadlineCalendarOpen} onOpenChange={handleDeadlineCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="text-sm font-semibold hover:text-primary transition-colors cursor-pointer text-left"
                  >
                    {formatDueTime(dueAtEffective)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="px-3 pt-3 pb-1">
                    <input
                      type="text"
                      placeholder="MM/DD/YYYY"
                      value={deadlineInput}
                      onChange={(e) => {
                        const v = formatDateInput(deadlineInput, e.target.value)
                        setDeadlineInput(v)
                        const parsed = parseDateInput(v)
                        if (parsed) {
                          setDeadlineMonth(parsed)
                          setStagedDeadlineDate(parsed)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const parsed = parseDateInput(deadlineInput)
                          if (parsed) {
                            setStagedDeadlineDate(parsed)
                            handleDeadlineSave()
                          }
                        }
                      }}
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  </div>
                  <Calendar
                    mode="single"
                    fixedWeeks
                    selected={stagedDeadlineDate ?? dueAtEffective}
                    onSelect={handleStagedDeadlineDateSelect}
                    month={deadlineMonth}
                    onMonthChange={setDeadlineMonth}
                  />
                  {/* Time picker row */}
                  <div className="border-t border-border px-3 py-2.5 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={stagedDeadlineHour}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(12, parseInt(e.target.value) || 1))
                        setStagedDeadlineHour(v)
                      }}
                      className="w-11 h-8 text-center text-sm font-mono rounded-md border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-sm font-mono text-muted-foreground">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={String(stagedDeadlineMinute).padStart(2, '0')}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(59, parseInt(e.target.value) || 0))
                        setStagedDeadlineMinute(v)
                      }}
                      className="w-11 h-8 text-center text-sm font-mono rounded-md border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <select
                      value={stagedDeadlineAmPm}
                      onChange={(e) => setStagedDeadlineAmPm(e.target.value as 'AM' | 'PM')}
                      className="h-8 text-sm font-mono rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                  {/* Save / Reset buttons */}
                  <div className="border-t border-border px-3 py-2 flex items-center justify-between">
                    {experience.custom_due_at ? (
                      <button
                        onClick={handleDeadlineReset}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        Reset to default
                      </button>
                    ) : (
                      <span />
                    )}
                    <Button size="sm" className="h-7 text-xs" onClick={handleDeadlineSave}>
                      Save
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {!client.initial_intake_date && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Intake reminder pulse when blank
              </span>
              <button
                onClick={handleIntakePulseToggle}
                className="text-xs font-medium text-primary hover:underline"
              >
                {client.initial_intake_pulse_enabled ? 'On' : 'Off'}
              </button>
            </div>
          )}

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
                <SelectItem value="failed">
                  <span className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    Failed
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Completion details — visible when done/done_late */}
          {(derivedStatus === 'done' || derivedStatus === 'done_late') && experience.completed_at && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              {/* Completed On — editable date */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Completed On
                  </span>
                </div>
                <Popover open={completionCalendarOpen} onOpenChange={handleCompletionCalendarOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer text-left"
                    >
                      {formatCompletedDateFull(experience.completed_at)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="px-3 pt-3 pb-1">
                      <input
                        type="text"
                        placeholder="MM/DD/YYYY"
                        value={completionInput}
                        onChange={(e) => {
                          const v = formatDateInput(completionInput, e.target.value)
                          setCompletionInput(v)
                          const parsed = parseDateInput(v)
                          if (parsed) {
                            setCompletionMonth(parsed)
                            setStagedDate(parsed)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const parsed = parseDateInput(completionInput)
                            if (parsed) {
                              setStagedDate(parsed)
                              handleCompletionSave()
                            }
                          }
                        }}
                        className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      />
                    </div>
                    <Calendar
                      mode="single"
                      fixedWeeks
                      selected={stagedDate ?? new Date(experience.completed_at)}
                      onSelect={handleStagedDateSelect}
                      month={completionMonth}
                      onMonthChange={setCompletionMonth}
                    />
                    {/* Time picker row */}
                    <div className="border-t border-border px-3 py-2.5 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={stagedHour}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(12, parseInt(e.target.value) || 1))
                          setStagedHour(v)
                        }}
                        className="w-11 h-8 text-center text-sm font-mono rounded-md border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-sm font-mono text-muted-foreground">:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={String(stagedMinute).padStart(2, '0')}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(59, parseInt(e.target.value) || 0))
                          setStagedMinute(v)
                        }}
                        className="w-11 h-8 text-center text-sm font-mono rounded-md border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <select
                        value={stagedAmPm}
                        onChange={(e) => setStagedAmPm(e.target.value as 'AM' | 'PM')}
                        className="h-8 text-sm font-mono rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                    {/* Save button */}
                    <div className="border-t border-border px-3 py-2 flex justify-end">
                      <Button size="sm" className="h-7 text-xs" onClick={handleCompletionSave}>
                        Save
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Relative timing badge */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Timing
                  </span>
                </div>
                {relativeTiming && (
                  <p className={cn(
                    'text-sm font-semibold',
                    relativeTiming.isEarly ? 'text-green-500' : 'text-amber-500'
                  )}>
                    {relativeTiming.label === 'On time'
                      ? 'On time'
                      : relativeTiming.isEarly
                        ? `${relativeTiming.label} early`
                        : `${relativeTiming.label} late`
                    }
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
