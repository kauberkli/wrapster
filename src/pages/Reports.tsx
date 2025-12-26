import { useCallback, useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import { FileText, Loader2, Sheet } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { databaseService, Query } from '@/lib/appwrite/database'
import { productService } from '@/lib/appwrite/products'
import { cn } from '@/lib/utils'
import { COLLECTIONS } from '@/types/packaging'
import type { PackagingItem, PackagingRecord } from '@/types/packaging'

// Helper to format Date to YYYY-MM-DD string
function formatDateToString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

interface DatePickerFieldProps {
  label: string
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  disabled?: boolean
  maxDate?: Date
  minDate?: Date
}

function DatePickerField({
  label,
  date,
  onDateChange,
  disabled,
  maxDate,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const today = startOfDay(new Date())

  const handleSelect = (selectedDate: Date | undefined) => {
    onDateChange(selectedDate)
    setOpen(false)
  }

  // Build disabled matcher
  const disabledMatcher = maxDate ? { after: maxDate } : { after: today }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            {date ? format(date, "PPP") : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            disabled={disabledMatcher}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Product quantity summary
interface ProductQuantity {
  name: string
  barcode: string
  quantity: number
}

// Report data types
interface ReportData {
  startDateStr: string
  endDateStr: string
  allRecords: PackagingRecord[]
  allItems: Array<PackagingItem & { waybill_number: string; packaging_date: string }>
  productMap: Map<string, string>
  uniqueBarcodes: string[]
  dailySummary: Map<string, { records: number; items: number }>
  productQuantities: ProductQuantity[]
}

export default function Reports() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null)

  const today = startOfDay(new Date())

  // Fetch report data (shared between Excel and PDF export)
  const fetchReportData = useCallback(async (): Promise<ReportData | null> => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates')
      return null
    }

    if (startDate > endDate) {
      toast.error('Start date must be before end date')
      return null
    }

    const startDateStr = formatDateToString(startDate)
    const endDateStr = formatDateToString(endDate)

    // Fetch all packaging records in the date range
    const allRecords: PackagingRecord[] = []
    let offset = 0
    const limit = 100

    while (true) {
      const result = await databaseService.listDocuments<PackagingRecord>(
        COLLECTIONS.PACKAGING_RECORDS,
        [
          Query.greaterThanEqual('packaging_date', startDateStr),
          Query.lessThanEqual('packaging_date', endDateStr),
          Query.orderAsc('packaging_date'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      )
      allRecords.push(...result.documents)
      if (result.documents.length < limit) break
      offset += limit
    }

    if (allRecords.length === 0) {
      toast.error('No records found for the selected date range')
      return null
    }

    // Fetch all items for each record
    const allItems: Array<PackagingItem & { waybill_number: string; packaging_date: string }> = []

    for (const record of allRecords) {
      const itemsResult = await databaseService.listDocuments<PackagingItem>(
        COLLECTIONS.PACKAGING_ITEMS,
        [
          Query.equal('packaging_record_id', record.$id),
          Query.orderAsc('scanned_at'),
        ]
      )

      for (const item of itemsResult.documents) {
        allItems.push({
          ...item,
          waybill_number: record.waybill_number,
          packaging_date: record.packaging_date,
        })
      }
    }

    // Build a map of product barcodes to names
    const uniqueBarcodes = [...new Set(allItems.map((item) => item.product_barcode))]
    const productMap = new Map<string, string>()

    // Fetch product names
    for (const barcode of uniqueBarcodes) {
      const product = await productService.getByBarcode(barcode)
      productMap.set(barcode, product?.name || 'Unknown Product')
    }

    // Create daily summary
    const dailySummary = new Map<string, { records: number; items: number }>()
    for (const record of allRecords) {
      const existing = dailySummary.get(record.packaging_date) || { records: 0, items: 0 }
      existing.records += 1
      dailySummary.set(record.packaging_date, existing)
    }
    for (const item of allItems) {
      const existing = dailySummary.get(item.packaging_date)
      if (existing) {
        existing.items += 1
      }
    }

    // Calculate product quantities (group by product name and count)
    const quantityMap = new Map<string, { barcode: string; quantity: number }>()
    for (const item of allItems) {
      const productName = productMap.get(item.product_barcode) || 'Unknown Product'
      const existing = quantityMap.get(productName)
      if (existing) {
        existing.quantity += 1
      } else {
        quantityMap.set(productName, { barcode: item.product_barcode, quantity: 1 })
      }
    }

    const productQuantities: ProductQuantity[] = Array.from(quantityMap.entries())
      .map(([name, data]) => ({ name, barcode: data.barcode, quantity: data.quantity }))
      .sort((a, b) => b.quantity - a.quantity)

    return {
      startDateStr,
      endDateStr,
      allRecords,
      allItems,
      productMap,
      uniqueBarcodes,
      dailySummary,
      productQuantities,
    }
  }, [startDate, endDate])

  // Export to Excel
  const handleExportExcel = useCallback(async () => {
    try {
      setIsExporting('excel')

      const data = await fetchReportData()
      if (!data) return

      const { startDateStr, endDateStr, allRecords, allItems, productMap, uniqueBarcodes, dailySummary, productQuantities } = data

      // Prepare data for Excel export
      const exportData = allItems.map((item, index) => ({
        'No.': index + 1,
        'Date': item.packaging_date,
        'Waybill': item.waybill_number,
        'Product Barcode': item.product_barcode,
        'Product Name': productMap.get(item.product_barcode) || 'Unknown',
        'Scanned At': format(new Date(item.scanned_at), 'yyyy-MM-dd HH:mm:ss'),
      }))

      // Create summary sheet
      const summaryData = [
        { 'Metric': 'Report Period', 'Value': `${startDateStr} to ${endDateStr}` },
        { 'Metric': 'Total Records', 'Value': allRecords.length },
        { 'Metric': 'Total Items Scanned', 'Value': allItems.length },
        { 'Metric': 'Unique Products', 'Value': uniqueBarcodes.length },
        { 'Metric': 'Generated At', 'Value': format(new Date(), 'yyyy-MM-dd HH:mm:ss') },
      ]

      const dailySummaryData = Array.from(dailySummary.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          'Date': date,
          'Records': data.records,
          'Items Scanned': data.items,
        }))

      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new()

      // Summary sheet
      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      summarySheet['!cols'] = [{ wch: 20 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

      // Daily summary sheet
      const dailySheet = XLSX.utils.json_to_sheet(dailySummaryData)
      dailySheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily Summary')

      // Product quantities sheet (grouped by product name)
      const productQuantitiesData = productQuantities.map((p, index) => ({
        'No.': index + 1,
        'Product Name': p.name,
        'Barcode': p.barcode,
        'Total Quantity': p.quantity,
      }))
      const productSheet = XLSX.utils.json_to_sheet(productQuantitiesData)
      productSheet['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 15 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(workbook, productSheet, 'Product Quantities')

      // Details sheet
      const detailsSheet = XLSX.utils.json_to_sheet(exportData)
      detailsSheet['!cols'] = [
        { wch: 6 },  // No.
        { wch: 12 }, // Date
        { wch: 25 }, // Waybill
        { wch: 15 }, // Product Barcode
        { wch: 40 }, // Product Name
        { wch: 20 }, // Scanned At
      ]
      XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Details')

      // Generate filename
      const filename = `packaging-report-${startDateStr}-to-${endDateStr}.xlsx`

      // Download
      XLSX.writeFile(workbook, filename)

      toast.success(`Exported ${allItems.length} items to ${filename}`)
    } catch (err) {
      console.error('Export failed:', err)
      toast.error('Failed to export report')
    } finally {
      setIsExporting(null)
    }
  }, [fetchReportData])

  // Export to PDF
  const handleExportPDF = useCallback(async () => {
    try {
      setIsExporting('pdf')

      const data = await fetchReportData()
      if (!data) return

      const { startDateStr, endDateStr, allRecords, allItems, productMap, uniqueBarcodes, dailySummary, productQuantities } = data

      // Create PDF document
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      // Consistent font sizes
      const FONT_SIZE = {
        TITLE: 16,
        SECTION: 11,
        TABLE: 9,
      }

      // Title
      doc.setFontSize(FONT_SIZE.TITLE)
      doc.text('Packaging Report', pageWidth / 2, 20, { align: 'center' })

      // Subtitle with date range
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text(`${startDateStr} to ${endDateStr}`, pageWidth / 2, 28, { align: 'center' })

      // Summary section
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text('Summary', 14, 42)

      const summaryTableData = [
        ['Report Period', `${startDateStr} to ${endDateStr}`],
        ['Total Records', String(allRecords.length)],
        ['Total Items Scanned', String(allItems.length)],
        ['Unique Products', String(uniqueBarcodes.length)],
        ['Generated At', format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ]

      autoTable(doc, {
        startY: 46,
        head: [['Metric', 'Value']],
        body: summaryTableData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: FONT_SIZE.TABLE },
        margin: { left: 14, right: 14 },
        tableWidth: 'auto',
      })

      // Daily Summary section
      const dailySummaryY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text('Daily Summary', 14, dailySummaryY)

      const dailySummaryData = Array.from(dailySummary.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => [date, String(data.records), String(data.items)])

      autoTable(doc, {
        startY: dailySummaryY + 4,
        head: [['Date', 'Records', 'Items Scanned']],
        body: dailySummaryData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: FONT_SIZE.TABLE },
        margin: { left: 14, right: 14 },
      })

      // Product Quantities section
      const productQuantitiesY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text('Product Quantities', 14, productQuantitiesY)

      const productQuantitiesData = productQuantities.map((p, index) => [
        String(index + 1),
        p.name,
        p.barcode,
        String(p.quantity),
      ])

      autoTable(doc, {
        startY: productQuantitiesY + 4,
        head: [['#', 'Product Name', 'Barcode', 'Total Qty']],
        body: productQuantitiesData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: FONT_SIZE.TABLE },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 80 },
          2: { cellWidth: 40 },
          3: { cellWidth: 25 },
        },
      })

      // Details section (new page)
      doc.addPage()
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text('Details', 14, 20)

      const detailsData = allItems.map((item, index) => [
        String(index + 1),
        item.packaging_date,
        item.waybill_number,
        item.product_barcode,
        productMap.get(item.product_barcode) || 'Unknown',
        format(new Date(item.scanned_at), 'HH:mm:ss'),
      ])

      autoTable(doc, {
        startY: 24,
        head: [['#', 'Date', 'Waybill', 'Barcode', 'Product Name', 'Time']],
        body: detailsData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: FONT_SIZE.TABLE },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 22 },
          2: { cellWidth: 35 },
          3: { cellWidth: 28 },
          4: { cellWidth: 60 },
          5: { cellWidth: 18 },
        },
      })

      // Generate filename
      const filename = `packaging-report-${startDateStr}-to-${endDateStr}.pdf`

      // Download
      doc.save(filename)

      toast.success(`Exported ${allItems.length} items to ${filename}`)
    } catch (err) {
      console.error('PDF export failed:', err)
      toast.error('Failed to export PDF')
    } finally {
      setIsExporting(null)
    }
  }, [fetchReportData])

  const canExport = startDate && endDate && startDate <= endDate

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-1">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate and export packaging reports
        </p>
      </div>

      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Packaging Report</CardTitle>
          <CardDescription>
            Export packaging records for a date range
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <DatePickerField
              label="Start Date"
              date={startDate}
              onDateChange={setStartDate}
              disabled={!!isExporting}
              maxDate={endDate || today}
            />
            <DatePickerField
              label="End Date"
              date={endDate}
              onDateChange={setEndDate}
              disabled={!!isExporting}
              maxDate={today}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleExportExcel}
              disabled={!canExport || !!isExporting}
              variant="outline"
              className="flex-1"
            >
              {isExporting === 'excel' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Sheet className="size-4" />
                  Export Excel
                </>
              )}
            </Button>
            <Button
              onClick={handleExportPDF}
              disabled={!canExport || !!isExporting}
              variant="outline"
              className="flex-1"
            >
              {isExporting === 'pdf' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileText className="size-4" />
                  Export PDF
                </>
              )}
            </Button>
          </div>

          {startDate && endDate && startDate > endDate && (
            <p className="text-destructive text-sm">
              Start date must be before or equal to end date
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
