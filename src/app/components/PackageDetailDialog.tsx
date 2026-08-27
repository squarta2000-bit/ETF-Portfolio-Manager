import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { PackageWithQuote, Dividend } from '../types/etf'
import { Pencil, Plus, Trash2, Check, X, ExternalLink } from 'lucide-react'
import { Separator } from './ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

interface PackageDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  package: PackageWithQuote | null
  onEdit: (pkg: PackageWithQuote) => void
  onDelete: (id: string) => void
  onUpdateDividends: (packageId: string, dividends: Dividend[]) => void
}

export function PackageDetailDialog({
  open,
  onOpenChange,
  package: pkg,
  onEdit,
  onDelete,
  onUpdateDividends,
}: PackageDetailDialogProps) {
  const [dividends, setDividends] = useState<Dividend[]>([])
  const [editingDividendId, setEditingDividendId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Initialize dividends when package changes
  useEffect(() => {
    if (pkg) {
      setDividends(pkg.dividends || [])
    }
  }, [pkg])

  if (!pkg) return null

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    const numValue = Number(value) || 0
    const formatted = numValue.toFixed(2).replace('.', ',')
    return `${numValue >= 0 ? '+' : ''}${formatted}%`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-EU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const totalDividends = dividends.reduce((sum, div) => sum + div.amount, 0)
  const purchaseCost = pkg.quantity * pkg.purchasePrice + (pkg.commission || 0)

  const handleAddDividend = () => {
    if (!newDate || !newAmount) return
    
    const dividend: Dividend = {
      id: `div_${Date.now()}`,
      date: newDate,
      amount: parseFloat(newAmount),
    }
    
    const updatedDividends = [...dividends, dividend].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    setDividends(updatedDividends)
    onUpdateDividends(pkg.id, updatedDividends)
    
    setNewDate('')
    setNewAmount('')
    setIsAddingNew(false)
  }

  const handleEditDividend = (dividend: Dividend) => {
    setEditingDividendId(dividend.id)
    setEditDate(dividend.date)
    setEditAmount(dividend.amount.toString())
  }

  const handleSaveEdit = () => {
    if (!editDate || !editAmount || !editingDividendId) return
    
    const updatedDividends = dividends.map((div) =>
      div.id === editingDividendId
        ? { ...div, date: editDate, amount: parseFloat(editAmount) }
        : div
    ).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    
    setDividends(updatedDividends)
    onUpdateDividends(pkg.id, updatedDividends)
    
    setEditingDividendId(null)
    setEditDate('')
    setEditAmount('')
  }

  const handleCancelEdit = () => {
    setEditingDividendId(null)
    setEditDate('')
    setEditAmount('')
  }

  const handleDeleteDividend = (dividendId: string) => {
    const updatedDividends = dividends.filter((div) => div.id !== dividendId)
    setDividends(updatedDividends)
    onUpdateDividends(pkg.id, updatedDividends)
  }

  const handleCancelAdd = () => {
    setIsAddingNew(false)
    setNewDate('')
    setNewAmount('')
  }

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    onDelete(pkg.id)
    setDeleteDialogOpen(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div>
            <DialogTitle className="text-2xl">{pkg.name}</DialogTitle>
            <DialogDescription className="mt-2">
              ISIN: {pkg.isin}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Performance */}
          <div>
            <h3 className="mb-3">Current Performance</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-muted-foreground text-sm">Current Value</div>
                <div className="text-2xl">
                  {pkg.currentValue ? formatCurrency(pkg.currentValue) : '—'}
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-muted-foreground text-sm">Daily Change</div>
                <div
                  className={`text-2xl ${
                    pkg.quote && pkg.quote.dtdPrc >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {pkg.quote ? formatPercentage(pkg.quote.dtdPrc) : '—'}
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="text-muted-foreground text-sm">Total Gain/Loss</div>
                <div
                  className={`text-2xl ${
                    pkg.gainLossValue && pkg.gainLossValue >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {pkg.gainLossValue ? formatCurrency(pkg.gainLossValue) : '—'}
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="text-muted-foreground text-sm">Gain/Loss %</div>
                <div
                  className={`text-2xl ${
                    pkg.gainLossPercentage && pkg.gainLossPercentage >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {pkg.gainLossPercentage ? formatPercentage(pkg.gainLossPercentage) : '—'}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Market Data */}
          <div>
            <h3 className="mb-3">Market Data</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Latest Quote</div>
                <div>{pkg.quote ? formatCurrency(pkg.quote.latestQuote) : '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Previous Quote</div>
                <div>{pkg.quote ? formatCurrency(pkg.quote.previousQuote) : '—'}</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Purchase Details */}
          <div>
            <h3 className="mb-3">Purchase Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Short Name</div>
                <div>{pkg.shortName || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Purchase Date</div>
                <div>{formatDate(pkg.purchaseDate)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Type</div>
                <div>{pkg.type === 'Acc' ? 'Accumulating' : 'Distributing'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Quantity</div>
                <div>{pkg.quantity}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Purchase Price</div>
                <div>{formatCurrency(pkg.purchasePrice)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Commission</div>
                <div>{formatCurrency(pkg.commission || 0)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Purchase Cost</div>
                <div>{formatCurrency(purchaseCost)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-sm text-muted-foreground">JustETF Page</div>
                {pkg.url ? (
                  <a
                    href={pkg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    View on JustETF <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <div className="text-muted-foreground">No URL provided</div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Dividends */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3>Dividends</h3>
                {totalDividends > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Total: {formatCurrency(totalDividends)}
                  </p>
                )}
              </div>
              <Button
                onClick={() => setIsAddingNew(true)}
                size="sm"
                variant="outline"
                disabled={isAddingNew}
              >
                <Plus className="size-4 mr-2" />
                Add Dividend
              </Button>
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividends.length === 0 && !isAddingNew && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No dividends recorded
                      </TableCell>
                    </TableRow>
                  )}
                  
                  {isAddingNew && (
                    <TableRow>
                      <TableCell>
                        <Input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={newAmount}
                          onChange={(e) => setNewAmount(e.target.value)}
                          placeholder="Amount in €"
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleAddDividend}
                            disabled={!newDate || !newAmount}
                          >
                            <Check className="size-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleCancelAdd}
                          >
                            <X className="size-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  
                  {dividends.map((dividend) => (
                    <TableRow key={dividend.id}>
                      {editingDividendId === dividend.id ? (
                        <>
                          <TableCell>
                            <Input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="Amount in €"
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleSaveEdit}
                                disabled={!editDate || !editAmount}
                              >
                                <Check className="size-4 text-green-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleCancelEdit}
                              >
                                <X className="size-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>{formatDate(dividend.date)}</TableCell>
                          <TableCell>{formatCurrency(dividend.amount)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditDividend(dividend)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteDividend(dividend.id)}
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4 flex-row justify-between sm:justify-end gap-2">
          <Button
            variant="destructive"
            onClick={handleDeleteClick}
            className="sm:mr-auto"
          >
            <Trash2 className="size-4 mr-2" />
            <span className="hidden sm:inline">Delete Package</span>
            <span className="sm:hidden">Delete</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => onEdit(pkg)}
          >
            <Pencil className="size-4 mr-2" />
            <span className="hidden sm:inline">Edit Package</span>
            <span className="sm:hidden">Edit</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Package</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{pkg.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}