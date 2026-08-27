import { Card } from './ui/card'
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { PackageWithQuote } from '../types/etf'

interface PortfolioSummaryProps {
  totalValue: number
  totalGainLoss: number
  totalGainLossPercentage: number
  totalDailyPercentage: number
  totalDailyEuroAmount: number
  packages: PackageWithQuote[]
  packageSnapshots?: Record<string, { packageId: string; isin: string; quote: number; timestamp: string }>
  lastRefreshTime: Date | null
}

export function PortfolioSummary({
  totalValue,
  totalGainLoss,
  totalGainLossPercentage,
  totalDailyPercentage,
  totalDailyEuroAmount,
  packages,
  packageSnapshots,
  lastRefreshTime,
}: PortfolioSummaryProps) {
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

  const formatEuroAmount = (value: number) => {
    const numValue = Number(value) || 0
    const formatted = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(numValue))
    return `${numValue >= 0 ? '+' : '-'}${formatted} €`
  }

  const formatLastRefreshTime = (date: Date | null) => {
    if (!date) return ''
    return new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)
  }

  const isPositive = totalGainLoss >= 0
  const isDailyPositive = totalDailyPercentage >= 0

  // Helper function to calculate daily % for a package (same logic as PackagesTable)
  const calculateDailyPercentage = (pkg: PackageWithQuote): number => {
    const snapshot = packageSnapshots?.[pkg.id]
    
    if (snapshot && snapshot.quote > 0 && pkg.quote?.latestQuote) {
      // Use stored quote from yesterday at 23:00
      const yesterdayValue = snapshot.quote * pkg.quantity
      const currentValue = pkg.quote.latestQuote * pkg.quantity
      return ((currentValue - yesterdayValue) / yesterdayValue) * 100
    } else if (pkg.quote?.dtdPrc !== undefined) {
      // Fallback to API's dtdPrc if no snapshot available
      return pkg.quote.dtdPrc
    }
    
    return 0
  }

  // Find packages with highest and lowest daily change using snapshot-based calculation
  const packagesWithDaily = packages.filter(pkg => pkg.quote?.latestQuote !== undefined)
  
  const topPerformer = packagesWithDaily.length > 0 
    ? packagesWithDaily.reduce((max, pkg) => {
        const maxDaily = calculateDailyPercentage(max)
        const pkgDaily = calculateDailyPercentage(pkg)
        return pkgDaily > maxDaily ? pkg : max
      })
    : null
  
  const topPerformerDaily = topPerformer ? calculateDailyPercentage(topPerformer) : 0
  
  const bottomPerformer = packagesWithDaily.length > 0
    ? packagesWithDaily.reduce((min, pkg) => {
        const minDaily = calculateDailyPercentage(min)
        const pkgDaily = calculateDailyPercentage(pkg)
        return pkgDaily < minDaily ? pkg : min
      })
    : null
  
  const bottomPerformerDaily = bottomPerformer ? calculateDailyPercentage(bottomPerformer) : 0

  // Debug logging to verify updates
  console.log('📊 PortfolioSummary - Best/Worst Performers:')
  if (topPerformer) {
    console.log(`  ✅ Best: ${topPerformer.shortName || topPerformer.name} - ${topPerformerDaily.toFixed(2)}%`)
    console.log(`     Current quote: ${topPerformer.quote?.latestQuote}, Snapshot: ${packageSnapshots?.[topPerformer.id]?.quote}`)
  }
  if (bottomPerformer) {
    console.log(`  ⬇️ Worst: ${bottomPerformer.shortName || bottomPerformer.name} - ${bottomPerformerDaily.toFixed(2)}%`)
    console.log(`     Current quote: ${bottomPerformer.quote?.latestQuote}, Snapshot: ${packageSnapshots?.[bottomPerformer.id]?.quote}`)
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 relative">
      <div className="mb-4">
        {/* Header - Desktop: horizontal with performers on right, Mobile: vertical */}
        <div className="flex items-center justify-between gap-2 mb-2 md:mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-6 text-blue-600" />
            <h2 className="text-muted-foreground">Total Portfolio Value</h2>
          </div>
          
          {/* Daily Performance - Desktop Only (on the right) */}
          <div className="hidden md:flex flex-col gap-2">
            {topPerformer && (
              <div className="flex items-center gap-2">
                <TrendingUp className="size-5 text-green-600" />
                <span className="text-2xl text-muted-foreground">{topPerformer.shortName || topPerformer.name}</span>
                <span className="text-2xl text-green-600">
                  {formatPercentage(topPerformerDaily)}
                </span>
              </div>
            )}
            {bottomPerformer && (
              <div className="flex items-center gap-2">
                <TrendingDown className="size-5 text-red-600" />
                <span className="text-2xl text-muted-foreground">{bottomPerformer.shortName || bottomPerformer.name}</span>
                <span className="text-2xl text-red-600">
                  {formatPercentage(bottomPerformerDaily)}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Daily Performance - Mobile Only (below title) */}
        <div className="md:hidden flex flex-col gap-2">
          {topPerformer && (
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-green-600" />
              <span className="text-base text-muted-foreground">{topPerformer.shortName || topPerformer.name}</span>
              <span className="text-base text-green-600">
                {formatPercentage(topPerformerDaily)}
              </span>
            </div>
          )}
          {bottomPerformer && (
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-red-600" />
              <span className="text-base text-muted-foreground">{bottomPerformer.shortName || bottomPerformer.name}</span>
              <span className="text-base text-red-600">
                {formatPercentage(bottomPerformerDaily)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-4xl mb-2">{formatCurrency(totalValue)}</div>
          {/* Daily Percentage and Euro Amount - Right below total value */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Daily:</span>
            <span className={`text-xl ${isDailyPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercentage(totalDailyPercentage)}
            </span>
            <span className={`text-base ${isDailyPositive ? 'text-green-600' : 'text-red-600'}`}>
              ({formatEuroAmount(totalDailyEuroAmount)})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="size-5 text-green-600" />
            ) : (
              <TrendingDown className="size-5 text-red-600" />
            )}
            <div>
              <div className="text-sm text-muted-foreground">Total Gain/Loss</div>
              <div className={`text-2xl ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalGainLoss)}
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Percentage</div>
            <div className={`text-2xl ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercentage(totalGainLossPercentage)}
            </div>
          </div>
        </div>
      </div>

      {/* Last Refresh Time - Bottom Right Corner */}
      {lastRefreshTime && (
        <div className="absolute bottom-4 right-4">
          <span className="text-xs text-muted-foreground/70">
            {formatLastRefreshTime(lastRefreshTime)}
          </span>
        </div>
      )}
    </Card>
  )
}