'use client'

import type { DerivedStatus, ExperienceType } from '@/lib/types'
import { EXPERIENCE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface CalendarEvent {
  clientId: string
  clientName: string
  experienceId: string
  experienceType: ExperienceType
  derivedStatus: DerivedStatus
  dueDate: Date
}

interface CalendarDayCellProps {
  date: Date
  events: CalendarEvent[]
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
  onEventClick: (event: CalendarEvent) => void
}

const STATUS_CHIP_STYLES: Record<DerivedStatus, string> = {
  pending: 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25',
  done: 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25',
  done_late: 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',
}

const EXPERIENCE_SHORT_LABELS: Record<ExperienceType, string> = {
  hour24: '24h',
  day14: '14d',
  day30: '30d',
}

export function CalendarDayCell({
  date,
  events,
  isCurrentMonth,
  isToday,
  isWeekend,
  onEventClick,
}: CalendarDayCellProps) {
  return (
    <div
      className={cn(
        'flex flex-col min-h-0 border-r border-b border-border p-1',
        isToday && 'animate-today-pulse',
        !isToday && !isCurrentMonth && 'calendar-outside-month',
        !isToday && isCurrentMonth && isWeekend && 'bg-muted/25',
      )}
    >
      <div
        className={cn(
          'mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
          isToday && 'bg-primary text-primary-foreground',
          !isToday && isCurrentMonth && 'text-foreground',
          !isToday && !isCurrentMonth && 'text-muted-foreground/50',
        )}
      >
        {date.getDate()}
      </div>

      <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto min-h-0">
        {events.map((event) => (
          <button
            key={`${event.clientId}-${event.experienceType}`}
            onClick={() => onEventClick(event)}
            className={cn(
              'flex items-center gap-1 w-full rounded border px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-colors cursor-pointer',
              STATUS_CHIP_STYLES[event.derivedStatus],
            )}
            title={`${event.clientName} — ${EXPERIENCE_LABELS[event.experienceType]}`}
          >
            <span className="shrink-0 opacity-80">{EXPERIENCE_SHORT_LABELS[event.experienceType]}</span>
            <span className="truncate">{event.clientName}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
