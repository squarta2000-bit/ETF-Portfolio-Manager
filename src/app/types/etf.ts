export interface Dividend {
  id: string
  date: string
  amount: number
}

export interface ETFPackage {
  id: string
  name: string
  shortName: string
  isin: string
  url?: string
  purchaseDate: string
  type: 'Acc' | 'Dist'
  quantity: number
  purchasePrice: number
  commission: number
  dividends: Dividend[]
  createdAt: string
  updatedAt?: string
}

export interface ETFQuote {
  latestQuote: number
  previousQuote: number
  dtdPrc: number
  dtdAmt: number
}

export interface PackageWithQuote extends ETFPackage {
  quote?: ETFQuote
  currentValue?: number
  gainLossValue?: number
  gainLossPercentage?: number
}