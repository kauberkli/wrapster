import jsPDF from 'jspdf'

// Cache for font data (base64)
let cachedFontBase64: string | null = null
let fontLoadPromise: Promise<string | null> | null = null
let fontLoaded = false

/**
 * Load Chinese font for CJK character support in jsPDF
 * Uses Noto Sans SC which has excellent Chinese support
 * Returns true if font was loaded, false if fallback is used
 */
export async function loadChineseFont(doc: jsPDF): Promise<boolean> {
  // Check if font is already registered in this document
  const fontList = doc.getFontList()
  if (fontList['NotoSansSC']) {
    doc.setFont('NotoSansSC', 'normal')
    fontLoaded = true
    return true
  }

  try {
    // Get cached font or fetch it
    const fontBase64 = await getFontBase64()

    if (!fontBase64 || fontBase64.length < 1000) {
      console.warn('Chinese font not available, using default font')
      return false
    }

    // Register font with this document instance
    doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64)
    doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
    doc.setFont('NotoSansSC', 'normal')
    fontLoaded = true
    console.log('Chinese font registered successfully')
    return true
  } catch (error) {
    console.warn('Failed to load Chinese font, using default:', error)
    fontLoaded = false
    return false
  }
}

/**
 * Fetch and cache font data
 */
async function getFontBase64(): Promise<string | null> {
  // Return cached font if available
  if (cachedFontBase64) {
    return cachedFontBase64
  }

  // If already fetching, wait for it
  if (fontLoadPromise) {
    return fontLoadPromise
  }

  // Fetch the font
  fontLoadPromise = (async () => {
    // Try local font first (bundled in public folder), then CDN fallbacks
    // Note: Full NotoSansSC/NotoSansCJKsc is ~16MB, subsets won't display Chinese correctly
    const fontUrls = [
      // Local font bundled with the app (most reliable)
      '/fonts/NotoSansSC-Regular.ttf',
      // jsDelivr hosting full NotoSansSC font
      'https://cdn.jsdelivr.net/gh/AuYuHui/cdn@0.0.9/fonts/NotoSansSC-Regular.ttf',
      // Alternative full font source
      'https://cdn.jsdelivr.net/npm/@aspect-build/aspect-fonts@0.0.1/NotoSansSC-Regular.ttf',
    ]

    for (const fontUrl of fontUrls) {
      try {
        console.log('Fetching font from:', fontUrl)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

        const response = await fetch(fontUrl, {
          signal: controller.signal,
          mode: 'cors',
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        console.log('Font loaded, size:', arrayBuffer.byteLength, 'bytes')

        // Full NotoSansSC font should be ~9MB. Subset fonts are much smaller
        // and won't have Chinese characters. Accept fonts >= 1MB
        if (arrayBuffer.byteLength < 1000000) {
          console.warn(`Font file too small (${(arrayBuffer.byteLength / 1024).toFixed(0)}KB), likely a subset without CJK characters`)
          throw new Error('Font file too small, likely a subset without CJK characters')
        }

        cachedFontBase64 = arrayBufferToBase64(arrayBuffer)
        return cachedFontBase64
      } catch (error) {
        console.warn(`Failed to fetch from ${fontUrl}:`, error)
      }
    }

    // All sources failed
    fontLoadPromise = null
    console.warn('Could not load Chinese font from any source')
    return null
  })()

  return fontLoadPromise
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Check if Chinese font is available
 */
export function isChineseFontLoaded(): boolean {
  return fontLoaded
}

/**
 * Get font configuration for jspdf-autotable
 * Returns Chinese font config if loaded, otherwise default
 */
export function getAutoTableFontConfig(): { font: string; fontStyle: string } {
  if (fontLoaded) {
    return {
      font: 'NotoSansSC',
      fontStyle: 'normal',
    }
  }
  return {
    font: 'helvetica',
    fontStyle: 'normal',
  }
}
