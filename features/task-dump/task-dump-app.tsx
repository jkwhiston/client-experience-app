'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bold,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Flag,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCcw,
  TextQuote,
  Trash2,
  Underline,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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
import { createClient } from '@/lib/supabase/client'
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
import { ThemeToggle } from '@/components/theme-toggle'
import { stripLoomEmbedsFromHtml } from '@/features/task-dump/loom-embed'
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
  | 'quote'
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
  { action: 'quote', label: 'Quote block', icon: TextQuote },
  { action: 'divider', label: 'Divider', icon: Minus },
]

function newQuickDumpCheckboxHtml(): string {
  return `<div data-task-check="unchecked"><span data-check-toggle contenteditable="false">\u2610</span><span data-check-text>\u00a0</span></div>`
}

function insertQuoteBlockAtSelection(editor: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return false

  const quote = document.createElement('blockquote')
  if (range.collapsed) {
    quote.append(document.createElement('br'))
    range.insertNode(quote)
    const nextRange = document.createRange()
    nextRange.selectNodeContents(quote)
    nextRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(nextRange)
    return true
  }

  const fragment = range.extractContents()
  quote.append(fragment)
  range.insertNode(quote)
  const nextRange = document.createRange()
  nextRange.selectNodeContents(quote)
  nextRange.collapse(false)
  selection.removeAllRanges()
  selection.addRange(nextRange)
  return true
}

function toggleQuoteBlockAtSelection(editor: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return false

  function unwrapQuoteBlock(quote: HTMLElement) {
    const parent = quote.parentNode
    if (!parent) return

    const fragment = document.createDocumentFragment()
    Array.from(quote.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (!text.trim()) return
        const row = document.createElement('div')
        row.textContent = text
        fragment.append(row)
        return
      }
      fragment.append(node)
    })

    parent.insertBefore(fragment, quote)
    parent.removeChild(quote)
  }

  function outdentQuoteRange(firstQuote: HTMLElement, lastQuote: HTMLElement): boolean {
    const currentSelection = window.getSelection()
    if (!currentSelection) return false
    const outdentRange = document.createRange()
    outdentRange.setStartBefore(firstQuote)
    outdentRange.setEndAfter(lastQuote)
    currentSelection.removeAllRanges()
    currentSelection.addRange(outdentRange)
    return document.execCommand('outdent')
  }

  const intersectingQuotes = Array.from(editor.querySelectorAll('blockquote')).filter((quote) => {
    try {
      return range.intersectsNode(quote)
    } catch {
      return false
    }
  }) as HTMLElement[]
  const selectedQuotes = intersectingQuotes.filter(
    (quote) => !intersectingQuotes.some((other) => other !== quote && other.contains(quote))
  )

  const selectionElement =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as HTMLElement)
      : range.commonAncestorContainer.parentElement
  const activeQuote = selectionElement?.closest('blockquote') as HTMLElement | null

  if (selectedQuotes.length > 0) {
    const firstQuote = selectedQuotes[0]
    const lastQuote = selectedQuotes[selectedQuotes.length - 1]
    if (outdentQuoteRange(firstQuote, lastQuote)) return true
    selectedQuotes.forEach(unwrapQuoteBlock)
    return true
  }
  if (activeQuote && editor.contains(activeQuote)) {
    if (outdentQuoteRange(activeQuote, activeQuote)) return true
    unwrapQuoteBlock(activeQuote)
    return true
  }

  if (
    !document.execCommand('formatBlock', false, 'blockquote') &&
    !document.execCommand('formatBlock', false, '<blockquote>')
  ) {
    return insertQuoteBlockAtSelection(editor)
  }
  return true
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

function getAdjacentTaskStatus(
  status: TaskDumpStatus,
  direction: 'backward' | 'forward'
): TaskDumpStatus | null {
  const currentIndex = TASK_DUMP_STATUSES.indexOf(status)
  if (currentIndex < 0) return null
  const nextIndex = direction === 'forward' ? currentIndex + 1 : currentIndex - 1
  if (nextIndex < 0 || nextIndex >= TASK_DUMP_STATUSES.length) return null
  return TASK_DUMP_STATUSES[nextIndex]
}

function getPriorityClass(flag: TaskDumpPriorityFlag): string {
  return TASK_DUMP_PRIORITY_OPTIONS.find((option) => option.value === flag)?.className || 'text-muted-foreground'
}

function stripHtmlToText(html: string): string {
  return stripLoomEmbedsFromHtml(html)
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

function normalizeCopiedText(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value
  const probe = document.createElement('div')
  probe.innerHTML = value
  probe.style.position = 'fixed'
  probe.style.left = '-99999px'
  probe.style.top = '0'
  probe.style.opacity = '0'
  probe.style.pointerEvents = 'none'
  probe.style.whiteSpace = 'pre-wrap'
  document.body.appendChild(probe)
  const text = (probe.innerText || probe.textContent || stripHtmlToText(value))
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  document.body.removeChild(probe)
  return text
}

async function copyToClipboard(value: string): Promise<boolean> {
  const textValue = normalizeCopiedText(value)
  try {
    await navigator.clipboard.writeText(textValue)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = textValue
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
      className={cn('h-7 w-7 text-foreground/15 hover:text-foreground/40', className)}
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
      {copied ? <Check className="h-3.5 w-3.5 text-foreground/40" /> : <Copy className="h-3.5 w-3.5" />}
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
    cardMetaClassName: string
  }
> = {
  pending: {
    summaryClassName: '',
    summaryCountClassName: '',
    columnClassName: 'relative before:absolute before:inset-y-0 before:left-0 before:w-px before:origin-left before:scale-x-50 before:bg-amber-500',
    columnBadgeClassName: 'text-amber-500',
    emptyStateClassName: 'text-foreground/20',
    cardMetaClassName: 'text-foreground/35',
  },
  in_progress: {
    summaryClassName: '',
    summaryCountClassName: '',
    columnClassName: 'relative before:absolute before:inset-y-0 before:left-0 before:w-px before:origin-left before:scale-x-50 before:bg-sky-500',
    columnBadgeClassName: 'text-sky-500',
    emptyStateClassName: 'text-foreground/20',
    cardMetaClassName: 'text-foreground/35',
  },
  done: {
    summaryClassName: '',
    summaryCountClassName: '',
    columnClassName: 'relative before:absolute before:inset-y-0 before:left-0 before:w-px before:origin-left before:scale-x-50 before:bg-emerald-500',
    columnBadgeClassName: 'text-emerald-500',
    emptyStateClassName: 'text-foreground/20',
    cardMetaClassName: 'text-foreground/35',
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
    dialogClassName: 'border border-foreground/28 bg-background shadow-none',
    borderGradientStart: '',
    headerClassName: '',
    workspaceLabelClassName: 'text-foreground/40',
    railClassName: 'border-l-foreground/15',
  },
  in_progress: {
    dialogClassName: 'border border-foreground/28 bg-background shadow-none',
    borderGradientStart: '',
    headerClassName: '',
    workspaceLabelClassName: 'text-foreground/40',
    railClassName: 'border-l-foreground/15',
  },
  done: {
    dialogClassName: 'border border-foreground/28 bg-background shadow-none',
    borderGradientStart: '',
    headerClassName: '',
    workspaceLabelClassName: 'text-foreground/40',
    railClassName: 'border-l-foreground/15',
  },
}

export function TaskDumpApp() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [snapshot, setSnapshot] = useState<TaskDumpSnapshot>(DEFAULT_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickTaskTitle, setQuickTaskTitle] = useState('')
  const [quickTaskText, setQuickTaskText] = useState('')
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskDumpPriorityFlag>('none')
  const [quickTaskDueAt, setQuickTaskDueAt] = useState<string | null>(null)
  const [quickTaskFiles, setQuickTaskFiles] = useState<File[]>([])
  const [quickTaskComposerResetKey, setQuickTaskComposerResetKey] = useState(0)
  const quickTaskFileInputRef = useRef<HTMLInputElement>(null)
  const quickDumpEditorWrapRef = useRef<HTMLDivElement>(null)
  const [quickThoughtText, setQuickThoughtText] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null)
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
  const liveReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('cstreet-mono')
    return () => { document.documentElement.classList.remove('cstreet-mono') }
  }, [])

  const load = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setLoading(true)
      const nextSnapshot = await fetchTaskDumpSnapshot()
      setSnapshot(nextSnapshot)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load C-Street Dump.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  const scheduleLiveReload = useCallback(() => {
    if (liveReloadTimerRef.current) clearTimeout(liveReloadTimerRef.current)
    liveReloadTimerRef.current = setTimeout(() => {
      void load({ showLoading: false })
    }, 350)
  }, [load])

  useEffect(() => {
    const taskTimers = taskTimersRef.current
    const thoughtTimers = thoughtTimersRef.current
    const blockTimers = blockTimersRef.current

    void load()
    return () => {
      taskTimers.forEach((timer) => clearTimeout(timer))
      thoughtTimers.forEach((timer) => clearTimeout(timer))
      blockTimers.forEach((timer) => clearTimeout(timer))
      if (liveReloadTimerRef.current) clearTimeout(liveReloadTimerRef.current)
    }
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('task-dump-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_dump_tasks' },
        scheduleLiveReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_dump_task_workspace_blocks' },
        scheduleLiveReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_dump_task_attachments' },
        scheduleLiveReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_dump_thoughts' },
        scheduleLiveReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_dump_thought_attachments' },
        scheduleLiveReload
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          scheduleLiveReload()
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [scheduleLiveReload, supabase])

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      void load({ showLoading: false })
    }

    const intervalId = window.setInterval(refreshIfVisible, 5000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisible()
      }
    }

    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [load])

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

    const selection = window.getSelection()
    const hasSelectionInEditor = Boolean(
      selection &&
      selection.rangeCount > 0 &&
      editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    )
    if (!hasSelectionInEditor) editor.focus()

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
      case 'quote':
        toggleQuoteBlockAtSelection(editor)
        break
      case 'divider':
        document.execCommand('insertHTML', false, '<hr>')
        break
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

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
      setQuickTaskComposerResetKey((current) => current + 1)
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

  const handleTaskStep = useCallback((taskId: string, direction: 'backward' | 'forward') => {
    const task = snapshot.tasks.find((candidate) => candidate.id === taskId)
    if (!task) return
    const nextStatus = getAdjacentTaskStatus(task.status, direction)
    if (!nextStatus) return

    updateTaskLocal(taskId, (current) => ({ ...current, status: nextStatus }))
    queueTaskSave(taskId, { status: nextStatus })
  }, [snapshot.tasks])

  const handleTaskReorder = useCallback(async (taskId: string, direction: 'up' | 'down') => {
    const task = snapshot.tasks.find((candidate) => candidate.id === taskId)
    if (!task) return

    const columnTasks = snapshot.tasks
      .filter((candidate) => candidate.status === task.status)
      .sort((a, b) => a.column_order - b.column_order)
    const currentIndex = columnTasks.findIndex((candidate) => candidate.id === taskId)
    if (currentIndex < 0) return

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (nextIndex < 0 || nextIndex >= columnTasks.length) return

    const reordered = [...columnTasks]
    ;[reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]]

    const updates = reordered.map((candidate, index) => ({
      id: candidate.id,
      status: candidate.status,
      columnOrder: index,
    }))
    const orderById = new Map<string, number>(updates.map((update) => [update.id, update.columnOrder]))

    setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.map((candidate) =>
        candidate.status === task.status
          ? { ...candidate, column_order: orderById.get(candidate.id) ?? candidate.column_order }
          : candidate
      ),
    }))

    try {
      const nextSnapshot = await reorderTaskDumpTasks(updates)
      setSnapshot(nextSnapshot)
    } catch (reorderError) {
      toast.error(reorderError instanceof Error ? reorderError.message : 'Could not move task.')
      await load()
    }
  }, [snapshot.tasks])

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
          <div className="space-y-5 border-l border-border pl-5">
            <h1 className="text-xl font-semibold tracking-tight">C-Street Dump</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button variant="ghost" onClick={() => router.push('/')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to tracker
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-12 px-6 py-10 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button type="button" className="text-foreground/65 transition-colors hover:text-foreground" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex items-center gap-3 text-2xl font-normal tracking-tight">
              <DumpTruckDumpingIcon className="h-8 w-8" />
              C-Street Dump
            </h1>
          </div>
          <div className="text-foreground/65 transition-colors hover:text-foreground [&_button]:h-auto [&_button]:w-auto [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:shadow-none hover:[&_button]:bg-transparent">
            <ThemeToggle />
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            <div className="space-y-4 pb-8">
                <Input
                  value={quickTaskTitle}
                  onChange={(event) => setQuickTaskTitle(event.target.value)}
                  placeholder="Title"
                  className="h-10 rounded-none border-0 border-b border-b-foreground/25 bg-transparent px-0 text-base font-normal shadow-none dark:bg-transparent placeholder:text-foreground/60 focus-visible:border-b-foreground/60 focus-visible:ring-0"
                />
                <div ref={quickDumpEditorWrapRef} className="border-b border-b-foreground/20 transition-colors focus-within:border-b-foreground/60">
                  <MarkdownComposer
                    key={quickTaskComposerResetKey}
                    value={quickTaskText}
                    onChange={setQuickTaskText}
                    placeholder="Write a task..."
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
                <div className="flex w-full flex-wrap items-center gap-0">
                  <Select
                    value={quickTaskPriority}
                    onValueChange={(value) => setQuickTaskPriority(value as TaskDumpPriorityFlag)}
                  >
                    <SelectTrigger
                      className={cn(
                        'h-8 w-auto min-w-0 justify-start gap-1.5 rounded-none border-0 bg-transparent px-0 text-sm shadow-none dark:bg-transparent focus:ring-0 [&>svg]:hidden',
                        quickTaskPriority === 'none'
                          ? 'text-foreground/90 data-[placeholder]:text-foreground/90'
                          : (TASK_DUMP_PRIORITY_OPTIONS.find((option) => option.value === quickTaskPriority)?.className ?? 'text-foreground/90')
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Flag
                          className="h-3.5 w-3.5 text-foreground/90"
                          aria-hidden="true"
                        />
                        <SelectValue placeholder="Flag" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_DUMP_PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className={cn(option.className)}>
                          {option.value === 'none' ? 'Flag' : option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mx-2 h-4 w-px bg-foreground/10" aria-hidden="true" />

                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 border-0 bg-transparent px-0 text-sm transition-colors hover:text-foreground',
                          !quickTaskDueAt ? 'text-foreground/90' : 'text-foreground'
                        )}
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        {quickTaskDueAt ? formatTaskDumpDate(quickTaskDueAt) : 'Due'}
                      </button>
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
                  <div className="mx-2 h-4 w-px bg-foreground/10" aria-hidden="true" />
                  <div className="flex items-center gap-1">
                    {QUICK_DUMP_FORMAT_ITEMS.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.action}
                          type="button"
                          title={item.label}
                          className="flex h-6 w-6 items-center justify-center text-foreground/80 transition-colors hover:text-foreground"
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

                  <button
                    type="button"
                    className={cn(
                      'ml-auto inline-flex items-center text-sm transition-colors',
                      quickTaskFiles.length > 0 ? 'text-foreground' : 'text-foreground/80 hover:text-foreground'
                    )}
                    aria-label="Attach files"
                    title="Attach files"
                    onClick={() => quickTaskFileInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {quickTaskFiles.length > 0 ? (
                      <span className="ml-1 text-[11px]">{quickTaskFiles.length}</span>
                    ) : null}
                  </button>
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
                </div>

                {quickTaskFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quickTaskFiles.map((file, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 text-xs text-foreground/70">
                        {file.name}
                        <button
                          type="button"
                          className="ml-0.5 text-foreground/65 hover:text-foreground"
                          onClick={() => setQuickTaskFiles((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-sm text-foreground/90 transition-colors hover:text-foreground"
                    onClick={handleQuickTaskCreate}
                  >
                    <Plus className="h-4 w-4" />
                    dump
                  </button>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
              {TASK_DUMP_STATUSES.map((status) => (
                <TaskColumn
                  key={status}
                  status={status}
                  tasks={groupedTasks[status]}
                  onOpenTask={setSelectedTaskId}
                  onStepTask={handleTaskStep}
                  onReorderTask={handleTaskReorder}
                  onDeleteTask={handleTaskDelete}
                />
              ))}
            </div>
          </div>

          <ThoughtsPanel
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
  onStepTask,
  onReorderTask,
  onDeleteTask,
}: {
  status: TaskDumpStatus
  tasks: TaskDumpTask[]
  onOpenTask: (taskId: string) => void
  onStepTask: (taskId: string, direction: 'backward' | 'forward') => void
  onReorderTask: (taskId: string, direction: 'up' | 'down') => void
  onDeleteTask: (taskId: string) => void
}) {
  const statusStyles = TASK_DUMP_STATUS_STYLES[status]

  return (
    <div className={cn('pl-5', statusStyles.columnClassName)}>
      <div className="mb-5 flex items-center justify-between">
        <span className={cn('text-xs font-medium uppercase tracking-[0.2em]', statusStyles.columnBadgeClassName)}>
          {TASK_DUMP_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="min-h-[200px] space-y-1">
        {tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            onOpenTask={onOpenTask}
            onStepTask={onStepTask}
            onReorderTask={onReorderTask}
            canMoveUp={index > 0}
            canMoveDown={index < tasks.length - 1}
            onDeleteTask={onDeleteTask}
          />
        ))}
        {tasks.length === 0 && (
          <p className={cn('py-10 text-center text-sm', statusStyles.emptyStateClassName)}>
            —
          </p>
        )}
      </div>
    </div>
  )
})

const TaskCard = memo(function TaskCard({
  task,
  onOpenTask,
  onStepTask,
  onReorderTask,
  canMoveUp,
  canMoveDown,
  onDeleteTask,
}: {
  task: TaskDumpTask
  onOpenTask: (taskId: string) => void
  onStepTask: (taskId: string, direction: 'backward' | 'forward') => void
  onReorderTask: (taskId: string, direction: 'up' | 'down') => void
  canMoveUp: boolean
  canMoveDown: boolean
  onDeleteTask: (taskId: string) => void
}) {
  const statusStyles = TASK_DUMP_STATUS_STYLES[task.status]
  const canMoveBackward = Boolean(getAdjacentTaskStatus(task.status, 'backward'))
  const canMoveForward = Boolean(getAdjacentTaskStatus(task.status, 'forward'))

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group py-4 pl-5 pr-2 transition-colors">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
              {task.priority_flag !== 'none' && (
                <span className={cn('text-[10px] uppercase tracking-[0.2em]', getPriorityClass(task.priority_flag))}>
                  {task.priority_flag}
                </span>
              )}
              <h3 className="text-sm text-foreground">
                {task.title || stripHtmlToText(task.body).slice(0, 60) || 'Untitled'}
              </h3>
              {task.body.trim() && (
                <p className="mt-1.5 line-clamp-2 text-xs text-foreground/60">
                  {getTaskBodyPreview(task.body)}
                </p>
              )}
              {task.due_at && (
                <p className={cn('mt-2 text-[11px]', statusStyles.cardMetaClassName)}>
                  {formatTaskDumpDate(task.due_at)}
                </p>
              )}
            </button>

            <div className="flex shrink-0 self-stretch flex-col items-end justify-end py-0.5">
              <div className="flex items-center gap-0.5">
                {canMoveBackward && (
                  <button
                    type="button"
                    className="text-foreground/0 transition-colors group-hover:text-foreground/35 group-focus-within:text-foreground/35 hover:!text-foreground/75"
                    aria-label="Move task backward"
                    title="Move task backward"
                    onClick={() => onStepTask(task.id, 'backward')}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                {canMoveForward && (
                  <button
                    type="button"
                    className="text-foreground/0 transition-colors group-hover:text-foreground/35 group-focus-within:text-foreground/35 hover:!text-foreground/75"
                    aria-label="Move task forward"
                    title="Move task forward"
                    onClick={() => onStepTask(task.id, 'forward')}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[9rem]">
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <ContextMenuItem asChild disabled={!canMoveUp} className="h-8 w-8 justify-center rounded-sm px-0">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-sm text-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Move task up"
              title="Move up"
              onClick={() => onReorderTask(task.id, 'up')}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </ContextMenuItem>
          <ContextMenuItem asChild disabled={!canMoveDown} className="h-8 w-8 justify-center rounded-sm px-0">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-sm text-foreground/65 transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Move task down"
              title="Move down"
              onClick={() => onReorderTask(task.id, 'down')}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </ContextMenuItem>
        </div>
        <div className="mx-1 my-1 h-px bg-border" />
        <ContextMenuItem
          className="text-red-500 focus:text-red-500"
          onClick={() => onDeleteTask(task.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete task
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
  const titleEditorRef = useRef<HTMLInputElement>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => {
    if (open && task) {
      // Sync local panel/editor state each time a task dialog session starts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspaceOpen(task.workspace_blocks.length > 0)
      return
    }
    setIsEditingTitle(false)
  }, [open, task?.id])

  useEffect(() => {
    if (!task) return
    if (isEditingTitle) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitleDraft(task.title ?? '')
  }, [task, isEditingTitle])

  if (!task) return null
  const modalSurfaceStyles = TASK_DUMP_MODAL_SURFACE_STYLES[task.status]
  const statusAccent =
    task.status === 'pending'
      ? { dotClassName: 'bg-amber-400', textClassName: 'text-amber-400/80' }
      : task.status === 'in_progress'
        ? { dotClassName: 'bg-sky-400', textClassName: 'text-sky-400/80' }
        : { dotClassName: 'bg-emerald-400', textClassName: 'text-emerald-400/80' }
  const priorityMeta = TASK_DUMP_PRIORITY_OPTIONS.find((option) => option.value === task.priority_flag) ?? TASK_DUMP_PRIORITY_OPTIONS[0]

  function commitTitleEdit() {
    if (!task) return
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
        <DialogHeader
          className="relative sticky top-0 z-20 border-b border-foreground/10 bg-background px-8 py-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="sr-only">Task details</DialogTitle>
              {isEditingTitle ? (
                <input
                  ref={titleEditorRef}
                  type="text"
                  value={titleDraft}
                  onChange={(event) => {
                    setTitleDraft(event.target.value)
                  }}
                  aria-label="Task title"
                  placeholder="Untitled task"
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
                  className="block h-8 w-full cursor-text border-0 bg-transparent px-0 pr-2 text-left text-xl font-normal leading-8 tracking-tight text-foreground outline-none placeholder:text-foreground/45"
                />
              ) : (
                <button
                  type="button"
                  className="block h-8 w-full cursor-text pr-2 text-left text-xl font-normal leading-8 tracking-tight text-foreground"
                  onClick={() => {
                    const initialTitle = task.title ?? ''
                    setTitleDraft(initialTitle)
                    setIsEditingTitle(true)
                    requestAnimationFrame(() => {
                      const editor = titleEditorRef.current
                      if (!editor) return
                      editor.focus()
                      const cursorPosition = initialTitle.length
                      editor.setSelectionRange(cursorPosition, cursorPosition)
                    })
                  }}
                >
                  {task.title?.replace(/\s+/g, ' ').trim() || 'Untitled task'}
                </button>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-foreground/65">Created {formatTaskDumpTimestamp(task.created_at)}</span>
                <span className="text-foreground/30" aria-hidden="true">•</span>
                <span className="text-foreground/25">Updated {formatTaskDumpTimestamp(task.updated_at)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-1 text-xs text-foreground/70 hover:bg-transparent hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Links
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
              <button
                type="button"
                className="text-foreground/70 transition-colors hover:text-foreground"
                onClick={() => onDeleteTask(task.id)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete task</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-76px)] gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="subtle-scrollbar overflow-y-auto px-8 py-6">
            <div className="space-y-8">
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
                  className="border-0 bg-transparent"
                  minHeightClassName="min-h-[180px]"
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
                <div className="mx-6 h-px bg-foreground/10" />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm text-foreground/70 transition-colors hover:text-foreground"
                    onClick={() => setWorkspaceOpen((current) => !current)}
                  >
                    {workspaceOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Workspace ({task.workspace_blocks.length})
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm text-foreground/65 transition-colors hover:text-foreground"
                    onClick={() => void onAddBlock(task.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    add note
                  </button>
                </div>

                {workspaceOpen && (
                  <div className="space-y-5">
                    {task.workspace_blocks.map((block, index) => (
                      <div key={block.id} className={cn('space-y-2 border-l-2 pl-4', modalSurfaceStyles.railClassName)}>
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-foreground/55">
                            {index + 1}
                          </span>
                          <div className="flex-1" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="text-foreground/65 transition-colors hover:text-foreground">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                                <span className="sr-only">Note actions</span>
                              </button>
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
                            placeholder="Write a note..."
                            placeholderClassName="text-foreground/45"
                            className="border-0 bg-transparent"
                            minHeightClassName="min-h-[120px]"
                            maxHeightClassName="max-h-[280px]"
                            maxHeightPx={280}
                            toolbarVariant="inline"
                          />
                        </div>
                      </div>
                    ))}

                    {task.workspace_blocks.length === 0 && (
                      <p className="py-8 text-sm text-foreground/45">—</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="subtle-scrollbar overflow-y-auto border-t border-foreground/10 px-6 py-6 lg:border-t-0 lg:border-l lg:border-foreground/10">
            <div className="space-y-7">
              <div className="space-y-5">
                <div className="space-y-3 pb-4">
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
                        'h-9 w-full rounded-none border-0 bg-transparent px-0 text-sm shadow-none dark:bg-transparent focus:ring-0',
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
                              ? 'text-amber-400/80'
                              : status === 'in_progress'
                                ? 'text-sky-400/80'
                                : 'text-emerald-400/80'
                          )}
                        >
                          {TASK_DUMP_STATUS_LABELS[status]}
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
                        'h-9 w-full rounded-none border-0 bg-transparent px-0 text-sm shadow-none dark:bg-transparent focus:ring-0',
                        priorityMeta.className
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
                        className="h-9 w-full justify-start border-0 px-0 text-sm hover:bg-transparent"
                      >
                        <CalendarDays className="mr-2 h-4 w-4 text-foreground/60" />
                        <span className={cn(!task.due_at && 'text-foreground/65')}>
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

        <div className="sticky bottom-0 z-20 border-t border-foreground/8 bg-background px-4 py-3 lg:hidden">
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="text-sm text-foreground/70 hover:text-foreground">
                  Links
                </button>
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
            <button type="button" className="text-sm text-foreground/70 hover:text-foreground" onClick={() => fileInputRef.current?.click()}>
              Upload
            </button>
            <button type="button" className="text-sm text-foreground/70 hover:text-foreground" onClick={() => onDeleteTask(task.id)}>
              Delete
            </button>
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
  thoughts,
  quickThoughtText,
  onQuickThoughtChange,
  onQuickThoughtCreate,
  onOpenThought,
  onDeleteThought,
}: {
  thoughts: TaskDumpThought[]
  quickThoughtText: string
  onQuickThoughtChange: (value: string) => void
  onQuickThoughtCreate: () => Promise<void>
  onOpenThought: (thoughtId: string) => void
  onDeleteThought: (thoughtId: string) => void
}) {
  return (
    <div className="w-full">
      <div className="border-l border-foreground/20 pl-6">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-foreground/85">Thoughts</span>
        </div>
        <div className="mb-3">
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
            className="min-h-[60px] resize-none rounded-none border-0 bg-transparent px-0 text-sm shadow-none dark:bg-transparent placeholder:text-foreground/40 focus-visible:ring-0"
          />
        </div>
        <button
          type="button"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-foreground/95 transition-colors hover:text-foreground disabled:opacity-60"
          disabled={!quickThoughtText.trim()}
          onClick={() => void onQuickThoughtCreate()}
        >
          <Plus className="h-3.5 w-3.5" />
          add thought
        </button>

        <div className="space-y-0">
          {thoughts.map((thought, idx) => (
            <div
              key={thought.id}
              onClick={() => onOpenThought(thought.id)}
              className={cn(
                'group cursor-pointer py-3 transition-colors',
                idx > 0 && 'border-t border-foreground/8'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm text-foreground/80">
                    {thought.title || thought.content.split('\n')[0] || 'Untitled thought'}
                  </h3>
                  {thought.content && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-foreground/60">
                      {thought.content}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-foreground/0 transition-opacity hover:text-foreground/80 group-hover:text-foreground/45"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteThought(thought.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-foreground/55">
                {formatTaskDumpTimestamp(thought.updated_at)}
              </p>
            </div>
          ))}

          {thoughts.length === 0 && (
            <p className="py-6 text-center text-xs text-foreground/40">—</p>
          )}
        </div>
      </div>
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
      <DialogContent showCloseButton={false} className="max-h-[88vh] overflow-hidden border border-foreground/28 bg-background p-0 shadow-none sm:max-w-3xl">
        <DialogHeader className="border-b border-foreground/10 px-8 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-xl font-normal">Thought</DialogTitle>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-foreground/65">Created {formatTaskDumpTimestamp(thought.created_at)}</span>
                <span className="text-foreground/30" aria-hidden="true">•</span>
                <span className="text-foreground/25">Updated {formatTaskDumpTimestamp(thought.updated_at)}</span>
              </p>
            </div>
            <button type="button" className="text-foreground/70 transition-colors hover:text-foreground" onClick={() => onDeleteThought(thought.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(88vh-84px)] overflow-y-auto px-8 py-6">
          <div className="space-y-6">
            <div className="space-y-2">
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
                placeholder="Title"
                className="h-10 rounded-none border-0 bg-transparent px-0 text-base font-normal shadow-none dark:bg-transparent placeholder:text-foreground/60 focus-visible:ring-0"
              />
            </div>

            <div>
              <MarkdownComposer
                value={thought.content}
                onChange={(content) => {
                  onThoughtChange(
                    thought.id,
                    (current) => ({ ...current, content }),
                    { content }
                  )
                }}
                placeholder="Write here..."
                className="border-0 bg-transparent"
                minHeightClassName="min-h-[220px]"
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-foreground/80">{title}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm text-foreground/85 transition-colors hover:text-foreground disabled:opacity-30"
          onClick={onUploadClick}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          upload
        </button>
      </div>

      <div className="divide-y divide-foreground/8">
        {attachments.map((attachment) => (
          <AttachmentPreview
            key={attachment.id}
            attachment={attachment}
            onView={() => setViewerAttachment(attachment)}
            onDelete={() => void onDeleteAttachment(attachment)}
          />
        ))}
        {attachments.length === 0 && (
          <p className="py-4 text-sm text-foreground/45">—</p>
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
    <div className="group py-3">
      <div className="flex items-center gap-3">
        <div className="text-foreground/60">
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
        <p className="min-w-0 flex-1 truncate text-sm text-foreground/80">{attachment.file_name}</p>
        <button type="button" className="text-sm text-foreground/55 transition-colors hover:text-foreground" onClick={onView}>view</button>
        <button type="button" className="text-foreground/45 transition-colors hover:text-foreground" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
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
      <DialogContent className="max-h-[88vh] overflow-hidden border border-foreground/28 bg-background p-0 shadow-none sm:max-w-4xl">
        <DialogHeader className="border-b border-foreground/10 px-8 py-4">
          <DialogTitle className="truncate pr-6 text-sm font-normal text-foreground/80">{attachment.file_name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(88vh-70px)] overflow-auto p-8">
          {attachment.media_kind === 'image' && (
            <Image
              src={href}
              alt={attachment.file_name}
              width={1600}
              height={900}
              className="h-auto max-h-[70vh] w-full border border-border/70 object-contain"
              unoptimized
            />
          )}

          {attachment.media_kind === 'audio' && (
            <audio controls className="w-full">
              <source src={href} />
            </audio>
          )}

          {attachment.media_kind === 'video' && (
            <video controls className="max-h-[70vh] w-full border border-border/70">
              <source src={href} />
            </video>
          )}

          {attachment.media_kind === 'file' && (
            <iframe
              src={href}
              title={attachment.file_name}
              className="h-[70vh] w-full border border-border/70 bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
