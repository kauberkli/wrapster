import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, FileUp, Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as XLSX from 'xlsx'

import {
  ProductForm,
  type ProductFormValues,
} from '@/components/products/ProductForm'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { useDebounce } from '@/hooks/use-debounce'
import { useActiveJobs, useDeleteJob, useDownloadExport, useQueueExport, useQueueImport, useRecentCompletedExports } from '@/hooks/use-jobs'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchAllProductsForExport,
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from '@/hooks/use-products'
import { productComponentService, productService } from '@/lib/appwrite'
import type { Product, ProductType } from '@/types/product'
import { toast } from 'sonner'

export default function Products() {
  const { t } = useTranslation()
  const { user } = useAuth()

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [initialBundleItems, setInitialBundleItems] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [useAsyncMode] = useState(true) // Async mode enabled by default
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Async job hooks
  const queueImport = useQueueImport()
  const queueExport = useQueueExport()
  const downloadExport = useDownloadExport()
  const deleteJob = useDeleteJob()
  const { data: activeJobs = [] } = useActiveJobs(
    user?.$id || '',
    !!user
  )
  const { data: completedExports = [] } = useRecentCompletedExports(
    user?.$id || '',
    !!user
  )

  // Filter to only product exports (not reports)
  const productExports = completedExports.filter(j => !j.action.includes('reporting'))

  // Check if import/export jobs are running
  const hasRunningImportJob = activeJobs.some(
    (job) => job.action === 'import-excel' && (job.status === 'pending' || job.status === 'processing')
  )
  const hasRunningExportJob = activeJobs.some(
    (job) => job.action === 'export-excel' && (job.status === 'pending' || job.status === 'processing')
  )

  // Track completed import jobs to invalidate cache
  const completedImportJobIds = useRef<Set<string>>(new Set())

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProductType | 'all'>('all')
  const debouncedSearch = useDebounce(searchQuery, 300)

  // Sorting state
  const [sorting, setSorting] = useState<SortingState>([])

  // Virtualization
  const ROW_HEIGHT = 53
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // TanStack Query hooks
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useProducts({
    type: typeFilter === 'all' ? undefined : typeFilter,
    search: debouncedSearch || undefined,
  })

  const queryClient = useQueryClient()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const deleteProduct = useDeleteProduct()

  // Flatten pages into single array
  const products = useMemo(() => {
    return data?.pages.flatMap((page) => page.documents) ?? []
  }, [data])

  const total = data?.pages[0]?.total ?? 0
  const hasMore = hasNextPage ?? false

  const handleCreate = () => {
    setSelectedProduct(null)
    setInitialBundleItems([])
    setIsFormOpen(true)
  }

  const handleExport = async () => {
    // Use async mode if enabled and user is logged in
    if (useAsyncMode && user) {
      try {
        setIsExporting(true)
        setError(null)

        const filters = typeFilter !== 'all' ? { type: typeFilter } : undefined
        await queueExport.mutateAsync({ userId: user.$id, filters })

        toast.success(t('jobs.exportQueued'))
      } catch (err) {
        setError(t('products.exportError'))
        console.error('Error queuing export:', err)
        toast.error(t('products.exportError'))
      } finally {
        setIsExporting(false)
      }
      return
    }

    // Fallback to sync mode
    try {
      setIsExporting(true)
      setError(null)

      // Fetch all products using parallel batch fetching
      const allProducts = await fetchAllProductsForExport()

      // Prepare data for Excel
      const exportData = allProducts.map((product, index) => ({
        'No.': index + 1,
        'Barcode': product.barcode,
        'SKU Code': product.sku_code || '',
        'Product Name': product.name,
        'Type': product.type === 'bundle' ? 'Bundle' : 'Single',
        'Cost': product.cost,
        'Created At': new Date(product.$createdAt).toLocaleString(),
      }))

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData)

      // Set column widths
      worksheet['!cols'] = [
        { wch: 6 },   // No.
        { wch: 15 },  // Barcode
        { wch: 15 },  // SKU Code
        { wch: 30 },  // Product Name
        { wch: 10 },  // Type
        { wch: 12 },  // Cost
        { wch: 20 },  // Created At
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products')

      // Generate filename with date
      const date = new Date().toISOString().split('T')[0]
      const filename = `products_${date}.xlsx`

      // Download the file
      XLSX.writeFile(workbook, filename)
    } catch (err) {
      setError(t('products.exportError'))
      console.error('Error exporting products:', err)
    } finally {
      setIsExporting(false)
    }
  }

  // Handle download of completed export
  const handleDownloadExport = async (job: typeof productExports[0]) => {
    if (!job.result_file_id) return

    const date = new Date(job.created_at).toISOString().split('T')[0]
    await downloadExport.mutateAsync({
      fileId: job.result_file_id,
      fileName: `products_export_${date}.xlsx`,
    })
  }

  // Handle delete of export record
  const handleDeleteExport = async (job: typeof productExports[0]) => {
    await deleteJob.mutateAsync({
      jobId: job.$id,
      fileId: job.result_file_id,
    })
    toast.success(t('jobs.exportDeleted'))
  }

  // Download import template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Barcode': '1234567890123',
        'SKU Code': 'SKU-001',
        'Product Name': 'Sample Single Product',
        'Type': 'Single',
        'Cost': 9.99,
        'Bundle Components': '',
      },
      {
        'Barcode': '9876543210987',
        'SKU Code': 'SKU-BUNDLE-001',
        'Product Name': 'Sample Bundle Product',
        'Type': 'Bundle',
        'Cost': 29.99,
        'Bundle Components': '1234567890123:2,ANOTHER-BARCODE:1',
      },
    ]

    const instructionsData = [
      { 'Column': 'Barcode', 'Required': 'Yes', 'Description': 'Unique product barcode (any format)' },
      { 'Column': 'SKU Code', 'Required': 'No', 'Description': 'Optional SKU code for the product' },
      { 'Column': 'Product Name', 'Required': 'Yes', 'Description': 'Name of the product' },
      { 'Column': 'Type', 'Required': 'Yes', 'Description': 'Either "Single" or "Bundle"' },
      { 'Column': 'Cost', 'Required': 'No', 'Description': 'Product cost (defaults to 0)' },
      { 'Column': 'Bundle Components', 'Required': 'No', 'Description': 'For bundles: comma-separated list of BARCODE:QUANTITY pairs (e.g., "ABC123:2,DEF456:1")' },
    ]

    const workbook = XLSX.utils.book_new()

    // Products sheet (template)
    const productsSheet = XLSX.utils.json_to_sheet(templateData)
    productsSheet['!cols'] = [
      { wch: 18 }, // Barcode
      { wch: 15 }, // SKU Code
      { wch: 30 }, // Product Name
      { wch: 10 }, // Type
      { wch: 10 }, // Cost
      { wch: 40 }, // Bundle Components
    ]
    XLSX.utils.book_append_sheet(workbook, productsSheet, 'Products')

    // Instructions sheet
    const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData)
    instructionsSheet['!cols'] = [
      { wch: 20 }, // Column
      { wch: 10 }, // Required
      { wch: 60 }, // Description
    ]
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions')

    XLSX.writeFile(workbook, 'product-import-template.xlsx')
    toast.success(t('products.templateDownloaded'))
  }

  // Import products from Excel
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset file input
    event.target.value = ''

    // Use async mode if enabled and user is logged in
    if (useAsyncMode && user) {
      try {
        setIsImporting(true)
        setError(null)

        await queueImport.mutateAsync({ file, userId: user.$id })

        toast.success(t('jobs.importQueued'))
      } catch (err) {
        setError(t('products.importError'))
        console.error('Error queuing import:', err)
        toast.error(t('products.importError'))
      } finally {
        setIsImporting(false)
      }
      return
    }

    // Fallback to sync mode
    // Helper to throttle API calls
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const API_DELAY = 100 // 100ms between API calls to avoid rate limiting

    try {
      setIsImporting(true)
      setError(null)

      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<{
        'Barcode': string
        'SKU Code'?: string
        'Product Name': string
        'Type': string
        'Cost'?: number
        'Bundle Components'?: string
      }>(worksheet)

      if (jsonData.length === 0) {
        toast.error(t('common.noData'))
        return
      }

      // Pre-fetch all existing products into a cache to reduce API calls
      toast.info(t('products.loadingProducts'))
      const productCache = new Map<string, { $id: string; name: string; sku_code: string | null; cost: number; type: string }>()
      const allProducts = await fetchAllProductsForExport()
      for (const product of allProducts) {
        productCache.set(product.barcode, {
          $id: product.$id,
          name: product.name,
          sku_code: product.sku_code,
          cost: product.cost,
          type: product.type,
        })
      }

      toast.info(t('products.processingRows', { count: jsonData.length }))

      let imported = 0
      let updated = 0
      let skipped = 0
      let failed = 0

      // First pass: Import/update single products to build barcode->id map
      const productMap = new Map<string, string>()
      const bundlesToProcess: Array<{
        barcode: string
        sku_code?: string
        name: string
        cost: number
        components: string
        existingId?: string
      }> = []

      // Copy existing product IDs to map
      for (const [barcode, product] of productCache) {
        productMap.set(barcode, product.$id)
      }

      for (const row of jsonData) {
        if (!row['Barcode'] || !row['Product Name']) {
          skipped++
          continue
        }

        const barcode = String(row['Barcode']).trim()
        const type = (row['Type'] || 'Single').toLowerCase()
        const skuCode = row['SKU Code'] ? String(row['SKU Code']).trim() : undefined
        const name = String(row['Product Name']).trim()
        const cost = Number(row['Cost']) || 0
        const components = row['Bundle Components'] || ''

        // Check cache for existing product
        const existing = productCache.get(barcode)

        if (type === 'bundle') {
          bundlesToProcess.push({
            barcode,
            sku_code: skuCode,
            name,
            cost,
            components,
            existingId: existing?.$id,
          })
        } else {
          if (existing) {
            // Check if values changed
            const hasChanges =
              existing.name !== name ||
              existing.sku_code !== (skuCode || null) ||
              existing.cost !== cost

            if (hasChanges) {
              try {
                await delay(API_DELAY)
                await productService.update(existing.$id, {
                  sku_code: skuCode,
                  name,
                  cost,
                })
                productCache.set(barcode, { ...existing, name, sku_code: skuCode || null, cost })
                updated++
              } catch {
                failed++
              }
            } else {
              skipped++
            }
          } else {
            try {
              await delay(API_DELAY)
              const newProduct = await productService.create({
                barcode,
                sku_code: skuCode,
                name,
                type: 'single',
                cost,
              })
              productMap.set(barcode, newProduct.$id)
              productCache.set(barcode, {
                $id: newProduct.$id,
                name,
                sku_code: skuCode || null,
                cost,
                type: 'single',
              })
              imported++
            } catch {
              failed++
            }
          }
        }
      }

      // Second pass: Import/update bundles with components
      for (const bundle of bundlesToProcess) {
        try {
          let bundleId: string

          if (bundle.existingId) {
            // Update existing bundle
            const existing = productCache.get(bundle.barcode)
            const hasChanges = existing && (
              existing.name !== bundle.name ||
              existing.sku_code !== (bundle.sku_code || null) ||
              existing.cost !== bundle.cost
            )

            if (hasChanges) {
              await delay(API_DELAY)
              await productService.update(bundle.existingId, {
                sku_code: bundle.sku_code,
                name: bundle.name,
                cost: bundle.cost,
              })
            }
            bundleId = bundle.existingId

            // Remove existing components with throttling
            await productComponentService.deleteAllForParent(bundleId, API_DELAY)
            updated++
          } else {
            // Create new bundle
            await delay(API_DELAY)
            const newBundle = await productService.create({
              barcode: bundle.barcode,
              sku_code: bundle.sku_code,
              name: bundle.name,
              type: 'bundle',
              cost: bundle.cost,
            })
            bundleId = newBundle.$id
            productMap.set(bundle.barcode, bundleId)
            imported++
          }

          // Add components with throttling
          if (bundle.components) {
            const componentParts = bundle.components.split(',')
            for (const part of componentParts) {
              const [componentBarcode, qtyStr] = part.trim().split(':')
              if (componentBarcode) {
                const componentId = productMap.get(componentBarcode.trim())

                if (componentId) {
                  await delay(API_DELAY)
                  await productComponentService.create({
                    parent_product_id: bundleId,
                    child_product_id: componentId,
                    quantity: parseInt(qtyStr) || 1,
                  })
                }
              }
            }
          }
        } catch {
          failed++
        }
      }

      toast.success(t('products.importComplete', { imported, updated, skipped, failed }))

      // Refresh the products list
      queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (err) {
      console.error('Import error:', err)
      toast.error(t('products.importError'))
    } finally {
      setIsImporting(false)
    }
  }

  const handleEdit = async (product: Product) => {
    setSelectedProduct(product)

    if (product.type === 'bundle') {
      try {
        const components = await productComponentService.getByParentId(product.$id)
        setInitialBundleItems(components.map((c) => c.child_product_id))
      } catch (err) {
        console.error('Error fetching bundle components:', err)
        setInitialBundleItems([])
      }
    } else {
      setInitialBundleItems([])
    }

    setIsFormOpen(true)
  }

  const handleDeleteClick = (product: Product) => {
    setSelectedProduct(product)
    setIsDeleteDialogOpen(true)
  }

  const handleFormSubmit = async (data: ProductFormValues) => {
    try {
      setError(null)

      if (selectedProduct) {
        // Update existing product
        await updateProduct.mutateAsync({
          productId: selectedProduct.$id,
          data: {
            sku_code: data.sku_code || undefined,
            name: data.name,
            type: data.type,
            cost: data.cost,
            stock_quantity: data.type === 'single' ? data.stock_quantity : 0,
            bundleItems: data.bundleItems,
          },
        })
      } else {
        // Create new product
        await createProduct.mutateAsync({
          barcode: data.barcode,
          sku_code: data.sku_code || undefined,
          name: data.name,
          type: data.type,
          cost: data.cost,
          stock_quantity: data.type === 'single' ? data.stock_quantity : 0,
          bundleItems: data.bundleItems,
        })
      }

      setIsFormOpen(false)
      setSelectedProduct(null)
      setInitialBundleItems([])
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to save product'
      setError(errorMessage)
      console.error('Error saving product:', err)
    }
  }

  const handleDelete = async () => {
    if (!selectedProduct) return

    try {
      setError(null)
      await deleteProduct.mutateAsync(selectedProduct.$id)
      setIsDeleteDialogOpen(false)
      setSelectedProduct(null)
    } catch (err) {
      setError('Failed to delete product')
      console.error('Error deleting product:', err)
    }
  }

  const handleFormCancel = () => {
    setIsFormOpen(false)
    setSelectedProduct(null)
    setInitialBundleItems([])
  }


  const formatCost = (cost: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cost)
  }

  // Column width proportions: 1 - 1 - 2.5 - 1 - 1 - 1 - 1 = 8.5 total
  const COLUMN_WIDTHS: Record<string, string> = {
    barcode: `${(1 / 8.5) * 100}%`,
    sku_code: `${(1 / 8.5) * 100}%`,
    name: `${(2.5 / 8.5) * 100}%`,
    type: `${(1 / 8.5) * 100}%`,
    stock_quantity: `${(1 / 8.5) * 100}%`,
    cost: `${(1 / 8.5) * 100}%`,
    actions: `${(1 / 8.5) * 100}%`,
  }

  // Define columns for React Table
  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: 'barcode',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8 hover:bg-transparent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="mr-2 size-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="mr-2 size-4" />
            ) : (
              <ArrowUpDown className="mr-2 size-4 opacity-50" />
            )}
            {t('products.barcode')}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono">{row.original.barcode}</span>
        ),
      },
      {
        accessorKey: 'sku_code',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8 hover:bg-transparent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="mr-2 size-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="mr-2 size-4" />
            ) : (
              <ArrowUpDown className="mr-2 size-4 opacity-50" />
            )}
            {t('products.skuCode')}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono">{row.original.sku_code || '-'}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8 hover:bg-transparent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="mr-2 size-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="mr-2 size-4" />
            ) : (
              <ArrowUpDown className="mr-2 size-4 opacity-50" />
            )}
            {t('products.productName')}
          </Button>
        ),
      },
      {
        accessorKey: 'type',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4 h-8 hover:bg-transparent"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="mr-2 size-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="mr-2 size-4" />
            ) : (
              <ArrowUpDown className="mr-2 size-4 opacity-50" />
            )}
            {t('products.type')}
          </Button>
        ),
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              row.original.type === 'bundle'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                : 'bg-primary/10 text-primary'
            }`}
          >
            {row.original.type === 'bundle' ? t('products.bundle') : t('products.single')}
          </span>
        ),
      },
      {
        accessorKey: 'stock_quantity',
        header: ({ column }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="-mr-4 h-8 hover:bg-transparent"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="mr-2 size-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="mr-2 size-4" />
              ) : (
                <ArrowUpDown className="mr-2 size-4 opacity-50" />
              )}
              {t('products.stock')}
            </Button>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.type === 'bundle' ? '-' : (row.original.stock_quantity ?? 0)}
          </div>
        ),
      },
      {
        accessorKey: 'cost',
        header: ({ column }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="-mr-4 h-8 hover:bg-transparent"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="mr-2 size-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="mr-2 size-4" />
              ) : (
                <ArrowUpDown className="mr-2 size-4 opacity-50" />
              )}
              {t('products.cost')}
            </Button>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">{formatCost(row.original.cost)}</div>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEdit(row.original)}
              title={t('products.editProduct')}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(row.original)}
              title={t('products.deleteProduct')}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [t]
  )

  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  // Trigger loadMore when scrolling near the end
  useEffect(() => {
    const container = tableContainerRef.current
    if (!container || isLoading || isFetchingNextPage || !hasMore) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      // Load more when user is within 200px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        fetchNextPage()
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [hasMore, isLoading, isFetchingNextPage, fetchNextPage])

  // Invalidate product cache when import job completes
  useEffect(() => {
    for (const job of activeJobs) {
      if (
        job.action === 'import-excel' &&
        job.status === 'completed' &&
        !completedImportJobIds.current.has(job.$id)
      ) {
        completedImportJobIds.current.add(job.$id)
        queryClient.invalidateQueries({ queryKey: ['products'] })
        toast.success(t('products.importRefreshed'))
        break // Only invalidate once per completed job
      }
    }
  }, [activeJobs, queryClient, t])

  const isSubmitting = createProduct.isPending || updateProduct.isPending || deleteProduct.isPending

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('products.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('products.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 self-end sm:self-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImport}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            disabled={isImporting || hasRunningImportJob}
            title={t('common.template')}
          >
            <Download className="mr-2 size-4" />
            {t('common.template')}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || hasRunningImportJob || isLoading}
          >
            {isImporting || hasRunningImportJob ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 size-4" />
            )}
            {t('common.import')}
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || hasRunningExportJob || isLoading}
          >
            {isExporting || hasRunningExportJob ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            {t('common.export')}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 size-4" />
            {t('products.addProduct')}
          </Button>
        </div>
      </div>

      {/* Recent Exports */}
      {productExports.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">{t('jobs.recentExports')}:</span>
          {productExports.map((job) => (
            <div
              key={job.$id}
              className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1"
            >
              <FileSpreadsheet className="size-4 text-green-600" />
              <span className="text-sm">
                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => handleDownloadExport(job)}
                disabled={downloadExport.isPending}
                title={t('common.download')}
              >
                <Download className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                onClick={() => handleDeleteExport(job)}
                disabled={deleteJob.isPending}
                title={t('common.remove')}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 text-destructive shrink-0 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder={t('products.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as ProductType | 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('products.filterByType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products.allTypes')}</SelectItem>
            <SelectItem value="single">{t('products.singleItems')}</SelectItem>
            <SelectItem value="bundle">{t('products.bundles')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div ref={tableContainerRef} className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table className="min-w-[600px] table-fixed">
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: COLUMN_WIDTHS[header.column.id] }}
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="text-muted-foreground size-8" />
                    <p className="text-muted-foreground">{t('products.noProducts')}</p>
                    {searchQuery && (
                      <Button
                        variant="link"
                        onClick={() => setSearchQuery('')}
                        className="h-auto p-0"
                      >
                        {t('products.clearSearch')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {/* Top padding row for virtual scroll */}
                {virtualRows.length > 0 && virtualRows[0].start > 0 && (
                  <tr style={{ height: virtualRows[0].start }} />
                )}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          style={{ width: COLUMN_WIDTHS[cell.column.id] }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
                {/* Bottom padding row for virtual scroll */}
                {virtualRows.length > 0 && (
                  <tr style={{ height: totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) }} />
                )}
                {/* Loading more indicator */}
                {isFetchingNextPage && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-16 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="text-muted-foreground text-sm">
                          {t('products.loadingMore')}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Products count */}
      {!isLoading && products.length > 0 && (
        <div className="text-muted-foreground shrink-0 text-center text-sm">
          {debouncedSearch ? (
            <>
              {t('products.foundMatching', { count: total })}
              {hasMore && ` (${products.length} ${t('common.loaded')})`}
            </>
          ) : (
            <>
              {t('products.showingProducts', { count: products.length, total })}
              {!hasMore && ` ${t('products.allLoaded')}`}
            </>
          )}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? t('products.editProduct') : t('products.addProduct')}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct
                ? t('products.updateProductDetails')
                : t('products.enterProductDetails')}
            </DialogDescription>
          </DialogHeader>
          <ProductForm
            key={selectedProduct?.$id ?? 'new'}
            product={selectedProduct}
            initialBundleItems={initialBundleItems}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('products.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('products.deleteConfirmMessage', { name: selectedProduct?.name || selectedProduct?.barcode })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isSubmitting ? t('products.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
