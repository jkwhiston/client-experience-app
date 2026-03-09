export type TaskDumpStatus = 'pending' | 'in_progress' | 'done'

export type TaskDumpPriorityFlag = 'none' | 'low' | 'medium' | 'high'

export type TaskDumpAttachmentKind = 'image' | 'audio' | 'video' | 'file'

export interface TaskDumpAttachment {
  id: string
  file_name: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  media_kind: TaskDumpAttachmentKind
  created_at: string
}

export interface TaskDumpWorkspaceBlock {
  id: string
  task_id: string
  label: string | null
  content: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TaskDumpTask {
  id: string
  title: string | null
  body: string
  status: TaskDumpStatus
  column_order: number
  priority_flag: TaskDumpPriorityFlag
  due_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  workspace_blocks: TaskDumpWorkspaceBlock[]
  attachments: TaskDumpAttachment[]
}

export interface TaskDumpThought {
  id: string
  title: string | null
  content: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  attachments: TaskDumpAttachment[]
}

export interface TaskDumpSnapshot {
  tasks: TaskDumpTask[]
  thoughts: TaskDumpThought[]
}

export const TASK_DUMP_STATUSES: TaskDumpStatus[] = [
  'pending',
  'in_progress',
  'done',
]

export const TASK_DUMP_STATUS_LABELS: Record<TaskDumpStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
}

export const TASK_DUMP_PRIORITY_OPTIONS: {
  value: TaskDumpPriorityFlag
  label: string
  className: string
}[] = [
  { value: 'none', label: 'No flag', className: 'text-muted-foreground' },
  { value: 'low', label: 'Low', className: 'text-sky-500' },
  { value: 'medium', label: 'Medium', className: 'text-amber-500' },
  { value: 'high', label: 'High', className: 'text-rose-500' },
]

export const TASK_DUMP_ATTACHMENT_BUCKET = 'c-street-dump'

export const TASK_DUMP_QUICK_LINKS = [
  {
    id: 'c-street-brain',
    label: 'C Street Brain',
    href: 'https://cstreet-brain.vercel.app/',
  },
  {
    id: 'openphone',
    label: 'QUO',
    href: 'https://my.openphone.com/inbox/PNnOCf04NM/c/CNcf45ea5efc0d40688edf9e9a5c2b2437',
  },
  {
    id: 'taxdome',
    label: 'TaxDome',
    href: 'https://cstreettax.taxdome.com/login',
  },
  {
    id: 'john-gmail',
    label: "John's Gmail",
    href: 'https://mail.google.com/mail/u/0/d/AEoRXRSc7ldY1RRe5lexEbOJr0GUx-xTSTsjnSdGu3ECswSKRdxU/#inbox',
  },
  {
    id: 'jake-gmail',
    label: "Jake's Gmail",
    href: 'https://mail.google.com/mail/u/0/#inbox',
  },
] as const

export function formatTaskDumpTimestamp(value: string | null): string {
  if (!value) return 'Not set'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTaskDumpDate(value: string | null): string {
  if (!value) return 'No due date'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function getTaskDumpAttachmentKind(
  mimeType: string | null | undefined
): TaskDumpAttachmentKind {
  if (!mimeType) return 'file'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}
