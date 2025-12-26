import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { BundleItemsField } from '@/components/products/BundleItemsField'
import { Barcode } from '@/components/ui/barcode'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Product, ProductType } from '@/types/product'

const productFormSchema = z.object({
  barcode: z
    .string()
    .min(1, 'Product code is required'),
  sku_code: z.string().optional(),
  name: z.string().min(1, 'Product name is required'),
  type: z.enum(['single', 'bundle']),
  price: z.number().min(0),
})

type FormValues = z.infer<typeof productFormSchema>

export interface ProductFormValues extends FormValues {
  bundleItems: string[]
}

interface ProductFormProps {
  product?: Product | null
  initialBundleItems?: string[]
  onSubmit: (data: ProductFormValues) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function ProductForm({
  product,
  initialBundleItems = [],
  onSubmit,
  onCancel,
  isLoading = false,
}: ProductFormProps) {
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef<number>(0)
  const barcodeBuffer = useRef<string>('')

  const [bundleItems, setBundleItems] = useState<string[]>(initialBundleItems)
  const [bundleError, setBundleError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      barcode: product?.barcode ?? '',
      sku_code: product?.sku_code ?? '',
      name: product?.name ?? '',
      type: (product?.type as ProductType) ?? 'single',
      price: product?.price ?? 0,
    },
  })

  const selectedType = form.watch('type')

  // Clear bundle error when type changes to single
  useEffect(() => {
    if (selectedType === 'single') {
      setBundleError(null)
    }
  }, [selectedType])

  // Reset bundle items when initialBundleItems changes
  useEffect(() => {
    setBundleItems(initialBundleItems)
  }, [initialBundleItems])

  // Focus barcode input on mount
  useEffect(() => {
    if (!product) {
      barcodeInputRef.current?.focus()
    }
  }, [product])

  // Handle barcode scanner input (rapid keystrokes ending with Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process if barcode field is focused or no field is focused
      const activeElement = document.activeElement
      const isBarcodeField = activeElement === barcodeInputRef.current
      const isInputField = activeElement?.tagName === 'INPUT'

      if (!isBarcodeField && isInputField) return

      const currentTime = Date.now()
      const timeDiff = currentTime - lastKeyTime.current

      // Scanner typically sends characters very quickly (< 50ms between keys)
      if (timeDiff > 100) {
        barcodeBuffer.current = ''
      }

      if (e.key === 'Enter' && barcodeBuffer.current.length > 0) {
        e.preventDefault()
        form.setValue('barcode', barcodeBuffer.current, { shouldValidate: true })
        barcodeBuffer.current = ''
        // Keep focus on barcode field for user to review before moving on
        barcodeInputRef.current?.focus()
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer.current += e.key
      }

      lastKeyTime.current = currentTime
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [form])

  // Clear bundle error when items are added
  const handleBundleItemsChange = (items: string[]) => {
    setBundleItems(items)
    if (items.length > 0) {
      setBundleError(null)
    }
  }

  const handleSubmit = async (data: FormValues) => {
    // Validate bundle has at least one item
    if (data.type === 'bundle' && bundleItems.length === 0) {
      setBundleError('Bundle must have at least one product')
      return
    }

    setBundleError(null)
    await onSubmit({
      ...data,
      bundleItems: data.type === 'bundle' ? bundleItems : [],
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="barcode"
          render={({ field }) => (
            <FormItem>
              {field.value && (
                <div className="mb-3 rounded-md border bg-white p-3">
                  <Barcode value={field.value} format="CODE128" height={60} />
                </div>
              )}
              <FormLabel>Product Code *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  ref={barcodeInputRef}
                  placeholder="Scan or enter product code"
                  disabled={isLoading || !!product}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sku_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU Code</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter SKU code (optional)"
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product Name *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Enter product name"
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select product type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="single">Single Item</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    disabled={isLoading}
                    onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {selectedType === 'bundle' && (
          <div className="space-y-2">
            <BundleItemsField
              value={bundleItems}
              onChange={handleBundleItemsChange}
              disabled={isLoading}
            />
            {bundleError && (
              <p className="text-sm font-medium text-destructive">{bundleError}</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : product ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
