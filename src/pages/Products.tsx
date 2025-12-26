import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
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
import { useDebounce } from '@/hooks/use-debounce'
import {
  fetchAllProductsForExport,
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from '@/hooks/use-products'
import { productComponentService } from '@/lib/appwrite'
import type { Product, ProductType } from '@/types/product'

export default function Products() {
  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [initialBundleItems, setInitialBundleItems] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError('Failed to export products')
      console.error('Error exporting products:', err)
    } finally {
      setIsExporting(false)
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
        header: 'Barcode',
        cell: ({ row }) => (
          <span className="font-mono">{row.original.barcode}</span>
        ),
        size: 140,
      },
      {
        accessorKey: 'sku_code',
        header: 'SKU',
        cell: ({ row }) => (
          <span className="font-mono">{row.original.sku_code || '-'}</span>
        ),
        size: 120,
      },
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              row.original.type === 'bundle'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {row.original.type === 'bundle' ? 'Bundle' : 'Single'}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'price',
        header: () => <div className="text-right">Price</div>,
        cell: ({ row }) => (
          <div className="text-right">{formatPrice(row.original.price)}</div>
        ),
        size: 100,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEdit(row.original)}
              title="Edit product"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(row.original)}
              title="Delete product"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
        size: 100,
      },
    ],
    []
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
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground mt-1">
            Manage your product catalog
          </p>
        </div>
        <div className="flex gap-2 self-end sm:self-auto">
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
            Export
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 size-4" />
            Add Product
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive shrink-0 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by barcode, name, or SKU..."
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
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="single">Single Items</SelectItem>
            <SelectItem value="bundle">Bundles</SelectItem>
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
                  Loading products...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="text-muted-foreground size-8" />
                    <p className="text-muted-foreground">No products found</p>
                    {searchQuery && (
                      <Button
                        variant="link"
                        onClick={() => setSearchQuery('')}
                        className="h-auto p-0"
                      >
                        Clear search
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
                          Loading more products...
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
              Found {filteredProducts.length} matching products
              {hasMore && ` (${products.length} of ${total} loaded)`}
            </>
          ) : (
            <>
              Showing {products.length} of {total} products
              {!hasMore && ' (all loaded)'}
            </>
          )}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct
                ? 'Update the product details below.'
                : 'Enter the product details. Use a barcode scanner for quick entry.'}
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
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;
              {selectedProduct?.name || selectedProduct?.barcode}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
