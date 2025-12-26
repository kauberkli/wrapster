import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { productService } from '@/lib/appwrite'
import type { Product } from '@/types/product'

interface ProductComboboxProps {
  value?: string
  onSelect: (productId: string | undefined) => void
  disabledProductIds?: string[]
  disabled?: boolean
  placeholder?: string
}

export function ProductCombobox({
  value,
  onSelect,
  disabledProductIds = [],
  disabled = false,
  placeholder = 'Select a product',
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductData, setSelectedProductData] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Find selected product in the list or use separately fetched data
  const selectedProduct = products.find((p) => p.$id === value) ??
    (selectedProductData?.$id === value ? selectedProductData : null)

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true)
      const result = await productService.list({
        type: 'single',
        limit: 100,
      })
      setProducts(result.documents)
    } catch (err) {
      console.error('Error fetching products:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch product list when dropdown opens or value is set
  useEffect(() => {
    if ((open || value) && products.length === 0) {
      fetchProducts()
    }
  }, [open, value, products.length, fetchProducts])

  // Fetch selected product by ID if not in the list or list hasn't loaded
  useEffect(() => {
    if (!value) {
      setSelectedProductData(null)
      return
    }
    // If we already have this product's data, skip
    if (selectedProductData?.$id === value) return
    // If product is in the list, skip
    if (products.find((p) => p.$id === value)) return
    // Fetch the product by ID
    productService.getById(value).then(setSelectedProductData).catch(console.error)
  }, [value, products, selectedProductData])

  const filteredProducts = products.filter((product) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      product.barcode.toLowerCase().includes(query) ||
      product.name?.toLowerCase().includes(query)
    )
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selectedProduct ? (
            <span className="truncate">
              {selectedProduct.name}{' '}
              <span className="text-muted-foreground">
                ({selectedProduct.barcode})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by barcode or name..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm">Loading products...</div>
            ) : filteredProducts.length === 0 ? (
              <CommandEmpty>No products found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredProducts.map((product) => {
                  const isDisabled = disabledProductIds.includes(product.$id)
                  const isSelected = value === product.$id
                  return (
                    <CommandItem
                      key={product.$id}
                      value={product.$id}
                      disabled={isDisabled}
                      onSelect={() => {
                        if (!isDisabled) {
                          onSelect(isSelected ? undefined : product.$id)
                          setOpen(false)
                          setSearchQuery('')
                        }
                      }}
                      className={cn(isDisabled && 'opacity-50')}
                    >
                      <Check
                        className={cn(
                          'mr-2 size-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-1 flex-col">
                        <span>{product.name}</span>
                        <span className="text-muted-foreground text-xs font-mono">
                          {product.barcode}
                        </span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
