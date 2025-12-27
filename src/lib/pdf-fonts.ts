import jsPDF from 'jspdf'

// Cache for font data (base64)
let cachedFontBase64: string | null = null
let fontLoadPromise: Promise<string> | null = null

/**
 * Load Noto Sans SC font for Chinese character support in jsPDF
 * Uses a CDN-hosted font file
 */
export async function loadChineseFont(doc: jsPDF): Promise<void> {
  // Check if font is already registered in this document
  const fontList = doc.getFontList()
  if (fontList['NotoSansSC']) {
    doc.setFont('NotoSansSC', 'normal')
    return
  }

  try {
    // Get cached font or fetch it
    const fontBase64 = await getFontBase64()

    // Register font with this document instance
    doc.addFileToVFS('NotoSansSC-Regular.ttf', fontBase64)
    doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
    doc.setFont('NotoSansSC', 'normal')
  } catch (error) {
    console.error('Failed to load Chinese font:', error)
    // Fall back to default font
  }
}

/**
 * Fetch and cache font data
 */
async function getFontBase64(): Promise<string> {
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
    // Use Noto Sans SC from jsDelivr CDN (proxies GitHub, handles CORS)
    // This fetches the complete OTF font file with full Chinese character support
    const fontUrl = 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'

    try {
      const response = await fetch(fontUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch font: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      console.log('Font loaded, size:', arrayBuffer.byteLength)
      cachedFontBase64 = arrayBufferToBase64(arrayBuffer)
      return cachedFontBase64
    } catch (error) {
      console.error('Font fetch error:', error)
      throw new Error('Failed to fetch Chinese font')
    }
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
 * Get font configuration for jspdf-autotable
 */
export function getAutoTableFontConfig() {
  return {
    font: 'NotoSansSC',
    fontStyle: 'normal',
  }
}
