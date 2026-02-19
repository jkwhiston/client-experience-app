'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClientWithExperiences, ClientExperience, TodoItem } from '@/lib/types'
import { getExperienceLabel } from '@/lib/types'
import { updateExperience } from '@/lib/queries'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Copy, X, Pencil, ListTodo, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: ClientWithExperiences
  experience: ClientExperience
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

export function NotesModal({
  open,
  onOpenChange,
  client,
  experience,
  updateClientLocal,
}: NotesModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(experience.notes || '')
  const [saveStatus, setSaveStatus] = useState<string>('')
  const [editingCompletedAt, setEditingCompletedAt] = useState(false)
  const [completedAtValue, setCompletedAtValue] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Todo state
  const [todos, setTodos] = useState<TodoItem[]>(experience.todos || [])
  const [todosExpanded, setTodosExpanded] = useState(true)
  const todoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const todoInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const focusIdRef = useRef<string | null>(null)

  const label = getExperienceLabel(experience)

  // Reset state when the modal opens
  useEffect(() => {
    if (open) {
      setContent(experience.notes || '')
      setTodos(experience.todos || [])
      setIsEditing(false)
      setSaveStatus('')
      setTodosExpanded(true)
      focusIdRef.current = null
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus management: after a render, focus the requested todo input
  useEffect(() => {
    if (focusIdRef.current) {
      const el = todoInputRefs.current.get(focusIdRef.current)
      if (el) {
        el.focus()
        focusIdRef.current = null
      }
    }
  })

  // Sync completed_at editing value
  useEffect(() => {
    if (experience.completed_at) {
      const dt = new Date(experience.completed_at)
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setCompletedAtValue(local)
    }
  }, [experience.completed_at])

  // --- Notes save ---
  const saveNotes = useCallback(
    async (text: string) => {
      updateClientLocal(client.id, (c) => ({
        ...c,
        client_experiences: c.client_experiences.map((e) =>
          e.id === experience.id ? { ...e, notes: text } : e
        ),
      }))
      await updateExperience(experience.id, { notes: text })
      setSaveStatus('Saved \u2022 just now')
    },
    [client.id, experience.id, updateClientLocal]
  )

  function handleContentChange(newContent: string) {
    setContent(newContent)
    setSaveStatus('Saving...')

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      saveNotes(newContent)
    }, 500)
  }

  // --- Todos save ---
  const saveTodos = useCallback(
    async (items: TodoItem[]) => {
      updateClientLocal(client.id, (c) => ({
        ...c,
        client_experiences: c.client_experiences.map((e) =>
          e.id === experience.id ? { ...e, todos: items } : e
        ),
      }))
      await updateExperience(experience.id, { todos: items })
      setSaveStatus('Saved \u2022 just now')
    },
    [client.id, experience.id, updateClientLocal]
  )

  function updateTodos(newTodos: TodoItem[]) {
    setTodos(newTodos)
    setSaveStatus('Saving...')

    if (todoDebounceRef.current) {
      clearTimeout(todoDebounceRef.current)
    }

    todoDebounceRef.current = setTimeout(() => {
      saveTodos(newTodos)
    }, 500)
  }

  // --- Todo actions ---
  function handleAddTodo() {
    const newItem: TodoItem = { id: crypto.randomUUID(), text: '', done: false }
    const newTodos = [...todos, newItem]
    updateTodos(newTodos)
    setTodosExpanded(true)
    focusIdRef.current = newItem.id
  }

  function handleTodoTextChange(id: string, text: string) {
    const newTodos = todos.map((t) => (t.id === id ? { ...t, text } : t))
    updateTodos(newTodos)
  }

  function handleTodoToggle(id: string) {
    const newTodos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    updateTodos(newTodos)
  }

  function handleTodoDelete(id: string) {
    const idx = todos.findIndex((t) => t.id === id)
    const newTodos = todos.filter((t) => t.id !== id)
    updateTodos(newTodos)

    // Focus previous item, or next if first, or nothing
    if (newTodos.length > 0) {
      const focusIdx = idx > 0 ? idx - 1 : 0
      focusIdRef.current = newTodos[focusIdx].id
    }
  }

  function handleTodoKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: string) {
    const idx = todos.findIndex((t) => t.id === id)
    const item = todos[idx]

    if (e.key === 'Enter') {
      e.preventDefault()
      const newItem: TodoItem = { id: crypto.randomUUID(), text: '', done: false }
      const newTodos = [...todos]
      newTodos.splice(idx + 1, 0, newItem)
      updateTodos(newTodos)
      focusIdRef.current = newItem.id
    }

    if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault()
      handleTodoDelete(id)
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) {
        focusIdRef.current = todos[idx - 1].id
        // trigger re-render to run focus effect
        setTodos([...todos])
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < todos.length - 1) {
        focusIdRef.current = todos[idx + 1].id
        setTodos([...todos])
      }
    }
  }

  // --- Other handlers ---
  function handleCopy() {
    navigator.clipboard.writeText(content)
    setSaveStatus('Copied to clipboard!')
    setTimeout(() => setSaveStatus(''), 2000)
  }

  async function handleCompletedAtSave() {
    if (!completedAtValue) return
    const newCompletedAt = new Date(completedAtValue).toISOString()

    updateClientLocal(client.id, (c) => ({
      ...c,
      client_experiences: c.client_experiences.map((e) =>
        e.id === experience.id ? { ...e, completed_at: newCompletedAt } : e
      ),
    }))
    await updateExperience(experience.id, { completed_at: newCompletedAt })
    setEditingCompletedAt(false)
    setSaveStatus('Completion time updated')
  }

  function formatCompletedAt(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const hasTodos = todos.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[600px] max-h-[80vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Notes &mdash; {client.name} &bull; {label}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={handleAddTodo}
                title="Add to-do item"
              >
                <ListTodo className="h-3.5 w-3.5 mr-1" />
                Add Todo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={handleCopy}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground px-5 py-2 border-b border-border">
          Click inside the text to edit (Markdown supported). Changes save
          automatically.
        </p>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-[250px]">
          {/* Todo section */}
          {hasTodos && (
            <div className="px-5 pt-4 pb-2">
              {/* Collapse toggle */}
              <button
                onClick={() => setTodosExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-2 select-none"
              >
                {todosExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                To-dos
                <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                  ({todos.filter((t) => t.done).length}/{todos.length})
                </span>
              </button>

              {todosExpanded && (
                <div className="space-y-0.5">
                  {todos.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50 transition-colors"
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => handleTodoToggle(item.id)}
                        className={cn(
                          'shrink-0 h-4 w-4 rounded border transition-all duration-200 flex items-center justify-center',
                          item.done
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/40 hover:border-primary'
                        )}
                      >
                        {item.done && (
                          <svg
                            className="h-3 w-3 text-primary-foreground"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2.5 6.5L5 9L9.5 3.5" />
                          </svg>
                        )}
                      </button>

                      {/* Text input with animated strikethrough */}
                      <div className="relative flex-1 min-w-0">
                        <input
                          ref={(el) => {
                            if (el) todoInputRefs.current.set(item.id, el)
                            else todoInputRefs.current.delete(item.id)
                          }}
                          type="text"
                          value={item.text}
                          onChange={(e) => handleTodoTextChange(item.id, e.target.value)}
                          onKeyDown={(e) => handleTodoKeyDown(e, item.id)}
                          placeholder="Type a to-do..."
                          className={cn(
                            'w-full text-sm bg-transparent border-0 outline-none py-1 placeholder:text-muted-foreground/40 transition-colors duration-300',
                            item.done ? 'text-muted-foreground' : 'text-foreground'
                          )}
                        />
                        {/* Animated strikethrough line — sized to text width */}
                        <div className="absolute left-0 top-0 bottom-0 flex items-center pointer-events-none">
                          <div className="relative">
                            <span className="text-sm invisible whitespace-pre" aria-hidden="true">
                              {item.text || '\u200B'}
                            </span>
                            <div
                              className={cn(
                                'absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-muted-foreground/60 transition-all duration-300 ease-out origin-left',
                                item.done ? 'scale-x-100' : 'scale-x-0'
                              )}
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Delete button (visible on hover) */}
                      <button
                        onClick={() => handleTodoDelete(item.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive h-5 w-5 flex items-center justify-center"
                        tabIndex={-1}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Divider between todos and notes */}
              <div className="border-b border-border mt-3" />
            </div>
          )}

          {/* Notes area */}
          <div
            className="px-5 py-4 cursor-text"
            onClick={() => {
              if (!isEditing) {
                setIsEditing(true)
                setTimeout(() => textareaRef.current?.focus(), 0)
              }
            }}
          >
            {isEditing ? (
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onBlur={() => setIsEditing(false)}
                className="min-h-[200px] resize-none border-0 p-0 focus-visible:ring-0 text-sm leading-relaxed bg-transparent"
                placeholder="Start writing notes..."
                autoFocus
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed min-h-[200px]">
                {content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">
                    No notes yet. Click to add notes...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Completed at editor (only for status = yes) */}
        {experience.status === 'yes' && experience.completed_at && (
          <div className="px-5 py-2 border-t border-border">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Completed:</span>
              {editingCompletedAt ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="datetime-local"
                    value={completedAtValue}
                    onChange={(e) => setCompletedAtValue(e.target.value)}
                    className="h-6 text-xs w-auto"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={handleCompletedAtSave}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => setEditingCompletedAt(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingCompletedAt(true)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {formatCompletedAt(experience.completed_at)}
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {saveStatus || '\u00A0'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
