export type ExperienceType = 'hour24' | 'day14' | 'day30' | 'monthly'
export type ExperienceStatus = 'pending' | 'yes' | 'no'
export type DerivedStatus = 'pending' | 'done' | 'done_late' | 'failed'
export type FocusTab = 'overview' | 'hour24' | 'day14' | 'day30'
export type StatusFilter = 'all' | 'pending' | 'done' | 'late' | 'failed'
export type ActiveTab = 'onboarding' | 'lifecycle' | 'archived'

export type SortOption =
  | 'name_asc'
  | 'name_desc'
  | 'deadline_hour24'
  | 'deadline_day14'
  | 'deadline_day30'
  | 'next_active_deadline'
  | 'next_monthly_deadline'

export interface Client {
  id: string
  name: string
  signed_on_date: string // date string YYYY-MM-DD
  is_archived: boolean
  archived_at: string | null
  paused: boolean
  pause_started_at: string | null
  paused_total_seconds: number
  flag_color: string | null
  created_at: string
  updated_at: string
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export interface ClientExperience {
  id: string
  client_id: string
  experience_type: ExperienceType
  status: ExperienceStatus
  completed_at: string | null
  custom_due_at: string | null
  notes: string
  todos: TodoItem[]
  month_number: number | null
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
  monthly: 'Monthly',
}

export const EXPERIENCE_TYPES: ExperienceType[] = ['hour24', 'day14', 'day30']

export const INITIAL_EXPERIENCE_TYPES: ExperienceType[] = ['hour24', 'day14', 'day30']

export const MONTHLY_MONTH_RANGE = { min: 2, max: 18 }

export const FLAG_COLORS: { key: string; label: string; rgb: string }[] = [
  { key: 'red',    label: 'Red',    rgb: '239,68,68'   },
  { key: 'orange', label: 'Orange', rgb: '249,115,22'  },
  { key: 'amber',  label: 'Amber',  rgb: '245,158,11'  },
  { key: 'green',  label: 'Green',  rgb: '34,197,94'   },
  { key: 'blue',   label: 'Blue',   rgb: '59,130,246'  },
  { key: 'purple', label: 'Purple', rgb: '168,85,247'  },
  { key: 'pink',   label: 'Pink',   rgb: '236,72,153'  },
]

export function getMonthlyLabel(monthNumber: number | null): string {
  if (monthNumber == null) return 'Monthly'
  return `${monthNumber}-Month`
}

export function getExperienceLabel(exp: ClientExperience): string {
  if (exp.experience_type === 'monthly') {
    return getMonthlyLabel(exp.month_number)
  }
  return EXPERIENCE_LABELS[exp.experience_type]
}
