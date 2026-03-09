import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  TaskDumpAttachment,
  TaskDumpAttachmentKind,
  TaskDumpSnapshot,
  TaskDumpStatus,
  TaskDumpTask,
  TaskDumpThought,
  TaskDumpWorkspaceBlock,
} from '@/lib/task-dump-types'

type TaskRow = Omit<TaskDumpTask, 'workspace_blocks' | 'attachments'>
type WorkspaceBlockRow = TaskDumpWorkspaceBlock
type ThoughtRow = Omit<TaskDumpThought, 'attachments'>
type AttachmentRow = TaskDumpAttachment
type TaskAttachmentRow = TaskDumpAttachment & { task_id: string }
type ThoughtAttachmentRow = TaskDumpAttachment & { thought_id: string }

const TASKS_TABLE = 'task_dump_tasks'
const BLOCKS_TABLE = 'task_dump_task_workspace_blocks'
const TASK_ATTACHMENTS_TABLE = 'task_dump_task_attachments'
const THOUGHTS_TABLE = 'task_dump_thoughts'
const THOUGHT_ATTACHMENTS_TABLE = 'task_dump_thought_attachments'

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeBody(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function hasContent(title: string | null, body: string): boolean {
  return Boolean(title || body.trim())
}

function normalizeDueAt(value: unknown): string | null {
  if (!value) return null
  if (typeof value !== 'string') return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function normalizePriority(value: unknown): 'none' | 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'none'
}

function normalizeStatus(value: unknown): TaskDumpStatus {
  return value === 'in_progress' || value === 'done' ? value : 'pending'
}

function normalizeAttachmentKind(value: unknown): TaskDumpAttachmentKind {
  if (value === 'image' || value === 'audio' || value === 'video') return value
  return 'file'
}

function ensureNoError(error: { message?: string } | null, fallback: string): void {
  if (error) {
    throw new Error(error.message || fallback)
  }
}

async function getTaskDumpClient() {
  return createServerSupabaseClient()
}

async function getNextTaskOrder(status: TaskDumpStatus): Promise<number> {
  const taskDump = await getTaskDumpClient()
  const { data, error } = await taskDump
    .from(TASKS_TABLE)
    .select('column_order')
    .eq('status', status)
    .is('deleted_at', null)
    .order('column_order', { ascending: false })
    .limit(1)

  ensureNoError(error, 'Could not load next task order.')

  return data && data.length > 0 ? (data[0].column_order as number) + 1 : 0
}

async function getNextThoughtOrder(): Promise<number> {
  const taskDump = await getTaskDumpClient()
  const { data, error } = await taskDump
    .from(THOUGHTS_TABLE)
    .select('sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)

  ensureNoError(error, 'Could not load next thought order.')

  return data && data.length > 0 ? (data[0].sort_order as number) + 1 : 0
}

async function loadSnapshot(): Promise<TaskDumpSnapshot> {
  const taskDump = await getTaskDumpClient()
  const [tasksResult, blocksResult, taskAttachmentsResult, thoughtsResult, thoughtAttachmentsResult] =
    await Promise.all([
      taskDump
        .from(TASKS_TABLE)
        .select('*')
        .is('deleted_at', null)
        .order('status', { ascending: true })
        .order('column_order', { ascending: true })
        .order('created_at', { ascending: true }),
      taskDump
        .from(BLOCKS_TABLE)
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      taskDump
        .from(TASK_ATTACHMENTS_TABLE)
        .select('*')
        .order('created_at', { ascending: true }),
      taskDump
        .from(THOUGHTS_TABLE)
        .select('*')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      taskDump
        .from(THOUGHT_ATTACHMENTS_TABLE)
        .select('*')
        .order('created_at', { ascending: true }),
    ])

  ensureNoError(tasksResult.error, 'Could not load tasks.')
  ensureNoError(blocksResult.error, 'Could not load workspace blocks.')
  ensureNoError(taskAttachmentsResult.error, 'Could not load task attachments.')
  ensureNoError(thoughtsResult.error, 'Could not load thoughts.')
  ensureNoError(thoughtAttachmentsResult.error, 'Could not load thought attachments.')

  const blocksByTaskId = new Map<string, TaskDumpWorkspaceBlock[]>()
  for (const block of (blocksResult.data as WorkspaceBlockRow[] | null) ?? []) {
    const existing = blocksByTaskId.get(block.task_id) ?? []
    existing.push(block)
    blocksByTaskId.set(block.task_id, existing)
  }

  const taskAttachmentsByTaskId = new Map<string, TaskDumpAttachment[]>()
  for (const attachment of (taskAttachmentsResult.data as TaskAttachmentRow[] | null) ?? []) {
    const existing = taskAttachmentsByTaskId.get(attachment.task_id) ?? []
    existing.push(attachment)
    taskAttachmentsByTaskId.set(attachment.task_id, existing)
  }

  const thoughtAttachmentsByThoughtId = new Map<string, TaskDumpAttachment[]>()
  for (const attachment of (thoughtAttachmentsResult.data as ThoughtAttachmentRow[] | null) ?? []) {
    const existing = thoughtAttachmentsByThoughtId.get(attachment.thought_id) ?? []
    existing.push(attachment)
    thoughtAttachmentsByThoughtId.set(attachment.thought_id, existing)
  }

  return {
    tasks: ((tasksResult.data as TaskRow[] | null) ?? []).map((task) => ({
      ...task,
      workspace_blocks: blocksByTaskId.get(task.id) ?? [],
      attachments: taskAttachmentsByTaskId.get(task.id) ?? [],
    })),
    thoughts: ((thoughtsResult.data as ThoughtRow[] | null) ?? []).map((thought) => ({
      ...thought,
      attachments: thoughtAttachmentsByThoughtId.get(thought.id) ?? [],
    })),
  }
}

async function getExistingTask(id: string): Promise<TaskRow> {
  const taskDump = await getTaskDumpClient()
  const result = await taskDump.from(TASKS_TABLE).select('*').eq('id', id).single()
  ensureNoError(result.error, 'Task not found.')
  const task = result.data as TaskRow | null
  if (!task) {
    throw new Error('Task not found.')
  }

  return task
}

async function getExistingThought(id: string): Promise<ThoughtRow> {
  const taskDump = await getTaskDumpClient()
  const result = await taskDump.from(THOUGHTS_TABLE).select('*').eq('id', id).single()
  ensureNoError(result.error, 'Thought not found.')
  const thought = result.data as ThoughtRow | null
  if (!thought) {
    throw new Error('Thought not found.')
  }

  return thought
}

async function getExistingTaskBlock(id: string): Promise<WorkspaceBlockRow> {
  const taskDump = await getTaskDumpClient()
  const result = await taskDump.from(BLOCKS_TABLE).select('*').eq('id', id).single()
  ensureNoError(result.error, 'Workspace block not found.')
  const block = result.data as WorkspaceBlockRow | null
  if (!block) {
    throw new Error('Workspace block not found.')
  }

  return block
}

export async function GET() {
  try {
    const snapshot = await loadSnapshot()
    return NextResponse.json({ snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body?.action

    if (typeof action !== 'string') {
      return NextResponse.json({ error: 'Missing action.' }, { status: 400 })
    }

    const taskDump = await getTaskDumpClient()

    switch (action) {
      case 'createTask': {
        const title = normalizeNullableText(body.title)
        const taskBody = normalizeBody(body.body)
        if (!hasContent(title, taskBody)) {
          throw new Error('A task needs a title or description.')
        }

        const nextOrder = await getNextTaskOrder('pending')
        const result = await taskDump.from(TASKS_TABLE).insert({
          title,
          body: taskBody,
          status: 'pending',
          column_order: nextOrder,
          priority_flag: normalizePriority(body.priorityFlag),
          due_at: normalizeDueAt(body.dueAt),
        })
        ensureNoError(result.error, 'Could not create task.')
        break
      }

      case 'updateTask': {
        const existing = await getExistingTask(body.id)
        const title =
          Object.prototype.hasOwnProperty.call(body, 'title')
            ? normalizeNullableText(body.title)
            : existing.title
        const taskBody =
          Object.prototype.hasOwnProperty.call(body, 'body')
            ? normalizeBody(body.body)
            : existing.body
        if (!hasContent(title, taskBody)) {
          throw new Error('A task needs a title or description.')
        }

        let nextStatus = existing.status
        let nextOrder = existing.column_order

        if (Object.prototype.hasOwnProperty.call(body, 'status')) {
          nextStatus = normalizeStatus(body.status)
          if (
            nextStatus !== existing.status &&
            !Object.prototype.hasOwnProperty.call(body, 'columnOrder')
          ) {
            nextOrder = await getNextTaskOrder(nextStatus)
          }
        }

        if (Object.prototype.hasOwnProperty.call(body, 'columnOrder')) {
          nextOrder = Number.isFinite(body.columnOrder)
            ? Number(body.columnOrder)
            : existing.column_order
        }

        const result = await taskDump
          .from(TASKS_TABLE)
          .update({
            title,
            body: taskBody,
            status: nextStatus,
            column_order: nextOrder,
            priority_flag: Object.prototype.hasOwnProperty.call(body, 'priorityFlag')
              ? normalizePriority(body.priorityFlag)
              : existing.priority_flag,
            due_at: Object.prototype.hasOwnProperty.call(body, 'dueAt')
              ? normalizeDueAt(body.dueAt)
              : existing.due_at,
          })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not update task.')
        break
      }

      case 'deleteTask': {
        const result = await taskDump
          .from(TASKS_TABLE)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not delete task.')
        break
      }

      case 'restoreTask': {
        const existing = await getExistingTask(body.id)
        const nextOrder = await getNextTaskOrder(existing.status)
        const result = await taskDump
          .from(TASKS_TABLE)
          .update({ deleted_at: null, column_order: nextOrder })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not restore task.')
        break
      }

      case 'reorderTasks': {
        const updates = Array.isArray(body.updates) ? body.updates : []
        for (const update of updates) {
          if (!update?.id) continue

          const result = await taskDump
            .from(TASKS_TABLE)
            .update({
              status: normalizeStatus(update.status),
              column_order: Number.isFinite(update.columnOrder) ? Number(update.columnOrder) : 0,
            })
            .eq('id', String(update.id))
          ensureNoError(result.error, 'Could not reorder tasks.')
        }
        break
      }

      case 'createTaskBlock': {
        const taskId = String(body.taskId || '')
        if (!taskId) throw new Error('Task block requires a task.')

        const { data: existingBlocks, error } = await taskDump
          .from(BLOCKS_TABLE)
          .select('sort_order')
          .eq('task_id', taskId)
          .order('sort_order', { ascending: false })
          .limit(1)

        ensureNoError(error, 'Could not inspect workspace blocks.')

        const result = await taskDump
          .from(BLOCKS_TABLE)
          .insert({
            task_id: taskId,
            label: normalizeNullableText(body.label),
            content: normalizeBody(body.content),
            sort_order: existingBlocks && existingBlocks.length > 0
              ? (existingBlocks[0].sort_order as number) + 1
              : 0,
          })
        ensureNoError(result.error, 'Could not create workspace block.')
        break
      }

      case 'updateTaskBlock': {
        const existing = await getExistingTaskBlock(body.id)
        const label =
          Object.prototype.hasOwnProperty.call(body, 'label')
            ? normalizeNullableText(body.label)
            : existing.label
        const content =
          Object.prototype.hasOwnProperty.call(body, 'content')
            ? normalizeBody(body.content)
            : existing.content

        const result = await taskDump
          .from(BLOCKS_TABLE)
          .update({
            label,
            content,
            sort_order: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : existing.sort_order,
          })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not update workspace block.')
        break
      }

      case 'deleteTaskBlock': {
        const result = await taskDump.from(BLOCKS_TABLE).delete().eq('id', body.id)
        ensureNoError(result.error, 'Could not delete workspace block.')
        break
      }

      case 'createThought': {
        const title = normalizeNullableText(body.title)
        const content = normalizeBody(body.content)
        if (!hasContent(title, content)) {
          throw new Error('A thought needs a title or content.')
        }

        const nextOrder = await getNextThoughtOrder()
        const result = await taskDump.from(THOUGHTS_TABLE).insert({
          title,
          content,
          sort_order: nextOrder,
        })
        ensureNoError(result.error, 'Could not create thought.')
        break
      }

      case 'updateThought': {
        const existing = await getExistingThought(body.id)
        const title =
          Object.prototype.hasOwnProperty.call(body, 'title')
            ? normalizeNullableText(body.title)
            : existing.title
        const content =
          Object.prototype.hasOwnProperty.call(body, 'content')
            ? normalizeBody(body.content)
            : existing.content
        if (!hasContent(title, content)) {
          throw new Error('A thought needs a title or content.')
        }

        const result = await taskDump
          .from(THOUGHTS_TABLE)
          .update({
            title,
            content,
            sort_order: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : existing.sort_order,
          })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not update thought.')
        break
      }

      case 'deleteThought': {
        const result = await taskDump
          .from(THOUGHTS_TABLE)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not delete thought.')
        break
      }

      case 'restoreThought': {
        const nextOrder = await getNextThoughtOrder()
        const result = await taskDump
          .from(THOUGHTS_TABLE)
          .update({ deleted_at: null, sort_order: nextOrder })
          .eq('id', body.id)
        ensureNoError(result.error, 'Could not restore thought.')
        break
      }

      case 'createTaskAttachment': {
        const result = await taskDump.from(TASK_ATTACHMENTS_TABLE).insert({
          task_id: body.taskId,
          file_name: String(body.fileName || ''),
          storage_path: String(body.storagePath || ''),
          mime_type: typeof body.mimeType === 'string' ? body.mimeType : null,
          file_size: Number.isFinite(body.fileSize) ? Number(body.fileSize) : null,
          media_kind: normalizeAttachmentKind(body.mediaKind),
        })
        ensureNoError(result.error, 'Could not create task attachment.')
        break
      }

      case 'createThoughtAttachment': {
        const result = await taskDump.from(THOUGHT_ATTACHMENTS_TABLE).insert({
          thought_id: body.thoughtId,
          file_name: String(body.fileName || ''),
          storage_path: String(body.storagePath || ''),
          mime_type: typeof body.mimeType === 'string' ? body.mimeType : null,
          file_size: Number.isFinite(body.fileSize) ? Number(body.fileSize) : null,
          media_kind: normalizeAttachmentKind(body.mediaKind),
        })
        ensureNoError(result.error, 'Could not create thought attachment.')
        break
      }

      case 'deleteAttachment': {
        if (body.targetType === 'thought') {
          const result = await taskDump.from(THOUGHT_ATTACHMENTS_TABLE).delete().eq('id', body.id)
          ensureNoError(result.error, 'Could not delete thought attachment.')
        } else {
          const result = await taskDump.from(TASK_ATTACHMENTS_TABLE).delete().eq('id', body.id)
          ensureNoError(result.error, 'Could not delete task attachment.')
        }
        break
      }

      default:
        throw new Error(`Unsupported action: ${action}`)
    }

    const snapshot = await loadSnapshot()

    return NextResponse.json({ snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
