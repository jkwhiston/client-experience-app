import { addDays, addMonths } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { ExperienceType, ExperienceStatus, DerivedStatus, ClientWithExperiences, ClientExperience } from './types'
import { EXPERIENCE_TYPES } from './types'

const FIRM_TIMEZONE = process.env.NEXT_PUBLIC_FIRM_TIMEZONE || 'America/New_York'

/**
 * Get the deadline for a given experience type based on signed-on date.
 * All deadlines are 11:59 PM in the firm timezone.
 *
 * 24h: 11:59 PM on signed_on_date + 1 day
 * 14d: 11:59 PM on signed_on_date + 14 days
 * 30d: 11:59 PM on signed_on_date + 30 days
 * monthly: 11:59 PM on signed_on_date + N months (uses addMonths for proper month-length handling)
 */
export function getDueAt(
  signedOnDate: string | Date,
  experienceType: ExperienceType,
  firmTz: string = FIRM_TIMEZONE,
  monthNumber?: number | null
): Date {
  const baseDate = typeof signedOnDate === 'string' ? new Date(signedOnDate + 'T00:00:00') : signedOnDate

  let targetDate: Date
  if (experienceType === 'monthly' && monthNumber != null) {
    targetDate = addMonths(baseDate, monthNumber)
  } else {
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
      default:
        daysToAdd = 30
        break
    }
    targetDate = addDays(baseDate, daysToAdd)
  }

  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()
  const day = targetDate.getDate()

  const endOfDayInFirmTz = new Date(year, month, day, 23, 59, 0, 0)
  const utcDate = fromZonedTime(endOfDayInFirmTz, firmTz)

  return utcDate
}

/**
 * Get the effective due date for an experience.
 * Uses custom_due_at if set, otherwise falls back to the default computed deadline.
 */
export function getEffectiveDueDate(
  experience: { custom_due_at: string | null; experience_type: ExperienceType; month_number?: number | null },
  signedOnDate: string | Date,
  firmTz: string = FIRM_TIMEZONE
): Date {
  if (experience.custom_due_at) {
    return new Date(experience.custom_due_at)
  }
  return getDueAt(signedOnDate, experience.experience_type, firmTz, experience.month_number)
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

    const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
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
 * Get the nearest active deadline for a client across all experience types.
 * "Active" means the DB status is 'pending' (includes overdue-but-not-resolved).
 * Returns the effective due date of the nearest active deadline, or null if none.
 */
export function getNextActiveDeadline(
  client: ClientWithExperiences,
): Date | null {
  let nearest: Date | null = null

  for (const expType of EXPERIENCE_TYPES) {
    const exp = client.client_experiences.find((e) => e.experience_type === expType)
    if (!exp) continue
    if (exp.status !== 'pending') continue

    const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
    const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)

    if (nearest === null || dueAtEff.getTime() < nearest.getTime()) {
      nearest = dueAtEff
    }
  }

  return nearest
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
export function formatDurationCompact(totalSeconds: number): { line1: string; line2: string } {
  const negative = totalSeconds < 0
  const prefix = negative ? '-' : ''
  const abs = Math.abs(Math.floor(totalSeconds))
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)

  if (days > 0) return { line1: `${prefix}${days}d`, line2: `${hours}h` }
  if (hours > 0) return { line1: `${prefix}${hours}h`, line2: `${minutes}m` }
  return { line1: `${prefix}${minutes}m`, line2: '' }
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
      if (secondsRemaining <= 8 * 3600) return 'red'
      return 'normal'
    case 'day14':
    case 'day30':
      if (secondsRemaining <= 2 * 86400) return 'red'
      if (secondsRemaining <= 5 * 86400) return 'yellow'
      return 'normal'
    case 'monthly':
      // More lax thresholds: red when <= 3 days, yellow when <= 7 days
      if (secondsRemaining <= 3 * 86400) return 'red'
      if (secondsRemaining <= 7 * 86400) return 'yellow'
      return 'normal'
  }
}

/**
 * Format duration with seconds, split into two lines for active node display.
 * Line 1: days/hours, Line 2: minutes/seconds
 */
export function formatDurationWithSeconds(totalSeconds: number): { line1: string; line2: string } {
  const abs = Math.abs(Math.floor(totalSeconds))
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = abs % 60

  if (days > 0) {
    return {
      line1: `${days}d ${hours}h`,
      line2: `${minutes}m ${seconds}s`,
    }
  }
  if (hours > 0) {
    return {
      line1: `${hours}h ${minutes}m`,
      line2: `${seconds}s`,
    }
  }
  return {
    line1: `${minutes}m`,
    line2: `${seconds}s`,
  }
}

/**
 * Format overdue duration as two-line string for active node display.
 * Line 2 includes "(LATE)".
 */
export function formatLateCompactTwoLine(secondsOverdue: number): { line1: string; line2: string } {
  const abs = Math.floor(secondsOverdue)
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const seconds = abs % 60

  if (days > 0) {
    return {
      line1: `-${days}d ${hours}h`,
      line2: `${minutes}m ${seconds}s (LATE)`,
    }
  }
  if (hours > 0) {
    return {
      line1: `-${hours}h ${minutes}m`,
      line2: `${seconds}s (LATE)`,
    }
  }
  return {
    line1: `-${minutes}m`,
    line2: `${seconds}s (LATE)`,
  }
}

/**
 * Format overdue duration as negative compact string.
 * e.g. "-41m" or "-2d 5h"
 */
export function formatLateCompact(secondsOverdue: number): string {
  const abs = Math.floor(secondsOverdue)
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)

  if (days > 0) return `-${days}d ${hours}h`
  if (hours > 0) return `-${hours}h ${minutes}m`
  return `-${minutes}m`
}

/**
 * Format completion date for display.
 * e.g. "Completed Feb 9"
 */
export function formatCompletedShort(completedAt: string, firmTz: string = FIRM_TIMEZONE): string {
  const zoned = toZonedTime(new Date(completedAt), firmTz)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[zoned.getMonth()]
  const day = zoned.getDate()
  return `Completed ${month} ${day}`
}

/**
 * Format due date short for timeline (date only for future, full for active/late).
 * e.g. "Feb 16" or "Feb 3, 11:59 PM"
 */
export function formatDueShort(dueAt: Date, includeTime: boolean = false, firmTz: string = FIRM_TIMEZONE): string {
  const zoned = toZonedTime(dueAt, firmTz)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[zoned.getMonth()]
  const day = zoned.getDate()
  if (includeTime) {
    const hours = zoned.getHours()
    const minutes = zoned.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${month} ${day}, ${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`
  }
  return `${month} ${day}`
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

/**
 * Format a completion date with full detail for the metadata row.
 * e.g. "Feb 9, 2026 at 12:00 PM"
 */
export function formatCompletedDateFull(completedAt: string, firmTz: string = FIRM_TIMEZONE): string {
  const zoned = toZonedTime(new Date(completedAt), firmTz)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[zoned.getMonth()]
  const day = zoned.getDate()
  const year = zoned.getFullYear()
  const hours = zoned.getHours()
  const minutes = zoned.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${month} ${day}, ${year} at ${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`
}

/**
 * Compute the relative timing between a completion date and a deadline.
 * Returns a human-readable label and whether the completion was early.
 * e.g. { label: "2d 5h", isEarly: true } or { label: "1d 3h", isEarly: false }
 */
export function formatRelativeTiming(
  completedAt: string,
  dueAt: Date
): { label: string; isEarly: boolean } {
  const completedDate = new Date(completedAt)
  const diffMs = dueAt.getTime() - completedDate.getTime()
  const isEarly = diffMs >= 0
  const absSec = Math.abs(Math.floor(diffMs / 1000))

  if (absSec < 60) {
    return { label: 'On time', isEarly: true }
  }

  const days = Math.floor(absSec / 86400)
  const hours = Math.floor((absSec % 86400) / 3600)
  const minutes = Math.floor((absSec % 3600) / 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (days === 0 && minutes > 0) parts.push(`${minutes}m`)

  return { label: parts.join(' ') || 'On time', isEarly }
}

/**
 * Get all monthly experiences for a client, sorted by month_number ascending.
 */
export function getMonthlyExperiences(client: ClientWithExperiences): ClientExperience[] {
  return client.client_experiences
    .filter((e) => e.experience_type === 'monthly' && e.month_number != null)
    .sort((a, b) => (a.month_number ?? 0) - (b.month_number ?? 0))
}

/**
 * Get the "active" monthly stage — the first monthly experience that is pending or failed.
 * Returns the experience's month_number, or null if all monthly stages are done
 * or the initial 30-day onboarding experience hasn't been resolved yet.
 */
export function getActiveStageMonthly(
  client: ClientWithExperiences,
  now: Date = new Date()
): number | null {
  const day30 = client.client_experiences.find((e) => e.experience_type === 'day30')
  if (day30 && day30.status === 'pending') return null

  const nowEff = getNowEffective(client, now)
  const monthlyExps = getMonthlyExperiences(client)

  for (const exp of monthlyExps) {
    const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
    const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
    const derivedStatus = getDerivedStatus({
      status: exp.status,
      completed_at: exp.completed_at,
      dueAt: dueAtEff,
      now: nowEff,
    })

    if (derivedStatus === 'pending' || derivedStatus === 'failed') {
      return exp.month_number
    }
  }
  return null
}

/**
 * Determine which 3 monthly experiences to display in the sliding window.
 *
 * 1. Find the first pending monthly experience (lowest month_number still active)
 * 2. Show that month and the next 2
 * 3. If all complete, show the last 3 completed
 * 4. If not enough experiences exist, show what's available
 */
export function getVisibleMonthlyExperiences(
  client: ClientWithExperiences,
  now: Date = new Date()
): ClientExperience[] {
  const nowEff = getNowEffective(client, now)
  const monthlyExps = getMonthlyExperiences(client)

  if (monthlyExps.length === 0) return []

  // Find the index of the first pending/failed experience
  let activeIndex = -1
  for (let i = 0; i < monthlyExps.length; i++) {
    const exp = monthlyExps[i]
    const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
    const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
    const derived = getDerivedStatus({
      status: exp.status,
      completed_at: exp.completed_at,
      dueAt: dueAtEff,
      now: nowEff,
    })
    if (derived === 'pending' || derived === 'failed') {
      activeIndex = i
      break
    }
  }

  if (activeIndex >= 0) {
    return monthlyExps.slice(activeIndex, activeIndex + 3)
  }

  // All complete: show last 3
  return monthlyExps.slice(-3)
}

/**
 * Get the nearest active monthly deadline for a client.
 * Returns the effective due date of the nearest pending monthly experience, or null.
 */
export function getNextMonthlyDeadline(
  client: ClientWithExperiences,
): Date | null {
  let nearest: Date | null = null
  const monthlyExps = getMonthlyExperiences(client)

  for (const exp of monthlyExps) {
    if (exp.status !== 'pending') continue

    const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
    const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)

    if (nearest === null || dueAtEff.getTime() < nearest.getTime()) {
      nearest = dueAtEff
    }
  }

  return nearest
}
