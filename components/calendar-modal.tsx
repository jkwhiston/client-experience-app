'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import type { ClientWithExperiences, ClientExperience, DerivedStatus, ActiveTab } from '@/lib/types'
import { INITIAL_EXPERIENCE_TYPES } from '@/lib/types'
import {
  getEffectiveDueDate,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
  getActiveStage,
  getActiveStageMonthly,
} from '@/lib/deadlines'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CalendarDayCell, type CalendarEvent } from './calendar-day-cell'
import { ExperienceDetailModal } from './experience-detail-modal'
import { NotesModal } from './notes-modal'

const FIRM_TIMEZONE = process.env.NEXT_PUBLIC_FIRM_TIMEZONE || 'America/New_York'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CalendarModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientWithExperiences[]
  now: Date
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
  activeTab?: ActiveTab
}

export function CalendarModal({
  open,
  onOpenChange,
  clients,
  now,
  updateClientLocal,
  activeTab,
}: CalendarModalProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(now))
  const [showCompleted, setShowCompleted] = useState(false)
  const [showOngoing, setShowOngoing] = useState(() => activeTab === 'lifecycle')

  const [selectedClient, setSelectedClient] = useState<ClientWithExperiences | null>(null)
  const [selectedExperience, setSelectedExperience] = useState<ClientExperience | null>(null)
  const [selectedIsActive, setSelectedIsActive] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [currentMonth])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    const activeClients = clients.filter((c) => !c.is_archived)

    for (const client of activeClients) {
      const nowEff = getNowEffective(client, now)
      const clientActiveStage = getActiveStage(client, now)
      const clientActiveMonthlyStage = getActiveStageMonthly(client, now)

      for (const exp of client.client_experiences) {
        const isInitial = INITIAL_EXPERIENCE_TYPES.includes(exp.experience_type)
        const isMonthly = exp.experience_type === 'monthly'

        if (!isInitial && !isMonthly) continue
        if (isMonthly && !showOngoing) continue

        const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
        const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
        const derived = getDerivedStatus({
          status: exp.status,
          completed_at: exp.completed_at,
          dueAt: dueAtEff,
          now: nowEff,
        })

        if (!showCompleted && (derived === 'done' || derived === 'done_late')) {
          continue
        }

        const isActive = isMonthly
          ? exp.month_number === clientActiveMonthlyStage
          : exp.experience_type === clientActiveStage

        const zonedDue = toZonedTime(dueAtEff, FIRM_TIMEZONE)
        const dateKey = format(zonedDue, 'yyyy-MM-dd')

        const event: CalendarEvent = {
          clientId: client.id,
          clientName: client.name,
          experienceId: exp.id,
          experienceType: exp.experience_type,
          monthNumber: exp.month_number ?? undefined,
          derivedStatus: derived,
          isActive,
          dueDate: dueAtEff,
        }

        const existing = map.get(dateKey) || []
        existing.push(event)
        map.set(dateKey, existing)
      }
    }

    for (const [key, events] of map) {
      events.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      map.set(key, events)
    }

    return map
  }, [clients, now, showCompleted, showOngoing])

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      const client = clients.find((c) => c.id === event.clientId)
      const experience = client?.client_experiences.find(
        (e) => e.id === event.experienceId
      )
      if (client && experience) {
        setSelectedClient(client)
        setSelectedExperience(experience)
        setSelectedIsActive(event.isActive)
        setDetailOpen(true)
      }
    },
    [clients]
  )

  const handlePrevMonth = () => setCurrentMonth((m) => subMonths(m, 1))
  const handleNextMonth = () => setCurrentMonth((m) => addMonths(m, 1))
  const handleToday = () => setCurrentMonth(startOfMonth(now))

  const today = useMemo(() => {
    const z = toZonedTime(now, FIRM_TIMEZONE)
    return new Date(z.getFullYear(), z.getMonth(), z.getDate())
  }, [now])

  const updatedSelectedClient = selectedClient
    ? clients.find((c) => c.id === selectedClient.id) ?? selectedClient
    : null
  const updatedSelectedExperience = updatedSelectedClient && selectedExperience
    ? updatedSelectedClient.client_experiences.find((e) => e.id === selectedExperience.id) ?? selectedExperience
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-6xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleToday}
                  className="text-xs px-2"
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOngoing((v) => !v)}
                className={cn(
                  'text-xs gap-1.5',
                  showOngoing && 'text-violet-400',
                )}
              >
                {showOngoing ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {showOngoing ? 'Lifecycle visible' : 'Lifecycle hidden'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCompleted((v) => !v)}
                className={cn(
                  'text-xs gap-1.5',
                  showCompleted && 'text-green-400',
                )}
              >
                {showCompleted ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {showCompleted ? 'Completed visible' : 'Completed hidden'}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_LABELS.map((day, i) => (
              <div
                key={day}
                className={cn(
                  'py-2 text-center text-xs font-medium text-muted-foreground',
                  i === 0 || i === 6 ? 'bg-muted/60' : 'bg-muted/30',
                )}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            <div
              className="grid grid-cols-7 border-l border-t border-border h-full"
              style={{ gridTemplateRows: `repeat(${calendarDays.length / 7}, 1fr)` }}
            >
              {calendarDays.map((date) => {
                const dateKey = format(date, 'yyyy-MM-dd')
                const events = eventsByDate.get(dateKey) || []
                const dayOfWeek = date.getDay()
                return (
                  <CalendarDayCell
                    key={dateKey}
                    date={date}
                    events={events}
                    isCurrentMonth={isSameMonth(date, currentMonth)}
                    isToday={isSameDay(date, today)}
                    isWeekend={dayOfWeek === 0 || dayOfWeek === 6}
                    onEventClick={handleEventClick}
                  />
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {updatedSelectedClient && updatedSelectedExperience && (
        <>
          <ExperienceDetailModal
            open={detailOpen}
            onOpenChange={setDetailOpen}
            client={updatedSelectedClient}
            experience={updatedSelectedExperience}
            now={now}
            isActiveStage={selectedIsActive}
            onOpenNotes={() => {
              setDetailOpen(false)
              setNotesOpen(true)
            }}
            updateClientLocal={updateClientLocal}
          />
          <NotesModal
            open={notesOpen}
            onOpenChange={setNotesOpen}
            client={updatedSelectedClient}
            experience={updatedSelectedExperience}
            updateClientLocal={updateClientLocal}
          />
        </>
      )}
    </>
  )
}
