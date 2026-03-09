type SelectionResult = {
  nextValue: string
  nextSelectionStart: number
  nextSelectionEnd: number
}

function replaceSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
  caretOffset: number = replacement.length
): SelectionResult {
  const nextValue =
    value.slice(0, selectionStart) + replacement + value.slice(selectionEnd)
  const nextCaret = selectionStart + caretOffset

  return {
    nextValue,
    nextSelectionStart: nextCaret,
    nextSelectionEnd: nextCaret,
  }
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string = before,
  placeholder: string
): SelectionResult {
  const selected = value.slice(selectionStart, selectionEnd)
  const inner = selected || placeholder
  const replacement = `${before}${inner}${after}`
  const nextValue =
    value.slice(0, selectionStart) + replacement + value.slice(selectionEnd)
  const nextStart = selectionStart + before.length
  const nextEnd = nextStart + inner.length

  return {
    nextValue,
    nextSelectionStart: nextStart,
    nextSelectionEnd: nextEnd,
  }
}

function getSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { start: number; end: number; lines: string[] } {
  const lineStart = value.lastIndexOf('\n', Math.max(selectionStart - 1, 0)) + 1
  const endSearchIndex = Math.max(selectionEnd, selectionStart)
  const rawLineEnd = value.indexOf('\n', endSearchIndex)
  const lineEnd = rawLineEnd === -1 ? value.length : rawLineEnd
  const chunk = value.slice(lineStart, lineEnd)

  return {
    start: lineStart,
    end: lineEnd,
    lines: chunk.split('\n'),
  }
}

function replaceLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transformer: (line: string, index: number) => string
): SelectionResult {
  const { start, end, lines } = getSelectedLines(value, selectionStart, selectionEnd)
  const nextChunk = lines.map(transformer).join('\n')
  const nextValue = value.slice(0, start) + nextChunk + value.slice(end)

  return {
    nextValue,
    nextSelectionStart: start,
    nextSelectionEnd: start + nextChunk.length,
  }
}

export type MarkdownFormatAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bullet-list'
  | 'numbered-list'
  | 'checkbox'
  | 'divider'

export function applyMarkdownFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownFormatAction
): SelectionResult {
  switch (action) {
    case 'bold':
      return wrapSelection(value, selectionStart, selectionEnd, '**', '**', 'bold text')
    case 'italic':
      return wrapSelection(value, selectionStart, selectionEnd, '*', '*', 'italic text')
    case 'underline':
      return wrapSelection(value, selectionStart, selectionEnd, '<u>', '</u>', 'underlined text')
    case 'bullet-list':
      return replaceLines(value, selectionStart, selectionEnd, (line) =>
        line.trim() ? `- ${line.replace(/^[-*]\s+/, '')}` : '- '
      )
    case 'numbered-list':
      return replaceLines(value, selectionStart, selectionEnd, (line, index) => {
        const normalized = line.replace(/^\d+\.\s+/, '')
        return normalized.trim() ? `${index + 1}. ${normalized}` : `${index + 1}. `
      })
    case 'checkbox':
      return replaceLines(value, selectionStart, selectionEnd, (line) =>
        line.trim() ? `- [ ] ${line.replace(/^(-\s\[[ xX]\]\s+|- |\d+\.\s+)/, '')}` : '- [ ] '
      )
    case 'divider':
      return replaceSelection(value, selectionStart, selectionEnd, '\n---\n')
    default:
      return {
        nextValue: value,
        nextSelectionStart: selectionStart,
        nextSelectionEnd: selectionEnd,
      }
  }
}

export function applyMarkdownShortcutTransforms(value: string): string {
  return value.replace(/(^|\n)===(?=\n|$)/g, '$1---')
}

export function toggleMarkdownCheckbox(
  value: string,
  targetIndex: number,
  checked: boolean
): string {
  let currentIndex = -1

  return value
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*[-*]\s+\[)( |x|X)(\]\s.*)$/)
      if (!match) return line

      currentIndex += 1
      if (currentIndex !== targetIndex) return line

      return `${match[1]}${checked ? 'x' : ' '}${match[3]}`
    })
    .join('\n')
}
