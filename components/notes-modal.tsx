'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClientWithExperiences, ClientExperience } from '@/lib/types'
import { EXPERIENCE_LABELS } from '@/lib/types'
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
import { Copy, X, Pencil } from 'lucide-react'

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

  const label = EXPERIENCE_LABELS[experience.experience_type]

  // Sync content when modal opens or experience changes
  useEffect(() => {
    setContent(experience.notes || '')
    setIsEditing(false)
    setSaveStatus('')
  }, [experience.notes, open])

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

        {/* Content area */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 min-h-[250px] cursor-text"
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
              onBlur={() => {
                if (!content.trim()) setIsEditing(false)
              }}
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
