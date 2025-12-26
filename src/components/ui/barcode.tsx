import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

import { cn } from '@/lib/utils'

interface BarcodeProps {
  value: string
  format?: 'EAN13' | 'CODE128' | 'CODE39' | 'UPC'
  width?: number
  height?: number
  displayValue?: boolean
  className?: string
}

/**
 * Validates EAN-13 barcode format and check digit
 */
function isValidEAN13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false
  }

  const digits = barcode.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10

  return checkDigit === digits[12]
}

export function Barcode({
  value,
  format = 'EAN13',
  width = 2,
  height = 80,
  displayValue = true,
  className,
}: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const isValid = format === 'EAN13' ? isValidEAN13(value) : value.length > 0

  useEffect(() => {
    if (svgRef.current && isValid) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          margin: 10,
          fontSize: 14,
          textMargin: 5,
        })
      } catch {
        // Invalid barcode format, will show error state
      }
    }
  }, [value, format, width, height, displayValue, isValid])

  if (!isValid) {
    return null
  }

  return (
    <div className={cn('flex justify-center', className)}>
      <svg ref={svgRef} />
    </div>
  )
}
