'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  Bold,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  GripVertical,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCcw,
  Trash2,
  Underline,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  createTaskDumpBlock,
  createTaskDumpTask,
  createTaskDumpThought,
  deleteTaskDumpAttachment,
  deleteTaskDumpBlock,
  deleteTaskDumpTask,
  deleteTaskDumpThought,
  fetchTaskDumpSnapshot,
  getTaskDumpAttachmentUrl,
  reorderTaskDumpTasks,
  restoreTaskDumpTask,
  restoreTaskDumpThought,
  updateTaskDumpBlock,
  updateTaskDumpTask,
  updateTaskDumpThought,
  uploadTaskDumpTaskAttachment,
  uploadTaskDumpThoughtAttachment,
} from '@/lib/task-dump-queries'
import {
  TASK_DUMP_PRIORITY_OPTIONS,
  TASK_DUMP_QUICK_LINKS,
  TASK_DUMP_STATUSES,
  TASK_DUMP_STATUS_LABELS,
  formatTaskDumpDate,
  formatTaskDumpTimestamp,
  type TaskDumpAttachment,
  type TaskDumpPriorityFlag,
  type TaskDumpSnapshot,
  type TaskDumpStatus,
  type TaskDumpTask,
  type TaskDumpThought,
  type TaskDumpWorkspaceBlock,
} from '@/lib/task-dump-types'
import { MarkdownComposer } from '@/features/task-dump/markdown-composer'

const DEFAULT_SNAPSHOT: TaskDumpSnapshot = {
  tasks: [],
  thoughts: [],
}

type TaskSavePayload = {
  title?: string | null
  body?: string
  status?: TaskDumpStatus
  columnOrder?: number
  priorityFlag?: TaskDumpPriorityFlag
  dueAt?: string | null
}

type ThoughtSavePayload = {
  title?: string | null
  content?: string
  sortOrder?: number
}

type BlockSavePayload = {
  label?: string | null
  content?: string
  sortOrder?: number
}

type QuickDumpFormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bullet-list'
  | 'numbered-list'
  | 'checkbox'
  | 'divider'

const QUICK_DUMP_FORMAT_ITEMS: {
  action: QuickDumpFormatAction
  label: string
  icon: typeof Bold
}[] = [
  { action: 'bold', label: 'Bold', icon: Bold },
  { action: 'italic', label: 'Italic', icon: Italic },
  { action: 'underline', label: 'Underline', icon: Underline },
  { action: 'bullet-list', label: 'Bullets', icon: List },
  { action: 'numbered-list', label: 'Numbered list', icon: ListOrdered },
  { action: 'checkbox', label: 'Checkbox list', icon: ListChecks },
  { action: 'divider', label: 'Divider', icon: Minus },
]

function newQuickDumpCheckboxHtml(): string {
  return `<div data-task-check="unchecked"><span data-check-toggle contenteditable="false">\u2610</span>\u00a0\u00a0</div>`
}

function DumpTruckDumpingIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 64"
      aria-hidden="true"
      className={cn('h-10 w-10 text-foreground', className)}
      fill="currentColor"
    >
      <polygon points="12,35 43,16 52,37 21,54" />
      <polygon points="39,14 48,8 51,12 42,18" />
      <polygon points="31,37 36,37 44,49 39,49" />
      <rect x="47" y="38" width="16" height="11" />
      <polygon points="49,30 58,30 64,38 49,38" />
      <polygon points="52,32 57,32 61,36 52,36" className="fill-background/85" />
      <rect x="18" y="49" width="36" height="3" />
      <circle cx="23" cy="54" r="6" />
      <circle cx="36" cy="54" r="6" />
      <circle cx="56" cy="54" r="6" />
      <circle cx="23" cy="54" r="3.1" className="fill-background" />
      <circle cx="36" cy="54" r="3.1" className="fill-background" />
      <circle cx="56" cy="54" r="3.1" className="fill-background" />
      <circle cx="8.9" cy="48.8" r="1.15" />
      <circle cx="7" cy="52.4" r="0.95" />
      <circle cx="11.8" cy="53.2" r="0.8" />
    </svg>
  )
}

function hasTextContent(value: string | null | undefined): boolean {
  return Boolean(typeof value === 'string' && value.trim())
}

function payloadHasKey<T extends object>(payload: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key)
}

function groupTasksByStatus(tasks: TaskDumpTask[]) {
  return TASK_DUMP_STATUSES.reduce<Record<TaskDumpStatus, TaskDumpTask[]>>(
    (acc, status) => {
      acc[status] = tasks
        .filter((task) => task.status === status)
        .sort((a, b) => a.column_order - b.column_order)
      return acc
    },
    {
      pending: [],
      in_progress: [],
      done: [],
    }
  )
}

function getPriorityClass(flag: TaskDumpPriorityFlag): string {
  return TASK_DUMP_PRIORITY_OPTIONS.find((option) => option.value === flag)?.className || 'text-muted-foreground'
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:div|p|li|h[1-6])>/gi, ' ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getTaskBodyPreview(body: string): string {
  return stripHtmlToText(body)
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)
      return success
    } catch {
      return false
    }
  }
}

function CopyIconButton({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8 text-muted-foreground', className)}
      aria-label={label}
      onClick={async () => {
        const success = await copyToClipboard(value)
        if (!success) {
          toast.error('Could not copy text.')
          return
        }
        setCopied(true)
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = setTimeout(() => {
          setCopied(false)
          copiedTimerRef.current = null
        }, 1200)
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

const TASK_DUMP_STATUS_STYLES: Record<
  TaskDumpStatus,
  {
    summaryClassName: string
    summaryCountClassName: string
    columnClassName: string
    columnBadgeClassName: string
    emptyStateClassName: string
    cardClassName: string
    cardMetaClassName: string
  }
> = {
  pending: {
    summaryClassName:
      'border-amber-400/25 bg-gradient-to-br from-amber-500/14 via-background/90 to-background/95 shadow-[inset_0_1px_0_rgba(251,191,36,0.12)]',
    summaryCountClassName: 'text-amber-200',
    columnClassName:
      'border-amber-400/20 bg-gradient-to-b from-amber-500/10 via-background to-background/95 shadow-[inset_0_1px_0_rgba(251,191,36,0.12)]',
    columnBadgeClassName: 'border border-amber-300/20 bg-amber-400/12 text-amber-100',
    emptyStateClassName: 'border-amber-300/18 bg-amber-400/[0.04] text-amber-50/75',
    cardClassName:
      'border-amber-300/16 bg-gradient-to-br from-amber-400/16 via-background/98 to-background shadow-[0_10px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(253,230,138,0.12)] hover:border-amber-300/28',
    cardMetaClassName: 'text-amber-100/75',
  },
  in_progress: {
    summaryClassName:
      'border-sky-400/25 bg-gradient-to-br from-sky-500/14 via-background/90 to-background/95 shadow-[inset_0_1px_0_rgba(56,189,248,0.12)]',
    summaryCountClassName: 'text-sky-200',
    columnClassName:
      'border-sky-400/20 bg-gradient-to-b from-sky-500/10 via-background to-background/95 shadow-[inset_0_1px_0_rgba(56,189,248,0.12)]',
    columnBadgeClassName: 'border border-sky-300/20 bg-sky-400/12 text-sky-100',
    emptyStateClassName: 'border-sky-300/18 bg-sky-400/[0.04] text-sky-50/75',
    cardClassName:
      'border-sky-300/16 bg-gradient-to-br from-sky-400/16 via-background/98 to-background shadow-[0_10px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(186,230,253,0.12)] hover:border-sky-300/28',
    cardMetaClassName: 'text-sky-100/75',
  },
  done: {
    summaryClassName:
      'border-emerald-400/25 bg-gradient-to-br from-emerald-500/14 via-background/90 to-background/95 shadow-[inset_0_1px_0_rgba(52,211,153,0.12)]',
    summaryCountClassName: 'text-emerald-200',
    columnClassName:
      'border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 via-background to-background/95 shadow-[inset_0_1px_0_rgba(52,211,153,0.12)]',
    columnBadgeClassName: 'border border-emerald-300/20 bg-emerald-400/12 text-emerald-100',
    emptyStateClassName: 'border-emerald-300/18 bg-emerald-400/[0.04] text-emerald-50/75',
    cardClassName:
      'border-emerald-300/16 bg-gradient-to-br from-emerald-400/16 via-background/98 to-background shadow-[0_10px_30px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(209,250,229,0.12)] hover:border-emerald-300/28',
    cardMetaClassName: 'text-emerald-100/75',
  },
}

const TASK_DUMP_MODAL_SURFACE_STYLES: Record<
  TaskDumpStatus,
  {
    dialogClassName: string
    borderGradientStart: string
    headerClassName: string
    workspaceLabelClassName: string
    railClassName: string
  }
> = {
  pending: {
    dialogClassName:
      'bg-background border-border/70 shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(253,230,138,0.12)]',
    borderGradientStart: '251 191 36',
    headerClassName:
      'bg-gradient-to-r from-amber-500/10 via-background to-background',
    workspaceLabelClassName: 'text-amber-100/82',
    railClassName: 'border-l-amber-300/58',
  },
  in_progress: {
    dialogClassName:
      'bg-background border-border/70 shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(186,230,253,0.12)]',
    borderGradientStart: '56 189 248',
    headerClassName:
      'bg-gradient-to-r from-sky-500/10 via-background to-background',
    workspaceLabelClassName: 'text-sky-100/82',
    railClassName: 'border-l-sky-300/58',
  },
  done: {
    dialogClassName:
      'bg-background border-border/70 shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(209,250,229,0.12)]',
    borderGradientStart: '52 211 153',
    headerClassName:
      'bg-gradient-to-r from-emerald-500/10 via-background to-background',
    workspaceLabelClassName: 'text-emerald-100/82',
    railClassName: 'border-l-emerald-300/58',
  },
}

function getColumnFromOverId(snapshot: TaskDumpSnapshot, overId: string): TaskDumpStatus | null {
  if (overId.startsWith('column:')) {
    const status = overId.replace('column:', '')
    return TASK_DUMP_STATUSES.includes(status as TaskDumpStatus)
      ? (status as TaskDumpStatus)
      : null
  }

  return snapshot.tasks.find((task) => task.id === overId)?.status ?? null
}

function buildReorderedTasks(
  snapshot: TaskDumpSnapshot,
  activeId: string,
  overId: string
) {
  const grouped = groupTasksByStatus(snapshot.tasks)
  const activeTask = snapshot.tasks.find((task) => task.id === activeId)
  if (!activeTask) return null

  const targetStatus = getColumnFromOverId(snapshot, overId)
  if (!targetStatus) return null

  const sourceList = [...grouped[activeTask.status]]
  const sourceIndex = sourceList.findIndex((task) => task.id === activeId)
  if (sourceIndex === -1) return null

  const [movedTask] = sourceList.splice(sourceIndex, 1)

  if (activeTask.status === targetStatus) {
    const targetList = sourceList
    const overIndex = overId.startsWith('column:')
      ? targetList.length
      : targetList.findIndex((task) => task.id === overId)
    const baseList = [...grouped[targetStatus]]
    const nextList = overId.startsWith('column:')
      ? [...targetList, movedTask]
      : overIndex === -1
        ? [...targetList, movedTask]
        : arrayMove(baseList, sourceIndex, overIndex)

    const normalizedGroup = {
      ...grouped,
      [targetStatus]: nextList.map((task, index) => ({
        ...task,
        column_order: index,
      })),
    }

    return TASK_DUMP_STATUSES.flatMap((status) => normalizedGroup[status])
  }

  const targetList = [...grouped[targetStatus]]
  const overIndex = overId.startsWith('column:')
    ? targetList.length
    : targetList.findIndex((task) => task.id === overId)
  const insertAt = overIndex === -1 ? targetList.length : overIndex
  targetList.splice(insertAt, 0, { ...movedTask, status: targetStatus })

  const nextGroups = {
    ...grouped,
    [activeTask.status]: sourceList.map((task, index) => ({
      ...task,
      column_order: index,
    })),
    [targetStatus]: targetList.map((task, index) => ({
      ...task,
      status: targetStatus,
      column_order: index,
    })),
  }

  return TASK_DUMP_STATUSES.flatMap((status) => nextGroups[status])
}

export function TaskDumpApp() {
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [snapshot, setSnapshot] = useState<TaskDumpSnapshot>(DEFAULT_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickTaskText, setQuickTaskText] = useState('')
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskDumpPriorityFlag>('none')
  const [quickTaskDueAt, setQuickTaskDueAt] = useState<string | null>(null)
  const [quickTaskFiles, setQuickTaskFiles] = useState<File[]>([])
  const quickTaskFileInputRef = useRef<HTMLInputElement>(null)
  const quickDumpEditorWrapRef = useRef<HTMLDivElement>(null)
  const [quickThoughtText, setQuickThoughtText] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null)
  const [thoughtsOpen, setThoughtsOpen] = useState(true)
  const [busyAttachmentTarget, setBusyAttachmentTarget] = useState<string | null>(null)

  const taskTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const taskPayloadRef = useRef(new Map<string, TaskSavePayload>())
  const taskSaveVersionRef = useRef(new Map<string, number>())
  const thoughtTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const thoughtPayloadRef = useRef(new Map<string, ThoughtSavePayload>())
  const thoughtSaveVersionRef = useRef(new Map<string, number>())
  const blockTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const blockPayloadRef = useRef(new Map<string, BlockSavePayload>())
  const blockSaveVersionRef = useRef(new Map<string, number>())

  useEffect(() => {
    const taskTimers = taskTimersRef.current
    const thoughtTimers = thoughtTimersRef.current
    const blockTimers = blockTimersRef.current

    load()
    return () => {
      taskTimers.forEach((timer) => clearTimeout(timer))
      thoughtTimers.forEach((timer) => clearTimeout(timer))
      blockTimers.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    if (selectedTaskId && !snapshot.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null)
    }
    if (selectedThoughtId && !snapshot.thoughts.some((thought) => thought.id === selectedThoughtId)) {
      setSelectedThoughtId(null)
    }
  }, [selectedTaskId, selectedThoughtId, snapshot.tasks, snapshot.thoughts])

  const groupedTasks = useMemo(() => groupTasksByStatus(snapshot.tasks), [snapshot.tasks])
  const selectedTask = snapshot.tasks.find((task) => task.id === selectedTaskId) ?? null
  const selectedThought = snapshot.thoughts.find((thought) => thought.id === selectedThoughtId) ?? null

  const applyQuickDumpFormat = useCallback((action: QuickDumpFormatAction) => {
    const editor = quickDumpEditorWrapRef.current?.querySelector('[contenteditable="true"]') as HTMLDivElement | null
    if (!editor) return

    editor.focus()

    switch (action) {
      case 'bold':
        document.execCommand('bold')
        break
      case 'italic':
        document.execCommand('italic')
        break
      case 'underline':
        document.execCommand('underline')
        break
      case 'bullet-list':
        document.execCommand('insertUnorderedList')
        break
      case 'numbered-list':
        document.execCommand('insertOrderedList')
        break
      case 'checkbox':
        document.execCommand('insertHTML', false, newQuickDumpCheckboxHtml())
        break
      case 'divider':
        document.execCommand('insertHTML', false, '<hr>')
        break
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  async function load() {
    try {
      setLoading(true)
      const nextSnapshot = await fetchTaskDumpSnapshot()
      setSnapshot(nextSnapshot)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load C-Street Dump.')
    } finally {
      setLoading(false)
    }
  }

  function updateTaskLocal(taskId: string, updater: (task: TaskDumpTask) => TaskDumpTask) {
    setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    }))
  }

  function updateThoughtLocal(thoughtId: string, updater: (thought: TaskDumpThought) => TaskDumpThought) {
    setSnapshot((prev) => ({
      ...prev,
      thoughts: prev.thoughts.map((thought) => (thought.id === thoughtId ? updater(thought) : thought)),
    }))
  }

  function queueTaskSave(taskId: string, payload: TaskSavePayload) {
    taskPayloadRef.current.set(taskId, {
      ...taskPayloadRef.current.get(taskId),
      ...payload,
    })
    taskSaveVersionRef.current.set(taskId, (taskSaveVersionRef.current.get(taskId) ?? 0) + 1)
    const mergedPayload = taskPayloadRef.current.get(taskId)
    const currentTask = snapshot.tasks.find((task) => task.id === taskId)
    if (mergedPayload && currentTask) {
      const nextTitle = payloadHasKey(mergedPayload, 'title') ? (mergedPayload.title ?? null) : currentTask.title
      const nextBody = payloadHasKey(mergedPayload, 'body') ? (mergedPayload.body ?? '') : currentTask.body
      const shouldDeferSave = !hasTextContent(nextTitle) && !hasTextContent(nextBody)
      if (shouldDeferSave) {
        const pendingTimer = taskTimersRef.current.get(taskId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          taskTimersRef.current.delete(taskId)
        }
        return
      }
    }

    const existingTimer = taskTimersRef.current.get(taskId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(async () => {
      const requestVersion = taskSaveVersionRef.current.get(taskId) ?? 0
      const nextPayload = taskPayloadRef.current.get(taskId)
      taskPayloadRef.current.delete(taskId)
      taskTimersRef.current.delete(taskId)

      if (!nextPayload) return

      try {
        const nextSnapshot = await updateTaskDumpTask(taskId, nextPayload)
        const latestVersion = taskSaveVersionRef.current.get(taskId) ?? 0
        if (latestVersion !== requestVersion || taskPayloadRef.current.has(taskId)) return
        setSnapshot(nextSnapshot)
      } catch (saveError) {
        const latestVersion = taskSaveVersionRef.current.get(taskId) ?? 0
        if (latestVersion !== requestVersion) return
        toast.error(saveError instanceof Error ? saveError.message : 'Could not save task.')
        await load()
      }
    }, 500)

    taskTimersRef.current.set(taskId, timer)
  }

  function queueThoughtSave(thoughtId: string, payload: ThoughtSavePayload) {
    thoughtPayloadRef.current.set(thoughtId, {
      ...thoughtPayloadRef.current.get(thoughtId),
      ...payload,
    })
    thoughtSaveVersionRef.current.set(thoughtId, (thoughtSaveVersionRef.current.get(thoughtId) ?? 0) + 1)
    const mergedPayload = thoughtPayloadRef.current.get(thoughtId)
    const currentThought = snapshot.thoughts.find((thought) => thought.id === thoughtId)
    if (mergedPayload && currentThought) {
      const nextTitle = payloadHasKey(mergedPayload, 'title') ? (mergedPayload.title ?? null) : currentThought.title
      const nextContent = payloadHasKey(mergedPayload, 'content')
        ? (mergedPayload.content ?? '')
        : currentThought.content
      const shouldDeferSave = !hasTextContent(nextTitle) && !hasTextContent(nextContent)
      if (shouldDeferSave) {
        const pendingTimer = thoughtTimersRef.current.get(thoughtId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          thoughtTimersRef.current.delete(thoughtId)
        }
        return
      }
    }

    const existingTimer = thoughtTimersRef.current.get(thoughtId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(async () => {
      const requestVersion = thoughtSaveVersionRef.current.get(thoughtId) ?? 0
      const nextPayload = thoughtPayloadRef.current.get(thoughtId)
      thoughtPayloadRef.current.delete(thoughtId)
      thoughtTimersRef.current.delete(thoughtId)

      if (!nextPayload) return

      try {
        const nextSnapshot = await updateTaskDumpThought(thoughtId, nextPayload)
        const latestVersion = thoughtSaveVersionRef.current.get(thoughtId) ?? 0
        if (latestVersion !== requestVersion || thoughtPayloadRef.current.has(thoughtId)) return
        setSnapshot(nextSnapshot)
      } catch (saveError) {
        const latestVersion = thoughtSaveVersionRef.current.get(thoughtId) ?? 0
        if (latestVersion !== requestVersion) return
        toast.error(saveError instanceof Error ? saveError.message : 'Could not save thought.')
        await load()
      }
    }, 500)

    thoughtTimersRef.current.set(thoughtId, timer)
  }

  function queueBlockSave(blockId: string, payload: BlockSavePayload) {
    blockPayloadRef.current.set(blockId, {
      ...blockPayloadRef.current.get(blockId),
      ...payload,
    })
    blockSaveVersionRef.current.set(blockId, (blockSaveVersionRef.current.get(blockId) ?? 0) + 1)

    const existingTimer = blockTimersRef.current.get(blockId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(async () => {
      const requestVersion = blockSaveVersionRef.current.get(blockId) ?? 0
      const nextPayload = blockPayloadRef.current.get(blockId)
      blockPayloadRef.current.delete(blockId)
      blockTimersRef.current.delete(blockId)

      if (!nextPayload) return

      try {
        const nextSnapshot = await updateTaskDumpBlock(blockId, nextPayload)
        const latestVersion = blockSaveVersionRef.current.get(blockId) ?? 0
        if (latestVersion !== requestVersion || blockPayloadRef.current.has(blockId)) return
        setSnapshot(nextSnapshot)
      } catch (saveError) {
        const latestVersion = blockSaveVersionRef.current.get(blockId) ?? 0
        if (latestVersion !== requestVersion) return
        toast.error(saveError instanceof Error ? saveError.message : 'Could not save workspace block.')
        await load()
      }
    }, 500)

    blockTimersRef.current.set(blockId, timer)
  }

  async function handleQuickTaskCreate() {
    if (!quickTaskText.trim() && !quickTaskTitle.trim()) return

    try {
      const nextSnapshot = await createTaskDumpTask({
        title: quickTaskTitle.trim() || null,
        body: quickTaskText.trim(),
        priorityFlag: quickTaskPriority !== 'none' ? quickTaskPriority : undefined,
        dueAt: quickTaskDueAt,
      })
      setSnapshot(nextSnapshot)

      const createdTask = nextSnapshot.tasks.find(
        (t) =>
          t.body === quickTaskText.trim() &&
          (quickTaskTitle.trim() ? t.title === quickTaskTitle.trim() : !t.title)
      )

      if (createdTask && quickTaskFiles.length > 0) {
        let latestSnapshot = nextSnapshot
        for (const file of quickTaskFiles) {
          try {
            latestSnapshot = await uploadTaskDumpTaskAttachment(createdTask.id, file)
          } catch {
            toast.error(`Could not upload ${file.name}.`)
          }
        }
        setSnapshot(latestSnapshot)
      }

      setQuickTaskTitle('')
      setQuickTaskText('')
      setQuickTaskPriority('none')
      setQuickTaskDueAt(null)
      setQuickTaskFiles([])
      toast.success('Task dumped into Pending.')
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Could not create task.')
    }
  }

  async function handleQuickThoughtCreate() {
    if (!quickThoughtText.trim()) return

    try {
      const nextSnapshot = await createTaskDumpThought({ content: quickThoughtText.trim() })
      setSnapshot(nextSnapshot)
      setQuickThoughtText('')
      toast.success('Thought added.')
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Could not create thought.')
    }
  }

  const handleTaskDelete = useCallback(async (taskId: string) => {
    const pendingTimer = taskTimersRef.current.get(taskId)
    if (pendingTimer) clearTimeout(pendingTimer)
    taskTimersRef.current.delete(taskId)
    taskPayloadRef.current.delete(taskId)

    try {
      const nextSnapshot = await deleteTaskDumpTask(taskId)
      setSnapshot(nextSnapshot)
      setSelectedTaskId((current) => (current === taskId ? null : current))
      toast.success('Task deleted.', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const restored = await restoreTaskDumpTask(taskId)
            setSnapshot(restored)
          },
        },
      })
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Could not delete task.')
    }
  }, [])

  async function handleThoughtDelete(thoughtId: string) {
    const pendingTimer = thoughtTimersRef.current.get(thoughtId)
    if (pendingTimer) clearTimeout(pendingTimer)
    thoughtTimersRef.current.delete(thoughtId)
    thoughtPayloadRef.current.delete(thoughtId)

    try {
      const nextSnapshot = await deleteTaskDumpThought(thoughtId)
      setSnapshot(nextSnapshot)
      setSelectedThoughtId((current) => (current === thoughtId ? null : current))
      toast.success('Thought deleted.', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const restored = await restoreTaskDumpThought(thoughtId)
            setSnapshot(restored)
          },
        },
      })
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Could not delete thought.')
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const nextTasks = buildReorderedTasks(snapshot, String(active.id), String(over.id))
    if (!nextTasks) return

    setSnapshot((prev) => ({
      ...prev,
      tasks: nextTasks,
    }))

    try {
      const nextSnapshot = await reorderTaskDumpTasks(
        nextTasks.map((task) => ({
          id: task.id,
          status: task.status,
          columnOrder: task.column_order,
        }))
      )
      setSnapshot(nextSnapshot)
    } catch (reorderError) {
      toast.error(reorderError instanceof Error ? reorderError.message : 'Could not reorder tasks.')
      await load()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading C-Street Dump...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-6">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b px-6 py-5">
              <CardTitle>C-Street Dump</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 py-6">
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-2">
                <Button onClick={load}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button variant="outline" onClick={() => router.push('/')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to tracker
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <div className="space-y-2">
            <Button variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={() => router.push('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Client Experience Tracker
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
                <DumpTruckDumpingIcon />
                C-Street Dump
              </h1>
              <p className="text-sm text-muted-foreground">
                A messy hub for Tasks and Thoughts.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Card className="gap-0 overflow-hidden py-0">
              <CardContent className="space-y-3 px-5 py-5">
                <Input
                  value={quickTaskTitle}
                  onChange={(event) => setQuickTaskTitle(event.target.value)}
                  placeholder="Title (optional)"
                  className="h-9 border-border/60 bg-background/40"
                />
                <div ref={quickDumpEditorWrapRef}>
                  <MarkdownComposer
                    value={quickTaskText}
                    onChange={setQuickTaskText}
                    placeholder="Drop a task here..."
                    minHeightClassName="min-h-[88px]"
                    maxHeightClassName="max-h-[260px]"
                    maxHeightPx={260}
                    toolbarVariant="hidden"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void handleQuickTaskCreate()
                      }
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={quickTaskPriority}
                    onValueChange={(value) => setQuickTaskPriority(value as TaskDumpPriorityFlag)}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-8 w-auto min-w-[110px] gap-1.5 rounded-md border-border/50 bg-background/35 px-2.5 text-xs',
                        TASK_DUMP_PRIORITY_OPTIONS.find((o) => o.value === quickTaskPriority)?.className ?? 'text-muted-foreground'
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_DUMP_PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className={cn(option.className)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          'h-8 gap-1.5 rounded-md border border-border/50 bg-background/35 px-2.5 text-xs',
                          !quickTaskDueAt && 'text-muted-foreground'
                        )}
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        {quickTaskDueAt ? formatTaskDumpDate(quickTaskDueAt) : 'Due date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={quickTaskDueAt ? new Date(quickTaskDueAt) : undefined}
                        onSelect={(date) => setQuickTaskDueAt(date ? date.toISOString() : null)}
                      />
                      {quickTaskDueAt && (
                        <div className="border-t p-3">
                          <Button variant="ghost" size="sm" className="w-full" onClick={() => setQuickTaskDueAt(null)}>
                            Clear due date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  <Button
                    variant="ghost"
                    className={cn(
                      'h-8 gap-1.5 rounded-md border border-border/50 bg-background/35 px-2.5 text-xs',
                      quickTaskFiles.length > 0 ? 'text-foreground' : 'text-muted-foreground'
                    )}
                    onClick={() => quickTaskFileInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {quickTaskFiles.length > 0 ? `${quickTaskFiles.length} file${quickTaskFiles.length > 1 ? 's' : ''}` : 'Attach'}
                  </Button>
                  <input
                    ref={quickTaskFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                      if (files.length > 0) setQuickTaskFiles((prev) => [...prev, ...files])
                      event.target.value = ''
                    }}
                  />
                  <div className="mx-1 h-5 w-px bg-border/50" aria-hidden="true" />
                  <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-background/35 px-1 py-1">
                    {QUICK_DUMP_FORMAT_ITEMS.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.action}
                          type="button"
                          title={item.label}
                          className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            applyQuickDumpFormat(item.action)
                          }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      )
                    })}
                  </div>
                </div>

                {quickTaskFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quickTaskFiles.map((file, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {file.name}
                        <button
                          type="button"
                          className="ml-0.5 text-muted-foreground/60 hover:text-foreground"
                          onClick={() => setQuickTaskFiles((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={handleQuickTaskCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Dump Task
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Cmd/Ctrl + Enter
                  </span>
                </div>
              </CardContent>
            </Card>

            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
              <div className="grid gap-4 lg:grid-cols-3">
                {TASK_DUMP_STATUSES.map((status) => (
                  <TaskColumn
                    key={status}
                    status={status}
                    tasks={groupedTasks[status]}
                    onOpenTask={setSelectedTaskId}
                    onDeleteTask={handleTaskDelete}
                  />
                ))}
              </div>
            </DndContext>
          </div>

          <ThoughtsPanel
            open={thoughtsOpen}
            onToggle={() => setThoughtsOpen((current) => !current)}
            thoughts={snapshot.thoughts}
            quickThoughtText={quickThoughtText}
            onQuickThoughtChange={setQuickThoughtText}
            onQuickThoughtCreate={handleQuickThoughtCreate}
            onOpenThought={setSelectedThoughtId}
            onDeleteThought={handleThoughtDelete}
          />
        </div>
      </div>

      <TaskDialog
        open={Boolean(selectedTask)}
        task={selectedTask}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null)
        }}
        onTaskChange={(taskId, updater, payload) => {
          updateTaskLocal(taskId, updater)
          queueTaskSave(taskId, payload)
        }}
        onDeleteTask={handleTaskDelete}
        onAddBlock={async (taskId) => {
          try {
            const nextSnapshot = await createTaskDumpBlock({
              taskId,
              label: null,
              content: '',
            })
            setSnapshot(nextSnapshot)
          } catch (blockError) {
            toast.error(blockError instanceof Error ? blockError.message : 'Could not add workspace block.')
          }
        }}
        onBlockChange={(blockId, taskId, updater, payload) => {
          updateTaskLocal(taskId, (task) => ({
            ...task,
            workspace_blocks: task.workspace_blocks.map((block) =>
              block.id === blockId ? updater(block) : block
            ),
          }))
          queueBlockSave(blockId, payload)
        }}
        onDeleteBlock={async (blockId) => {
          try {
            const nextSnapshot = await deleteTaskDumpBlock(blockId)
            setSnapshot(nextSnapshot)
          } catch (blockError) {
            toast.error(blockError instanceof Error ? blockError.message : 'Could not delete workspace block.')
          }
        }}
        onUploadAttachment={async (taskId, file) => {
          setBusyAttachmentTarget(taskId)
          try {
            const nextSnapshot = await uploadTaskDumpTaskAttachment(taskId, file)
            setSnapshot(nextSnapshot)
          } catch (uploadError) {
            toast.error(uploadError instanceof Error ? uploadError.message : 'Could not upload attachment.')
          } finally {
            setBusyAttachmentTarget(null)
          }
        }}
        onDeleteAttachment={async (attachment) => {
          if (!selectedTask) return
          try {
            const nextSnapshot = await deleteTaskDumpAttachment({
              id: attachment.id,
              storagePath: attachment.storage_path,
              targetType: 'task',
            })
            setSnapshot(nextSnapshot)
          } catch (attachmentError) {
            toast.error(attachmentError instanceof Error ? attachmentError.message : 'Could not delete attachment.')
          }
        }}
        busyAttachmentTarget={busyAttachmentTarget}
      />

      <ThoughtDialog
        open={Boolean(selectedThought)}
        thought={selectedThought}
        onOpenChange={(open) => {
          if (!open) setSelectedThoughtId(null)
        }}
        onThoughtChange={(thoughtId, updater, payload) => {
          updateThoughtLocal(thoughtId, updater)
          queueThoughtSave(thoughtId, payload)
        }}
        onDeleteThought={handleThoughtDelete}
        onUploadAttachment={async (thoughtId, file) => {
          setBusyAttachmentTarget(thoughtId)
          try {
            const nextSnapshot = await uploadTaskDumpThoughtAttachment(thoughtId, file)
            setSnapshot(nextSnapshot)
          } catch (uploadError) {
            toast.error(uploadError instanceof Error ? uploadError.message : 'Could not upload attachment.')
          } finally {
            setBusyAttachmentTarget(null)
          }
        }}
        onDeleteAttachment={async (attachment) => {
          if (!selectedThought) return
          try {
            const nextSnapshot = await deleteTaskDumpAttachment({
              id: attachment.id,
              storagePath: attachment.storage_path,
              targetType: 'thought',
            })
            setSnapshot(nextSnapshot)
          } catch (attachmentError) {
            toast.error(attachmentError instanceof Error ? attachmentError.message : 'Could not delete attachment.')
          }
        }}
        busyAttachmentTarget={busyAttachmentTarget}
      />
    </div>
  )
}

const TaskColumn = memo(function TaskColumn({
  status,
  tasks,
  onOpenTask,
  onDeleteTask,
}: {
  status: TaskDumpStatus
  tasks: TaskDumpTask[]
  onOpenTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${status}`,
  })
  const statusStyles = TASK_DUMP_STATUS_STYLES[status]

  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-2xl p-4 backdrop-blur-sm', statusStyles.columnClassName)}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]', statusStyles.columnBadgeClassName)}>
          {TASK_DUMP_STATUS_LABELS[status]}
        </div>
        <p className="text-xs text-muted-foreground">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </p>
      </div>

      <SortableContext items={tasks.map((task) => task.id)} strategy={rectSortingStrategy}>
        <div className="min-h-[240px] space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onOpenTask={onOpenTask}
              onDeleteTask={onDeleteTask}
            />
          ))}
          {tasks.length === 0 && (
            <div
              className={cn(
                'rounded-xl border border-dashed px-4 py-10 text-center text-sm',
                statusStyles.emptyStateClassName
              )}
            >
              Drop tasks here.
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
})

const TaskCard = memo(function TaskCard({
  task,
  onOpenTask,
  onDeleteTask,
}: {
  task: TaskDumpTask
  onOpenTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const statusStyles = TASK_DUMP_STATUS_STYLES[task.status]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg',
        statusStyles.cardClassName,
        isDragging && 'opacity-70 shadow-lg'
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={cn('text-xs font-medium uppercase tracking-[0.18em]', getPriorityClass(task.priority_flag))}>
                {task.priority_flag === 'none' ? '' : `${task.priority_flag} priority`}
              </div>
              <h3 className="mt-1 truncate text-sm font-semibold">
                {task.title || stripHtmlToText(task.body).slice(0, 80) || 'Untitled task'}
              </h3>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {task.attachments.length > 0 ? `${task.attachments.length} files` : ''}
            </span>
          </div>

          {task.body.trim() && (
            <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">
              {getTaskBodyPreview(task.body)}
            </p>
          )}

          <div className={cn('mt-4 flex justify-end text-[11px]', statusStyles.cardMetaClassName)}>
            <span>{formatTaskDumpDate(task.due_at)}</span>
          </div>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground/55 opacity-0 transition-[opacity,color] duration-300 ease-out hover:text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onDeleteTask(task.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
})

function TaskDialog({
  open,
  task,
  onOpenChange,
  onTaskChange,
  onDeleteTask,
  onAddBlock,
  onBlockChange,
  onDeleteBlock,
  onUploadAttachment,
  onDeleteAttachment,
  busyAttachmentTarget,
}: {
  open: boolean
  task: TaskDumpTask | null
  onOpenChange: (open: boolean) => void
  onTaskChange: (
    taskId: string,
    updater: (task: TaskDumpTask) => TaskDumpTask,
    payload: TaskSavePayload
  ) => void
  onDeleteTask: (taskId: string) => void
  onAddBlock: (taskId: string) => Promise<void>
  onBlockChange: (
    blockId: string,
    taskId: string,
    updater: (block: TaskDumpWorkspaceBlock) => TaskDumpWorkspaceBlock,
    payload: BlockSavePayload
  ) => void
  onDeleteBlock: (blockId: string) => Promise<void>
  onUploadAttachment: (taskId: string, file: File) => Promise<void>
  onDeleteAttachment: (attachment: TaskDumpAttachment) => Promise<void>
  busyAttachmentTarget: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleEditorRef = useRef<HTMLDivElement>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => {
    if (open) {
      setWorkspaceOpen(false)
    }
    setIsEditingTitle(false)
  }, [open, task?.id])

  useEffect(() => {
    if (!task) return
    if (isEditingTitle) return
    setTitleDraft(task.title ?? '')
  }, [task, isEditingTitle])

  if (!task) return null
  const modalSurfaceStyles = TASK_DUMP_MODAL_SURFACE_STYLES[task.status]
  const statusAccent =
    task.status === 'pending'
      ? { dotClassName: 'bg-amber-400', textClassName: 'text-amber-200' }
      : task.status === 'in_progress'
        ? { dotClassName: 'bg-sky-400', textClassName: 'text-sky-200' }
        : { dotClassName: 'bg-emerald-400', textClassName: 'text-emerald-200' }
  const priorityMeta = TASK_DUMP_PRIORITY_OPTIONS.find((option) => option.value === task.priority_flag) ?? TASK_DUMP_PRIORITY_OPTIONS[0]
  const priorityDotClassName =
    task.priority_flag === 'high'
      ? 'bg-rose-400'
      : task.priority_flag === 'medium'
        ? 'bg-amber-400'
        : task.priority_flag === 'low'
          ? 'bg-sky-400'
          : 'bg-muted-foreground/60'
  const c = modalSurfaceStyles.borderGradientStart
  const cornerGlow = `radial-gradient(ellipse at top left, rgb(${c} / 0.22) 0%, rgb(${c} / 0.08) 30%, transparent 55%)`
  const topBorderGradient = `linear-gradient(to right, rgb(${c} / 0.5) 0%, rgb(${c} / 0.2) 40%, transparent 80%)`
  const headerBorderGradient = `linear-gradient(to right, rgb(${c} / 0.22) 0%, rgb(${c} / 0.08) 50%, transparent 85%)`

  function commitTitleEdit() {
    const normalizedTitle = titleDraft.replace(/\s+/g, ' ').trim()
    const nextTitle = normalizedTitle ? normalizedTitle : null
    onTaskChange(
      task.id,
      (current) => ({ ...current, title: nextTitle }),
      { title: nextTitle }
    )
    setIsEditingTitle(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn('max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl', modalSurfaceStyles.dialogClassName)}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-lg">
          <div
            className="absolute inset-0"
            style={{ background: cornerGlow }}
          />
          <div
            className="absolute left-0 top-0 h-px w-full"
            style={{ background: topBorderGradient }}
          />
        </div>
        <DialogHeader
          className={cn(
            'relative sticky top-0 z-20 border-b border-border/70 bg-background px-6 py-4',
            modalSurfaceStyles.headerClassName
          )}
        >
          <div
            className="pointer-events-none absolute bottom-[-1px] left-0 h-px w-full"
            style={{ background: headerBorderGradient }}
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="sr-only">Task details</DialogTitle>
              {isEditingTitle ? (
                <div
                  ref={titleEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label="Task title"
                  data-empty={!titleDraft.trim()}
                  data-placeholder="Untitled task"
                  onInput={(event) => {
                    setTitleDraft(event.currentTarget.innerText)
                  }}
                  onBlur={commitTitleEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitTitleEdit()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setTitleDraft(task.title ?? '')
                      setIsEditingTitle(false)
                    }
                  }}
                  className="relative min-h-8 w-full cursor-text pr-2 text-xl font-semibold tracking-tight outline-none before:pointer-events-none before:absolute before:left-0 before:top-0 before:whitespace-nowrap before:text-muted-foreground/70 before:content-[attr(data-placeholder)] data-[empty=false]:before:hidden"
                />
              ) : (
                <button
                  type="button"
                  className="min-h-8 w-full cursor-text pr-2 text-left text-xl font-semibold tracking-tight text-foreground/95"
                  onClick={() => {
                    setTitleDraft(task.title ?? '')
                    setIsEditingTitle(true)
                    requestAnimationFrame(() => {
                      const editor = titleEditorRef.current
                      if (!editor) return
                      editor.focus()
                      const selection = window.getSelection()
                      if (!selection) return
                      const range = document.createRange()
                      range.selectNodeContents(editor)
                      range.collapse(false)
                      selection.removeAllRanges()
                      selection.addRange(range)
                    })
                  }}
                >
                  {task.title?.replace(/\s+/g, ' ').trim() || 'Untitled task'}
                </button>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                <span>Created {formatTaskDumpTimestamp(task.created_at)}.</span>{' '}
                <span className="text-muted-foreground/65">Updated {formatTaskDumpTimestamp(task.updated_at)}.</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1 px-3 text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Quick Links
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {TASK_DUMP_QUICK_LINKS.map((link) => (
                    <DropdownMenuItem key={link.id} onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')}>
                      <ExternalLink className="h-4 w-4" />
                      {link.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:bg-background/50 hover:text-foreground"
                onClick={() => onDeleteTask(task.id)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete task</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-76px)] gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="subtle-scrollbar overflow-y-auto px-6 py-5">
            <div className="space-y-6">
              <div className="relative space-y-2">
                <div className="absolute right-2 top-2 z-10">
                  <CopyIconButton value={task.body} label="Copy task details" />
                </div>
                <MarkdownComposer
                  value={task.body}
                  onChange={(body) => {
                    onTaskChange(
                      task.id,
                      (current) => ({ ...current, body }),
                      { body }
                    )
                  }}
                  placeholder="Task Details..."
                  className="border-border/85 bg-black/60"
                  minHeightClassName="min-h-[220px]"
                  maxHeightClassName="max-h-[380px]"
                  maxHeightPx={380}
                  toolbarVariant="inline"
                />
              </div>

              <div
                className={cn(
                  '-mx-6 space-y-3 px-6 pt-2 transition-all',
                  workspaceOpen
                    ? 'bg-transparent pb-3'
                    : 'bg-transparent pb-2'
                )}
              >
                <div className="mx-6 h-px bg-foreground/35" />
                <div className="flex items-center justify-between gap-2 rounded-lg">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-sm font-medium text-foreground/90 hover:text-foreground"
                    onClick={() => setWorkspaceOpen((current) => !current)}
                  >
                    {workspaceOpen ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}
                    <span className={modalSurfaceStyles.workspaceLabelClassName}>
                      Workspace ({task.workspace_blocks.length})
                    </span>
                    <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                      {workspaceOpen ? 'Collapse' : 'Expand'}
                    </span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void onAddBlock(task.id)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Note
                  </Button>
                </div>

                {workspaceOpen && (
                  <div className="space-y-5">
                    {task.workspace_blocks.map((block, index) => (
                      <div key={block.id} className={cn('space-y-2 border-l-2 pl-4', modalSurfaceStyles.railClassName)}>
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/65">
                            Note {index + 1}
                          </span>
                          <div className="flex-1" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Note actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => void onDeleteBlock(block.id)}>
                                <Trash2 className="h-4 w-4" />
                                Delete note
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="relative">
                          <div className="absolute right-2 top-2 z-10">
                            <CopyIconButton value={block.content} label={`Copy workspace ${index + 1} text`} />
                          </div>
                          <MarkdownComposer
                            value={block.content}
                            onChange={(content) => {
                              onBlockChange(
                                block.id,
                                task.id,
                                (current) => ({ ...current, content }),
                                { content }
                              )
                            }}
                            placeholder=""
                            className="border-border/85 bg-black/60"
                            minHeightClassName="min-h-[160px]"
                            maxHeightClassName="max-h-[280px]"
                            maxHeightPx={280}
                            toolbarVariant="inline"
                          />
                        </div>
                      </div>
                    ))}

                    {task.workspace_blocks.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                        No workspace blocks yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="subtle-scrollbar overflow-y-auto border-t border-border/70 bg-muted/10 px-6 py-5 lg:border-t-0 lg:border-l">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-3 border-b border-border/45 pb-4">
                  <Select
                    value={task.status}
                    onValueChange={(value) => {
                      const status = value as TaskDumpStatus
                      onTaskChange(
                        task.id,
                        (current) => ({ ...current, status }),
                        { status }
                      )
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-9 w-full rounded-md border-border/50 bg-background/35 px-3 text-sm',
                        statusAccent.textClassName
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_DUMP_STATUSES.map((status) => (
                        <SelectItem
                          key={status}
                          value={status}
                          className={cn(
                            status === 'pending'
                              ? 'text-amber-200'
                              : status === 'in_progress'
                                ? 'text-sky-200'
                                : 'text-emerald-200'
                          )}
                        >
                          {`• ${TASK_DUMP_STATUS_LABELS[status]}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={task.priority_flag}
                    onValueChange={(value) => {
                      const priorityFlag = value as TaskDumpPriorityFlag
                      onTaskChange(
                        task.id,
                        (current) => ({ ...current, priority_flag: priorityFlag }),
                        { priorityFlag }
                      )
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-9 w-full rounded-md border-border/50 bg-background/35 px-3 text-sm',
                        priorityMeta.className
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_DUMP_PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className={cn(option.className)}>
                          {`• ${option.label}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-9 w-full justify-start rounded-md border border-border/50 bg-background/35 px-3 text-sm hover:bg-background/45"
                      >
                        <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className={cn(!task.due_at && 'text-muted-foreground')}>
                          {formatTaskDumpDate(task.due_at)}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={task.due_at ? new Date(task.due_at) : undefined}
                        onSelect={(date) => {
                          onTaskChange(
                            task.id,
                            (current) => ({ ...current, due_at: date ? date.toISOString() : null }),
                            { dueAt: date ? date.toISOString() : null }
                          )
                        }}
                      >
                      </Calendar>
                      <div className="border-t p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            onTaskChange(
                              task.id,
                              (current) => ({ ...current, due_at: null }),
                              { dueAt: null }
                            )
                          }}
                        >
                          Clear due date
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <AttachmentSection
                title="Attachments"
                attachments={task.attachments}
                busy={busyAttachmentTarget === task.id}
                onUploadClick={() => fileInputRef.current?.click()}
                onDeleteAttachment={onDeleteAttachment}
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <Link2 className="mr-2 h-4 w-4" />
                  Links
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TASK_DUMP_QUICK_LINKS.map((link) => (
                  <DropdownMenuItem key={link.id} onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink className="h-4 w-4" />
                    {link.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" />
              Upload
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDeleteTask(task.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            files.forEach((file) => {
              void onUploadAttachment(task.id, file)
            })
            event.target.value = ''
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ThoughtsPanel({
  open,
  onToggle,
  thoughts,
  quickThoughtText,
  onQuickThoughtChange,
  onQuickThoughtCreate,
  onOpenThought,
  onDeleteThought,
}: {
  open: boolean
  onToggle: () => void
  thoughts: TaskDumpThought[]
  quickThoughtText: string
  onQuickThoughtChange: (value: string) => void
  onQuickThoughtCreate: () => Promise<void>
  onOpenThought: (thoughtId: string) => void
  onDeleteThought: (thoughtId: string) => void
}) {
  return (
    <div className={cn('transition-all duration-200', open ? 'w-full' : 'w-full xl:w-[40px]')}>
      {open ? (
        <div className="border-l-2 border-border/40 pl-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground/90">Thoughts</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={onToggle}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mb-4 flex gap-2">
            <Textarea
              value={quickThoughtText}
              onChange={(event) => onQuickThoughtChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void onQuickThoughtCreate()
                }
              }}
              placeholder="Drop a thought here..."
              className="min-h-[60px] resize-none border-border/40 bg-transparent text-sm"
            />
          </div>
          <Button
            onClick={() => void onQuickThoughtCreate()}
            disabled={!quickThoughtText.trim()}
            variant="outline"
            size="sm"
            className="mb-5 w-full border-border/40 text-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Thought
          </Button>

          <div className="space-y-0">
            {thoughts.map((thought, idx) => (
              <div
                key={thought.id}
                onClick={() => onOpenThought(thought.id)}
                className={cn(
                  'group cursor-pointer px-1 py-3 transition-colors hover:bg-muted/20',
                  idx > 0 && 'border-t border-border/25'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground/90">
                      {thought.title || thought.content.split('\n')[0] || 'Untitled thought'}
                    </h3>
                    {thought.content && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                        {thought.content}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteThought(thought.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground/50">
                  {formatTaskDumpTimestamp(thought.updated_at)}
                </p>
              </div>
            ))}

            {thoughts.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground/50">
                No thoughts yet.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden h-full items-start justify-center border-l-2 border-border/30 pt-1 xl:flex">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60" onClick={onToggle}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

function ThoughtDialog({
  open,
  thought,
  onOpenChange,
  onThoughtChange,
  onDeleteThought,
  onUploadAttachment,
  onDeleteAttachment,
  busyAttachmentTarget,
}: {
  open: boolean
  thought: TaskDumpThought | null
  onOpenChange: (open: boolean) => void
  onThoughtChange: (
    thoughtId: string,
    updater: (thought: TaskDumpThought) => TaskDumpThought,
    payload: ThoughtSavePayload
  ) => void
  onDeleteThought: (thoughtId: string) => void
  onUploadAttachment: (thoughtId: string, file: File) => Promise<void>
  onDeleteAttachment: (attachment: TaskDumpAttachment) => Promise<void>
  busyAttachmentTarget: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!thought) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-xl">Thought</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Created {formatTaskDumpTimestamp(thought.created_at)}. Updated {formatTaskDumpTimestamp(thought.updated_at)}.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onDeleteThought(thought.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(88vh-84px)] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Title
              </label>
              <Input
                value={thought.title ?? ''}
                onChange={(event) => {
                  const title = event.target.value
                  onThoughtChange(
                    thought.id,
                    (current) => ({ ...current, title: title || null }),
                    { title: title || null }
                  )
                }}
                placeholder="Optional title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Content
              </label>
              <MarkdownComposer
                value={thought.content}
                onChange={(content) => {
                  onThoughtChange(
                    thought.id,
                    (current) => ({ ...current, content }),
                    { content }
                  )
                }}
                placeholder="Drop a thought, note, idea, or AI-generated markdown here."
                className="border-border/85 bg-black/60"
                minHeightClassName="min-h-[260px]"
                toolbarVariant="inline"
              />
            </div>

            <AttachmentSection
              title="Attachments"
              attachments={thought.attachments}
              busy={busyAttachmentTarget === thought.id}
              onUploadClick={() => fileInputRef.current?.click()}
              onDeleteAttachment={onDeleteAttachment}
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            files.forEach((file) => {
              void onUploadAttachment(thought.id, file)
            })
            event.target.value = ''
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AttachmentSection({
  title,
  attachments,
  busy,
  onUploadClick,
  onDeleteAttachment,
}: {
  title: string
  attachments: TaskDumpAttachment[]
  busy: boolean
  onUploadClick: () => void
  onDeleteAttachment: (attachment: TaskDumpAttachment) => Promise<void>
}) {
  const [viewerAttachment, setViewerAttachment] = useState<TaskDumpAttachment | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onUploadClick}
          disabled={busy}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
          Upload
        </Button>
      </div>

      <div className="divide-y divide-border/35">
        {attachments.map((attachment) => (
          <AttachmentPreview
            key={attachment.id}
            attachment={attachment}
            onView={() => setViewerAttachment(attachment)}
            onDelete={() => void onDeleteAttachment(attachment)}
          />
        ))}
        {attachments.length === 0 && (
          <div className="py-5 text-sm text-muted-foreground">
            No attachments yet.
          </div>
        )}
      </div>

      <AttachmentViewerDialog
        open={Boolean(viewerAttachment)}
        attachment={viewerAttachment}
        onOpenChange={(open) => {
          if (!open) setViewerAttachment(null)
        }}
      />
    </div>
  )
}

function AttachmentPreview({
  attachment,
  onView,
  onDelete,
}: {
  attachment: TaskDumpAttachment
  onView: () => void
  onDelete: () => void
}) {
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-border/70 p-2">
          {attachment.media_kind === 'image' ? (
            <FileImage className="h-4 w-4" />
          ) : attachment.media_kind === 'audio' ? (
            <FileAudio className="h-4 w-4" />
          ) : attachment.media_kind === 'video' ? (
            <FileVideo className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{attachment.file_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {attachment.mime_type || 'Unknown type'} {attachment.file_size ? `• ${Math.round(attachment.file_size / 1024)} KB` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onView}>
                View
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttachmentViewerDialog({
  open,
  attachment,
  onOpenChange,
}: {
  open: boolean
  attachment: TaskDumpAttachment | null
  onOpenChange: (open: boolean) => void
}) {
  if (!attachment) return null

  const href = getTaskDumpAttachmentUrl(attachment.storage_path)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="truncate pr-6 text-base">{attachment.file_name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(88vh-70px)] overflow-auto p-5">
          {attachment.media_kind === 'image' && (
            <Image
              src={href}
              alt={attachment.file_name}
              width={1600}
              height={900}
              className="h-auto max-h-[70vh] w-full rounded-xl border border-border/70 object-contain"
              unoptimized
            />
          )}

          {attachment.media_kind === 'audio' && (
            <audio controls className="w-full">
              <source src={href} />
            </audio>
          )}

          {attachment.media_kind === 'video' && (
            <video controls className="max-h-[70vh] w-full rounded-xl border border-border/70">
              <source src={href} />
            </video>
          )}

          {attachment.media_kind === 'file' && (
            <iframe
              src={href}
              title={attachment.file_name}
              className="h-[70vh] w-full rounded-xl border border-border/70 bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
