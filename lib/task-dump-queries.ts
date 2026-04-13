import { createClient } from '@/lib/supabase/client'
import type {
  TaskDumpAttachment,
  TaskDumpPriorityFlag,
  TaskDumpSnapshot,
  TaskDumpStatus,
} from '@/lib/task-dump-types'
import {
  TASK_DUMP_ATTACHMENT_BUCKET,
  getTaskDumpAttachmentKind,
} from '@/lib/task-dump-types'

const supabase = createClient()

async function requestTaskDump(
  init?: RequestInit
): Promise<TaskDumpSnapshot> {
  const response = await fetch('/api/task-dump', {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.assign('/login')
    }
    throw new Error('Your session expired. Redirecting to login.')
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (typeof window !== 'undefined' && response.redirected && response.url.includes('/login')) {
      window.location.assign('/login')
      throw new Error('Your session expired. Redirecting to login.')
    }

    throw new Error('Task Dump returned a non-JSON response.')
  }

  let json: { error?: string; snapshot?: TaskDumpSnapshot }
  try {
    json = (await response.json()) as { error?: string; snapshot?: TaskDumpSnapshot }
  } catch {
    throw new Error('Task Dump returned invalid JSON.')
  }

  if (!response.ok) {
    throw new Error(json?.error || 'Task Dump request failed.')
  }

  return json.snapshot as TaskDumpSnapshot
}

async function mutateTaskDump(action: string, payload: Record<string, unknown>) {
  return requestTaskDump({
    method: 'POST',
    body: JSON.stringify({
      action,
      ...payload,
    }),
  })
}

export async function fetchTaskDumpSnapshot(): Promise<TaskDumpSnapshot> {
  return requestTaskDump({ method: 'GET' })
}

export async function createTaskDumpTask(payload: {
  title?: string | null
  body?: string
  priorityFlag?: TaskDumpPriorityFlag
  dueAt?: string | null
}) {
  return mutateTaskDump('createTask', payload)
}

export async function updateTaskDumpTask(
  id: string,
  payload: {
    title?: string | null
    body?: string
    status?: TaskDumpStatus
    columnOrder?: number
    priorityFlag?: TaskDumpPriorityFlag
    dueAt?: string | null
  }
) {
  return mutateTaskDump('updateTask', { id, ...payload })
}

export async function deleteTaskDumpTask(id: string) {
  return mutateTaskDump('deleteTask', { id })
}

export async function restoreTaskDumpTask(id: string) {
  return mutateTaskDump('restoreTask', { id })
}

export async function reorderTaskDumpTasks(
  updates: { id: string; status: TaskDumpStatus; columnOrder: number }[]
) {
  return mutateTaskDump('reorderTasks', { updates })
}

export async function createTaskDumpBlock(payload: {
  taskId: string
  label?: string | null
  content?: string
}) {
  return mutateTaskDump('createTaskBlock', payload)
}

export async function updateTaskDumpBlock(
  id: string,
  payload: {
    label?: string | null
    content?: string
    sortOrder?: number
  }
) {
  return mutateTaskDump('updateTaskBlock', { id, ...payload })
}

export async function deleteTaskDumpBlock(id: string) {
  return mutateTaskDump('deleteTaskBlock', { id })
}

export async function createTaskDumpThought(payload: {
  title?: string | null
  content?: string
}) {
  return mutateTaskDump('createThought', payload)
}

export async function updateTaskDumpThought(
  id: string,
  payload: {
    title?: string | null
    content?: string
    sortOrder?: number
  }
) {
  return mutateTaskDump('updateThought', { id, ...payload })
}

export async function deleteTaskDumpThought(id: string) {
  return mutateTaskDump('deleteThought', { id })
}

export async function restoreTaskDumpThought(id: string) {
  return mutateTaskDump('restoreThought', { id })
}

export function getTaskDumpAttachmentUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from(TASK_DUMP_ATTACHMENT_BUCKET)
    .getPublicUrl(storagePath)

  return data.publicUrl
}

async function uploadAttachmentFile(
  parentFolder: string,
  file: File
): Promise<{ storagePath: string; attachment: Omit<TaskDumpAttachment, 'id' | 'created_at'> }> {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : null
  const storagePath = `${parentFolder}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`

  const upload = await supabase.storage
    .from(TASK_DUMP_ATTACHMENT_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

  if (upload.error) {
    throw new Error(upload.error.message)
  }

  return {
    storagePath,
    attachment: {
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size: file.size,
      media_kind: getTaskDumpAttachmentKind(file.type),
    },
  }
}

export async function uploadTaskDumpTaskAttachment(taskId: string, file: File) {
  const upload = await uploadAttachmentFile(`tasks/${taskId}`, file)

  try {
    return await mutateTaskDump('createTaskAttachment', {
      taskId,
      fileName: upload.attachment.file_name,
      storagePath: upload.storagePath,
      mimeType: upload.attachment.mime_type,
      fileSize: upload.attachment.file_size,
      mediaKind: upload.attachment.media_kind,
    })
  } catch (error) {
    await supabase.storage.from(TASK_DUMP_ATTACHMENT_BUCKET).remove([upload.storagePath])
    throw error
  }
}

export async function uploadTaskDumpThoughtAttachment(thoughtId: string, file: File) {
  const upload = await uploadAttachmentFile(`thoughts/${thoughtId}`, file)

  try {
    return await mutateTaskDump('createThoughtAttachment', {
      thoughtId,
      fileName: upload.attachment.file_name,
      storagePath: upload.storagePath,
      mimeType: upload.attachment.mime_type,
      fileSize: upload.attachment.file_size,
      mediaKind: upload.attachment.media_kind,
    })
  } catch (error) {
    await supabase.storage.from(TASK_DUMP_ATTACHMENT_BUCKET).remove([upload.storagePath])
    throw error
  }
}

export async function deleteTaskDumpAttachment(params: {
  id: string
  targetType: 'task' | 'thought'
  storagePath: string
}) {
  await supabase.storage
    .from(TASK_DUMP_ATTACHMENT_BUCKET)
    .remove([params.storagePath])

  return mutateTaskDump('deleteAttachment', {
    id: params.id,
    targetType: params.targetType,
  })
}
