import { Card } from './ui/card'
import { Button } from './ui/button'
import { PackageWithQuote } from '../types/etf'
import { Trash2, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog'

interface PackageCardProps {
  package: PackageWithQuote
  onDelete: (id: string) => void
  onViewDetails: (pkg: PackageWithQuote) => void
}

export function PackageCard({ package: pkg, onDelete, onViewDetails }: PackageCardProps) {
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

  const dailyChange = pkg.quote?.dtdPrc ?? 0
  const gainLossPercentage = pkg.gainLossPercentage ?? 0
  const isPositiveDaily = dailyChange >= 0
  const isPositiveGain = gainLossPercentage >= 0

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-3">
            <div className="flex-1">
              <h3 className="truncate">{pkg.name}</h3>
              <p className="text-sm text-muted-foreground">{pkg.isin}</p>
            </div>
            {isPositiveDaily ? (
              <TrendingUp className="size-5 text-green-600 flex-shrink-0" />
            ) : (
              <TrendingDown className="size-5 text-red-600 flex-shrink-0" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Current Value</div>
              <div className="text-xl">
                {pkg.currentValue ? formatCurrency(pkg.currentValue) : '—'}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Daily Change</div>
              <div className={`text-xl ${isPositiveDaily ? 'text-green-600' : 'text-red-600'}`}>
                {pkg.quote ? formatPercentage(dailyChange) : '—'}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Total Gain/Loss</div>
              <div className={`text-xl ${isPositiveGain ? 'text-green-600' : 'text-red-600'}`}>
                {pkg.gainLossValue ? formatCurrency(pkg.gainLossValue) : '—'}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Gain/Loss %</div>
              <div className={`text-xl ${isPositiveGain ? 'text-green-600' : 'text-red-600'}`}>
                {pkg.gainLossPercentage ? formatPercentage(gainLossPercentage) : '—'}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(pkg)}
              className="flex-1"
            >
              View Details
              <ChevronRight className="size-4 ml-1" />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
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
                    onClick={() => onDelete(pkg.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </Card>
  )
}