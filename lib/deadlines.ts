import { addDays } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { ExperienceType, ExperienceStatus, DerivedStatus, ClientWithExperiences } from './types'
import { EXPERIENCE_TYPES } from './types'

const FIRM_TIMEZONE = process.env.NEXT_PUBLIC_FIRM_TIMEZONE || 'America/New_York'

/**
 * Get the deadline for a given experience type based on signed-on date.
 * All deadlines are 11:59 PM in the firm timezone.
 *
 * 24h: 11:59 PM on signed_on_date + 1 day
 * 14d: 11:59 PM on signed_on_date + 14 days
 * 30d: 11:59 PM on signed_on_date + 30 days
 */
export function getDueAt(
  signedOnDate: string | Date,
  experienceType: ExperienceType,
  firmTz: string = FIRM_TIMEZONE
): Date {
  const baseDate = typeof signedOnDate === 'string' ? new Date(signedOnDate + 'T00:00:00') : signedOnDate

  let daysToAdd: number
  switch (experienceType) {
    case 'hour24':
      daysToAdd = 1
      break
    case 'day14':
      daysToAdd = 14
      break
    case 'day30':
      daysToAdd = 30
      break
  }

  const targetDate = addDays(baseDate, daysToAdd)

  // Build end-of-day in firm timezone: 11:59 PM
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()
  const day = targetDate.getDate()

  // Create a date representing 11:59 PM in the firm timezone
  const endOfDayInFirmTz = new Date(year, month, day, 23, 59, 0, 0)
  // Convert from firm timezone to UTC
  const utcDate = fromZonedTime(endOfDayInFirmTz, firmTz)

  return utcDate
}

/**
 * Shift a deadline by the total paused seconds.
 */
export function getDueAtEffective(dueAt: Date, pausedTotalSeconds: number): Date {
  return new Date(dueAt.getTime() + pausedTotalSeconds * 1000)
}

/**
 * Get the effective "now" for a client.
 * If paused, returns pause_started_at (so countdowns freeze).
 * Otherwise returns current time.
 */
export function getNowEffective(client: ClientWithExperiences, now: Date = new Date()): Date {
  if (client.paused && client.pause_started_at) {
    return new Date(client.pause_started_at)
  }
  return now
}

/**
 * Derive the display status from the raw status, completion time, and deadline.
 */
export function getDerivedStatus(params: {
  status: ExperienceStatus
  completed_at: string | null
  dueAt: Date
  now: Date
}): DerivedStatus {
  const { status, completed_at, dueAt, now } = params

  if (status === 'yes') {
    if (completed_at) {
      const completedDate = new Date(completed_at)
      return completedDate <= dueAt ? 'done' : 'done_late'
    }
    return 'done'
  }

  if (status === 'no') {
    return 'failed'
  }

  // status === 'pending'
  if (now > dueAt) {
    return 'failed' // Past due, visually failed (not written to DB)
  }

  return 'pending'
}

/**
 * Get the "active" stage — the first experience that is pending or failed (shows live countdown).
 * Returns null if all stages are done or done_late.
 */
export function getActiveStage(
  client: ClientWithExperiences,
  now: Date = new Date()
): ExperienceType | null {
  const nowEff = getNowEffective(client, now)

  for (const expType of EXPERIENCE_TYPES) {
    const exp = client.client_experiences.find((e) => e.experience_type === expType)
    if (!exp) continue

    const dueAt = getDueAt(client.signed_on_date, expType)
    const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
    const derivedStatus = getDerivedStatus({
      status: exp.status,
      completed_at: exp.completed_at,
      dueAt: dueAtEff,
      now: nowEff,
    })

    if (derivedStatus === 'pending' || derivedStatus === 'failed') {
      return expType
    }
  }
  return null
}

/**
 * Format a duration in seconds to a human-readable string.
 * e.g. "2d 5h 12m 34s"
 */
export function formatDuration(totalSeconds: number): string {
  const abs = Math.abs(Math.floor(totalSeconds))
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = abs % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  return parts.join(' ')
}

/**
 * A number/unit pair for split-size rendering.
 */
export interface DurationPart {
  number: string
  unit: string
}

/**
 * Format duration as multi-line structured parts for card display.
 * Each part has a separate number and unit for independent sizing.
 */
export function formatDurationParts(totalSeconds: number): {
  days: DurationPart
  hours: DurationPart
  mins: DurationPart
  secs: DurationPart
} {
  const abs = Math.abs(Math.floor(totalSeconds))
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = abs % 60

  return {
    days: { number: String(days), unit: days !== 1 ? 'days' : 'day' },
    hours: { number: String(hours), unit: hours !== 1 ? 'hours' : 'hour' },
    mins: { number: String(minutes), unit: 'm' },
    secs: { number: String(seconds).padStart(2, '0'), unit: 's' },
  }
}

/**
 * Format duration compactly for focus mode and mini indicators.
 * e.g. "4h 12m" or "6d"
 */
export function formatDurationCompact(totalSeconds: number): string {
  const abs = Math.abs(Math.floor(totalSeconds))
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)

  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Determine urgency level for countdown coloring.
 * Only applies to pending milestones.
 */
export function getUrgency(
  experienceType: ExperienceType,
  secondsRemaining: number
): 'normal' | 'yellow' | 'red' {
  if (secondsRemaining <= 0) return 'red'

  switch (experienceType) {
    case 'hour24':
      // Red when <= 8 hours
      if (secondsRemaining <= 8 * 3600) return 'red'
      return 'normal'
    case 'day14':
    case 'day30':
      // Red when <= 2 days, yellow when <= 5 days
      if (secondsRemaining <= 2 * 86400) return 'red'
      if (secondsRemaining <= 5 * 86400) return 'yellow'
      return 'normal'
  }
}

/**
 * Format the due date and time display string.
 * e.g. "Due: 2/9/2026, 11:59 PM"
 */
export function formatDueTime(dueAt: Date, firmTz: string = FIRM_TIMEZONE): string {
  const zonedDue = toZonedTime(dueAt, firmTz)
  const month = zonedDue.getMonth() + 1
  const day = zonedDue.getDate()
  const year = zonedDue.getFullYear()
  const hours = zonedDue.getHours()
  const minutes = zonedDue.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12

  return `Due: ${month}/${day}/${year}, ${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`
}

/**
 * Format the due date+time for focus mode subtitle.
 * e.g. "Due: 11:59:59 PM (end of day)"
 */
export function formatDueTimeFull(dueAt: Date, firmTz: string = FIRM_TIMEZONE): string {
  return `${formatDueTime(dueAt, firmTz)} (end of day)`
}
