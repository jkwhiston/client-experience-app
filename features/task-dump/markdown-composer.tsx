'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold,
  Eye,
  Expand,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  TextQuote,
  Underline,
} from 'lucide-react'
import { marked } from 'marked'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  buildLoomEmbedHtml,
  parseLoomUrl,
} from '@/features/task-dump/loom-embed'
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
  placeholderClassName?: string
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
  | 'quote'
  | 'divider'

type EditorMode = 'edit' | 'preview'
type LoomModalState = {
  embedUrl: string
  originalUrl: string
}

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
  { action: 'quote', label: 'Quote block', icon: TextQuote },
  { action: 'divider', label: 'Divider', icon: Minus },
]

marked.setOptions({ gfm: true, breaks: true })

const URL_PATTERN = /https?:\/\/[^\s<]+/gi
const TRAILING_URL_PUNCTUATION = /[),.!?:;]+$/

function normalizePreviewAnchors(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    const hasTarget = /\btarget\s*=/.test(attrs)
    const hasRel = /\brel\s*=/.test(attrs)
    const withTarget = hasTarget ? attrs : `${attrs} target="_blank"`
    const withRel = hasRel ? withTarget : `${withTarget} rel="noopener noreferrer"`
    return `<a${withRel}>`
  })
}

function renderPreviewHtml(content: string): string {
  if (!content.trim()) return ''
  return normalizePreviewAnchors(marked.parse(content) as string)
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
const EMPTY_CHECKBOX_TEXT_ANCHOR = '\u00a0'

function newCheckboxHtml(): string {
  return (
    `<div data-task-check="unchecked"><span data-check-toggle contenteditable="false">${UNCHECKED_ICON}</span><span data-check-text>${EMPTY_CHECKBOX_TEXT_ANCHOR}</span></div>`
  )
}

function setRowCheckedState(row: HTMLElement, checked: boolean) {
  row.setAttribute('data-task-check', checked ? 'checked' : 'unchecked')
  const toggle = row.querySelector('[data-check-toggle]')
  if (toggle) toggle.textContent = checked ? CHECKED_ICON : UNCHECKED_ICON
}

function normalizeCheckboxTextSpans(container: HTMLElement): boolean {
  const rows = container.querySelectorAll('[data-task-check]')
  let changed = false

  rows.forEach((rowNode) => {
    const row = rowNode as HTMLElement
    const toggle = row.querySelector('[data-check-toggle]') as HTMLElement | null
    if (!toggle) return

    const text = Array.from(row.childNodes)
      .filter((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return true
        const element = node as HTMLElement
        return !element.hasAttribute('data-check-toggle')
      })
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\u00a0/g, ' ')
      .trim()

    const existingTextSpan = row.querySelector('[data-check-text]') as HTMLElement | null
    const existingText = (existingTextSpan?.textContent ?? '')
      .replace(new RegExp(EMPTY_CHECKBOX_TEXT_ANCHOR, 'g'), '')
      .replace(/\u00a0/g, ' ')
      .trim()
    const hasSingleToggle = row.querySelectorAll('[data-check-toggle]').length === 1
    const hasSingleTextSpan = row.querySelectorAll('[data-check-text]').length === 1
    const isAlreadyCanonical = hasSingleToggle && hasSingleTextSpan && existingText === text
    if (isAlreadyCanonical) return

    row.innerHTML = ''
    toggle.setAttribute('contenteditable', 'false')
    row.append(toggle)
    const textSpan = document.createElement('span')
    textSpan.setAttribute('data-check-text', '')
    textSpan.textContent = text || EMPTY_CHECKBOX_TEXT_ANCHOR
    row.append(textSpan)
    changed = true
  })

  return changed
}

function getSelectionContainerElement(): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const node = selection.getRangeAt(0).startContainer
  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
}

function getCheckboxRowText(row: HTMLElement): string {
  const textNode = row.querySelector('[data-check-text]') as HTMLElement | null
  if (textNode) {
    return (textNode.textContent ?? '')
      .replace(new RegExp(EMPTY_CHECKBOX_TEXT_ANCHOR, 'g'), '')
      .replace(/\u00a0/g, ' ')
      .trim()
  }
  const clone = row.cloneNode(true) as HTMLElement
  clone.querySelector('[data-check-toggle]')?.remove()
  return (clone.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}

function createCheckboxRowElement(text = ''): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-task-check', 'unchecked')
  const toggle = document.createElement('span')
  toggle.setAttribute('data-check-toggle', '')
  toggle.setAttribute('contenteditable', 'false')
  toggle.textContent = UNCHECKED_ICON
  const textSpan = document.createElement('span')
  textSpan.setAttribute('data-check-text', '')
  textSpan.textContent = text || EMPTY_CHECKBOX_TEXT_ANCHOR
  row.append(toggle, textSpan)
  return row
}

function setCheckboxRowText(row: HTMLElement, text: string) {
  const toggle = row.querySelector('[data-check-toggle]')
  if (!toggle) return
  row.innerHTML = ''
  const textSpan = document.createElement('span')
  textSpan.setAttribute('data-check-text', '')
  textSpan.textContent = text || EMPTY_CHECKBOX_TEXT_ANCHOR
  row.append(toggle, textSpan)
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
    const outdentRange = document.createRange()
    outdentRange.setStartBefore(firstQuote)
    outdentRange.setEndAfter(lastQuote)
    selection.removeAllRanges()
    selection.addRange(outdentRange)
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

function placeCaretInCheckboxRow(row: HTMLElement, at: 'start' | 'end' = 'start') {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  const textSpan = row.querySelector('[data-check-text]') as HTMLElement | null
  const fallbackTarget = textSpan ?? row
  if (textSpan && !textSpan.firstChild) {
    textSpan.append(document.createTextNode(''))
  }
  const targetNode = textSpan?.firstChild ?? row.lastChild ?? fallbackTarget
  const length = targetNode.nodeType === Node.TEXT_NODE
    ? (targetNode.textContent?.length ?? 0)
    : targetNode.childNodes.length

  if (targetNode.nodeType === Node.TEXT_NODE) {
    range.setStart(targetNode, at === 'end' ? length : 0)
  } else {
    range.selectNodeContents(targetNode)
    range.collapse(at !== 'end')
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function splitPastedLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean)
}

function isCaretAtStartOfCheckboxText(row: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const textSpan = row.querySelector('[data-check-text]') as HTMLElement | null
  if (!textSpan) return false

  const range = selection.getRangeAt(0)
  if (!textSpan.contains(range.startContainer)) return false

  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(textSpan)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const beforeText = beforeRange.toString().replace(new RegExp(EMPTY_CHECKBOX_TEXT_ANCHOR, 'g'), '')
  return beforeText.length === 0
}

function createPlainEditableRow(): HTMLElement {
  const row = document.createElement('div')
  row.append(document.createElement('br'))
  return row
}

function placeCaretInNodeStart(node: Node) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
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
    const normalizedText = text.trim()
    wrapper.innerHTML =
      `<span data-check-toggle contenteditable="false">${icon}</span><span data-check-text>${normalizedText || EMPTY_CHECKBOX_TEXT_ANCHOR}</span>`
  })

  return true
}

function getUrlChunks(value: string): Array<{ type: 'text' | 'url'; value: string }> {
  const chunks: Array<{ type: 'text' | 'url'; value: string }> = []
  URL_PATTERN.lastIndex = 0
  let cursor = 0
  let match = URL_PATTERN.exec(value)

  while (match) {
    const matchValue = match[0]
    const start = match.index
    let end = start + matchValue.length
    let normalizedUrl = matchValue

    while (TRAILING_URL_PUNCTUATION.test(normalizedUrl)) {
      normalizedUrl = normalizedUrl.replace(TRAILING_URL_PUNCTUATION, '')
      end = start + normalizedUrl.length
    }

    if (start > cursor) {
      chunks.push({ type: 'text', value: value.slice(cursor, start) })
    }

    if (normalizedUrl) {
      chunks.push({ type: 'url', value: normalizedUrl })
    } else {
      chunks.push({ type: 'text', value: matchValue })
      end = start + matchValue.length
    }

    if (end < start + matchValue.length) {
      chunks.push({ type: 'text', value: value.slice(end, start + matchValue.length) })
    }

    cursor = start + matchValue.length
    match = URL_PATTERN.exec(value)
  }

  if (cursor < value.length) {
    chunks.push({ type: 'text', value: value.slice(cursor) })
  }

  return chunks
}

function linkifyUrlsInContainer(container: HTMLElement): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  let changed = false
  for (const node of textNodes) {
    const parentElement = node.parentElement
    if (!parentElement) continue
    if (parentElement.closest('a,code,pre,script,style,[data-check-toggle],[data-loom-embed]')) continue

    const text = node.nodeValue ?? ''
    if (!URL_PATTERN.test(text)) continue
    URL_PATTERN.lastIndex = 0

    const chunks = getUrlChunks(text)
    if (!chunks.some((chunk) => chunk.type === 'url')) continue

    const fragment = document.createDocumentFragment()
    for (const chunk of chunks) {
      if (chunk.type === 'text') {
        fragment.appendChild(document.createTextNode(chunk.value))
        continue
      }

      const anchor = document.createElement('a')
      anchor.href = chunk.value
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.textContent = chunk.value
      anchor.className = 'text-primary underline'
      fragment.appendChild(anchor)
    }

    node.parentNode?.replaceChild(fragment, node)
    changed = true
  }

  return changed
}

function getTopLevelSelectionElement(
  editor: HTMLElement,
  node: Node | null
): HTMLElement | null {
  if (!node) return null
  if (node === editor) return editor

  let current =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement

  while (current && current.parentElement !== editor) {
    current = current.parentElement
  }

  return current
}

function isEditableRowEmpty(row: HTMLElement): boolean {
  if (row.matches('[data-task-check]')) {
    return !getCheckboxRowText(row)
  }

  if (row.matches('[data-loom-embed]')) return false

  const clone = row.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-loom-embed]').forEach((element) => element.remove())
  const text = (clone.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  const hasStructuredContent = Boolean(
    clone.querySelector('img,iframe,video,audio,hr,ul,ol,li,table,blockquote,pre,code')
  )

  return !text && !hasStructuredContent
}

function isCaretAtEndOfCheckboxText(row: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const textSpan = row.querySelector('[data-check-text]') as HTMLElement | null
  if (!textSpan) return false

  const range = selection.getRangeAt(0)
  if (!textSpan.contains(range.startContainer)) return false

  const afterRange = document.createRange()
  afterRange.selectNodeContents(textSpan)
  afterRange.setStart(range.startContainer, range.startOffset)
  const afterText = afterRange.toString().replace(new RegExp(EMPTY_CHECKBOX_TEXT_ANCHOR, 'g'), '')
  return afterText.length === 0
}

function isCaretAtStartOfElement(element: HTMLElement): boolean {
  if (element.matches('[data-task-check]')) {
    return isCaretAtStartOfCheckboxText(element)
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) return false

  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(element)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  return beforeRange.toString().replace(/\u00a0/g, ' ').trim().length === 0
}

function isCaretAtEndOfElement(element: HTMLElement): boolean {
  if (element.matches('[data-task-check]')) {
    return isCaretAtEndOfCheckboxText(element)
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) return false

  const afterRange = document.createRange()
  afterRange.selectNodeContents(element)
  afterRange.setStart(range.startContainer, range.startOffset)
  return afterRange.toString().replace(/\u00a0/g, ' ').trim().length === 0
}

function getAdjacentLoomEmbed(
  editor: HTMLElement,
  direction: 'backward' | 'forward'
): HTMLElement | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const currentRow = getTopLevelSelectionElement(editor, selection.getRangeAt(0).startContainer)
  if (!currentRow || currentRow === editor || currentRow.matches('[data-loom-embed]')) return null

  const isAdjacent =
    direction === 'backward'
      ? isCaretAtStartOfElement(currentRow)
      : isCaretAtEndOfElement(currentRow)
  if (!isAdjacent) return null

  const candidate =
    direction === 'backward'
      ? currentRow.previousElementSibling
      : currentRow.nextElementSibling

  return candidate instanceof HTMLElement && candidate.matches('[data-loom-embed]')
    ? candidate
    : null
}

function insertLoomEmbedAtSelection(editor: HTMLElement, embedHtml: string): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  const currentRow = getTopLevelSelectionElement(editor, range.startContainer)
  const canReplaceCurrentRow =
    currentRow && currentRow !== editor && isEditableRowEmpty(currentRow)

  if (!canReplaceCurrentRow && !(currentRow === editor && isContentEmpty(editor.innerHTML))) {
    return false
  }

  const wrapper = document.createElement('div')
  wrapper.innerHTML = embedHtml
  const embed = wrapper.firstElementChild
  if (!(embed instanceof HTMLElement)) return false

  const trailingRow = createPlainEditableRow()

  if (canReplaceCurrentRow && currentRow) {
    currentRow.replaceWith(embed, trailingRow)
  } else {
    editor.replaceChildren(embed, trailingRow)
  }

  placeCaretInNodeStart(trailingRow)
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
  placeholderClassName = 'text-foreground/60',
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
  const [loomModal, setLoomModal] = useState<LoomModalState | null>(null)
  const [isLoomFullscreen, setIsLoomFullscreen] = useState(false)
  const loomFullscreenRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorMode === 'edit' && !isFocusedRef.current && editorRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value
        if (normalizeCheckboxTextSpans(editorRef.current)) {
          const normalizedCheckboxes = editorRef.current.innerHTML
          onChangeRef.current(normalizedCheckboxes)
        }
        if (linkifyUrlsInContainer(editorRef.current)) {
          const linked = editorRef.current.innerHTML
          onChangeRef.current(linked)
        }
        if (migrateOldCheckboxes(editorRef.current)) {
          const migrated = editorRef.current.innerHTML
          onChangeRef.current(migrated)
        }
        if (normalizeCheckboxTextSpans(editorRef.current)) {
          const normalizedCheckboxes = editorRef.current.innerHTML
          onChangeRef.current(normalizedCheckboxes)
        }
      }
      setIsEmpty(isContentEmpty(value))
    }
  }, [value, editorMode])

  useEffect(() => {
    function handleFullscreenChange() {
      const mediaContainer = loomFullscreenRef.current
      setIsLoomFullscreen(Boolean(mediaContainer && document.fullscreenElement === mediaContainer))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

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

  const syncFromEditor = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? ''
    const normalized = isContentEmpty(html) ? '' : html
    setIsEmpty(isContentEmpty(normalized))
    if (normalized !== valueRef.current) {
      onChangeRef.current(normalized)
    }
  }, [])

  const toggleLoomFullscreen = useCallback(async () => {
    const mediaContainer = loomFullscreenRef.current
    if (!mediaContainer) return

    try {
      if (document.fullscreenElement === mediaContainer) {
        await document.exitFullscreen()
      } else {
        await mediaContainer.requestFullscreen()
      }
    } catch {
      // Ignore fullscreen errors caused by browser policy.
    }
  }, [])

  const closeLoomModal = useCallback(() => {
    if (document.fullscreenElement === loomFullscreenRef.current) {
      void document.exitFullscreen()
    }
    setLoomModal(null)
    setIsLoomFullscreen(false)
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    function handleCopy(event: ClipboardEvent) {
      const selection = window.getSelection()
      const selectedText = selection?.toString() ?? ''
      if (!selectedText) return
      if (!event.clipboardData) return
      event.preventDefault()
      event.clipboardData.setData('text/plain', selectedText)
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement
      const expandButton = target.closest('[data-loom-expand]') as HTMLElement | null
      if (expandButton) {
        event.preventDefault()
        const embed = expandButton.closest('[data-loom-embed="video"]') as HTMLElement | null
        if (!embed) return
        const iframe = embed.querySelector('iframe') as HTMLIFrameElement | null
        const embedUrl = iframe?.src?.trim()
        if (!embedUrl) return
        const originalUrl = embed.getAttribute('data-loom-url')?.trim() || embedUrl
        setLoomModal({ embedUrl, originalUrl })
        return
      }

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      event.preventDefault()
      window.open(anchor.href, '_blank', 'noopener,noreferrer')
    }

    function handleMousedown(event: MouseEvent) {
      const target = event.target as HTMLElement
      const toggle = target.closest('[data-check-toggle]') as HTMLElement | null
      if (!toggle) return

      event.preventDefault()

      const row = toggle.closest('[data-task-check]') as HTMLElement | null
      if (!row) return

      const wasChecked = row.getAttribute('data-task-check') === 'checked'
      setRowCheckedState(row, !wasChecked)
      placeCaretInCheckboxRow(row, 'end')
      syncFromEditor()
    }

    function handlePaste(event: ClipboardEvent) {
      const rawText = event.clipboardData?.getData('text/plain') ?? ''
      if (!rawText) return

      const editorNode = editorRef.current
      const trimmedText = rawText.trim()
      const loomMatch = trimmedText && !trimmedText.includes('\n') ? parseLoomUrl(trimmedText) : null
      if (editorNode && loomMatch) {
        const didInsert = insertLoomEmbedAtSelection(editorNode, buildLoomEmbedHtml(loomMatch))
        if (didInsert) {
          event.preventDefault()
          syncFromEditor()
          return
        }
      }

      if (rawText.includes('\n')) {
        const containerElement = getSelectionContainerElement()
        const checkRow = containerElement?.closest?.('[data-task-check]') as HTMLElement | null
        if (checkRow) {
          const lines = splitPastedLines(rawText)
          if (lines.length > 1) {
            event.preventDefault()

            let insertionAnchor = checkRow
            const rowIsEmpty = !getCheckboxRowText(checkRow)
            let startIndex = 0
            if (rowIsEmpty) {
              setCheckboxRowText(checkRow, lines[0])
              insertionAnchor = checkRow
              startIndex = 1
            }

            for (let index = startIndex; index < lines.length; index += 1) {
              const nextRow = createCheckboxRowElement(lines[index])
              insertionAnchor.after(nextRow)
              insertionAnchor = nextRow
            }

            placeCaretInCheckboxRow(insertionAnchor, 'end')
            syncFromEditor()
            return
          }
        }
      }

      // Force plain-text paste for non-checkbox content to avoid no-wrap markup
      // that can be carried from external clipboard sources.
      event.preventDefault()
      document.execCommand('insertText', false, rawText)
      syncFromEditor()
    }

    function handleKeydown(event: KeyboardEvent) {
      const editorNode = editorRef.current
      if (editorNode) {
        if (event.key === 'Backspace') {
          const previousEmbed = getAdjacentLoomEmbed(editorNode, 'backward')
          if (previousEmbed) {
            event.preventDefault()
            previousEmbed.remove()
            syncFromEditor()
            return
          }
        }

        if (event.key === 'Delete') {
          const nextEmbed = getAdjacentLoomEmbed(editorNode, 'forward')
          if (nextEmbed) {
            event.preventDefault()
            nextEmbed.remove()
            syncFromEditor()
            return
          }
        }
      }

      const containerElement = getSelectionContainerElement()
      const checkRow = containerElement?.closest?.('[data-task-check]') as HTMLElement | null
      if (!checkRow) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Enter' && !event.shiftKey) {
        if (isCaretAtStartOfCheckboxText(checkRow) && !checkRow.previousElementSibling) {
          event.preventDefault()
          const plainRow = createPlainEditableRow()
          checkRow.before(plainRow)
          placeCaretInNodeStart(plainRow)
          syncFromEditor()
          return
        }

        event.preventDefault()
        const newRow = createCheckboxRowElement('')
        checkRow.after(newRow)
        placeCaretInCheckboxRow(newRow, 'start')
        syncFromEditor()
      }

      if (event.key === 'Backspace') {
        const rowText = getCheckboxRowText(checkRow)
        if (rowText) return
        event.preventDefault()

        const previousRow = checkRow.previousElementSibling as HTMLElement | null
        const nextRow = checkRow.nextElementSibling as HTMLElement | null
        checkRow.remove()

        if (previousRow?.matches?.('[data-task-check]')) {
          placeCaretInCheckboxRow(previousRow, 'end')
        } else if (nextRow?.matches?.('[data-task-check]')) {
          placeCaretInCheckboxRow(nextRow, 'start')
        } else {
          const fallbackRow = document.createElement('div')
          fallbackRow.innerHTML = '<br>'
          const editorNode = editorRef.current
          if (!editorNode) return
          editorNode.append(fallbackRow)
          const selection = window.getSelection()
          if (selection) {
            const range = document.createRange()
            range.selectNodeContents(fallbackRow)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
        syncFromEditor()
      }
    }

    editor.addEventListener('copy', handleCopy)
    editor.addEventListener('click', handleClick)
    editor.addEventListener('mousedown', handleMousedown)
    editor.addEventListener('paste', handlePaste)
    editor.addEventListener('keydown', handleKeydown)
    return () => {
      editor.removeEventListener('copy', handleCopy)
      editor.removeEventListener('click', handleClick)
      editor.removeEventListener('mousedown', handleMousedown)
      editor.removeEventListener('paste', handlePaste)
      editor.removeEventListener('keydown', handleKeydown)
    }
  }, [syncFromEditor])

  function applyFormat(action: FormatAction) {
    if (editorMode === 'preview') return
    const editor = editorRef.current
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
        document.execCommand('insertHTML', false, newCheckboxHtml())
        break
      case 'quote':
        toggleQuoteBlockAtSelection(editor)
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
    'subtle-scrollbar block w-full resize-none overflow-x-hidden overflow-y-auto break-words bg-transparent px-4 py-3 text-left text-sm leading-relaxed text-foreground outline-none [overflow-wrap:anywhere]',
    '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/35 [&_blockquote]:pl-3',
    '[&_hr]:my-3 [&_hr]:border-muted-foreground/35',
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
    '[&_code]:break-words [&_pre]:break-words [&_pre]:whitespace-pre-wrap',
  ].join(' ')

  return (
    <>
      <div className="relative">
      <div
        className={cn(
          'rounded-none border-0 bg-transparent transition-colors',
          isFocused ? '' : '',
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
                if (editorRef.current && linkifyUrlsInContainer(editorRef.current)) {
                  setIsEmpty(isContentEmpty(editorRef.current.innerHTML))
                }
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
                      return
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
              <div className={cn('pointer-events-none absolute inset-0 px-4 py-3 text-sm leading-relaxed', placeholderClassName)}>
                {placeholder}
              </div>
            )}
          </div>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: previewHtml }}
            style={maxHeightPx ? { maxHeight: `${maxHeightPx}px` } : undefined}
            className={cn(
              'subtle-scrollbar prose prose-sm dark:prose-invert block max-w-none overflow-x-hidden overflow-y-auto break-words px-4 py-3 text-left text-sm leading-relaxed [overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline [&_code]:break-words [&_pre]:break-words [&_pre]:whitespace-pre-wrap [&_hr]:my-3 [&_hr]:border-muted-foreground/65 [&_p]:my-0 [&_p+*:not(hr)]:mt-4',
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
          <div className="flex items-center gap-0.5 p-1">
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
                    'flex h-8 w-8 items-center justify-center transition-colors hover:text-foreground',
                    editorMode === 'preview' && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-current'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}
            <div className="mx-1 h-4 w-px bg-foreground/20" />
            <button
              type="button"
              title={editorMode === 'preview' ? 'Back to editing' : 'Preview markdown'}
              onMouseDown={(event) => {
                event.preventDefault()
                toggleMode()
              }}
              className={cn(
                'ml-auto flex h-8 items-center justify-center gap-1 px-2 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors hover:text-foreground',
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

      <Dialog
        open={Boolean(loomModal)}
        onOpenChange={(open) => {
          if (!open) {
            closeLoomModal()
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="!h-[92vh] !w-[94vw] !max-w-[94vw] overflow-hidden border border-foreground/30 bg-background p-0 shadow-none"
        >
          <DialogTitle className="sr-only">Loom player</DialogTitle>
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-foreground/60">Loom</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void toggleLoomFullscreen() }}
                  className="inline-flex h-8 items-center gap-1.5 px-2 text-xs text-foreground/75 transition-colors hover:text-foreground"
                >
                  {isLoomFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {isLoomFullscreen ? 'Exit full screen' : 'Full screen'}
                </button>
                {loomModal && (
                  <button
                    type="button"
                    onClick={() => window.open(loomModal.originalUrl, '_blank', 'noopener,noreferrer')}
                    className="inline-flex h-8 items-center gap-1.5 px-2 text-xs text-primary underline transition-colors hover:text-primary/80"
                  >
                    <Expand className="h-3.5 w-3.5" />
                    Open in Loom
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeLoomModal}
                  className="inline-flex h-8 items-center px-2 text-xs text-foreground/75 transition-colors hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3">
              <div className="flex h-full items-center justify-center">
                <div
                  ref={loomFullscreenRef}
                  className="w-full max-h-full overflow-hidden rounded border border-foreground/10 bg-black"
                  style={{ aspectRatio: '16 / 9' }}
                >
                {loomModal && (
                  <iframe
                    src={loomModal.embedUrl}
                    title="Loom video player"
                    className="h-full w-full border-0"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
