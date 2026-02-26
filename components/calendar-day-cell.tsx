'use client'

import type { DerivedStatus, ExperienceType } from '@/lib/types'
import { getExperienceLabel } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface CalendarEvent {
  clientId: string
  clientName: string
  experienceId: string
  experienceType: ExperienceType
  monthNumber?: number
  derivedStatus: DerivedStatus
  isActive: boolean
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

const STATUS_CHIP_STYLES: Record<string, string> = {
  pending: 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25',
  pending_inactive: 'bg-muted/60 text-muted-foreground border-border hover:bg-muted',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25',
  done: 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25',
  done_late: 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',
}

function getChipStyleKey(event: CalendarEvent): string {
  if (event.derivedStatus === 'pending' && !event.isActive) return 'pending_inactive'
  return event.derivedStatus
}

const INITIAL_SHORT_LABELS: Partial<Record<ExperienceType, string>> = {
  hour24: '24h',
  day10: '10d',
  day30: '30d',
}

function getShortLabel(event: CalendarEvent): string {
  if (event.experienceType === 'monthly' && event.monthNumber != null) {
    return `${event.monthNumber}mo`
  }
  return INITIAL_SHORT_LABELS[event.experienceType] ?? event.experienceType
}

function getFullLabel(event: CalendarEvent): string {
  if (event.experienceType === 'monthly') {
    return getExperienceLabel({ experience_type: 'monthly', month_number: event.monthNumber ?? null } as never)
  }
  return getExperienceLabel({ experience_type: event.experienceType, month_number: null } as never)
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
            key={`${event.clientId}-${event.experienceId}`}
            onClick={() => onEventClick(event)}
            className={cn(
              'flex items-center gap-1 w-full rounded border px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-colors cursor-pointer',
              STATUS_CHIP_STYLES[getChipStyleKey(event)],
            )}
            title={`${event.clientName} — ${getFullLabel(event)}`}
          >
            <span className="shrink-0 opacity-80">{getShortLabel(event)}</span>
            <span className="truncate">{event.clientName}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
