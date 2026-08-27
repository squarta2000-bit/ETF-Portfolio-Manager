import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './ui/table'
import { PackageWithQuote } from '../types/etf'

interface PackagesTableProps {
  packages: PackageWithQuote[]
  packageSnapshots?: Record<string, { packageId: string; isin: string; quote: number; timestamp: string }>
  onViewDetails: (pkg: PackageWithQuote) => void
}

type SortColumn = 'name' | 'lastQuote' | 'totalGainLoss' | 'daily' | 'dailyEuro' | 'gainLoss'
type SortDirection = 'asc' | 'desc'

export function PackagesTable({ packages, packageSnapshots = {}, onViewDetails }: PackagesTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Helper function to calculate daily % for a package
  const calculateDailyPercentage = (pkg: PackageWithQuote): number => {
    const snapshot = packageSnapshots[pkg.id]
    
    if (snapshot && snapshot.quote > 0 && pkg.quote?.latestQuote) {
      // Use stored quote from yesterday at 23:00
      const yesterdayValue = snapshot.quote * pkg.quantity
      const currentValue = pkg.quote.latestQuote * pkg.quantity
      const dailyPct = ((currentValue - yesterdayValue) / yesterdayValue) * 100
      
      // Debug logging for LU1829219390
      if (pkg.isin === 'LU1829219390') {
        console.log(`🔍 Daily % calculation for ${pkg.isin}:`)
        console.log(`  Snapshot quote: ${snapshot.quote}`)
        console.log(`  Latest quote: ${pkg.quote.latestQuote}`)
        console.log(`  Quantity: ${pkg.quantity}`)
        console.log(`  Yesterday value: ${yesterdayValue}`)
        console.log(`  Current value: ${currentValue}`)
        console.log(`  Daily %: ${dailyPct.toFixed(2)}%`)
        console.log(`  API dtdPrc (fallback): ${pkg.quote.dtdPrc}`)
      }
      
      return dailyPct
    } else if (pkg.quote?.dtdPrc !== undefined) {
      // Fallback to API's dtdPrc if no snapshot available
      return pkg.quote.dtdPrc
    }
    
    return 0
  }

  // Helper function to calculate daily Euro amount for a package
  const calculateDailyEuroAmount = (pkg: PackageWithQuote): number => {
    const snapshot = packageSnapshots[pkg.id]
    
    if (snapshot && snapshot.quote > 0 && pkg.quote?.latestQuote) {
      // Use stored quote from yesterday at 23:00
      const yesterdayValue = snapshot.quote * pkg.quantity
      const currentValue = pkg.quote.latestQuote * pkg.quantity
      return currentValue - yesterdayValue
    } else if (pkg.quote?.latestQuote && pkg.quote?.dtdPrc !== undefined) {
      // Fallback: use dtdPrc percentage to calculate Euro amount
      const currentValue = pkg.quote.latestQuote * pkg.quantity
      const dailyChangeAmount = (currentValue * pkg.quote.dtdPrc) / 100
      return dailyChangeAmount
    }
    
    return 0
  }

  const sortedPackages = [...packages].sort((a, b) => {
    let aValue: number | string
    let bValue: number | string

    switch (sortColumn) {
      case 'name':
        aValue = a.shortName || a.name
        bValue = b.shortName || b.name
        break
      case 'lastQuote':
        aValue = a.quote?.latestQuote ?? 0
        bValue = b.quote?.latestQuote ?? 0
        break
      case 'totalGainLoss':
        aValue = a.gainLossValue ?? 0
        bValue = b.gainLossValue ?? 0
        break
      case 'daily':
        aValue = calculateDailyPercentage(a)
        bValue = calculateDailyPercentage(b)
        break
      case 'dailyEuro':
        aValue = calculateDailyEuroAmount(a)
        bValue = calculateDailyEuroAmount(b)
        break
      case 'gainLoss':
        aValue = a.gainLossPercentage ?? 0
        bValue = b.gainLossPercentage ?? 0
        break
      default:
        aValue = 0
        bValue = 0
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }

    return sortDirection === 'asc'
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number)
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'always',
    }).format(value / 100)
  }

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="size-4 inline ml-1" />
    ) : (
      <ChevronDown className="size-4 inline ml-1" />
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead 
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('name')}
            >
              Name <SortIcon column="name" />
            </TableHead>
            <TableHead 
              className="hidden md:table-cell text-right cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('lastQuote')}
            >
              Last Quote <SortIcon column="lastQuote" />
            </TableHead>
            <TableHead 
              className="text-right cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('daily')}
            >
              Daily <SortIcon column="daily" />
            </TableHead>
            <TableHead 
              className="hidden md:table-cell text-right cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('dailyEuro')}
            >
              Daily € <SortIcon column="dailyEuro" />
            </TableHead>
            <TableHead 
              className="hidden md:table-cell text-right cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('totalGainLoss')}
            >
              Total Gain/Loss <SortIcon column="totalGainLoss" />
            </TableHead>
            <TableHead 
              className="text-right cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('gainLoss')}
            >
              Gain/Loss % <SortIcon column="gainLoss" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPackages.map((pkg) => {
            const dailyChange = calculateDailyPercentage(pkg)
            const dailyEuroChange = calculateDailyEuroAmount(pkg)
            const gainLossPercentage = pkg.gainLossPercentage ?? 0
            const gainLossValue = pkg.gainLossValue ?? 0
            const isPositiveDaily = dailyChange >= 0
            const isPositiveGain = gainLossPercentage >= 0
            const isPositiveGainValue = gainLossValue >= 0

            return (
              <TableRow 
                key={pkg.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onViewDetails(pkg)}
              >
                <TableCell>
                  <div className="font-medium">{pkg.shortName || pkg.name}</div>
                  <a
                    href={`https://www.justetf.com/en/etf-profile.html?isin=${pkg.isin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pkg.isin}
                  </a>
                </TableCell>
                <TableCell className="hidden md:table-cell text-right">
                  {pkg.quote ? formatCurrency(pkg.quote.latestQuote) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <span className={isPositiveDaily ? 'text-green-600' : 'text-red-600'}>
                    {pkg.quote ? formatPercentage(dailyChange) : '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-right">
                  <span className={isPositiveDaily ? 'text-green-600' : 'text-red-600'}>
                    {pkg.quote ? formatCurrency(dailyEuroChange) : '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-right">
                  <span className={isPositiveGainValue ? 'text-green-600' : 'text-red-600'}>
                    {formatCurrency(gainLossValue)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={isPositiveGain ? 'text-green-600' : 'text-red-600'}>
                    {formatPercentage(gainLossPercentage)}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}