import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Info, Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  packagingItemService,
  packagingRecordService,
} from '@/lib/appwrite/packaging'
import { productService } from '@/lib/appwrite/products'
import { formatTime, getTodayDate, isToday } from '@/lib/utils'
import type { PackagingItem, PackagingRecord } from '@/types/packaging'
import type { Product } from '@/types/product'

// Helper to format Date to YYYY-MM-DD string
function formatDateToString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// Extended type to include product name for display
interface PackagingItemWithProduct extends PackagingItem {
  product_name: string
  is_bundle?: boolean
  bundle_components?: BundleComponentItem[]
}

interface PackagingRecordWithItemsAndProducts extends PackagingRecord {
  items: PackagingItemWithProduct[]
}

// Bundle component for display
interface BundleComponentItem {
  barcode: string
  productName: string
  quantity: number
}

// Local item type for state (before saving to database)
interface LocalPackagingItem {
  barcode: string
  productName: string
  isBundle?: boolean
  bundleComponents?: BundleComponentItem[]
}

export default function Packaging() {
  const { t } = useTranslation()

  // Date navigation state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const isSelectedToday = isToday(formatDateToString(selectedDate))

  // Current record being edited (stored in state only until Complete)
  const [currentWaybill, setCurrentWaybill] = useState<string | null>(null)
  const [currentItems, setCurrentItems] = useState<LocalPackagingItem[]>([])

  // Records for selected date (from database)
  const [todayRecords, setTodayRecords] = useState<PackagingRecordWithItemsAndProducts[]>([])

  // Input states
  const [waybillInput, setWaybillInput] = useState('')
  const [productInput, setProductInput] = useState('')

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Delete dialog state
  const [deleteRecord, setDeleteRecord] = useState<PackagingRecordWithItemsAndProducts | null>(null)

  // Product not found dialog state
  const [productNotFoundBarcode, setProductNotFoundBarcode] = useState<string | null>(null)

  // Waybill exists dialog state
  const [waybillExistsNumber, setWaybillExistsNumber] = useState<string | null>(null)

  // Product search state
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)

  // Refs for inputs and barcode scanner handling
  const waybillInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef<number>(0)
  const barcodeBuffer = useRef<string>('')
  const scanHandledRef = useRef<boolean>(false)

  // Fetch records for selected date with product names and bundle components
  const fetchRecords = useCallback(async () => {
    try {
      setIsLoading(true)
      const dateStr = formatDateToString(selectedDate)
      const records = await packagingRecordService.listByDate(dateStr)

      // Fetch product names and bundle components for all items
      const recordsWithProducts = await Promise.all(
        records.map(async (record) => {
          const itemsWithProducts = await Promise.all(
            record.items.map(async (item) => {
              const product = await productService.getByBarcode(item.product_barcode)

              const result: PackagingItemWithProduct = {
                ...item,
                product_name: product?.name ?? 'Unknown Product',
                is_bundle: product?.type === 'bundle',
              }

              // If it's a bundle, fetch its components
              if (product && product.type === 'bundle') {
                const productWithComponents = await productService.getWithComponents(product.$id)
                if (productWithComponents.components && productWithComponents.components.length > 0) {
                  result.bundle_components = productWithComponents.components.map((comp) => ({
                    barcode: comp.product.barcode,
                    productName: comp.product.name,
                    quantity: comp.quantity,
                  }))
                }
              }

              return result
            })
          )
          return {
            ...record,
            items: itemsWithProducts,
          }
        })
      )

      setTodayRecords(recordsWithProducts)
    } catch (err) {
      console.error('Error fetching records:', err)
      setError('Failed to load records')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate])

  // Fetch all products for search
  const fetchAllProducts = useCallback(async () => {
    if (allProducts.length > 0 || isLoadingProducts) return

    try {
      setIsLoadingProducts(true)
      const result = await productService.list({ limit: 500 })
      setAllProducts(result.documents)
    } catch (err) {
      console.error('Error fetching products:', err)
    } finally {
      setIsLoadingProducts(false)
    }
  }, [allProducts.length, isLoadingProducts])

  // Load records when date changes
  useEffect(() => {
    // Clear current editing state when date changes
    setCurrentWaybill(null)
    setCurrentItems([])
    setWaybillInput('')
    setProductInput('')
    fetchRecords()
  }, [fetchRecords])

  // Load products when popover opens or waybill is set
  useEffect(() => {
    if ((productPopoverOpen || currentWaybill) && allProducts.length === 0) {
      fetchAllProducts()
    }
  }, [productPopoverOpen, currentWaybill, allProducts.length, fetchAllProducts])

  // Filter products based on input
  const filteredProducts = useMemo(() => {
    if (!productInput.trim()) return allProducts
    const query = productInput.toLowerCase()
    return allProducts.filter(
      (product) =>
        product.barcode.toLowerCase().includes(query) ||
        product.name?.toLowerCase().includes(query) ||
        product.sku_code?.toLowerCase().includes(query)
    )
  }, [allProducts, productInput])

  // Focus management - focus waybill input on mount
  useEffect(() => {
    if (!currentWaybill) {
      waybillInputRef.current?.focus()
    }
  }, [currentWaybill])

  // Handle waybill submission (state only, no database)
  const handleWaybillSubmit = useCallback(async (scannedBarcode?: string) => {
    const waybillToSubmit = (scannedBarcode ?? waybillInput).trim()

    if (!waybillToSubmit) {
      toast.error(t('packaging.enterWaybillError'))
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const today = getTodayDate()

      // Check if waybill already exists for today in database
      const existing = await packagingRecordService.getByDateAndWaybill(
        today,
        waybillToSubmit
      )

      if (existing) {
        setWaybillExistsNumber(waybillToSubmit)
        setWaybillInput('')
        return
      }

      // Store in state only (no database record yet)
      setCurrentWaybill(waybillToSubmit)
      setCurrentItems([])
      // Move focus to product input
      setTimeout(() => productInputRef.current?.focus(), 0)
    } catch (err) {
      console.error('Error checking waybill:', err)
      setError('Failed to check waybill')
    } finally {
      setIsSubmitting(false)
    }
  }, [waybillInput])

  // Handle product barcode submission (state only, no database)
  const handleProductSubmit = useCallback(async (scannedBarcode?: string) => {
    const barcodeToSubmit = (scannedBarcode ?? productInput).trim()

    if (!barcodeToSubmit) {
      toast.error(t('packaging.scanProductError'))
      return
    }

    if (!currentWaybill) {
      toast.error(t('packaging.noActiveWaybill'))
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Check if product exists in database
      const product = await productService.getByBarcode(barcodeToSubmit)
      if (!product) {
        setProductNotFoundBarcode(barcodeToSubmit)
        setProductInput('')
        return
      }

      // Build the item, including bundle components if applicable
      const newItem: LocalPackagingItem = {
        barcode: barcodeToSubmit,
        productName: product.name,
        isBundle: product.type === 'bundle',
      }

      // If it's a bundle, fetch its components
      if (product.type === 'bundle') {
        const productWithComponents = await productService.getWithComponents(product.$id)
        if (productWithComponents.components && productWithComponents.components.length > 0) {
          newItem.bundleComponents = productWithComponents.components.map((comp) => ({
            barcode: comp.product.barcode,
            productName: comp.product.name,
            quantity: comp.quantity,
          }))
        }
      }

      setCurrentItems((prev) => [...prev, newItem])
      setProductInput('')
      setProductPopoverOpen(false)

      // Keep focus on product input for continuous scanning
      productInputRef.current?.focus()
    } catch (err) {
      console.error('Error checking product:', err)
      setError('Failed to check product')
    } finally {
      setIsSubmitting(false)
    }
  }, [currentWaybill, productInput])

  // Handle product selection from dropdown
  const handleProductSelect = useCallback(async (product: Product) => {
    if (!currentWaybill) return

    setIsSubmitting(true)

    const newItem: LocalPackagingItem = {
      barcode: product.barcode,
      productName: product.name,
      isBundle: product.type === 'bundle',
    }

    // If it's a bundle, fetch its components
    if (product.type === 'bundle') {
      try {
        const productWithComponents = await productService.getWithComponents(product.$id)
        if (productWithComponents.components && productWithComponents.components.length > 0) {
          newItem.bundleComponents = productWithComponents.components.map((comp) => ({
            barcode: comp.product.barcode,
            productName: comp.product.name,
            quantity: comp.quantity,
          }))
        }
      } catch (err) {
        console.error('Error fetching bundle components:', err)
      }
    }

    setCurrentItems((prev) => [...prev, newItem])
    setProductInput('')
    setProductPopoverOpen(false)
    setIsSubmitting(false)

    // Keep focus on product input for continuous scanning
    setTimeout(() => productInputRef.current?.focus(), 0)
  }, [currentWaybill])

  // Handle removing an item from current draft
  const handleRemoveItem = useCallback((index: number) => {
    setCurrentItems((prev) => prev.filter((_, i) => i !== index))
    productInputRef.current?.focus()
  }, [])

  // Handle completing current waybill - save to database
  const handleCompleteWaybill = useCallback(async () => {
    if (!currentWaybill || currentItems.length === 0) {
      toast.error(t('packaging.scanAtLeastOne'))
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const today = getTodayDate()

      // Create the packaging record in database
      const newRecord = await packagingRecordService.create({
        packaging_date: today,
        waybill_number: currentWaybill,
      })

      // Create all items in database
      const savedItems: PackagingItemWithProduct[] = await Promise.all(
        currentItems.map(async (item) => {
          const savedItem = await packagingItemService.create({
            packaging_record_id: newRecord.$id,
            product_barcode: item.barcode,
          })
          return {
            ...savedItem,
            product_name: item.productName,
            is_bundle: item.isBundle,
            bundle_components: item.bundleComponents,
          }
        })
      )

      // Add to today's records
      const completedRecord: PackagingRecordWithItemsAndProducts = {
        ...newRecord,
        items: savedItems,
      }
      setTodayRecords((prev) => [completedRecord, ...prev])

      // Clear state for next waybill
      setCurrentWaybill(null)
      setCurrentItems([])
      setWaybillInput('')
      setProductInput('')
      waybillInputRef.current?.focus()

      toast.success(t('packaging.recordSaved'))
    } catch (err) {
      console.error('Error saving packaging record:', err)
      setError(t('packaging.saveError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [currentWaybill, currentItems])

  // Barcode scanner detection and Enter key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isWaybillField = activeElement === waybillInputRef.current
      const isProductField = activeElement === productInputRef.current
      const isOurField = isWaybillField || isProductField

      // Backspace to go back to previous step (when input is empty)
      // Works when: focused on product field with empty input, OR not focused on any input
      const isOtherInput = activeElement?.tagName === 'INPUT' && !isOurField
      const canGoBack = currentWaybill && productInput === '' && (isProductField || (!isOtherInput && !isWaybillField))
      if (e.key === 'Backspace' && canGoBack) {
        e.preventDefault()
        // Go back to step 1 - clear waybill and items
        setCurrentWaybill(null)
        setCurrentItems([])
        setWaybillInput('')
        setProductInput('')
        setTimeout(() => waybillInputRef.current?.focus(), 0)
        return
      }

      // Enter key to submit - works regardless of focus
      if (e.key === 'Enter') {
        // Handle dialog dismissal with Enter key
        if (productNotFoundBarcode) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setProductNotFoundBarcode(null)
          productInputRef.current?.focus()
          return
        }
        if (waybillExistsNumber) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setWaybillExistsNumber(null)
          waybillInputRef.current?.focus()
          return
        }
        // Skip delete dialog - let it handle its own Enter (has Cancel/Delete options)
        if (deleteRecord) {
          return
        }

        // If focused on our input fields, let the input's onKeyDown handler process it
        // This ensures manual keyboard input uses the full input value, not the partial buffer
        // (Buffer may only contain last few chars if user typed slowly > 100ms between keys)
        if (isWaybillField || isProductField) {
          barcodeBuffer.current = ''  // Clear buffer to prevent interference
          return  // Let input's onKeyDown handler take over
        }

        // With items scanned - Enter always submits the record (when not focused on input)
        if (currentWaybill && currentItems.length > 0 && barcodeBuffer.current.length === 0) {
          e.preventDefault()
          e.stopImmediatePropagation()
          handleCompleteWaybill()
          return
        } else if (barcodeBuffer.current.length > 0) {
          // Barcode scan completed (scanner input while not focused on our fields)
          e.preventDefault()
          e.stopImmediatePropagation()
          const barcode = barcodeBuffer.current
          barcodeBuffer.current = ''

          // Set flag to prevent input's onKeyDown from also submitting
          scanHandledRef.current = true
          setTimeout(() => { scanHandledRef.current = false }, 0)

          // Determine which field to submit based on current state
          if (!currentWaybill) {
            setWaybillInput(barcode)
            handleWaybillSubmit(barcode)
          } else {
            setProductInput(barcode)
            handleProductSubmit(barcode)
          }
        }
        return
      }

      // For character keys - capture for barcode scanning
      // Skip if focused on another input field (not ours)
      if (isOtherInput) return

      const currentTime = Date.now()
      const timeDiff = currentTime - lastKeyTime.current

      // Scanner typically sends characters very quickly (< 50ms between keys)
      if (timeDiff > 100) {
        barcodeBuffer.current = ''
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer.current += e.key

        // Auto-focus the appropriate field when typing starts (not focused on our fields)
        if (!isOurField) {
          if (!currentWaybill) {
            waybillInputRef.current?.focus()
          } else {
            productInputRef.current?.focus()
          }
        }
      }

      lastKeyTime.current = currentTime
    }

    // Use capture phase so this fires BEFORE the input's onKeyDown
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [currentWaybill, currentItems.length, productInput, handleWaybillSubmit, handleProductSubmit, handleCompleteWaybill, productNotFoundBarcode, waybillExistsNumber, deleteRecord])

  // Handle delete record
  const handleDeleteRecord = async () => {
    if (!deleteRecord) return

    try {
      setIsSubmitting(true)
      await packagingRecordService.delete(deleteRecord.$id)
      setDeleteRecord(null)
      setTodayRecords((prev) => prev.filter((r) => r.$id !== deleteRecord.$id))
    } catch (err) {
      console.error('Error deleting record:', err)
      setError('Failed to delete record')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle keyboard events for manual input
  const handleWaybillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !scanHandledRef.current) {
      e.preventDefault()
      handleWaybillSubmit()
    }
  }

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Global handler takes care of Enter when items exist
    // This only fires when there are no items yet
    if (e.key === 'Enter' && !scanHandledRef.current) {
      e.preventDefault()
      handleProductSubmit()
    }
  }

  // Define columns for React Table
  const columns = useMemo<ColumnDef<PackagingRecordWithItemsAndProducts>[]>(
    () => [
      {
        id: 'index',
        header: () => <div className="text-center">#</div>,
        cell: ({ row }) => (
          <div className="text-muted-foreground text-center">
            {row.index + 1}
          </div>
        ),
        size: 64,
      },
      {
        accessorKey: 'waybill_number',
        header: t('packaging.waybill'),
        cell: ({ row }) => (
          <div className="font-mono font-semibold">
            {row.original.waybill_number}
          </div>
        ),
        size: 192,
      },
      {
        id: 'products',
        header: t('packaging.productBarcode'),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            {row.original.items.map((item, itemIndex) => (
              <div key={item.$id}>
                <div className="text-sm">
                  <span className="text-muted-foreground">{itemIndex + 1}.</span>{' '}
                  <span className="font-mono">{item.product_barcode}</span>
                  <span className="text-muted-foreground"> - {item.product_name}</span>
                  {item.is_bundle && (
                    <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">(Bundle)</span>
                  )}
                </div>
                {/* Show bundle components */}
                {item.is_bundle && item.bundle_components && item.bundle_components.length > 0 && (
                  <div className="ml-6 mt-1 flex flex-col gap-0.5 border-l-2 border-blue-200 pl-2 dark:border-blue-800">
                    {item.bundle_components.map((comp, compIndex) => (
                      <div key={compIndex} className="text-xs text-muted-foreground">
                        <span className="font-mono">{comp.barcode}</span>
                        <span> - {comp.productName}</span>
                        {comp.quantity > 1 && <span className="font-medium"> ×{comp.quantity}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {row.original.items.length === 0 && (
              <span className="text-muted-foreground text-sm">{t('packaging.noItems')}</span>
            )}
          </div>
        ),
      },
      {
        id: 'itemCount',
        header: () => <div className="text-center">{t('common.items')}</div>,
        cell: ({ row }) => (
          <div className="text-center font-semibold">
            {row.original.items.length}
          </div>
        ),
        size: 80,
      },
      {
        id: 'time',
        header: t('common.time'),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {formatTime(row.original.$createdAt)}
          </div>
        ),
        size: 96,
      },
      {
        id: 'actions',
        header: () => <div className="text-center">{t('common.actions')}</div>,
        cell: ({ row }) => (
          <div className="text-center">
            {isSelectedToday ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteRecord(row.original)}
                className="text-destructive hover:text-destructive h-8 w-8"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">-</span>
            )}
          </div>
        ),
        size: 80,
      },
    ],
    [isSelectedToday]
  )

  const table = useReactTable({
    data: todayRecords,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('packaging.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('packaging.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 self-end sm:self-auto">
          <DatePicker
            date={selectedDate}
            onDateChange={(date) => date && setSelectedDate(date)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      {
        error && (
          <div className="bg-destructive/10 text-destructive shrink-0 rounded-md p-3 text-sm">
            {error}
            <button
              className="ml-2 underline"
              onClick={() => setError(null)}
            >
              {t('common.dismiss')}
            </button>
          </div>
        )
      }

      {/* Excel-like Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table className="min-w-[700px]">
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.column.getSize() !== 150 ? header.column.getSize() : undefined }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {/* Input Row - Only shown for today */}
            {isSelectedToday && (
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableCell className="text-muted-foreground text-center align-top pt-3" style={{ width: 64 }}>
                  <Plus className="mx-auto size-4" />
                </TableCell>
                <TableCell className="align-top" style={{ width: 192 }}>
                  <Input
                    ref={waybillInputRef}
                    value={currentWaybill ?? waybillInput}
                    onChange={(e) => setWaybillInput(e.target.value)}
                    onKeyDown={handleWaybillKeyDown}
                    placeholder={t('packaging.scanWaybill')}
                    disabled={isSubmitting || !!currentWaybill}
                    autoComplete="off"
                    className="h-8 font-mono"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Popover open={productPopoverOpen && currentWaybill !== null} onOpenChange={setProductPopoverOpen}>
                        <PopoverTrigger asChild>
                          <div className="flex-1">
                            <Input
                              ref={productInputRef}
                              value={productInput}
                              onChange={(e) => {
                                setProductInput(e.target.value)
                                if (e.target.value.length > 0 && currentWaybill) {
                                  setProductPopoverOpen(true)
                                }
                              }}
                              onKeyDown={handleProductKeyDown}
                              onFocus={() => {
                                if (productInput.length > 0 && currentWaybill) {
                                  setProductPopoverOpen(true)
                                }
                              }}
                              placeholder={currentWaybill ? t('packaging.scanProduct') : t('packaging.enterWaybillFirst')}
                              disabled={isSubmitting || !currentWaybill}
                              autoComplete="off"
                              className="h-8 font-mono w-full"
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[--radix-popover-trigger-width] p-0"
                          align="start"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <Command shouldFilter={false}>
                            <CommandList>
                              {isLoadingProducts ? (
                                <div className="py-6 text-center text-sm">
                                  <Loader2 className="mx-auto size-4 animate-spin" />
                                </div>
                              ) : filteredProducts.length === 0 ? (
                                <CommandEmpty>No products found.</CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {filteredProducts.slice(0, 10).map((product) => (
                                    <CommandItem
                                      key={product.$id}
                                      value={product.$id}
                                      onSelect={() => handleProductSelect(product)}
                                    >
                                      <div className="flex flex-1 flex-col">
                                        <span>{product.name}</span>
                                        <span className="text-muted-foreground text-xs font-mono">
                                          {product.barcode}
                                          {product.sku_code && ` • ${product.sku_code}`}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                  {filteredProducts.length > 10 && (
                                    <div className="text-muted-foreground py-2 text-center text-xs">
                                      {filteredProducts.length - 10} more results...
                                    </div>
                                  )}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {currentWaybill && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCompleteWaybill}
                            disabled={isSubmitting}
                            className="h-8 whitespace-nowrap"
                          >
                            {t('common.complete')}
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="text-muted-foreground size-4 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {t('packaging.pressEnterToSubmit')}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                    {/* Current items for active waybill - Card Display */}
                    {currentItems.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {currentItems.map((item, index) => (
                          <div
                            key={index}
                            className="relative rounded-lg border bg-card p-3 shadow-sm min-w-[200px] max-w-[280px]"
                          >
                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Remove item"
                            >
                              <X className="size-4" />
                            </button>

                            {/* Product info */}
                            <div className="pr-6">
                              <div className="font-medium text-sm line-clamp-2">{item.productName}</div>
                              <div className="font-mono text-xs text-muted-foreground mt-1">{item.barcode}</div>
                              {item.isBundle && (
                                <span className="inline-block mt-1 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                  Bundle
                                </span>
                              )}
                            </div>

                            {/* Bundle components */}
                            {item.isBundle && item.bundleComponents && item.bundleComponents.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-dashed">
                                <div className="text-xs font-medium text-muted-foreground mb-1">{t('packaging.contains')}</div>
                                <div className="flex flex-col gap-1">
                                  {item.bundleComponents.map((comp, compIndex) => (
                                    <div key={compIndex} className="text-xs text-muted-foreground flex items-center gap-1">
                                      <span className="size-1 rounded-full bg-muted-foreground/50" />
                                      <span className="truncate">{comp.productName}</span>
                                      {comp.quantity > 1 && <span className="font-medium shrink-0">×{comp.quantity}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center align-top pt-3" style={{ width: 80 }}>
                  {currentWaybill && (
                    <span className="font-semibold">{currentItems.length}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground align-top pt-3" style={{ width: 96 }}>
                  {currentWaybill && <span className="text-xs italic">{t('common.draft')}</span>}
                </TableCell>
                <TableCell className="text-center align-top pt-3" style={{ width: 80 }}>
                  {isSubmitting && <Loader2 className="mx-auto size-4 animate-spin" />}
                </TableCell>
              </TableRow>
            )}

            {/* Loading State */}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="mx-auto size-6 animate-spin" />
                </TableCell>
              </TableRow>
            )}

            {/* Records for Selected Date - Using React Table */}
            {!isLoading && table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="align-top"
                    style={{ width: cell.column.getSize() !== 150 ? cell.column.getSize() : undefined }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {/* Empty State */}
            {!isLoading && todayRecords.length === 0 && !currentWaybill && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-muted-foreground">
                    {isSelectedToday
                      ? t('packaging.noRecordsToday')
                      : t('packaging.noRecordsDate', { date: format(selectedDate, 'MMMM d, yyyy') })}
                  </p>
                  {isSelectedToday && (
                    <p className="text-muted-foreground text-sm">{t('packaging.scanToCreate')}</p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteRecord}
        onOpenChange={(open) => !open && setDeleteRecord(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('packaging.deleteRecordTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('packaging.deleteRecordMessage', {
                waybill: deleteRecord?.waybill_number,
                count: deleteRecord?.items.length || 0
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecord}
              disabled={isSubmitting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isSubmitting ? t('products.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Not Found Dialog */}
      <AlertDialog
        open={!!productNotFoundBarcode}
        onOpenChange={(open) => {
          if (!open) {
            setProductNotFoundBarcode(null)
            productInputRef.current?.focus()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('packaging.productNotFoundTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('packaging.productNotFoundMessage', { barcode: productNotFoundBarcode })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setProductNotFoundBarcode(null)
                productInputRef.current?.focus()
              }}
            >
              {t('common.ok')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Waybill Exists Dialog */}
      <AlertDialog
        open={!!waybillExistsNumber}
        onOpenChange={(open) => {
          if (!open) {
            setWaybillExistsNumber(null)
            waybillInputRef.current?.focus()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('packaging.waybillExistsTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('packaging.waybillExistsMessage', { waybill: waybillExistsNumber })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setWaybillExistsNumber(null)
                waybillInputRef.current?.focus()
              }}
            >
              {t('common.ok')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  )
}
