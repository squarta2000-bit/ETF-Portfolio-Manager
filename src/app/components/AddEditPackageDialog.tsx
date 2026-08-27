import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { ETFPackage } from '../types/etf'

interface AddEditPackageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (pkg: Partial<ETFPackage>) => void
  editPackage?: ETFPackage | null
}

export function AddEditPackageDialog({
  open,
  onOpenChange,
  onSave,
  editPackage,
}: AddEditPackageDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    isin: '',
    url: '',
    purchaseDate: '',
    type: 'Acc' as 'Acc' | 'Dist',
    quantity: '',
    purchasePrice: '',
    commission: '',
  })

  useEffect(() => {
    if (editPackage) {
      setFormData({
        name: editPackage.name || '',
        shortName: editPackage.shortName || '',
        isin: editPackage.isin || '',
        url: editPackage.url || '',
        purchaseDate: editPackage.purchaseDate || '',
        type: editPackage.type || 'Acc',
        quantity: String(editPackage.quantity || ''),
        purchasePrice: String(editPackage.purchasePrice || ''),
        commission: String(editPackage.commission || ''),
      })
    } else {
      setFormData({
        name: '',
        shortName: '',
        isin: '',
        url: '',
        purchaseDate: '',
        type: 'Acc',
        quantity: '',
        purchasePrice: '',
        commission: '',
      })
    }
  }, [editPackage, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    onSave({
      ...(editPackage ? { id: editPackage.id } : {}),
      name: formData.name,
      shortName: formData.shortName,
      isin: formData.isin.toUpperCase(),
      url: formData.url || undefined,
      purchaseDate: formData.purchaseDate,
      type: formData.type,
      quantity: Number(formData.quantity),
      purchasePrice: Number(formData.purchasePrice),
      commission: Number(formData.commission),
      dividends: editPackage?.dividends || [],
    })
    
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editPackage ? 'Edit ETF Package' : 'Add New ETF Package'}
          </DialogTitle>
          <DialogDescription>
            {editPackage
              ? 'Update the details of your ETF package.'
              : 'Enter the details of the ETF package you want to add to your portfolio.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">ETF Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Vanguard S&P 500 ETF"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortName">Short Name *</Label>
            <Input
              id="shortName"
              value={formData.shortName}
              onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
              placeholder="e.g., S&P 500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="isin">ISIN *</Label>
            <Input
              id="isin"
              value={formData.isin}
              onChange={(e) => setFormData({ ...formData, isin: e.target.value.toUpperCase() })}
              placeholder="e.g., IE00B3XXRP09"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">JustETF URL</Label>
            <Input
              id="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="e.g., https://www.justetf.com/en/etf-profile.html?isin=..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchaseDate">Purchase Date *</Label>
            <Input
              id="purchaseDate"
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value: 'Acc' | 'Dist') =>
                setFormData({ ...formData, type: value })
              }
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Acc">Accumulating (Acc)</SelectItem>
                <SelectItem value="Dist">Distributing (Dist)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              step="0.001"
              min="0"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="e.g., 10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchasePrice">Purchase Price (€) *</Label>
            <Input
              id="purchasePrice"
              type="number"
              step="0.01"
              min="0"
              value={formData.purchasePrice}
              onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
              placeholder="e.g., 350.50"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission">Commission (€)</Label>
            <Input
              id="commission"
              type="number"
              step="0.01"
              min="0"
              value={formData.commission}
              onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
              placeholder="e.g., 5.00"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {editPackage ? 'Update Package' : 'Add Package'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}