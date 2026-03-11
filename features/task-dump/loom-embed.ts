const LOOM_ID_PATTERN = /^[a-zA-Z0-9-]{10,}$/

export interface LoomEmbedMatch {
  originalUrl: string
  originalHost: string
  videoId: string | null
  embedUrl: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isLoomHost(hostname: string): boolean {
  return hostname === 'loom.com' || hostname.endsWith('.loom.com') || hostname === 'useloom.com' || hostname.endsWith('.useloom.com')
}

function getVideoIdFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if ((segment === 'share' || segment === 'embed') && segments[index + 1]) {
      return segments[index + 1]
    }
  }

  const candidate = segments[segments.length - 1]
  return LOOM_ID_PATTERN.test(candidate) ? candidate : null
}

export function parseLoomUrl(value: string): LoomEmbedMatch | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (!isLoomHost(url.hostname.toLowerCase())) return null

    const videoId = getVideoIdFromPath(url.pathname)
    return {
      originalUrl: url.toString(),
      originalHost: url.hostname.toLowerCase(),
      videoId,
      embedUrl: videoId ? `https://www.useloom.com/embed/${videoId}` : null,
    }
  } catch {
    return null
  }
}

export function buildLoomEmbedHtml(match: LoomEmbedMatch): string {
  const originalUrl = escapeHtml(match.originalUrl)

  if (!match.videoId || !match.embedUrl) {
    return [
      `<figure data-loom-embed="fallback" data-loom-url="${originalUrl}" contenteditable="false" class="my-4 w-full max-w-[28rem] overflow-hidden rounded-xl border border-foreground/15 bg-muted/20 sm:w-[52%]">`,
      '<div class="flex items-center justify-between gap-4 px-4 py-3">',
      '<div class="min-w-0">',
      '<p class="text-xs font-medium uppercase tracking-[0.2em] text-foreground/50">Loom</p>',
      '<p class="mt-1 text-sm text-foreground/75">Open this Loom in a new tab.</p>',
      '</div>',
      `<a href="${originalUrl}" target="_blank" rel="noopener noreferrer" class="shrink-0 text-sm text-primary underline">Open in Loom</a>`,
      '</div>',
      '</figure>',
    ].join('')
  }

  const videoId = escapeHtml(match.videoId)
  const embedUrl = escapeHtml(match.embedUrl)

  return [
    `<figure data-loom-embed="video" data-loom-url="${originalUrl}" data-loom-id="${videoId}" contenteditable="false" class="my-4 w-full max-w-[28rem] overflow-hidden rounded-xl border border-foreground/15 bg-muted/20 sm:w-[52%]">`,
    '<div class="aspect-video w-full bg-black">',
    `<iframe src="${embedUrl}" title="Loom video player" class="h-full w-full border-0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`,
    '</div>',
    '<figcaption class="flex items-center justify-between gap-4 border-t border-foreground/10 px-4 py-3 text-xs text-foreground/65">',
    '<span class="font-medium uppercase tracking-[0.2em] text-foreground/50">Loom</span>',
    `<a href="${originalUrl}" target="_blank" rel="noopener noreferrer" class="text-primary underline">Open in Loom</a>`,
    '</figcaption>',
    '</figure>',
  ].join('')
}

export function stripLoomEmbedsFromHtml(value: string): string {
  return value.replace(/<figure\b[^>]*data-loom-embed[^>]*>[\s\S]*?<\/figure>/gi, '')
}
