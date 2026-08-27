import { Button } from './ui/button'
import { PackageWithQuote } from '../types/etf'
import { ArrowLeft } from 'lucide-react'

interface HistoryPageProps {
  packages: PackageWithQuote[]
  portfolioSnapshot: { value: number; timestamp: string; savedAt?: number; autoCreated?: boolean } | null
  packageSnapshots: Record<string, { packageId: string; isin: string; quote: number; timestamp: string }>
  currentTotalValue: number
  onBack: () => void
}

export function HistoryPage({
  packages,
  portfolioSnapshot,
  packageSnapshots,
  currentTotalValue,
  onBack,
}: HistoryPageProps) {
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
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header with back button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="size-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl">Portfolio History</h1>
          </div>
        </div>

        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="space-y-3">
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
                  <th className="text-left p-3 border-b text-sm">ETF Package Name</th>
                  <th className="text-right p-3 border-b text-sm">Yesterday Quote</th>
                  <th className="text-right p-3 border-b text-sm">Quote</th>
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
                      <td className="p-3 text-sm">{item.name}</td>
                      <td className="p-3 text-right text-sm">
                        {item.yesterdayQuote > 0 ? formatCurrency(item.yesterdayQuote) : '-'}
                      </td>
                      <td className="p-3 text-right text-sm">
                        {item.currentQuote > 0 ? formatCurrency(item.currentQuote) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}