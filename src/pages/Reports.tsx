import { useState } from 'react'
import { format, formatDistanceToNow, startOfDay } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, FileText, Loader2, Mail, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailRecipientInput } from '@/components/EmailRecipientInput'
import { useAuth } from '@/contexts/AuthContext'
import { useCompletedReportExports, useDownloadExport, useQueueReportExport, useQueueSendReportEmail } from '@/hooks/use-jobs'
import { cn } from '@/lib/utils'
import type { ParsedJob } from '@/types/job'

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

export default function Reports() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [isExporting, setIsExporting] = useState(false)

  // Email state
  const [emailingGroupKey, setEmailingGroupKey] = useState<string | null>(null)
  const [emailRecipients, setEmailRecipients] = useState<string[]>([])

  const today = startOfDay(new Date())

  // Async job hooks
  const queueReportExport = useQueueReportExport()
  const downloadExport = useDownloadExport()
  const queueSendReportEmail = useQueueSendReportEmail()
  const { data: completedReports = [] } = useCompletedReportExports(
    user?.$id || '',
    !!user
  )

  // Group completed reports by date range (filters field contains startDate and endDate)
  const getReportDateRange = (job: ParsedJob): string => {
    if (job.filters) {
      const startDate = (job.filters as Record<string, string>).startDate
      const endDate = (job.filters as Record<string, string>).endDate
      if (startDate && endDate) {
        return startDate === endDate ? startDate : `${startDate} to ${endDate}`
      }
    }
    // Fallback to created date
    return format(new Date(job.created_at), 'yyyy-MM-dd')
  }

  // Export both Excel and PDF
  const handleExport = async () => {
    if (!user || !startDate || !endDate) {
      toast.error(t('reports.selectDatesError'))
      return
    }

    if (startDate > endDate) {
      toast.error(t('reports.dateError'))
      return
    }

    try {
      setIsExporting(true)
      const startDateStr = formatDateToString(startDate)
      const endDateStr = formatDateToString(endDate)

      // Queue both Excel and PDF exports
      await Promise.all([
        queueReportExport.mutateAsync({
          userId: user.$id,
          startDate: startDateStr,
          endDate: endDateStr,
          format: 'excel',
        }),
        queueReportExport.mutateAsync({
          userId: user.$id,
          startDate: startDateStr,
          endDate: endDateStr,
          format: 'pdf',
        }),
      ])

      toast.success(t('jobs.reportExportQueued'))
    } catch (err) {
      console.error('Error queuing report exports:', err)
      toast.error(t('reports.exportError'))
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownload = async (job: ParsedJob) => {
    if (!job.result_file_id) return

    const dateRange = getReportDateRange(job)
    const isPdf = job.action === 'export-reporting-pdf'
    const ext = isPdf ? 'pdf' : 'xlsx'
    const fileName = `packaging-report-${dateRange.replace(/ to /g, '-to-')}.${ext}`

    await downloadExport.mutateAsync({
      fileId: job.result_file_id,
      fileName,
    })
  }

  const handleEmailClick = (groupKey: string) => {
    if (emailingGroupKey === groupKey) {
      // Close if already open
      setEmailingGroupKey(null)
      setEmailRecipients([])
    } else {
      setEmailingGroupKey(groupKey)
      setEmailRecipients([])
    }
  }

  const handleSendEmail = async (fileId: string, dateRange: string) => {
    if (!user || emailRecipients.length === 0) {
      toast.error(t('reports.addRecipientsError'))
      return
    }

    try {
      await queueSendReportEmail.mutateAsync({
        userId: user.$id,
        fileId,
        recipients: emailRecipients,
        dateRange,
      })

      toast.success(t('reports.emailQueued'))
      setEmailingGroupKey(null)
      setEmailRecipients([])
    } catch (err) {
      console.error('Error sending email:', err)
      toast.error(t('reports.emailError'))
    }
  }

  const canExport = startDate && endDate && startDate <= endDate

  // Group reports by date range + timestamp (within 1 minute = same batch)
  const groupedReports = completedReports.reduce((acc, job) => {
    const dateRange = getReportDateRange(job)
    const createdTime = new Date(job.created_at).getTime()
    // Round to nearest minute to group reports generated together
    const timestampKey = Math.floor(createdTime / 60000)
    const groupKey = `${dateRange}_${timestampKey}`

    if (!acc[groupKey]) {
      acc[groupKey] = {
        dateRange,
        createdAt: job.created_at,
        excel: null as ParsedJob | null,
        pdf: null as ParsedJob | null,
      }
    }

    if (job.action === 'export-reporting-excel') {
      acc[groupKey].excel = job
    } else if (job.action === 'export-reporting-pdf') {
      acc[groupKey].pdf = job
    }

    // Keep the earliest created_at for the group
    if (new Date(job.created_at) < new Date(acc[groupKey].createdAt)) {
      acc[groupKey].createdAt = job.created_at
    }

    return acc
  }, {} as Record<string, { dateRange: string; createdAt: string; excel: ParsedJob | null; pdf: ParsedJob | null }>)

  // Sort groups by creation time (newest first)
  const sortedGroups = Object.values(groupedReports).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('reports.subtitle')}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Export Form */}
        <Card className="flex flex-col">
          <CardHeader className="shrink-0">
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
                disabled={isExporting}
                maxDate={endDate || today}
                pickDateText={t('reports.pickDate')}
              />
              <DatePickerField
                label={t('reports.endDate')}
                date={endDate}
                onDateChange={setEndDate}
                disabled={isExporting}
                maxDate={today}
                pickDateText={t('reports.pickDate')}
              />
            </div>

            <Button
              onClick={handleExport}
              disabled={!canExport || isExporting}
              className="w-full"
            >
              {isExporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('reports.exporting')}
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  {t('common.export')}
                </>
              )}
            </Button>

            {startDate && endDate && startDate > endDate && (
              <p className="text-destructive text-sm">
                {t('reports.dateError')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right: Completed Reports */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0">
            <CardTitle>{t('reports.downloadableReports')}</CardTitle>
            <CardDescription>
              {t('reports.downloadableReportsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            {sortedGroups.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                {t('reports.noReportsAvailable')}
              </p>
            ) : (
              <div className="space-y-3">
                {sortedGroups.map((group) => {
                  const groupKey = `${group.dateRange}_${group.createdAt}`
                  const isEmailingThisGroup = emailingGroupKey === groupKey
                  // Prefer PDF for email, fallback to Excel
                  const emailFileId = group.pdf?.result_file_id || group.excel?.result_file_id

                  return (
                    <div
                      key={groupKey}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{group.dateRange}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(group.createdAt), 'MMM d, yyyy, h:mm a')} — Generated {formatDistanceToNow(new Date(group.createdAt))} ago
                          </p>
                          <p className="text-xs text-muted-foreground">{user?.name || user?.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {group.excel && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(group.excel!)}
                              disabled={downloadExport.isPending}
                              title={t('reports.downloadExcel')}
                            >
                              <FileSpreadsheet className="size-5 text-green-600" />
                            </Button>
                          )}
                          {group.pdf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(group.pdf!)}
                              disabled={downloadExport.isPending}
                              title={t('reports.downloadPdf')}
                            >
                              <FileText className="size-5 text-red-600" />
                            </Button>
                          )}
                          {emailFileId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEmailClick(groupKey)}
                              disabled={queueSendReportEmail.isPending}
                              title={t('reports.sendEmail')}
                              className={isEmailingThisGroup ? 'bg-primary/10' : ''}
                            >
                              <Mail className="size-5 text-blue-600" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Email Input Section */}
                      {isEmailingThisGroup && emailFileId && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{t('reports.sendTo')}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              onClick={() => {
                                setEmailingGroupKey(null)
                                setEmailRecipients([])
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                          <EmailRecipientInput
                            recipients={emailRecipients}
                            onChange={setEmailRecipients}
                            placeholder={t('reports.emailPlaceholder')}
                            disabled={queueSendReportEmail.isPending}
                          />
                          <Button
                            onClick={() => handleSendEmail(emailFileId, group.dateRange)}
                            disabled={emailRecipients.length === 0 || queueSendReportEmail.isPending}
                            size="sm"
                            className="w-full"
                          >
                            {queueSendReportEmail.isPending ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                {t('reports.sending')}
                              </>
                            ) : (
                              <>
                                <Send className="size-4" />
                                {t('reports.send')} ({emailRecipients.length})
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
