import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ProductCombobox } from './ProductCombobox'

interface BundleItemsFieldProps {
  value: string[]
  onChange: (productIds: string[]) => void
  disabled?: boolean
}

export function BundleItemsField({
  value,
  onChange,
  disabled = false,
}: BundleItemsFieldProps) {
  const { t } = useTranslation()
  const handleSelect = (index: number, productId: string | undefined) => {
    const newValue = [...value]

    if (productId) {
      if (index < value.length) {
        newValue[index] = productId
      } else {
        newValue.push(productId)
      }
    } else {
      newValue.splice(index, 1)
    }

    onChange(newValue)
  }

  const handleRemove = (index: number) => {
    const newValue = [...value]
    newValue.splice(index, 1)
    onChange(newValue)
  }

  return (
    <div className="space-y-3">
      <Label>{t('productForm.bundleItems')}</Label>
      <div className="space-y-2">
        {value.map((productId, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1">
              <ProductCombobox
                value={productId}
                onSelect={(id) => handleSelect(index, id)}
                disabled={disabled}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(index)}
              disabled={disabled}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ProductCombobox
              value={undefined}
              onSelect={(id) => handleSelect(value.length, id)}
              disabled={disabled}
              placeholder={t('productForm.addProductToBundle')}
            />
          </div>
          <div className="size-9 shrink-0" />
        </div>
      </div>
      {value.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t('productForm.selectBundleProducts')}
        </p>
      )}
    </div>
  )
}
