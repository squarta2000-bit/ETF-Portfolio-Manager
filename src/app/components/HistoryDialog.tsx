import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { PackageWithQuote } from '../types/etf'

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  packages: PackageWithQuote[]
  portfolioSnapshot: { value: number; timestamp: string; savedAt?: number; autoCreated?: boolean } | null
  packageSnapshots: Record<string, { packageId: string; isin: string; quote: number; timestamp: string }>
  currentTotalValue: number
}

export function HistoryDialog({
  open,
  onOpenChange,
  packages,
  portfolioSnapshot,
  packageSnapshots,
  currentTotalValue,
}: HistoryDialogProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  // Calculate YESTERDAY's portfolio value by summing individual package snapshots
  // This ensures we're comparing apples-to-apples (same packages)
  const yesterdayValue = packages.reduce((sum, pkg) => {
    const snapshot = packageSnapshots[pkg.id]
    if (snapshot && snapshot.quote) {
      const totalDividends = (pkg.dividends || []).reduce((divSum, div) => divSum + div.amount, 0)
      return sum + (snapshot.quote * pkg.quantity) + totalDividends
    }
    return sum
  }, 0)

  // Calculate TODAY's portfolio value by summing current quotes + dividends
  // This matches the calculation in App.tsx: currentValue = quote × quantity + dividends
  const todayValue = packages.reduce((sum, pkg) => {
    const currentQuote = pkg.quote?.latestQuote || 0
    const totalDividends = (pkg.dividends || []).reduce((divSum, div) => divSum + div.amount, 0)
    return sum + (currentQuote * pkg.quantity) + totalDividends
  }, 0)

  // Determine the timestamp text
  const getSnapshotTimestamp = () => {
    if (!portfolioSnapshot) return 'At 23:00 CET'
    
    // If auto-created, show the actual creation time
    if (portfolioSnapshot.autoCreated && portfolioSnapshot.savedAt) {
      const savedDate = new Date(portfolioSnapshot.savedAt)
      const formatter = new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris'
      })
      return `Recalculated at ${formatter.format(savedDate)}`
    }
    
    // Otherwise, it was saved at 23:00 - show the date too
    const snapshotDate = new Date(portfolioSnapshot.timestamp)
    const dateFormatter = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Paris'
    })
    return `At ${dateFormatter.format(snapshotDate)}, 23:00 CET`
  }

  // Prepare data for the table
  const historyData = packages.map(pkg => {
    // Find the snapshot for this package
    const snapshot = packageSnapshots[pkg.id]
    const yesterdayQuote = snapshot?.quote || 0
    const currentQuote = pkg.quote?.latestQuote || 0

    return {
      id: pkg.id,
      name: pkg.shortName || pkg.name,
      yesterdayQuote,
      currentQuote,
    }
  })

  // Sort by name
  const sortedData = historyData.sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Portfolio History</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <div className="text-sm text-muted-foreground mb-1">
                Yesterday Portfolio Value
              </div>
              <div className="text-2xl font-semibold">
                {formatCurrency(yesterdayValue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {getSnapshotTimestamp()}
              </div>
            </div>
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <div className="text-sm text-muted-foreground mb-1">
                Today Portfolio Value
              </div>
              <div className="text-2xl font-semibold">
                {formatCurrency(todayValue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Current
              </div>
            </div>
          </div>

          {/* Package History Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 border-b">ETF Package Name</th>
                  <th className="text-right p-3 border-b">Yesterday Quote</th>
                  <th className="text-right p-3 border-b">Quote</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-muted-foreground">
                      No history data available
                    </td>
                  </tr>
                ) : (
                  sortedData.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-3">{item.name}</td>
                      <td className="p-3 text-right">
                        {item.yesterdayQuote > 0 ? formatCurrency(item.yesterdayQuote) : '-'}
                      </td>
                      <td className="p-3 text-right">
                        {item.currentQuote > 0 ? formatCurrency(item.currentQuote) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}