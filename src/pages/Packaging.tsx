import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Info, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useQueryClient } from '@tanstack/react-query'

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
import { packagingRecordService } from '@/lib/appwrite/packaging'
import { productService } from '@/lib/appwrite/products'
import { formatTime, isToday } from '@/lib/utils'
import type { PackagingItemWithProduct, PackagingRecordWithProducts } from '@/types/packaging'
import type { Product } from '@/types/product'

// Helper to format Date to YYYY-MM-DD string
function formatDateToString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// Use PackagingRecordWithProducts from types (includes product names and bundle info)

// Bundle component for display (includes product for stock validation)
interface BundleComponentItem {
  barcode: string
  productName: string
  quantity: number
  product: Product // Full product for stock operations
}

// Local item type for state (before saving to database)
interface LocalPackagingItem {
  barcode: string
  productName: string
  isBundle?: boolean
  bundleComponents?: BundleComponentItem[]
  stockQuantity?: number // Original stock at time of scan (for single products)
  product?: Product // Full product reference for stock operations
}

// Insufficient stock info for error display
interface InsufficientStockItem {
  barcode: string
  name: string
  required: number
  available: number
}

export default function Packaging() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Date navigation state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const isSelectedToday = isToday(formatDateToString(selectedDate))

  // Edit mode state (for past records)
  const [isEditMode, setIsEditMode] = useState(false)

  // Current record being edited (stored in state only until Complete)
  const [currentWaybill, setCurrentWaybill] = useState<string | null>(null)
  const [currentItems, setCurrentItems] = useState<LocalPackagingItem[]>([])

  // Records for selected date (from database)
  const [todayRecords, setTodayRecords] = useState<PackagingRecordWithProducts[]>([])

  // Input states
  const [waybillInput, setWaybillInput] = useState('')
  const [productInput, setProductInput] = useState('')

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Delete dialog state
  const [deleteRecord, setDeleteRecord] = useState<PackagingRecordWithProducts | null>(null)

  // Product not found dialog state
  const [productNotFoundBarcode, setProductNotFoundBarcode] = useState<string | null>(null)

  // Waybill exists dialog state
  const [waybillExistsNumber, setWaybillExistsNumber] = useState<string | null>(null)

  // Insufficient stock dialog state
  const [insufficientStockItems, setInsufficientStockItems] = useState<InsufficientStockItem[] | null>(null)

  // Local stock tracking - maps barcode to available stock (deducted during session)
  const [localStock, setLocalStock] = useState<Map<string, number>>(new Map())

  // Product search state
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearchingProducts, setIsSearchingProducts] = useState(false)
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)

  // Edit record dialog state
  const [editRecord, setEditRecord] = useState<PackagingRecordWithProducts | null>(null)
  const [editWaybillNumber, setEditWaybillNumber] = useState('')
  const [editItems, setEditItems] = useState<Array<{ barcode: string; productName: string; quantity: number }>>([])
  const [editProductInput, setEditProductInput] = useState('')
  const [editSearchResults, setEditSearchResults] = useState<Product[]>([])
  const [editProductPopoverOpen, setEditProductPopoverOpen] = useState(false)
  const [isEditSearching, setIsEditSearching] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [editingQuantityIndex, setEditingQuantityIndex] = useState<number | null>(null)
  const [editingQuantityValue, setEditingQuantityValue] = useState('')

  // Helper: Get available stock for a product (checks localStock first, then original)
  const getAvailableStock = useCallback((barcode: string, originalStock: number): number => {
    if (localStock.has(barcode)) {
      return localStock.get(barcode)!
    }
    return originalStock
  }, [localStock])

  // Helper: Check stock availability and return insufficient items
  const checkStockAvailability = useCallback((
    product: Product,
    bundleComponents?: Array<{ product: Product; quantity: number }>
  ): InsufficientStockItem[] => {
    const insufficient: InsufficientStockItem[] = []

    if (product.type === 'bundle' && bundleComponents) {
      // For bundles, check each component
      for (const comp of bundleComponents) {
        const available = getAvailableStock(comp.product.barcode, comp.product.stock_quantity)
        if (available < comp.quantity) {
          insufficient.push({
            barcode: comp.product.barcode,
            name: comp.product.name,
            required: comp.quantity,
            available,
          })
        }
      }
    } else {
      // For single products, check the product itself
      const available = getAvailableStock(product.barcode, product.stock_quantity)
      if (available < 1) {
        insufficient.push({
          barcode: product.barcode,
          name: product.name,
          required: 1,
          available,
        })
      }
    }

    return insufficient
  }, [getAvailableStock])

  // Helper: Deduct stock for a product
  const deductStock = useCallback((
    product: Product,
    bundleComponents?: Array<{ product: Product; quantity: number }>
  ) => {
    setLocalStock((prev) => {
      const newStock = new Map(prev)

      if (product.type === 'bundle' && bundleComponents) {
        // For bundles, deduct each component
        for (const comp of bundleComponents) {
          const current = newStock.has(comp.product.barcode)
            ? newStock.get(comp.product.barcode)!
            : comp.product.stock_quantity
          newStock.set(comp.product.barcode, current - comp.quantity)
        }
      } else {
        // For single products, deduct 1
        const current = newStock.has(product.barcode)
          ? newStock.get(product.barcode)!
          : product.stock_quantity
        newStock.set(product.barcode, current - 1)
      }

      return newStock
    })
  }, [])

  // Helper: Restore stock for a product (when removing from list)
  const restoreStock = useCallback((item: LocalPackagingItem) => {
    setLocalStock((prev) => {
      const newStock = new Map(prev)

      if (item.isBundle && item.bundleComponents) {
        // For bundles, restore each component
        for (const comp of item.bundleComponents) {
          const current = newStock.get(comp.barcode) ?? comp.product.stock_quantity
          newStock.set(comp.barcode, current + comp.quantity)
        }
      } else if (item.product) {
        // For single products, restore 1
        const current = newStock.get(item.barcode) ?? item.product.stock_quantity
        newStock.set(item.barcode, current + 1)
      }

      return newStock
    })
  }, [])

  // Refs for inputs and barcode scanner handling
  const waybillInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef<number>(0)
  const barcodeBuffer = useRef<string>('')
  const scanHandledRef = useRef<boolean>(false)

  // Fetch records for selected date with product names and bundle components
  // Uses cache-aside pattern: today = live DB, historical = cached
  // Product info is now included in the response (batch fetched or cached)
  const fetchRecords = useCallback(async () => {
    try {
      setIsLoading(true)
      const dateStr = formatDateToString(selectedDate)
      // getPackagingByDate now returns records with product info included
      const records = await packagingRecordService.getPackagingByDate(dateStr)
      setTodayRecords(records)
    } catch (err) {
      console.error('Error fetching records:', err)
      setError('Failed to load records')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate])

  // Search products based on input
  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      setIsSearchingProducts(true)
      const result = await productService.list({ search: query, limit: 10 })
      setSearchResults(result.documents)
    } catch (err) {
      console.error('Error searching products:', err)
      setSearchResults([])
    } finally {
      setIsSearchingProducts(false)
    }
  }, [])

  // Load records when date changes
  useEffect(() => {
    // Clear current editing state when date changes
    setCurrentWaybill(null)
    setCurrentItems([])
    setWaybillInput('')
    setProductInput('')
    setIsEditMode(false) // Reset edit mode when changing dates
    fetchRecords()
  }, [fetchRecords])

  // Auto-refresh on window focus to sync with database
  useEffect(() => {
    const handleFocus = () => {
      // Only refresh if not in the middle of editing/submitting
      if (!isSubmitting && !currentWaybill && !editRecord) {
        fetchRecords()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchRecords, isSubmitting, currentWaybill, editRecord])

  // Search products when input changes
  useEffect(() => {
    if (productPopoverOpen && productInput.trim()) {
      searchProducts(productInput)
    } else {
      setSearchResults([])
    }
  }, [productPopoverOpen, productInput, searchProducts])


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

      const dateStr = formatDateToString(selectedDate)

      // Check if waybill already exists for the selected date in database
      const existing = await packagingRecordService.getByDateAndWaybill(
        dateStr,
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
  }, [waybillInput, selectedDate, t])

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

      // Fetch bundle components if applicable
      let bundleComponents: Array<{ product: Product; quantity: number }> | undefined
      if (product.type === 'bundle') {
        const productWithComponents = await productService.getWithComponents(product.$id)
        if (productWithComponents.components && productWithComponents.components.length > 0) {
          bundleComponents = productWithComponents.components
        }
      }

      // Check stock availability
      const insufficientItems = checkStockAvailability(product, bundleComponents)
      if (insufficientItems.length > 0) {
        setInsufficientStockItems(insufficientItems)
        setProductInput('')
        return
      }

      // Deduct stock from local state
      deductStock(product, bundleComponents)

      // Build the item
      const newItem: LocalPackagingItem = {
        barcode: barcodeToSubmit,
        productName: product.name,
        isBundle: product.type === 'bundle',
        stockQuantity: product.stock_quantity,
        product,
      }

      // Add bundle components if applicable
      if (bundleComponents) {
        newItem.bundleComponents = bundleComponents.map((comp) => ({
          barcode: comp.product.barcode,
          productName: comp.product.name,
          quantity: comp.quantity,
          product: comp.product,
        }))
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
  }, [currentWaybill, productInput, checkStockAvailability, deductStock])

  // Handle product selection from dropdown
  const handleProductSelect = useCallback(async (product: Product) => {
    if (!currentWaybill) return

    setIsSubmitting(true)

    // Fetch bundle components if applicable
    let bundleComponents: Array<{ product: Product; quantity: number }> | undefined
    if (product.type === 'bundle') {
      try {
        const productWithComponents = await productService.getWithComponents(product.$id)
        if (productWithComponents.components && productWithComponents.components.length > 0) {
          bundleComponents = productWithComponents.components
        }
      } catch (err) {
        console.error('Error fetching bundle components:', err)
      }
    }

    // Check stock availability
    const insufficientItems = checkStockAvailability(product, bundleComponents)
    if (insufficientItems.length > 0) {
      setInsufficientStockItems(insufficientItems)
      setProductInput('')
      setProductPopoverOpen(false)
      setIsSubmitting(false)
      return
    }

    // Deduct stock from local state
    deductStock(product, bundleComponents)

    const newItem: LocalPackagingItem = {
      barcode: product.barcode,
      productName: product.name,
      isBundle: product.type === 'bundle',
      stockQuantity: product.stock_quantity,
      product,
    }

    // Add bundle components if applicable
    if (bundleComponents) {
      newItem.bundleComponents = bundleComponents.map((comp) => ({
        barcode: comp.product.barcode,
        productName: comp.product.name,
        quantity: comp.quantity,
        product: comp.product,
      }))
    }

    setCurrentItems((prev) => [...prev, newItem])
    setProductInput('')
    setProductPopoverOpen(false)
    setIsSubmitting(false)

    // Keep focus on product input for continuous scanning
    setTimeout(() => productInputRef.current?.focus(), 0)
  }, [currentWaybill, checkStockAvailability, deductStock])

  // Handle removing an item from current draft
  const handleRemoveItem = useCallback((index: number) => {
    setCurrentItems((prev) => {
      const itemToRemove = prev[index]
      // Restore stock for the removed item
      if (itemToRemove) {
        restoreStock(itemToRemove)
      }
      return prev.filter((_, i) => i !== index)
    })
    productInputRef.current?.focus()
  }, [restoreStock])

  // Handle completing current waybill - save to database via Appwrite Function
  const handleCompleteWaybill = useCallback(async () => {
    if (!currentWaybill || currentItems.length === 0) {
      toast.error(t('packaging.scanAtLeastOne'))
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const dateStr = formatDateToString(selectedDate)

      // Build items array for the function
      const items = currentItems.map(item => ({
        product_barcode: item.barcode,
        product_name: item.productName,
      }))

      // Build stock updates array (product_id + deduct_amount)
      // Uses Map to aggregate duplicate products (same product scanned multiple times)
      const stockUpdatesMap = new Map<string, number>()
      for (const item of currentItems) {
        if (item.isBundle && item.bundleComponents) {
          for (const comp of item.bundleComponents) {
            const current = stockUpdatesMap.get(comp.product.$id) || 0
            stockUpdatesMap.set(comp.product.$id, current + comp.quantity)
          }
        } else if (item.product) {
          const current = stockUpdatesMap.get(item.product.$id) || 0
          stockUpdatesMap.set(item.product.$id, current + 1)
        }
      }
      const stockUpdates = Array.from(stockUpdatesMap.entries()).map(
        ([product_id, deduct_amount]) => ({ product_id, deduct_amount })
      )

      // Create record, items, and update stock via Appwrite Function (no rate limits)
      const result = await packagingRecordService.createWithItemsViaFunction(
        { packaging_date: dateStr, waybill_number: currentWaybill },
        items,
        stockUpdates
      )

      if (!result.stockUpdateSuccess) {
        console.error('Stock deduction failed in function')
        toast.error(t('packaging.stockDeductionError'))
      }

      // Build saved items with product info for display
      const savedItems: PackagingItemWithProduct[] = result.items.map((savedItem, index) => ({
        ...savedItem,
        product_name: currentItems[index].productName,
        is_bundle: currentItems[index].isBundle,
        bundle_components: currentItems[index].bundleComponents,
      }))

      // Invalidate products cache to reflect stock changes
      await queryClient.invalidateQueries({ queryKey: ['products'] })

      // Add to today's records
      const completedRecord: PackagingRecordWithProducts = {
        ...result.record,
        items: savedItems,
      }
      setTodayRecords((prev) => [completedRecord, ...prev])

      // Clear state for next waybill
      setCurrentWaybill(null)
      setCurrentItems([])
      setWaybillInput('')
      setProductInput('')
      setLocalStock(new Map()) // Clear local stock tracking
      waybillInputRef.current?.focus()

      toast.success(t('packaging.recordSaved'))
    } catch (err) {
      console.error('Error saving packaging record:', err)
      setError(t('packaging.saveError'))
    } finally {
      setIsSubmitting(false)
    }
  }, [currentWaybill, currentItems, queryClient, t, selectedDate])

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
        setLocalStock(new Map()) // Clear local stock tracking
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
        if (insufficientStockItems) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setInsufficientStockItems(null)
          productInputRef.current?.focus()
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
  }, [currentWaybill, currentItems.length, productInput, handleWaybillSubmit, handleProductSubmit, handleCompleteWaybill, productNotFoundBarcode, waybillExistsNumber, insufficientStockItems, deleteRecord])

  // Handle delete record via Appwrite Function
  const handleDeleteRecord = async () => {
    if (!deleteRecord) return

    try {
      setIsSubmitting(true)

      // Delete the packaging record and restore stock via Appwrite Function
      const result = await packagingRecordService.deleteViaFunction(deleteRecord.$id, true)

      if (!result.stockRestoreSuccess) {
        console.error('Stock restoration failed in function')
        toast.error(t('packaging.stockRestoreError'))
      }

      // Invalidate products cache to reflect stock changes
      await queryClient.invalidateQueries({ queryKey: ['products'] })

      // Clear local stock tracking since stock was restored in DB
      setLocalStock(new Map())

      setDeleteRecord(null)
      setTodayRecords((prev) => prev.filter((r) => r.$id !== deleteRecord.$id))
    } catch (err) {
      console.error('Error deleting record:', err)
      setError('Failed to delete record')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle opening the edit dialog
  const handleEditRecord = useCallback((record: PackagingRecordWithProducts) => {
    setEditRecord(record)
    setEditWaybillNumber(record.waybill_number)
    // Group items by barcode and sum quantities
    const groupedItems = new Map<string, { barcode: string; productName: string; quantity: number }>()
    for (const item of record.items) {
      const existing = groupedItems.get(item.product_barcode)
      if (existing) {
        existing.quantity += 1
      } else {
        groupedItems.set(item.product_barcode, {
          barcode: item.product_barcode,
          productName: item.product_name,
          quantity: 1,
        })
      }
    }
    setEditItems(Array.from(groupedItems.values()))
    setEditProductInput('')
    setEditSearchResults([])
    setEditProductPopoverOpen(false)
  }, [])

  // Search products in edit dialog
  const searchEditProducts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setEditSearchResults([])
      return
    }

    try {
      setIsEditSearching(true)
      const result = await productService.list({ search: query, limit: 10 })
      setEditSearchResults(result.documents)
    } catch (err) {
      console.error('Error searching products:', err)
      setEditSearchResults([])
    } finally {
      setIsEditSearching(false)
    }
  }, [])

  // Handle product search in edit dialog
  useEffect(() => {
    if (editProductPopoverOpen && editProductInput.trim()) {
      searchEditProducts(editProductInput)
    } else {
      setEditSearchResults([])
    }
  }, [editProductPopoverOpen, editProductInput, searchEditProducts])

  // Add product to edit items (group by barcode and sum quantities)
  const handleEditAddProduct = async (product: Product) => {
    setEditItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.barcode === product.barcode)
      if (existingIndex !== -1) {
        // Product exists, increment quantity
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        }
        return updated
      }
      // New product, add with quantity 1
      return [...prev, { barcode: product.barcode, productName: product.name, quantity: 1 }]
    })
    setEditProductInput('')
    setEditProductPopoverOpen(false)
  }

  // Remove product from edit items (decrement quantity or remove if 1)
  const handleEditRemoveItem = (index: number) => {
    setEditItems((prev) => {
      const item = prev[index]
      if (item.quantity > 1) {
        // Decrement quantity
        const updated = [...prev]
        updated[index] = { ...item, quantity: item.quantity - 1 }
        return updated
      }
      // Remove item completely
      return prev.filter((_, i) => i !== index)
    })
  }

  // Start editing quantity on double-click
  const handleQuantityDoubleClick = (index: number, currentQuantity: number) => {
    setEditingQuantityIndex(index)
    setEditingQuantityValue(currentQuantity.toString())
  }

  // Save quantity on blur or Enter key
  const handleQuantityBlur = () => {
    if (editingQuantityIndex === null) return

    const newQuantity = parseInt(editingQuantityValue, 10)
    const index = editingQuantityIndex

    // Validate: must be a positive integer
    if (isNaN(newQuantity) || newQuantity < 1) {
      // Reset to original value if invalid
      setEditingQuantityIndex(null)
      setEditingQuantityValue('')
      return
    }

    // Update the quantity
    setEditItems((prev) => {
      if (newQuantity === 0) {
        // Remove item if quantity is 0
        return prev.filter((_, i) => i !== index)
      }
      const updated = [...prev]
      updated[index] = { ...updated[index], quantity: newQuantity }
      return updated
    })

    setEditingQuantityIndex(null)
    setEditingQuantityValue('')
  }

  // Handle Enter key to save quantity
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleQuantityBlur()
    } else if (e.key === 'Escape') {
      setEditingQuantityIndex(null)
      setEditingQuantityValue('')
    }
  }

  // Submit edit changes via Appwrite Function
  const handleEditSubmit = async () => {
    if (!editRecord) return

    if (!editWaybillNumber.trim()) {
      toast.error(t('packaging.enterWaybillError'))
      return
    }

    if (editItems.length === 0) {
      toast.error(t('packaging.scanAtLeastOne'))
      return
    }

    try {
      setIsUpdating(true)

      // Expand grouped items back to individual items for comparison and submission
      const expandedItems: Array<{ barcode: string; productName: string }> = []
      for (const item of editItems) {
        for (let i = 0; i < item.quantity; i++) {
          expandedItems.push({ barcode: item.barcode, productName: item.productName })
        }
      }

      // Check what changed
      const waybillChanged = editWaybillNumber !== editRecord.waybill_number
      const originalBarcodes = editRecord.items.map((i) => i.product_barcode).sort()
      const newBarcodes = expandedItems.map((i) => i.barcode).sort()
      const itemsChanged =
        originalBarcodes.length !== newBarcodes.length ||
        originalBarcodes.some((b, i) => b !== newBarcodes[i])

      // Only call function if something changed
      if (waybillChanged || itemsChanged) {
        // Update via Appwrite Function (no rate limits)
        await packagingRecordService.updateViaFunction(
          editRecord.$id,
          waybillChanged ? { waybill_number: editWaybillNumber } : undefined,
          itemsChanged
            ? expandedItems.map((item) => ({
                product_barcode: item.barcode,
                product_name: item.productName,
              }))
            : undefined
        )
      }

      // Refresh records
      await fetchRecords()

      setEditRecord(null)
      toast.success(t('packaging.recordUpdated'))
    } catch (err) {
      console.error('Error updating record:', err)

      // Check if record was not found (deleted by another session)
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (errorMessage.includes('could not be found') || errorMessage.includes('not found')) {
        toast.error(t('packaging.recordNotFoundError'))
        setEditRecord(null)
        // Refresh to sync with database
        await fetchRecords()
      } else {
        toast.error(t('packaging.updateError'))
      }
    } finally {
      setIsUpdating(false)
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
    if (e.key === 'Enter' && !scanHandledRef.current) {
      e.preventDefault()

      // If input is empty and there are items, complete the waybill
      if (productInput.trim() === '' && currentItems.length > 0) {
        handleCompleteWaybill()
      } else if (productInput.trim() !== '') {
        // If input has content (scanner just finished), add the product
        handleProductSubmit()
      }
      // If input is empty and no items, do nothing (user needs to scan something first)
    }
  }

  // Define columns for React Table
  const columns = useMemo<ColumnDef<PackagingRecordWithProducts>[]>(
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
                    <span className="ml-1 text-xs text-primary">(Bundle)</span>
                  )}
                </div>
                {/* Show bundle components */}
                {item.is_bundle && item.bundle_components && item.bundle_components.length > 0 && (
                  <div className="ml-6 mt-1 flex flex-col gap-0.5 border-l-2 border-primary/30 pl-2">
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
        id: 'date',
        header: t('common.date'),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {row.original.packaging_date}
          </div>
        ),
        size: 100,
      },
      {
        id: 'time',
        header: t('common.time'),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {formatTime(row.original.$createdAt)}
          </div>
        ),
        size: 80,
      },
      {
        id: 'actions',
        header: () => <div className="text-center">{t('common.actions')}</div>,
        cell: ({ row }) => {
          // Show actions for today, or for past dates when in edit mode
          const showActions = isSelectedToday || isEditMode

          if (!showActions) {
            return <div className="text-center text-muted-foreground text-xs">-</div>
          }

          return (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEditRecord(row.original)}
                className="h-8 w-8"
                title={t('common.edit')}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteRecord(row.original)}
                className="text-destructive hover:text-destructive h-8 w-8"
                title={t('common.delete')}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        },
        size: 100,
      },
    ],
    [isSelectedToday, isEditMode, handleEditRecord, t]
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
            maxDate={isEditMode ? new Date(Date.now() - 86400000) : undefined} // Yesterday when in edit mode
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchRecords()}
            disabled={isSubmitting || isLoading}
            title={t('common.refresh')}
          >
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {!isSelectedToday && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDate(new Date())
                  setIsEditMode(false)
                }}
                disabled={isSubmitting}
              >
                {t('common.today')}
              </Button>
              <Button
                variant={isEditMode ? 'default' : 'outline'}
                onClick={() => setIsEditMode(!isEditMode)}
                disabled={isSubmitting}
              >
                <Pencil className="mr-2 size-4" />
                {isEditMode ? t('packaging.editing') : t('common.edit')}
              </Button>
            </>
          )}
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
            {/* Input Row - Shown for today, or for past dates when in edit mode */}
            {(isSelectedToday || isEditMode) && (
              <TableRow>
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
                              {isSearchingProducts ? (
                                <div className="py-6 text-center text-sm">
                                  <Loader2 className="mx-auto size-4 animate-spin" />
                                </div>
                              ) : searchResults.length === 0 ? (
                                <CommandEmpty>No products found.</CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {searchResults.map((product) => (
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
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                        {currentItems.map((item, index) => (
                          <div
                            key={index}
                            className="relative rounded-lg border bg-card p-3 shadow-sm"
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
                                <span className="inline-block mt-1 px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">
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
                <TableCell className="text-muted-foreground align-top pt-3" style={{ width: 100 }}>
                  {currentWaybill && <span className="text-xs italic">-</span>}
                </TableCell>
                <TableCell className="text-muted-foreground align-top pt-3" style={{ width: 80 }}>
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
                <TableCell colSpan={7} className="text-center py-8">
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
                <TableCell colSpan={7} className="text-center py-8">
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

      {/* Insufficient Stock Dialog */}
      <AlertDialog
        open={!!insufficientStockItems}
        onOpenChange={(open) => {
          if (!open) {
            setInsufficientStockItems(null)
            productInputRef.current?.focus()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('packaging.insufficientStockTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">{t('packaging.insufficientStockMessage')}</p>
                <div className="space-y-2">
                  {insufficientStockItems?.map((item, index) => (
                    <div key={index} className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">({item.barcode})</span>
                      </div>
                      <div className="text-destructive font-medium text-right">
                        <div>{t('packaging.stockRequired')}: {item.required}</div>
                        <div>{t('packaging.stockAvailable')}: {item.available}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setInsufficientStockItems(null)
                productInputRef.current?.focus()
              }}
            >
              {t('common.ok')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Record Dialog */}
      <Dialog
        open={!!editRecord}
        onOpenChange={(open) => {
          if (!open) {
            setEditRecord(null)
            setEditWaybillNumber('')
            setEditItems([])
            setEditProductInput('')
            setEditSearchResults([])
            setEditProductPopoverOpen(false)
            setEditingQuantityIndex(null)
            setEditingQuantityValue('')
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('packaging.editRecordTitle')}</DialogTitle>
            <DialogDescription>
              {t('packaging.editRecordDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4 py-4">
            {/* Waybill Number Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-waybill">{t('packaging.editWaybillNumber')}</Label>
              <Input
                id="edit-waybill"
                value={editWaybillNumber}
                onChange={(e) => setEditWaybillNumber(e.target.value)}
                className="font-mono"
                disabled={isUpdating}
              />
            </div>

            {/* Scanned Items */}
            <div className="space-y-2">
              <Label>{t('packaging.scannedItems')}</Label>

              {/* Add Product Input */}
              <Popover open={editProductPopoverOpen} onOpenChange={setEditProductPopoverOpen}>
                <PopoverTrigger asChild>
                  <div>
                    <Input
                      value={editProductInput}
                      onChange={(e) => {
                        setEditProductInput(e.target.value)
                        if (e.target.value.length > 0) {
                          setEditProductPopoverOpen(true)
                        }
                      }}
                      onFocus={() => {
                        if (editProductInput.length > 0) {
                          setEditProductPopoverOpen(true)
                        }
                      }}
                      placeholder={t('packaging.scanProduct')}
                      disabled={isUpdating}
                      autoComplete="off"
                      className="font-mono"
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
                      {isEditSearching ? (
                        <div className="py-6 text-center text-sm">
                          <Loader2 className="mx-auto size-4 animate-spin" />
                        </div>
                      ) : editSearchResults.length === 0 ? (
                        <CommandEmpty>No products found.</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {editSearchResults.map((product) => (
                            <CommandItem
                              key={product.$id}
                              value={product.$id}
                              onSelect={() => handleEditAddProduct(product)}
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
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Items List */}
              <div className="rounded-md border max-h-[200px] overflow-auto">
                {editItems.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    {t('packaging.noItemsScanned')}
                  </div>
                ) : (
                  <div className="divide-y">
                    {editItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.productName}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {item.barcode}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {editingQuantityIndex === index ? (
                            <input
                              type="number"
                              min="1"
                              value={editingQuantityValue}
                              onChange={(e) => setEditingQuantityValue(e.target.value)}
                              onBlur={handleQuantityBlur}
                              onKeyDown={handleQuantityKeyDown}
                              className="w-12 h-6 text-sm font-medium text-center border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="text-sm font-medium text-muted-foreground w-8 text-right cursor-pointer hover:text-primary hover:bg-muted rounded px-1"
                              onDoubleClick={() => handleQuantityDoubleClick(index, item.quantity)}
                              title={t('packaging.doubleClickToEdit')}
                            >
                              {item.quantity}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditRemoveItem(index)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={isUpdating || editingQuantityIndex === index}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditRecord(null)}
              disabled={isUpdating}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleEditSubmit} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('packaging.updating')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  )
}