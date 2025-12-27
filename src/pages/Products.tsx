import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileUp, Loader2, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import * as XLSX from 'xlsx'

import { JobStatusPanel } from '@/components/jobs/JobStatusPanel'
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
import { useActiveJobs, useQueueExport, useQueueImport } from '@/hooks/use-jobs'
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
  const { data: activeJobs = [], isLoading: isLoadingJobs } = useActiveJobs(
    user?.$id || '',
    !!user
  )

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProductType | 'all'>('all')
  const debouncedSearch = useDebounce(searchQuery, 300)

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
        'Price': product.price,
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
        { wch: 12 },  // Price
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

  // Download import template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Barcode': '1234567890123',
        'SKU Code': 'SKU-001',
        'Product Name': 'Sample Single Product',
        'Type': 'Single',
        'Price': 9.99,
        'Bundle Components': '',
      },
      {
        'Barcode': '9876543210987',
        'SKU Code': 'SKU-BUNDLE-001',
        'Product Name': 'Sample Bundle Product',
        'Type': 'Bundle',
        'Price': 29.99,
        'Bundle Components': '1234567890123:2,ANOTHER-BARCODE:1',
      },
    ]

    const instructionsData = [
      { 'Column': 'Barcode', 'Required': 'Yes', 'Description': 'Unique product barcode (any format)' },
      { 'Column': 'SKU Code', 'Required': 'No', 'Description': 'Optional SKU code for the product' },
      { 'Column': 'Product Name', 'Required': 'Yes', 'Description': 'Name of the product' },
      { 'Column': 'Type', 'Required': 'Yes', 'Description': 'Either "Single" or "Bundle"' },
      { 'Column': 'Price', 'Required': 'No', 'Description': 'Product price (defaults to 0)' },
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
      { wch: 10 }, // Price
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
        'Price'?: number
        'Bundle Components'?: string
      }>(worksheet)

      if (jsonData.length === 0) {
        toast.error(t('common.noData'))
        return
      }

      // Pre-fetch all existing products into a cache to reduce API calls
      toast.info(t('products.loadingProducts'))
      const productCache = new Map<string, { $id: string; name: string; sku_code: string | null; price: number; type: string }>()
      const allProducts = await fetchAllProductsForExport()
      for (const product of allProducts) {
        productCache.set(product.barcode, {
          $id: product.$id,
          name: product.name,
          sku_code: product.sku_code,
          price: product.price,
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
        price: number
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
        const price = Number(row['Price']) || 0
        const components = row['Bundle Components'] || ''

        // Check cache for existing product
        const existing = productCache.get(barcode)

        if (type === 'bundle') {
          bundlesToProcess.push({
            barcode,
            sku_code: skuCode,
            name,
            price,
            components,
            existingId: existing?.$id,
          })
        } else {
          if (existing) {
            // Check if values changed
            const hasChanges =
              existing.name !== name ||
              existing.sku_code !== (skuCode || null) ||
              existing.price !== price

            if (hasChanges) {
              try {
                await delay(API_DELAY)
                await productService.update(existing.$id, {
                  sku_code: skuCode,
                  name,
                  price,
                })
                productCache.set(barcode, { ...existing, name, sku_code: skuCode || null, price })
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
                price,
              })
              productMap.set(barcode, newProduct.$id)
              productCache.set(barcode, {
                $id: newProduct.$id,
                name,
                sku_code: skuCode || null,
                price,
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
              existing.price !== bundle.price
            )

            if (hasChanges) {
              await delay(API_DELAY)
              await productService.update(bundle.existingId, {
                sku_code: bundle.sku_code,
                name: bundle.name,
                price: bundle.price,
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
              price: bundle.price,
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
            price: data.price,
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
          price: data.price,
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

  // Client-side filtering with debounced search
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return products
    const query = debouncedSearch.toLowerCase()
    return products.filter((product) =>
      product.barcode.toLowerCase().includes(query) ||
      product.name?.toLowerCase().includes(query) ||
      product.sku_code?.toLowerCase().includes(query)
    )
  }, [products, debouncedSearch])

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  // Define columns for React Table
  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: 'barcode',
        header: t('products.barcode'),
        cell: ({ row }) => (
          <span className="font-mono">{row.original.barcode}</span>
        ),
        size: 140,
      },
      {
        accessorKey: 'sku_code',
        header: t('products.skuCode'),
        cell: ({ row }) => (
          <span className="font-mono">{row.original.sku_code || '-'}</span>
        ),
        size: 120,
      },
      {
        accessorKey: 'name',
        header: t('products.productName'),
      },
      {
        accessorKey: 'type',
        header: t('products.type'),
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              row.original.type === 'bundle'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {row.original.type === 'bundle' ? t('products.bundle') : t('products.single')}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'price',
        header: () => <div className="text-right">{t('products.price')}</div>,
        cell: ({ row }) => (
          <div className="text-right">{formatPrice(row.original.price)}</div>
        ),
        size: 100,
      },
      {
        id: 'actions',
        header: t('common.actions'),
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
        size: 100,
      },
    ],
    [t]
  )

  const table = useReactTable({
    data: filteredProducts,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
            disabled={isImporting}
            title={t('common.template')}
          >
            <Download className="mr-2 size-4" />
            {t('common.template')}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isLoading}
          >
            {isImporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 size-4" />
            )}
            {t('common.import')}
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || isLoading}
          >
            {isExporting ? (
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

      {error && (
        <div className="bg-destructive/10 text-destructive shrink-0 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {/* Active Jobs Panel */}
      {user && activeJobs.length > 0 && (
        <JobStatusPanel jobs={activeJobs} isLoading={isLoadingJobs} />
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
        <Table className="min-w-[600px]">
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
                          style={{ width: cell.column.getSize() !== 150 ? cell.column.getSize() : undefined }}
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
              {t('products.foundMatching', { count: filteredProducts.length })}
              {hasMore && ` (${products.length} / ${total})`}
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
