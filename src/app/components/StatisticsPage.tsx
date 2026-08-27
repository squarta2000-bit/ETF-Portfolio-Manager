import { Button } from './ui/button'
import { PackageWithQuote } from '../types/etf'
import { ArrowLeft } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface StatisticsPageProps {
  packages: PackageWithQuote[]
  onBack: () => void
}

// Generate distinct colors for the pie chart
const COLORS = [
  '#7C9CBF', // soft blue
  '#8EBA9F', // soft green
  '#E8B98A', // soft peach
  '#D4A5A5', // soft rose
  '#B4A3D8', // soft lavender
  '#E5A9C3', // soft pink
  '#88C5D1', // soft cyan
  '#D9B38C', // soft tan
  '#B5C99A', // soft sage
  '#A9B4D6', // soft periwinkle
  '#98C9C0', // soft teal
  '#E3B8C5', // soft mauve
]

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

  // Custom label for pie chart with word wrapping
  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, name, value, index } = props
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0
    
    // Don't show label if percentage is too small
    if (percentage <= 5) return null
    
    const RADIAN = Math.PI / 180
    const radius = outerRadius + 25
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    
    // Split name into words for wrapping - 1 word per line for mobile
    const words = name.split(' ')
    const maxWordsPerLine = 1
    const lines: string[] = []
    
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      lines.push(words.slice(i, i + maxWordsPerLine).join(' '))
    }
    
    // Get the color for this label
    const color = COLORS[index % COLORS.length]
    
    return (
      <text
        x={x}
        y={y}
        fill={color}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize="12"
      >
        {lines.map((line, lineIndex) => (
          <tspan key={lineIndex} x={x} dy={lineIndex === 0 ? 0 : 13}>
            {line}
          </tspan>
        ))}
      </text>
    )
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
              <div className="w-full" style={{ minHeight: '350px', height: '350px' }}>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={sortedData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderLabel}
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sortedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

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