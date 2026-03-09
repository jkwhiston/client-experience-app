'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold,
  Eye,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Underline,
} from 'lucide-react'
import { marked } from 'marked'
import { cn } from '@/lib/utils'

interface MarkdownComposerProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  previewClassName?: string
  minHeightClassName?: string
  maxHeightClassName?: string
  maxHeightPx?: number
  toolbarVariant?: 'hidden' | 'inline' | 'focus-inline'
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

type FormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bullet-list'
  | 'numbered-list'
  | 'checkbox'
  | 'divider'

type EditorMode = 'edit' | 'preview'

const FORMAT_ITEMS: {
  action: FormatAction
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

marked.setOptions({ gfm: true, breaks: true })

function renderPreviewHtml(content: string): string {
  if (!content.trim()) return ''
  return marked.parse(content) as string
}

function isContentEmpty(html: string): boolean {
  if (!html) return true
  const stripped = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<div><\/div>/gi, '')
    .replace(/&nbsp;/g, '')
    .trim()
  return !stripped
}

const UNCHECKED_ICON = '\u2610'
const CHECKED_ICON = '\u2611'

function newCheckboxHtml(): string {
  return (
    `<div data-task-check="unchecked"><span data-check-toggle contenteditable="false">${UNCHECKED_ICON}</span>\u00a0\u00a0</div>`
  )
}

function setRowCheckedState(row: HTMLElement, checked: boolean) {
  row.setAttribute('data-task-check', checked ? 'checked' : 'unchecked')
  const toggle = row.querySelector('[data-check-toggle]')
  if (toggle) toggle.textContent = checked ? CHECKED_ICON : UNCHECKED_ICON
}

function migrateOldCheckboxes(container: HTMLElement): boolean {
  const inputs = container.querySelectorAll('input[type="checkbox"]')
  if (inputs.length === 0) return false

  inputs.forEach((cb) => {
    const checkbox = cb as HTMLInputElement
    const label = checkbox.closest('label')
    const wrapper = (label?.parentElement ?? checkbox.parentElement) as HTMLElement | null
    if (!wrapper) return

    const wasChecked =
      checkbox.checked ||
      (label?.style.textDecoration?.includes('line-through') ?? false) ||
      (label?.style.opacity ? parseFloat(label.style.opacity) < 1 : false)

    let text = ''
    const source = label ?? checkbox
    let sibling = source.nextSibling
    while (sibling) {
      text += sibling.textContent ?? ''
      const next = sibling.nextSibling
      wrapper.removeChild(sibling)
      sibling = next
    }
    source.remove()

    const state = wasChecked ? 'checked' : 'unchecked'
    const icon = wasChecked ? CHECKED_ICON : UNCHECKED_ICON
    wrapper.setAttribute('data-task-check', state)
    wrapper.innerHTML =
      `<span data-check-toggle contenteditable="false">${icon}</span>\u00a0\u00a0${text.trim()}`
  })

  return true
}

export function MarkdownComposer({
  value,
  onChange,
  placeholder,
  className,
  previewClassName,
  minHeightClassName = 'min-h-[180px]',
  maxHeightClassName,
  maxHeightPx,
  toolbarVariant = 'hidden',
  onKeyDown: onKeyDownProp,
}: MarkdownComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  const isFocusedRef = useRef(false)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { valueRef.current = value }, [value])

  const [isFocused, setIsFocused] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('edit')
  const [previewHtml, setPreviewHtml] = useState('')
  const [isEmpty, setIsEmpty] = useState(() => isContentEmpty(value))

  useEffect(() => {
    if (editorMode === 'edit' && !isFocusedRef.current && editorRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value
        if (migrateOldCheckboxes(editorRef.current)) {
          const migrated = editorRef.current.innerHTML
          onChangeRef.current(migrated)
        }
      }
      setIsEmpty(isContentEmpty(value))
    }
  }, [value, editorMode])

  const readValue = useCallback((): string => {
    const html = editorRef.current?.innerHTML ?? valueRef.current
    return isContentEmpty(html) ? '' : html
  }, [])

  const flushToParent = useCallback(() => {
    const next = readValue()
    setIsEmpty(isContentEmpty(next))
    if (next !== valueRef.current) {
      onChangeRef.current(next)
    }
  }, [readValue])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    function handleMousedown(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target.hasAttribute('data-check-toggle')) return

      event.preventDefault()

      const row = target.closest('[data-task-check]') as HTMLElement | null
      if (!row) return

      const wasChecked = row.getAttribute('data-task-check') === 'checked'
      setRowCheckedState(row, !wasChecked)

      requestAnimationFrame(() => {
        const html = editor?.innerHTML ?? ''
        const normalized = isContentEmpty(html) ? '' : html
        setIsEmpty(isContentEmpty(normalized))
        if (normalized !== valueRef.current) {
          onChangeRef.current(normalized)
        }
      })
    }

    editor.addEventListener('mousedown', handleMousedown)
    return () => {
      editor.removeEventListener('mousedown', handleMousedown)
    }
  }, [])

  function applyFormat(action: FormatAction) {
    if (editorMode === 'preview') return
    const editor = editorRef.current
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
        document.execCommand('insertHTML', false, newCheckboxHtml())
        break
      case 'divider':
        document.execCommand('insertHTML', false, '<hr>')
        break
    }

    flushToParent()
  }

  function toggleMode() {
    if (editorMode === 'edit') {
      flushToParent()
      setPreviewHtml(renderPreviewHtml(readValue()))
      setEditorMode('preview')
    } else {
      setEditorMode('edit')
      requestAnimationFrame(() => {
        editorRef.current?.focus()
      })
    }
  }

  const editorStyles = [
    'subtle-scrollbar block w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-left text-sm leading-relaxed text-foreground outline-none',
    '[&_hr]:my-3 [&_hr]:border-muted-foreground/35',
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  ].join(' ')

  return (
    <div className="relative">
      <div
        className={cn(
          'rounded-xl border border-border/85 bg-background/60 transition-colors',
          isFocused ? 'ring-2 ring-primary/20' : 'hover:border-border',
          className
        )}
      >
        {editorMode === 'edit' ? (
          <div className="relative">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              onFocus={() => {
                isFocusedRef.current = true
                setIsFocused(true)
              }}
              onBlur={() => {
                isFocusedRef.current = false
                setIsFocused(false)
                flushToParent()
              }}
              onInput={flushToParent}
              onKeyDown={(event) => {
                const mod = event.metaKey || event.ctrlKey
                const k = event.key.toLowerCase()
                if (mod && k === 'b') { event.preventDefault(); applyFormat('bold') }
                else if (mod && k === 'i') { event.preventDefault(); applyFormat('italic') }
                else if (mod && k === 'u') { event.preventDefault(); applyFormat('underline') }
                else if (event.key === 'Enter' && !event.shiftKey && !mod) {
                  const sel = window.getSelection()
                  if (sel && sel.rangeCount > 0) {
                    const node = sel.getRangeAt(0).startContainer
                    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
                    const checkRow = el?.closest?.('[data-task-check]')
                    if (checkRow) {
                      event.preventDefault()
                      const template = document.createElement('div')
                      template.innerHTML = newCheckboxHtml()
                      const newRow = template.firstElementChild!
                      checkRow.after(newRow)
                      const sel2 = window.getSelection()!
                      const r = document.createRange()
                      r.setStartAfter(newRow.querySelector('[data-check-toggle]')!.nextSibling!)
                      r.collapse(true)
                      sel2.removeAllRanges()
                      sel2.addRange(r)
                      flushToParent()
                    }
                  }
                }
                onKeyDownProp?.(event)
              }}
              style={maxHeightPx ? { maxHeight: `${maxHeightPx}px` } : undefined}
              className={cn(
                editorStyles,
                minHeightClassName,
                maxHeightClassName
              )}
            />
            {isEmpty && (
              <div className="pointer-events-none absolute inset-0 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {placeholder}
              </div>
            )}
          </div>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: previewHtml }}
            style={maxHeightPx ? { maxHeight: `${maxHeightPx}px` } : undefined}
            className={cn(
              'subtle-scrollbar prose prose-sm dark:prose-invert block max-w-none overflow-y-auto px-4 py-3 text-left text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_hr]:my-3 [&_hr]:border-muted-foreground/65 [&_p]:my-0 [&_p+*:not(hr)]:mt-4',
              minHeightClassName,
              maxHeightClassName,
              previewClassName,
              !previewHtml.trim() && 'flex items-start text-muted-foreground'
            )}
          >
            {!previewHtml.trim() ? 'Nothing to preview.' : undefined}
          </div>
        )}
      </div>

      {(toolbarVariant === 'inline' || toolbarVariant === 'focus-inline') && (
        <div
          className={cn(
            toolbarVariant === 'inline' && 'mt-2',
            toolbarVariant === 'focus-inline' &&
              'mt-2 overflow-hidden transition-[max-height,opacity] duration-150 ease-out',
            toolbarVariant === 'focus-inline' &&
              (isFocused
                ? 'max-h-16 opacity-100'
                : 'pointer-events-none max-h-0 opacity-0')
          )}
        >
          <div className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-popover/90 p-1">
            {FORMAT_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.action}
                  type="button"
                  title={item.label}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    applyFormat(item.action)
                  }}
                  disabled={editorMode === 'preview'}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-accent hover:text-accent-foreground',
                    editorMode === 'preview' && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-current'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}
            <div className="mx-1 h-5 w-px bg-border/60" />
            <button
              type="button"
              title={editorMode === 'preview' ? 'Back to editing' : 'Preview markdown'}
              onMouseDown={(event) => {
                event.preventDefault()
                toggleMode()
              }}
              className={cn(
                'ml-auto flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors hover:bg-accent hover:text-accent-foreground',
                editorMode === 'preview' && 'bg-accent text-accent-foreground ring-1 ring-primary/30'
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              MD
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
