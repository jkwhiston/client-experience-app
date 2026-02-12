/**
 * Curated pool of Google Fonts for per-client name styling.
 * Mix of serif, sans-serif, slab, and display faces — all legible at bold weight.
 */
export const CLIENT_FONTS = [
  'Playfair Display',
  'Raleway',
  'Merriweather',
  'Oswald',
  'Lora',
  'Nunito',
  'Bitter',
  'Crimson Text',
  'Josefin Sans',
  'Source Serif 4',
  'Quicksand',
  'Libre Baskerville',
  'Rubik',
  'Karla',
  'Cormorant Garamond',
  'DM Sans',
  'Spectral',
  'Outfit',
  'Vollkorn',
  'Space Grotesk',
] as const

/**
 * Simple string hash that maps a client ID to a font index.
 * Deterministic — same ID always yields the same font.
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

/**
 * Get the font family name for a given client ID.
 */
export function getClientFont(clientId: string): string {
  const index = hashString(clientId) % CLIENT_FONTS.length
  return CLIENT_FONTS[index]
}

/**
 * Get the Google Fonts CSS URL for a given font family.
 * Loads only weight 700 (bold) since client names use font-bold.
 */
export function getGoogleFontUrl(fontFamily: string): string {
  const encoded = fontFamily.replace(/ /g, '+')
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@700&display=swap`
}
