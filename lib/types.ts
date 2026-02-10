export type ExperienceType = 'hour24' | 'day14' | 'day30'
export type ExperienceStatus = 'pending' | 'yes' | 'no'
export type DerivedStatus = 'pending' | 'done' | 'done_late' | 'failed'
export type FocusTab = 'overview' | 'hour24' | 'day14' | 'day30'
export type StatusFilter = 'all' | 'pending' | 'done' | 'late' | 'failed'
export type ActiveTab = 'active' | 'archived'

export type SortOption =
  | 'name_asc'
  | 'name_desc'
  | 'deadline_hour24'
  | 'deadline_day14'
  | 'deadline_day30'

export interface Client {
  id: string
  name: string
  signed_on_date: string // date string YYYY-MM-DD
  is_archived: boolean
  archived_at: string | null
  paused: boolean
  pause_started_at: string | null
  paused_total_seconds: number
  created_at: string
  updated_at: string
}

export interface ClientExperience {
  id: string
  client_id: string
  experience_type: ExperienceType
  status: ExperienceStatus
  completed_at: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface ClientWithExperiences extends Client {
  client_experiences: ClientExperience[]
}

export const EXPERIENCE_LABELS: Record<ExperienceType, string> = {
  hour24: '24-Hour',
  day14: '14-Day',
  day30: '30-Day',
}

export const EXPERIENCE_TYPES: ExperienceType[] = ['hour24', 'day14', 'day30']
