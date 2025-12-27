import { useCallback, useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileText, Loader2, Sheet } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { loadChineseFont } from '@/lib/pdf-fonts'
import * as XLSX from 'xlsx'

import { JobStatusPanel } from '@/components/jobs/JobStatusPanel'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveJobs, useQueueReportExport } from '@/hooks/use-jobs'
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
  pickDateText: string
}

function DatePickerField({
  label,
  date,
  onDateChange,
  disabled,
  maxDate,
  pickDateText,
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
            {date ? format(date, "PPP") : <span>{pickDateText}</span>}
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
  const { t } = useTranslation()
  const { user } = useAuth()
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null)
  const [useAsyncMode] = useState(true) // Async mode enabled by default

  const today = startOfDay(new Date())

  // Async job hooks
  const queueReportExport = useQueueReportExport()
  const { data: activeJobs = [], isLoading: isLoadingJobs } = useActiveJobs(
    user?.$id || '',
    !!user
  )

  // Filter jobs to only show report-export jobs
  const reportJobs = activeJobs.filter(job => job.action === 'report-export')

  // Fetch report data (shared between Excel and PDF export)
  const fetchReportData = useCallback(async (): Promise<ReportData | null> => {
    if (!startDate || !endDate) {
      toast.error(t('reports.selectDatesError'))
      return null
    }

    if (startDate > endDate) {
      toast.error(t('reports.dateError'))
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
      toast.error(t('reports.noRecordsError'))
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
    // Use async mode if enabled and user is logged in
    if (useAsyncMode && user && startDate && endDate) {
      try {
        setIsExporting('excel')
        await queueReportExport.mutateAsync({
          userId: user.$id,
          startDate: formatDateToString(startDate),
          endDate: formatDateToString(endDate),
          format: 'excel',
        })
        toast.success(t('jobs.reportExportQueued'))
      } catch (err) {
        console.error('Error queuing report export:', err)
        toast.error(t('reports.exportError'))
      } finally {
        setIsExporting(null)
      }
      return
    }

    // Fallback to sync mode
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

      toast.success(t('reports.exportSuccess', { count: allItems.length, filename }))
    } catch (err) {
      console.error('Export failed:', err)
      toast.error(t('reports.exportError'))
    } finally {
      setIsExporting(null)
    }
  }, [fetchReportData, t, useAsyncMode, user, startDate, endDate, queueReportExport])

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

      // Load Chinese font for CJK character support
      await loadChineseFont(doc)

      // Consistent font sizes
      const FONT_SIZE = {
        TITLE: 16,
        SECTION: 11,
        TABLE: 9,
      }

      // Title
      doc.setFontSize(FONT_SIZE.TITLE)
      doc.text(t('reports.packagingReport'), pageWidth / 2, 20, { align: 'center' })

      // Subtitle with date range
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text(`${startDateStr} to ${endDateStr}`, pageWidth / 2, 28, { align: 'center' })

      // Summary section
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text(t('reports.summary'), 14, 42)

      const summaryTableData = [
        [t('reports.reportPeriod'), `${startDateStr} to ${endDateStr}`],
        [t('reports.totalRecords'), String(allRecords.length)],
        [t('reports.totalItemsScanned'), String(allItems.length)],
        [t('reports.uniqueProducts'), String(uniqueBarcodes.length)],
        [t('reports.generatedAt'), format(new Date(), 'yyyy-MM-dd HH:mm:ss')],
      ]

      autoTable(doc, {
        startY: 46,
        head: [[t('reports.metric'), t('reports.value')]],
        body: summaryTableData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66], font: 'NotoSansSC' },
        styles: { fontSize: FONT_SIZE.TABLE, font: 'NotoSansSC' },
        margin: { left: 14, right: 14 },
        tableWidth: 'auto',
      })

      // Daily Summary section
      const dailySummaryY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text(t('reports.dailySummary'), 14, dailySummaryY)

      const dailySummaryData = Array.from(dailySummary.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => [date, String(data.records), String(data.items)])

      autoTable(doc, {
        startY: dailySummaryY + 4,
        head: [[t('common.date'), t('reports.records'), t('reports.itemsScanned')]],
        body: dailySummaryData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66], font: 'NotoSansSC' },
        styles: { fontSize: FONT_SIZE.TABLE, font: 'NotoSansSC' },
        margin: { left: 14, right: 14 },
      })

      // Product Quantities section
      const productQuantitiesY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text(t('reports.productQuantities'), 14, productQuantitiesY)

      const productQuantitiesData = productQuantities.map((p, index) => [
        String(index + 1),
        p.name,
        p.barcode,
        String(p.quantity),
      ])

      autoTable(doc, {
        startY: productQuantitiesY + 4,
        head: [['#', t('products.productName'), t('products.barcode'), t('reports.totalQty')]],
        body: productQuantitiesData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66], font: 'NotoSansSC' },
        bodyStyles: { font: 'NotoSansSC' },
        styles: { fontSize: FONT_SIZE.TABLE, font: 'NotoSansSC' },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 80, font: 'NotoSansSC' },
          2: { cellWidth: 40 },
          3: { cellWidth: 25 },
        },
      })

      // Details section (new page)
      doc.addPage()
      doc.setFontSize(FONT_SIZE.SECTION)
      doc.text(t('reports.details'), 14, 20)

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
        head: [['#', t('common.date'), t('packaging.waybill'), t('products.barcode'), t('products.productName'), t('common.time')]],
        body: detailsData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66], font: 'NotoSansSC' },
        bodyStyles: { font: 'NotoSansSC' },
        styles: { fontSize: FONT_SIZE.TABLE, font: 'NotoSansSC' },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 22 },
          2: { cellWidth: 35 },
          3: { cellWidth: 28 },
          4: { cellWidth: 60, font: 'NotoSansSC' },
          5: { cellWidth: 18 },
        },
      })

      // Generate filename
      const filename = `packaging-report-${startDateStr}-to-${endDateStr}.pdf`

      // Download
      doc.save(filename)

      toast.success(t('reports.exportSuccess', { count: allItems.length, filename }))
    } catch (err) {
      console.error('PDF export failed:', err)
      toast.error(t('reports.exportError'))
    } finally {
      setIsExporting(null)
    }
  }, [fetchReportData, t])

  const canExport = startDate && endDate && startDate <= endDate

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-1">
      <div>
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('reports.subtitle')}
        </p>
      </div>

      {/* Active Jobs Panel */}
      {user && reportJobs.length > 0 && (
        <JobStatusPanel jobs={reportJobs} isLoading={isLoadingJobs} />
      )}

      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>{t('reports.packagingReport')}</CardTitle>
          <CardDescription>
            {t('reports.exportDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <DatePickerField
              label={t('reports.startDate')}
              date={startDate}
              onDateChange={setStartDate}
              disabled={!!isExporting}
              maxDate={endDate || today}
              pickDateText={t('reports.pickDate')}
            />
            <DatePickerField
              label={t('reports.endDate')}
              date={endDate}
              onDateChange={setEndDate}
              disabled={!!isExporting}
              maxDate={today}
              pickDateText={t('reports.pickDate')}
            />
          </div>

          <div className="flex flex-col gap-6 sm:flex-row">
            <Button
              onClick={handleExportExcel}
              disabled={!canExport || !!isExporting}
              variant="outline"
              className="flex-1"
            >
              {isExporting === 'excel' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('reports.exporting')}
                </>
              ) : (
                <>
                  <Sheet className="size-4" />
                  {t('reports.exportExcel')}
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
                  {t('reports.exporting')}
                </>
              ) : (
                <>
                  <FileText className="size-4" />
                  {t('reports.exportPdf')}
                </>
              )}
            </Button>
          </div>

          {startDate && endDate && startDate > endDate && (
            <p className="text-destructive text-sm">
              {t('reports.dateError')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
