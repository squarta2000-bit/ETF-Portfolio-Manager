import { Button } from './ui/button'
import { PackageWithQuote } from '../types/etf'
import { ArrowLeft } from 'lucide-react'
import { PortfolioPieChart, PORTFOLIO_CHART_COLORS as COLORS } from './PortfolioPieChart'

interface StatisticsPageProps {
  packages: PackageWithQuote[]
  onBack: () => void
}

export function StatisticsPage({
  packages,
  onBack,
}: StatisticsPageProps) {
  // Aggregate packages by ISIN
  const aggregatedData = packages.reduce((acc, pkg) => {
    const existingEntry = acc.find(entry => entry.isin === pkg.isin)
    const currentValue = pkg.currentValue || 0
    const totalCost = (pkg.quantity * pkg.purchasePrice) + (pkg.commission || 0)
    const totalDividends = (pkg.dividends || []).reduce((sum, div) => sum + div.amount, 0)
    const gainLossValue = currentValue - totalCost + totalDividends
    
    if (existingEntry) {
      existingEntry.value += currentValue
      existingEntry.totalCost += totalCost
      existingEntry.gainLossValue += gainLossValue
    } else {
      acc.push({
        isin: pkg.isin,
        name: pkg.shortName || pkg.name,
        value: currentValue,
        totalCost: totalCost,
        gainLossValue: gainLossValue,
      })
    }
    
    return acc
  }, [] as Array<{ isin: string; name: string; value: number; totalCost: number; gainLossValue: number }>)

  // Sort by value descending
  const sortedData = aggregatedData.sort((a, b) => b.value - a.value)

  // Calculate total for percentages
  const totalValue = sortedData.reduce((sum, item) => sum + item.value, 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0
    return `${percentage.toFixed(1)}%`
  }

  const formatGainLossPercentage = (gainLossValue: number, totalCost: number) => {
    if (totalCost === 0) return '0,00%'
    const gainLoss = (gainLossValue / totalCost) * 100
    const formatted = gainLoss.toFixed(2).replace('.', ',')
    return `${gainLoss >= 0 ? '+' : ''}${formatted}%`
  }

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
            <h1 className="text-2xl">Portfolio Statistics</h1>
          </div>
        </div>

        <div className="space-y-6">
          {sortedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data available to display statistics
            </div>
          ) : (
            <>
              {/* Pie Chart */}
              <PortfolioPieChart
                data={sortedData}
                innerRadius={60}
                outerRadius={100}
                height={350}
                labelOffset={25}
                nameWordsPerLine={1}
                fontSize={12}
              />

              {/* Data Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 border-b">ETF</th>
                      <th className="text-right p-3 border-b">Value</th>
                      <th className="text-right p-3 border-b">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map((item, index) => {
                      return (
                        <tr key={item.isin} className="border-b last:border-0">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                              />
                              <div>{item.name}</div>
                            </div>
                          </td>
                          <td className="p-3 text-right">{formatCurrency(item.value)}</td>
                          <td className="p-3 text-right">{formatPercentage(item.value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}