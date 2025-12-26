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
  FormDescription,
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

/**
 * Validates EAN-13 barcode format and check digit
 */
function isValidEAN13(barcode: string): boolean {
  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(barcode)) {
    return false
  }

  // Calculate check digit
  const digits = barcode.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10

  return checkDigit === digits[12]
}

const productFormSchema = z.object({
  barcode: z
    .string()
    .min(1, 'Barcode is required')
    .regex(/^\d{13}$/, 'Barcode must be exactly 13 digits')
    .refine(isValidEAN13, 'Invalid EAN-13 check digit'),
  sku_code: z.string().optional(),
  name: z.string().min(1, 'Product name is required'),
  type: z.enum(['single', 'bundle']).default('single'),
  price: z.coerce.number().min(0).default(0),
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

  const handleSubmit = async (data: FormValues) => {
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
              {field.value && isValidEAN13(field.value) && (
                <div className="mb-3 rounded-md border bg-white p-3">
                  <Barcode value={field.value} format="EAN13" height={60} />
                </div>
              )}
              <FormLabel>Barcode *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  ref={barcodeInputRef}
                  placeholder="Scan barcode or enter manually"
                  disabled={isLoading || !!product}
                  autoComplete="off"
                />
              </FormControl>
              <FormDescription>
                EAN-13 format (13 digits)
              </FormDescription>
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
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {selectedType === 'bundle' && (
          <BundleItemsField
            value={bundleItems}
            onChange={setBundleItems}
            disabled={isLoading}
          />
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
