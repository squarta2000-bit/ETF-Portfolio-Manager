import * as XLSX from 'xlsx'
import { PackageWithQuote } from '../types/etf'

type PackageSnapshot = { packageId: string; isin: string; quote: number; timestamp: string }

// Mirrors the daily % calculation used in PackagesTable/PortfolioSummary
function calculateDailyPercentage(pkg: PackageWithQuote, snapshots: Record<string, PackageSnapshot>): number {
  const snapshot = snapshots[pkg.id]

  if (snapshot && snapshot.quote > 0 && pkg.quote?.latestQuote) {
    const yesterdayValue = snapshot.quote * pkg.quantity
    const currentValue = pkg.quote.latestQuote * pkg.quantity
    return ((currentValue - yesterdayValue) / yesterdayValue) * 100
  } else if (pkg.quote?.dtdPrc !== undefined) {
    return pkg.quote.dtdPrc
  }

  return 0
}

// Mirrors the daily € calculation used in PackagesTable
function calculateDailyEuroAmount(pkg: PackageWithQuote, snapshots: Record<string, PackageSnapshot>): number {
  const snapshot = snapshots[pkg.id]

  if (snapshot && snapshot.quote > 0 && pkg.quote?.latestQuote) {
    const yesterdayValue = snapshot.quote * pkg.quantity
    const currentValue = pkg.quote.latestQuote * pkg.quantity
    return currentValue - yesterdayValue
  } else if (pkg.quote?.latestQuote && pkg.quote?.dtdPrc !== undefined) {
    const currentValue = pkg.quote.latestQuote * pkg.quantity
    return (currentValue * pkg.quote.dtdPrc) / 100
  }

  return 0
}

function buildFileName(now: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`
  const time = `${pad(now.getHours())}.${pad(now.getMinutes())}`
  return `ETF Portfolio ${date} ${time}.xlsx`
}

const CURRENCY_FORMAT = '#,##0.00" €"'
const PERCENT_FORMAT = '0.00"%"'
const DATE_FORMAT = 'dd.mm.yyyy'

const COLUMN_FORMATS: Record<string, string> = {
  'Last Quote': CURRENCY_FORMAT,
  'Daily %': PERCENT_FORMAT,
  'Daily €': CURRENCY_FORMAT,
  'Total Gain/Loss': CURRENCY_FORMAT,
  'Gain/Loss %': PERCENT_FORMAT,
  'Purchase Date': DATE_FORMAT,
  'Purchase Price': CURRENCY_FORMAT,
  Commission: CURRENCY_FORMAT,
  'Total Dividends': CURRENCY_FORMAT,
}

export function exportPackagesToExcel(
  packages: PackageWithQuote[],
  packageSnapshots: Record<string, PackageSnapshot> = {}
) {
  const rows = packages.map((pkg) => {
    const totalDividends = (pkg.dividends || []).reduce((sum, d) => sum + d.amount, 0)

    return {
      Name: pkg.shortName || pkg.name,
      ISIN: pkg.isin,
      'Last Quote': pkg.quote?.latestQuote ?? null,
      'Daily %': pkg.quote ? calculateDailyPercentage(pkg, packageSnapshots) : null,
      'Daily €': pkg.quote ? calculateDailyEuroAmount(pkg, packageSnapshots) : null,
      'Total Gain/Loss': pkg.gainLossValue ?? null,
      'Gain/Loss %': pkg.gainLossPercentage ?? null,
      Quantity: pkg.quantity,
      'Purchase Date': pkg.purchaseDate ? new Date(pkg.purchaseDate) : null,
      'Purchase Price': pkg.purchasePrice,
      Commission: pkg.commission || 0,
      'Total Dividends': totalDividends,
    }
  })

  const headers = Object.keys(rows[0] || {})
  const worksheet = XLSX.utils.json_to_sheet(rows)

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
  for (let col = range.s.c; col <= range.e.c; col++) {
    const format = COLUMN_FORMATS[headers[col]]
    if (!format) continue

    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })]
      if (cell) cell.z = format
    }
  }

  worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(header.length + 2, 12) }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Portfolio')
  XLSX.writeFile(workbook, buildFileName(new Date()))
}
