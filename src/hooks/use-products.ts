import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { productComponentService, productService } from '@/lib/appwrite'
import type { Product, ProductType } from '@/types/product'

const PRODUCTS_QUERY_KEY = 'products'
const PAGE_SIZE = 50

interface ProductsQueryParams {
  type?: ProductType
  search?: string
}

interface ProductsPage {
  documents: Product[]
  total: number
  nextOffset: number | null
}

export function useProducts(params: ProductsQueryParams = {}) {
  return useInfiniteQuery<ProductsPage>({
    queryKey: [PRODUCTS_QUERY_KEY, params.type, params.search],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await productService.list({
        type: params.type,
        search: params.search || undefined,
        limit: PAGE_SIZE,
        offset: pageParam as number,
      })

      const nextOffset =
        (pageParam as number) + result.documents.length < result.total
          ? (pageParam as number) + result.documents.length
          : null

      return {
        documents: result.documents,
        total: result.total,
        nextOffset,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
  })
}

interface CreateProductInput {
  barcode: string
  sku_code?: string
  name: string
  type: ProductType
  cost: number
  stock_quantity?: number
  bundleItems?: string[]
}

// Helper to aggregate bundle items by product ID and count quantities
function aggregateBundleItems(bundleItems: string[]): Map<string, number> {
  const aggregated = new Map<string, number>()
  for (const productId of bundleItems) {
    aggregated.set(productId, (aggregated.get(productId) || 0) + 1)
  }
  return aggregated
}

export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateProductInput) => {
      const newProduct = await productService.create({
        barcode: data.barcode,
        sku_code: data.sku_code,
        name: data.name,
        type: data.type,
        cost: data.cost,
        stock_quantity: data.stock_quantity,
      })

      // Handle bundle components (aggregate duplicates into quantity)
      if (data.type === 'bundle' && data.bundleItems) {
        const aggregated = aggregateBundleItems(data.bundleItems)
        for (const [childProductId, quantity] of aggregated) {
          await productComponentService.create({
            parent_product_id: newProduct.$id,
            child_product_id: childProductId,
            quantity,
          })
        }
      }

      return newProduct
    },
    onSuccess: (newProduct) => {
      // Optimistically add to cache
      queryClient.setQueriesData<{
        pages: ProductsPage[]
        pageParams: number[]
      }>({ queryKey: [PRODUCTS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return oldData

        const newPages = oldData.pages.map((page, index) => {
          if (index === 0) {
            return {
              ...page,
              documents: [newProduct, ...page.documents],
              total: page.total + 1,
            }
          }
          return { ...page, total: page.total + 1 }
        })

        return { ...oldData, pages: newPages }
      })

      // Invalidate cache to ensure fresh data on next fetch (for other modules like Packaging)
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] })
    },
  })
}

interface UpdateProductInput {
  productId: string
  data: {
    sku_code?: string
    name: string
    type: ProductType
    cost: number
    stock_quantity?: number
    bundleItems?: string[]
  }
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ productId, data }: UpdateProductInput) => {
      const updatedProduct = await productService.update(productId, {
        sku_code: data.sku_code,
        name: data.name,
        type: data.type,
        cost: data.cost,
        stock_quantity: data.stock_quantity,
      })

      // Handle bundle components (aggregate duplicates into quantity)
      if (data.type === 'bundle') {
        await productComponentService.deleteAllForParent(productId)
        if (data.bundleItems) {
          const aggregated = aggregateBundleItems(data.bundleItems)
          for (const [childProductId, quantity] of aggregated) {
            await productComponentService.create({
              parent_product_id: productId,
              child_product_id: childProductId,
              quantity,
            })
          }
        }
      }

      return updatedProduct
    },
    onMutate: async ({ productId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [PRODUCTS_QUERY_KEY] })

      // Snapshot previous value
      const previousData = queryClient.getQueriesData({
        queryKey: [PRODUCTS_QUERY_KEY],
      })

      // Optimistically update cache
      queryClient.setQueriesData<{
        pages: ProductsPage[]
        pageParams: number[]
      }>({ queryKey: [PRODUCTS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return oldData

        const newPages = oldData.pages.map((page) => ({
          ...page,
          documents: page.documents.map((product) =>
            product.$id === productId
              ? { ...product, ...data, sku_code: data.sku_code ?? null }
              : product
          ),
        }))

        return { ...oldData, pages: newPages }
      })

      return { previousData }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (productId: string) => {
      await productService.delete(productId)
      return productId
    },
    onMutate: async (productId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [PRODUCTS_QUERY_KEY] })

      // Snapshot previous value
      const previousData = queryClient.getQueriesData({
        queryKey: [PRODUCTS_QUERY_KEY],
      })

      // Optimistically remove from cache
      queryClient.setQueriesData<{
        pages: ProductsPage[]
        pageParams: number[]
      }>({ queryKey: [PRODUCTS_QUERY_KEY] }, (oldData) => {
        if (!oldData) return oldData

        const newPages = oldData.pages.map((page) => ({
          ...page,
          documents: page.documents.filter(
            (product) => product.$id !== productId
          ),
          total: page.total - 1,
        }))

        return { ...oldData, pages: newPages }
      })

      return { previousData }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
  })
}

// Parallel batch fetching for export
const EXPORT_BATCH_SIZE = 100
const MAX_CONCURRENT_REQUESTS = 5

export async function fetchAllProductsForExport(): Promise<Product[]> {
  // First, get total count with a minimal request
  const initialResult = await productService.list({ limit: 1, offset: 0 })
  const total = initialResult.total

  if (total === 0) return []

  // Calculate batch offsets
  const offsets: number[] = []
  for (let offset = 0; offset < total; offset += EXPORT_BATCH_SIZE) {
    offsets.push(offset)
  }

  // Fetch in parallel batches (limited concurrency)
  const allProducts: Product[] = []

  for (let i = 0; i < offsets.length; i += MAX_CONCURRENT_REQUESTS) {
    const batchOffsets = offsets.slice(i, i + MAX_CONCURRENT_REQUESTS)
    const batchPromises = batchOffsets.map((offset) =>
      productService.list({ limit: EXPORT_BATCH_SIZE, offset })
    )
    const results = await Promise.all(batchPromises)
    results.forEach((result) => allProducts.push(...result.documents))
  }

  return allProducts
}

export function useExportProducts() {
  return useMutation({
    mutationFn: fetchAllProductsForExport,
  })
}
