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

export function Barcode({
  value,
  format = 'CODE128',
  width = 2,
  height = 80,
  displayValue = true,
  className,
}: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const isValid = value.length > 0

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
