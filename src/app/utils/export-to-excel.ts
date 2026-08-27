import ExcelJS from 'exceljs'
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

interface ColumnDef {
  header: string
  key: string
  width: number
  numFmt?: string
}

const COLUMNS: ColumnDef[] = [
  { header: 'Name', key: 'name', width: 20 },
  { header: 'ISIN', key: 'isin', width: 16 },
  { header: 'Last Quote', key: 'lastQuote', width: 14, numFmt: CURRENCY_FORMAT },
  { header: 'Daily %', key: 'dailyPercentage', width: 12, numFmt: PERCENT_FORMAT },
  { header: 'Daily €', key: 'dailyEuro', width: 14, numFmt: CURRENCY_FORMAT },
  { header: 'Total Gain/Loss', key: 'totalGainLoss', width: 16, numFmt: CURRENCY_FORMAT },
  { header: 'Gain/Loss %', key: 'gainLossPercentage', width: 14, numFmt: PERCENT_FORMAT },
  { header: 'Quantity', key: 'quantity', width: 12 },
  { header: 'Purchase Date', key: 'purchaseDate', width: 14, numFmt: DATE_FORMAT },
  { header: 'Purchase Price', key: 'purchasePrice', width: 16, numFmt: CURRENCY_FORMAT },
  { header: 'Commission', key: 'commission', width: 12, numFmt: CURRENCY_FORMAT },
  { header: 'Total Dividends', key: 'totalDividends', width: 16, numFmt: CURRENCY_FORMAT },
]

function downloadWorkbook(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportPackagesToExcel(
  packages: PackageWithQuote[],
  packageSnapshots: Record<string, PackageSnapshot> = {}
) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Portfolio')

  worksheet.columns = COLUMNS.map(({ header, key, width }) => ({ header, key, width }))
  worksheet.getRow(1).font = { bold: true }

  for (const pkg of packages) {
    const totalDividends = (pkg.dividends || []).reduce((sum, d) => sum + d.amount, 0)

    worksheet.addRow({
      name: pkg.shortName || pkg.name,
      isin: pkg.isin,
      lastQuote: pkg.quote?.latestQuote ?? null,
      dailyPercentage: pkg.quote ? calculateDailyPercentage(pkg, packageSnapshots) : null,
      dailyEuro: pkg.quote ? calculateDailyEuroAmount(pkg, packageSnapshots) : null,
      totalGainLoss: pkg.gainLossValue ?? null,
      gainLossPercentage: pkg.gainLossPercentage ?? null,
      quantity: pkg.quantity,
      purchaseDate: pkg.purchaseDate ? new Date(pkg.purchaseDate) : null,
      purchasePrice: pkg.purchasePrice,
      commission: pkg.commission || 0,
      totalDividends,
    })
  }

  for (const { key, numFmt } of COLUMNS) {
    if (numFmt) worksheet.getColumn(key).numFmt = numFmt
  }

  const buffer = await workbook.xlsx.writeBuffer()
  downloadWorkbook(buffer, buildFileName(new Date()))
}
