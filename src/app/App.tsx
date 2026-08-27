import { useState, useEffect } from 'react'
import { Plus, RefreshCw, BarChart3, History, Download } from 'lucide-react'
import { Button } from './components/ui/button'
import { PackagesTable } from './components/PackagesTable'
import { AddEditPackageDialog } from './components/AddEditPackageDialog'
import { PackageDetailDialog } from './components/PackageDetailDialog'
import { PackageDetailPage } from './components/PackageDetailPage'
import { PortfolioSummary } from './components/PortfolioSummary'
import { StatisticsDialog } from './components/StatisticsDialog'
import { StatisticsPage } from './components/StatisticsPage'
import { HistoryDialog } from './components/HistoryDialog'
import { HistoryPage } from './components/HistoryPage'
import { useIsMobile } from './hooks/useIsMobile'
import { exportPackagesToExcel } from './utils/export-to-excel'
import { ETFPackage, PackageWithQuote, ETFQuote } from './types/etf'
import { projectId, publicAnonKey } from './utils/supabase/info'
import { toast } from 'sonner'

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a36e056a`

export default function App() {
  const [packages, setPackages] = useState<PackageWithQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [editPackage, setEditPackage] = useState<ETFPackage | null>(null)
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)
  const [portfolioSnapshot, setPortfolioSnapshot] = useState<{ value: number; timestamp: string } | null>(null)
  const [packageSnapshots, setPackageSnapshots] = useState<Record<string, { packageId: string; isin: string; quote: number; timestamp: string }>>({})
  const isMobile = useIsMobile()

  // Get the current selected package from packages array
  const selectedPackage = selectedPackageId 
    ? packages.find(pkg => pkg.id === selectedPackageId) || null
    : null

  // Fetch packages from server
  const fetchPackages = async () => {
    try {
      console.log('Fetching packages from:', `${API_BASE}/packages`)
      
      const response = await fetch(`${API_BASE}/packages`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout (increased from 10)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Server response not OK:', response.status, errorText)
        throw new Error(`Failed to fetch packages: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Successfully fetched packages:', data.packages?.length || 0)
      return data.packages || []
    } catch (error: any) {
      console.error('Error fetching packages:', error)
      
      // Provide more specific error messages
      if (error.name === 'TimeoutError') {
        toast.error('Connection timeout. The server is taking too long to respond. Please try again.')
      } else if (error.message === 'Failed to fetch') {
        toast.error('Unable to connect to server. Please check your internet connection.')
      } else {
        toast.error('Failed to load portfolio')
      }
      
      return []
    }
  }

  // Fetch quotes in batch with caching
  const fetchQuotesBatch = async (isins: string[], forceRefresh = false): Promise<Map<string, ETFQuote | null>> => {
    try {
      const response = await fetch(`${API_BASE}/quotes/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ isins, forceRefresh }),
      })

      if (!response.ok) {
        console.error('Failed to fetch batch quotes')
        return new Map()
      }

      const data = await response.json()
      
      // Extract raw numeric values from nested structure
      const extractRaw = (value: any): number => {
        if (typeof value === 'number') return value
        if (value && typeof value.raw === 'number') return value.raw
        return 0
      }
      
      const quotesMap = new Map<string, ETFQuote | null>()
      
      for (const item of data.quotes) {
        if (item.quote) {
          quotesMap.set(item.isin, {
            latestQuote: extractRaw(item.quote.latestQuote),
            previousQuote: extractRaw(item.quote.previousQuote),
            dtdPrc: extractRaw(item.quote.dtdPrc),
            dtdAmt: extractRaw(item.quote.dtdAmt),
          })
        } else {
          quotesMap.set(item.isin, null)
        }
      }
      
      // If background refresh is needed, poll for updates after 3 seconds
      if (data.needsRefresh) {
        console.log('Background refresh in progress, will check for updates...')
        setTimeout(() => pollForUpdates(isins), 3000)
      }
      
      return quotesMap
    } catch (error) {
      console.error('Error fetching batch quotes:', error)
      return new Map()
    }
  }

  // Poll for updated quotes after background refresh
  const pollForUpdates = async (isins: string[]) => {
    try {
      const quotesMap = await fetchQuotesBatch(isins)
      
      // Update packages with new quotes
      setPackages(prevPackages => {
        return prevPackages.map(pkg => {
          const quote = quotesMap.get(pkg.isin)
          if (!quote) return pkg
          
          const totalDividends = (pkg.dividends || []).reduce((sum, div) => sum + div.amount, 0)
          const currentValue = quote.latestQuote * pkg.quantity + totalDividends
          const purchaseCost = pkg.purchasePrice * pkg.quantity + (pkg.commission || 0)
          const gainLossValue = currentValue - purchaseCost
          const gainLossPercentage = purchaseCost > 0 ? (gainLossValue / purchaseCost) * 100 : 0
          
          return {
            ...pkg,
            quote,
            currentValue,
            gainLossValue,
            gainLossPercentage,
          }
        })
      })
      
      console.log('✓ Updated with fresh quotes')
    } catch (error) {
      console.error('Error polling for updates:', error)
    }
  }

  // Load packages and their quotes
  const loadPortfolio = async (showToast = false) => {
    if (showToast) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      console.log('Loading portfolio...')
      const pkgs = await fetchPackages()
      
      console.log('Fetched packages count:', pkgs.length)

      // If no packages returned but we're not already showing loading, skip quote fetching
      if (pkgs.length === 0) {
        console.log('No packages to load')
        setPackages([])
        setLastRefreshTime(new Date())
        return
      }

      // Extract all ISINs
      const isins = pkgs.map((pkg: ETFPackage) => pkg.isin)
      
      // Fetch quotes in batch - force refresh if user clicked the refresh button
      const quotesMap = await fetchQuotesBatch(isins, showToast)

      // Combine packages with quotes
      const packagesWithQuotes = pkgs.map((pkg: ETFPackage) => {
        const quote = quotesMap.get(pkg.isin) || null

        const totalDividends = (pkg.dividends || []).reduce((sum, div) => sum + div.amount, 0)
        const currentValue = quote ? (quote.latestQuote * pkg.quantity) + totalDividends : totalDividends
        const purchaseCost = pkg.purchasePrice * pkg.quantity + (pkg.commission || 0)
        const gainLossValue = currentValue - purchaseCost
        const gainLossPercentage = purchaseCost > 0 ? (gainLossValue / purchaseCost) * 100 : 0

        return {
          ...pkg,
          quote,
          currentValue,
          gainLossValue,
          gainLossPercentage,
        }
      })

      // Sort packages by name (or shortName if available)
      const sortedPackages = packagesWithQuotes.sort((a, b) => {
        const nameA = (a.shortName || a.name).toLowerCase()
        const nameB = (b.shortName || b.name).toLowerCase()
        return nameA.localeCompare(nameB)
      })

      console.log('Successfully loaded portfolio with', sortedPackages.length, 'packages')
      console.log('Portfolio packages:', sortedPackages.map(p => ({ name: p.name, currentValue: p.currentValue })))
      setPackages(sortedPackages)
      setLastRefreshTime(new Date())
      
      // Also refresh the snapshot when manually refreshing
      if (showToast) {
        await fetchPortfolioSnapshot()
        await fetchPackageSnapshots()
      }
      
      if (showToast) {
        toast.success('Portfolio refreshed')
      }
    } catch (error: any) {
      console.error('Error loading portfolio:', error)
      // Don't show error toast if this is a background refresh
      if (!showToast) {
        toast.error('Failed to load portfolio')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadPortfolio()
  }, [])

  // Calculate portfolio totals (must be before useEffect hooks that depend on them)
  const totalValue = packages.reduce((sum, pkg) => sum + (pkg.currentValue || 0), 0)
  const totalGainLoss = packages.reduce((sum, pkg) => sum + (pkg.gainLossValue || 0), 0)
  const totalCost = packages.reduce((sum, pkg) => sum + pkg.purchasePrice * pkg.quantity + (pkg.commission || 0), 0)
  const totalGainLossPercentage = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0
  
  // Calculate daily performance based on saved snapshot (if available)
  // Otherwise fall back to API's previous quote
  let totalDailyPercentage = 0
  let totalDailyEuroAmount = 0

  if (portfolioSnapshot && portfolioSnapshot.value > 0) {
    // Use snapshot value for accurate daily calculation
    const dailyChange = totalValue - portfolioSnapshot.value
    totalDailyPercentage = (dailyChange / portfolioSnapshot.value) * 100
    totalDailyEuroAmount = dailyChange
  } else {
    // Fallback to API's previous quote (less reliable)
    const totalPreviousValue = packages.reduce((sum, pkg) => {
      if (pkg.quote?.previousQuote) {
        return sum + (pkg.quote.previousQuote * pkg.quantity)
      }
      return sum + (pkg.currentValue || 0)
    }, 0)
    const totalDailyChange = totalValue - totalPreviousValue
    totalDailyPercentage = totalPreviousValue > 0 ? (totalDailyChange / totalPreviousValue) * 100 : 0
    totalDailyEuroAmount = totalDailyChange
  }

  // Fetch portfolio snapshot from server
  const fetchPortfolioSnapshot = async () => {
    try {
      // Add cache-busting to ensure we get fresh data
      const cacheBuster = `?t=${Date.now()}`
      const response = await fetch(`${API_BASE}/portfolio/snapshot${cacheBuster}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      })

      if (!response.ok) {
        console.error('Failed to fetch portfolio snapshot')
        return
      }

      const data = await response.json()
      if (data.snapshot) {
        setPortfolioSnapshot(data.snapshot)
        console.log('✓ Loaded portfolio snapshot:', data.snapshot)
        console.log(`  Snapshot value: €${data.snapshot.value.toFixed(2)}`)
        console.log(`  Snapshot timestamp: ${data.snapshot.timestamp}`)
      } else {
        console.log('No portfolio snapshot found - will create one at 23:00 CET')
      }
    } catch (error) {
      console.error('Error fetching portfolio snapshot:', error)
    }
  }

  // Fetch package quote snapshots from server
  const fetchPackageSnapshots = async () => {
    try {
      const cacheBuster = `?t=${Date.now()}`
      const response = await fetch(`${API_BASE}/portfolio/package-snapshots${cacheBuster}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      })

      if (!response.ok) {
        console.error('Failed to fetch package snapshots')
        return
      }

      const data = await response.json()
      if (data.snapshots) {
        setPackageSnapshots(data.snapshots)
        console.log(`✓ Loaded ${Object.keys(data.snapshots).length} package snapshots`)
        
        // Debug specific ISIN
        const lu1829219390Snapshot = Object.values(data.snapshots).find((s: any) => s.isin === 'LU1829219390')
        if (lu1829219390Snapshot) {
          console.log('📊 LU1829219390 Snapshot Data:', lu1829219390Snapshot)
        }
      } else {
        console.log('No package snapshots found - will create them at 23:00 CET')
      }
    } catch (error) {
      console.error('Error fetching package snapshots:', error)
    }
  }

  // Ensure snapshot exists and is up-to-date (creates automatically if needed)
  const ensureSnapshot = async (force = false) => {
    try {
      const forceParam = force ? '?force=true' : ''
      console.log(`🔄 ${force ? 'Force regenerating' : 'Ensuring'} snapshot is up-to-date...`)
      const response = await fetch(`${API_BASE}/portfolio/ensure-snapshot${forceParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
      })

      if (!response.ok) {
        console.error('Failed to ensure snapshot')
        return
      }

      const data = await response.json()
      
      if (data.needsUpdate) {
        console.log('✅ Snapshot was created/updated:', data.message)
        // Reload snapshots after update
        await fetchPortfolioSnapshot()
        await fetchPackageSnapshots()
        
        if (force) {
          toast.success('History data refreshed with latest quotes')
        }
      } else {
        console.log('✓ Snapshot is current:', data.message)
        
        // Even if snapshot wasn't updated, reload state when force refreshing
        if (force) {
          await fetchPortfolioSnapshot()
          await fetchPackageSnapshots()
          toast.success('History data refreshed')
        }
      }
    } catch (error) {
      console.error('Error ensuring snapshot:', error)
      if (force) {
        toast.error('Failed to refresh history data')
      }
    }
  }
  
  // Force refresh snapshot - for manual user action
  const forceRefreshSnapshot = async () => {
    await ensureSnapshot(true)
    // Also reload portfolio to get fresh quotes
    await loadPortfolio(false)
  }

  // Check if it's 23:00 CET and create live snapshot
  const createLiveSnapshotAt2300 = async () => {
    try {
      console.log('📸 Attempting to create live snapshot at 23:00 CET...')
      
      const response = await fetch(`${API_BASE}/portfolio/snapshot-live`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
      })

      if (!response.ok) {
        console.error('Failed to create live snapshot')
        return
      }

      const data = await response.json()
      
      if (data.success) {
        console.log('✅ Live snapshot captured successfully at 23:00 CET')
        // Reload snapshots to show the new data
        await fetchPortfolioSnapshot()
        await fetchPackageSnapshots()
      }
    } catch (error) {
      console.error('Error creating live snapshot:', error)
    }
  }

  // Background interval to check for 23:00 CET every minute
  useEffect(() => {
    const checkFor2300 = () => {
      const now = new Date()
      const cetFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      })
      const cetParts = cetFormatter.formatToParts(now)
      const cetHour = parseInt(cetParts.find(p => p.type === 'hour')?.value || '0')
      const cetMinute = parseInt(cetParts.find(p => p.type === 'minute')?.value || '0')
      
      // If it's 23:00 CET (between 23:00 and 23:01)
      if (cetHour === 23 && cetMinute === 0) {
        console.log('🕚 It\'s 23:00 CET! Creating live snapshot...')
        createLiveSnapshotAt2300()
      }
    }

    // Check immediately on mount
    checkFor2300()

    // Check every minute
    const interval = setInterval(checkFor2300, 60 * 1000) // 60 seconds

    return () => clearInterval(interval)
  }, [])

  // Load snapshot on mount
  useEffect(() => {
    const loadSnapshots = async () => {
      // First, ensure we have a valid snapshot for yesterday (will create if needed)
      await ensureSnapshot(false)
      // Then fetch the snapshots
      await fetchPortfolioSnapshot()
      await fetchPackageSnapshots()
    }
    
    loadSnapshots()
  }, [])

  // Listen for browser back/forward navigation on mobile
  useEffect(() => {
    if (!isMobile) return

    const handlePopState = (event: PopStateEvent) => {
      // Check for stats view
      if (event.state?.statsView) {
        setStatsDialogOpen(true)
        return
      }
      
      // Check for history view
      if (event.state?.historyView) {
        setHistoryDialogOpen(true)
        return
      }
      
      // Check for detail view
      if (event.state?.detailView && event.state?.packageId) {
        setSelectedPackageId(event.state.packageId)
        setDetailDialogOpen(true)
        return
      }
      
      // Otherwise close all dialogs
      setStatsDialogOpen(false)
      setHistoryDialogOpen(false)
      setDetailDialogOpen(false)
      setSelectedPackageId(null)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isMobile])

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Auto-refreshing portfolio...')
      loadPortfolio(true)
    }, 15 * 60 * 1000) // 15 minutes in milliseconds

    return () => clearInterval(interval)
  }, [])

  // Refresh when page becomes visible (handles mobile browser tab switching and background)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('Page became visible, checking if reload needed...')
        const now = new Date().getTime()
        const lastRefresh = lastRefreshTime ? lastRefreshTime.getTime() : 0
        const timeSinceLastRefresh = now - lastRefresh
        
        // Always refresh if packages array is empty (app state was lost)
        if (packages.length === 0 && !loading) {
          console.log('Empty state detected, reloading portfolio...')
          await loadPortfolio(true)
          return
        }
        
        // Refresh if more than 5 minutes have passed since last refresh
        if (timeSinceLastRefresh > 5 * 60 * 1000) {
          console.log('Auto-refreshing portfolio (5+ minutes elapsed)...')
          await loadPortfolio(true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Also handle page focus event (additional fallback)
    const handleFocus = async () => {
      if (packages.length === 0 && !loading && document.visibilityState === 'visible') {
        console.log('Page focused with empty state, reloading portfolio...')
        await loadPortfolio(true)
      }
    }
    
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [lastRefreshTime, packages.length, loading])

  // Add or update package
  const handleSavePackage = async (pkg: Partial<ETFPackage>) => {
    try {
      const isEdit = !!pkg.id

      const response = await fetch(
        `${API_BASE}/packages${isEdit ? `/${pkg.id}` : ''}`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(pkg),
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to save package: ${response.statusText}`)
      }

      toast.success(isEdit ? 'Package updated' : 'Package added')
      setEditPackage(null)
      await loadPortfolio()
    } catch (error) {
      console.error('Error saving package:', error)
      toast.error('Failed to save package')
    }
  }

  // Delete package
  const handleDeletePackage = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/packages/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to delete package: ${response.statusText}`)
      }

      toast.success('Package deleted')
      setDetailDialogOpen(false)
      setSelectedPackageId(null)
      await loadPortfolio()
    } catch (error) {
      console.error('Error deleting package:', error)
      toast.error('Failed to delete package')
    }
  }

  // View package details
  const handleViewDetails = (pkg: PackageWithQuote) => {
    setSelectedPackageId(pkg.id)
    setDetailDialogOpen(true)
    
    // On mobile, push a history entry to enable browser back gesture
    if (isMobile) {
      window.history.pushState({ detailView: true, packageId: pkg.id }, '', `#detail-${pkg.id}`)
    }
  }

  // Close detail view (works for both mobile page and desktop dialog)
  const handleCloseDetail = () => {
    setDetailDialogOpen(false)
    setSelectedPackageId(null)
    
    // On mobile, go back in history if we're currently showing a detail
    if (isMobile && window.location.hash.startsWith('#detail-')) {
      window.history.back()
    }
  }

  // Edit package from detail view
  const handleEditFromDetail = (pkg: PackageWithQuote) => {
    setEditPackage(pkg)
    setDetailDialogOpen(false)
    setSelectedPackageId(null)
    setAddDialogOpen(true)
    
    // On mobile, clean up the hash
    if (isMobile && window.location.hash.startsWith('#detail-')) {
      window.history.back()
    }
  }

  // Export packages to Excel
  const handleExportToExcel = async () => {
    try {
      await exportPackagesToExcel(packages, packageSnapshots)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      toast.error('Failed to export portfolio to Excel')
    }
  }

  // Open statistics view
  const handleOpenStats = () => {
    setStatsDialogOpen(true)
    
    // On mobile, push a history entry to enable browser back gesture
    if (isMobile) {
      window.history.pushState({ statsView: true }, '', '#stats')
    }
  }

  // Close statistics view
  const handleCloseStats = () => {
    setStatsDialogOpen(false)
    
    // On mobile, go back in history if we're currently showing stats
    if (isMobile && window.location.hash === '#stats') {
      window.history.back()
    }
  }

  // Open history view
  const handleOpenHistory = () => {
    setHistoryDialogOpen(true)
    
    // On mobile, push a history entry to enable browser back gesture
    if (isMobile) {
      window.history.pushState({ historyView: true }, '', '#history')
    }
  }

  // Close history view
  const handleCloseHistory = () => {
    setHistoryDialogOpen(false)
    
    // On mobile, go back in history if we're currently showing history
    if (isMobile && window.location.hash === '#history') {
      window.history.back()
    }
  }

  // Update dividends for a package
  const handleUpdateDividends = async (packageId: string, dividends: any[]) => {
    try {
      const pkg = packages.find(p => p.id === packageId)
      if (!pkg) return

      const updatedPackage = { ...pkg, dividends }
      
      const response = await fetch(`${API_BASE}/packages/${packageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(updatedPackage),
      })

      if (!response.ok) {
        throw new Error(`Failed to update dividends: ${response.statusText}`)
      }

      // Update the package in state with recalculated performance
      const totalDividends = dividends.reduce((sum, div) => sum + div.amount, 0)
      const marketValue = pkg.quote ? pkg.quote.latestQuote * pkg.quantity : 0
      const currentValue = marketValue + totalDividends
      const purchaseCost = pkg.purchasePrice * pkg.quantity + (pkg.commission || 0)
      const gainLossValue = currentValue - purchaseCost
      const gainLossPercentage = purchaseCost > 0 ? (gainLossValue / purchaseCost) * 100 : 0

      const updatedPackageWithCalcs = {
        ...pkg,
        dividends,
        currentValue,
        gainLossValue,
        gainLossPercentage,
      }

      setPackages(packages.map(p => p.id === packageId ? updatedPackageWithCalcs : p))
      toast.success('Dividends updated')
    } catch (error) {
      console.error('Error updating dividends:', error)
      toast.error('Failed to update dividends')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="size-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your portfolio...</p>
        </div>
      </div>
    )
  }

  // On mobile, show full-page detail view instead of main portfolio
  if (isMobile && detailDialogOpen && selectedPackage) {
    return (
      <PackageDetailPage
        package={selectedPackage}
        onBack={handleCloseDetail}
        onEdit={handleEditFromDetail}
        onDelete={handleDeletePackage}
        onUpdateDividends={handleUpdateDividends}
      />
    )
  }

  // On mobile, show full-page statistics view
  if (isMobile && statsDialogOpen) {
    return (
      <StatisticsPage
        packages={packages}
        onBack={handleCloseStats}
      />
    )
  }

  // On mobile, show full-page history view
  if (isMobile && historyDialogOpen) {
    return (
      <HistoryPage
        packages={packages}
        portfolioSnapshot={portfolioSnapshot}
        packageSnapshots={packageSnapshots}
        currentTotalValue={totalValue}
        onBack={handleCloseHistory}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-normal">ETF Portfolio</h1>
          </div>
          <div className="flex gap-2 md:flex-row flex-col items-end">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => loadPortfolio(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenStats()}
                className="md:order-none order-2"
              >
                <BarChart3 className="size-4 mr-2" />
                Stats
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenHistory()}
                className="md:order-none order-3"
              >
                <History className="size-4 mr-2" />
                History
              </Button>
            </div>
            <Button onClick={() => setAddDialogOpen(true)} className="md:order-none order-1 w-full md:w-auto">
              <Plus className="size-4 mr-2" />
              Add Package
            </Button>
          </div>
        </div>

        {/* Portfolio Summary */}
        {packages.length > 0 && (
          <div className="mb-8">
            <PortfolioSummary
              totalValue={totalValue}
              totalGainLoss={totalGainLoss}
              totalGainLossPercentage={totalGainLossPercentage}
              totalDailyPercentage={totalDailyPercentage}
              totalDailyEuroAmount={totalDailyEuroAmount}
              packages={packages}
              packageSnapshots={packageSnapshots}
              lastRefreshTime={lastRefreshTime}
            />
          </div>
        )}

        {/* Packages List */}
        {packages.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-4 text-muted-foreground">
              <p className="text-xl mb-2">No ETF packages yet</p>
              <p>Start building your portfolio by adding your first ETF package.</p>
            </div>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="size-4 mr-2" />
              Add Your First Package
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2>Your ETF Packages</h2>
              <Button
                variant="outline"
                onClick={() => handleExportToExcel()}
              >
                <Download className="size-4 mr-2" />
                Save to XLS
              </Button>
            </div>
            <PackagesTable
              packages={packages}
              packageSnapshots={packageSnapshots}
              onViewDetails={handleViewDetails}
            />
          </div>
        )}

        {/* Dialogs */}
        <AddEditPackageDialog
          open={addDialogOpen}
          onOpenChange={(open) => {
            setAddDialogOpen(open)
            if (!open) setEditPackage(null)
          }}
          onSave={handleSavePackage}
          editPackage={editPackage}
        />

        {/* Only show dialog on desktop */}
        {!isMobile && (
          <PackageDetailDialog
            open={detailDialogOpen}
            onOpenChange={handleCloseDetail}
            package={selectedPackage}
            onEdit={handleEditFromDetail}
            onDelete={handleDeletePackage}
            onUpdateDividends={handleUpdateDividends}
          />
        )}

        {/* Statistics Dialog */}
        <StatisticsDialog
          open={statsDialogOpen}
          onOpenChange={handleCloseStats}
          packages={packages}
        />

        {/* History Dialog */}
        <HistoryDialog
          open={historyDialogOpen}
          onOpenChange={handleCloseHistory}
          packages={packages}
          portfolioSnapshot={portfolioSnapshot}
          packageSnapshots={packageSnapshots}
          currentTotalValue={totalValue}
        />
      </div>
    </div>
  )
}