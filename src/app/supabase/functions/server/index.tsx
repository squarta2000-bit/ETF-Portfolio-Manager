import { Hono } from 'npm:hono'
import { cors } from 'npm:hono/cors'
import { logger } from 'npm:hono/logger'
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as kv from './kv_store.tsx'

const app = new Hono()

app.use('*', cors())
app.use('*', logger(console.log))

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Get all ETF packages
app.get('/make-server-a36e056a/packages', async (c) => {
  try {
    console.log('Fetching packages from KV store...')
    const startTime = Date.now()
    const packages = await kv.getByPrefix('package:')
    const endTime = Date.now()
    console.log(`✓ Fetched ${packages.length} packages in ${endTime - startTime}ms`)
    return c.json({ packages })
  } catch (error) {
    console.error('Error fetching packages from database:', error)
    return c.json({ error: 'Failed to fetch packages', details: String(error) }, 500)
  }
})

// Get a single package by ID
app.get('/make-server-a36e056a/packages/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const pkg = await kv.get(`package:${id}`)
    
    if (!pkg) {
      return c.json({ error: 'Package not found' }, 404)
    }
    
    return c.json({ package: pkg })
  } catch (error) {
    console.error('Error fetching package from database:', error)
    return c.json({ error: 'Failed to fetch package', details: String(error) }, 500)
  }
})

// Create a new package
app.post('/make-server-a36e056a/packages', async (c) => {
  try {
    const body = await c.req.json()
    const { name, shortName, isin, url, purchaseDate, type, quantity, purchasePrice, commission, dividends } = body
    
    if (!name || !shortName || !isin || !purchaseDate || !quantity || !purchasePrice) {
      return c.json({ error: 'Missing required fields' }, 400)
    }
    
    const id = crypto.randomUUID()
    const pkg = {
      id,
      name,
      shortName,
      isin,
      url: url || undefined,
      purchaseDate,
      type: type || 'Acc',
      quantity: Number(quantity),
      purchasePrice: Number(purchasePrice),
      commission: Number(commission) || 0,
      dividends: dividends || [],
      createdAt: new Date().toISOString()
    }
    
    await kv.set(`package:${id}`, pkg)
    return c.json({ package: pkg })
  } catch (error) {
    console.error('Error creating package in database:', error)
    return c.json({ error: 'Failed to create package', details: String(error) }, 500)
  }
})

// Update a package
app.put('/make-server-a36e056a/packages/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { name, shortName, isin, url, purchaseDate, type, quantity, purchasePrice, commission, dividends } = body
    
    const existing = await kv.get(`package:${id}`)
    if (!existing) {
      return c.json({ error: 'Package not found' }, 404)
    }
    
    const pkg = {
      ...existing,
      name,
      shortName: shortName || existing.shortName || name,
      isin,
      url: url || undefined,
      purchaseDate,
      type: type || 'Acc',
      quantity: Number(quantity),
      purchasePrice: Number(purchasePrice),
      commission: Number(commission) || 0,
      dividends: dividends || existing.dividends || [],
      updatedAt: new Date().toISOString()
    }
    
    await kv.set(`package:${id}`, pkg)
    return c.json({ package: pkg })
  } catch (error) {
    console.error('Error updating package in database:', error)
    return c.json({ error: 'Failed to update package', details: String(error) }, 500)
  }
})

// Delete a package
app.delete('/make-server-a36e056a/packages/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await kv.del(`package:${id}`)
    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting package from database:', error)
    return c.json({ error: 'Failed to delete package', details: String(error) }, 500)
  }
})

// Cache for failed quotes to avoid repeated API calls
const failedQuotesCache = new Map<string, number>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const QUOTE_CACHE_DURATION = 2 * 60 * 1000 // 2 minutes for quote cache (reduced from 15)

// Helper function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper function to fetch quote from JustETF API with retry logic
async function fetchQuoteFromAPI(isin: string, retries = 3): Promise<any> {
  const url = `https://www.justetf.com/api/etfs/${isin}/quote?locale=en&currency=EUR`
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add delay before request (except first attempt) to avoid rate limiting
      if (attempt > 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 2), 5000) // Exponential backoff: 1s, 2s, 4s
        console.log(`  Retry ${attempt}/${retries} for ${isin} after ${delay}ms delay...`)
        await sleep(delay)
      }
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.justetf.com/',
          'Origin': 'https://www.justetf.com'
        },
        signal: AbortSignal.timeout(15000) // Increased timeout to 15 seconds
      })
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error: any) {
      if (attempt === retries) {
        // Final attempt failed, throw the error
        throw error
      }
      // Continue to next retry
      console.log(`  Attempt ${attempt}/${retries} failed for ${isin}: ${error.message}`)
    }
  }
  
  throw new Error(`Failed after ${retries} attempts`)
}

// New endpoint: Get cached quotes for all ISINs, with background refresh
app.post('/make-server-a36e056a/quotes/batch', async (c) => {
  try {
    const body = await c.req.json()
    const { isins, forceRefresh } = body
    
    if (!Array.isArray(isins) || isins.length === 0) {
      return c.json({ error: 'Invalid ISINs array' }, 400)
    }
    
    const now = Date.now()
    const results: any[] = []
    const needsRefresh: string[] = []
    
    // If forceRefresh is true, mark all ISINs for refresh
    if (forceRefresh) {
      console.log(`Force refresh requested for ${isins.length} quotes`)
      needsRefresh.push(...isins)
    }
    
    // Get all cached quotes
    for (const isin of isins) {
      const cached = await kv.get(`quote:${isin}`)
      
      if (cached && cached.data) {
        results.push({
          isin,
          quote: cached.data,
          cached: true,
          age: now - cached.timestamp
        })
        
        // Check if cache is stale (older than 2 minutes) and not already marked for refresh
        if (!forceRefresh && now - cached.timestamp > QUOTE_CACHE_DURATION) {
          needsRefresh.push(isin)
        }
      } else {
        // No cache, needs refresh
        if (!needsRefresh.includes(isin)) {
          needsRefresh.push(isin)
        }
        results.push({
          isin,
          quote: null,
          cached: false
        })
      }
    }
    
    // Trigger background refresh for stale quotes (don't await - fire and forget)
    if (needsRefresh.length > 0) {
      console.log(`Background refresh needed for ${needsRefresh.length} quotes`)
      // Use queueMicrotask or Promise to ensure it runs after response is sent
      Promise.resolve().then(() => refreshQuotesInBackground(needsRefresh))
    }
    
    // Return cached data immediately
    return c.json({
      quotes: results,
      needsRefresh: needsRefresh.length > 0
    })
  } catch (error) {
    console.error('Error in batch quotes endpoint:', error)
    return c.json({ error: 'Failed to fetch quotes', details: String(error) }, 500)
  }
})

// Background refresh function
async function refreshQuotesInBackground(isins: string[]) {
  console.log(`Starting background refresh for ${isins.length} quotes...`)
  
  for (const isin of isins) {
    try {
      // Check if this ISIN failed recently
      const cachedFailTime = failedQuotesCache.get(isin)
      if (cachedFailTime && Date.now() - cachedFailTime < CACHE_DURATION) {
        console.log(`Skipping ${isin} - recently failed`)
        continue
      }
      
      const quoteData = await fetchQuoteFromAPI(isin)
      
      // Store in cache
      await kv.set(`quote:${isin}`, {
        data: quoteData,
        timestamp: Date.now(),
        isin
      })
      
      // Remove from failed cache if it was there
      failedQuotesCache.delete(isin)
      console.log(`✓ Refreshed and cached quote for ${isin}`)
      
    } catch (error: any) {
      // Cache the failure
      failedQuotesCache.set(isin, Date.now())
      console.error(`✗ Failed to refresh quote for ${isin}:`, error.message)
    }
  }
  
  console.log(`Background refresh completed for ${isins.length} quotes`)
}

// Get fresh quotes endpoint (for manual refresh)
app.post('/make-server-a36e056a/quotes/refresh', async (c) => {
  try {
    const body = await c.req.json()
    const { isins } = body
    
    if (!Array.isArray(isins) || isins.length === 0) {
      return c.json({ error: 'Invalid ISINs array' }, 400)
    }
    
    await refreshQuotesInBackground(isins)
    
    // Get updated quotes from cache
    const results = await Promise.all(
      isins.map(async (isin) => {
        const cached = await kv.get(`quote:${isin}`)
        return {
          isin,
          quote: cached?.data || null,
          timestamp: cached?.timestamp || null
        }
      })
    )
    
    return c.json({ quotes: results })
  } catch (error) {
    console.error('Error in refresh endpoint:', error)
    return c.json({ error: 'Failed to refresh quotes', details: String(error) }, 500)
  }
})

// Save daily portfolio snapshot (at 23:00 CET)
app.post('/make-server-a36e056a/portfolio/snapshot', async (c) => {
  try {
    const body = await c.req.json()
    const { totalValue, packageQuotes } = body
    
    if (typeof totalValue !== 'number') {
      return c.json({ error: 'Invalid totalValue' }, 400)
    }
    
    const timestamp = new Date().toISOString()
    
    const snapshot = {
      value: totalValue,
      timestamp: timestamp,
      savedAt: Date.now()
    }
    
    await kv.set('portfolio_snapshot', snapshot)
    console.log(`✓ Saved portfolio snapshot: €${totalValue.toFixed(2)} at ${timestamp}`)
    
    // Save individual package quotes for daily % calculation
    if (Array.isArray(packageQuotes) && packageQuotes.length > 0) {
      console.log(`💾 Saving ${packageQuotes.length} package quote snapshots...`)
      
      for (const pkgQuote of packageQuotes) {
        const packageSnapshot = {
          packageId: pkgQuote.packageId,
          isin: pkgQuote.isin,
          quote: pkgQuote.quote,
          timestamp: timestamp,
          savedAt: Date.now()
        }
        
        await kv.set(`package_snapshot:${pkgQuote.packageId}`, packageSnapshot)
        console.log(`  ✓ Saved snapshot for package ${pkgQuote.packageId} (${pkgQuote.isin}): quote=${pkgQuote.quote}`)
      }
    }
    
    return c.json({ success: true, snapshot })
  } catch (error) {
    console.error('Error saving portfolio snapshot:', error)
    return c.json({ error: 'Failed to save snapshot', details: String(error) }, 500)
  }
})

// Manually set portfolio snapshot with custom timestamp (for testing/backfill)
app.post('/make-server-a36e056a/portfolio/snapshot/manual', async (c) => {
  try {
    const body = await c.req.json()
    const { totalValue, timestamp } = body
    
    if (typeof totalValue !== 'number') {
      return c.json({ error: 'Invalid totalValue' }, 400)
    }
    
    if (!timestamp) {
      return c.json({ error: 'timestamp is required' }, 400)
    }
    
    const snapshot = {
      value: totalValue,
      timestamp: timestamp,
      savedAt: Date.now()
    }
    
    await kv.set('portfolio_snapshot', snapshot)
    console.log(`✓ Manually saved portfolio snapshot: €${totalValue.toFixed(2)} at ${timestamp}`)
    
    return c.json({ success: true, snapshot })
  } catch (error) {
    console.error('Error saving manual portfolio snapshot:', error)
    return c.json({ error: 'Failed to save snapshot', details: String(error) }, 500)
  }
})

// Get latest portfolio snapshot
app.get('/make-server-a36e056a/portfolio/snapshot', async (c) => {
  try {
    const snapshot = await kv.get('portfolio_snapshot')
    
    if (!snapshot) {
      return c.json({ snapshot: null })
    }
    
    return c.json({ snapshot })
  } catch (error) {
    console.error('Error fetching portfolio snapshot:', error)
    return c.json({ error: 'Failed to fetch snapshot', details: String(error) }, 500)
  }
})

// Get package quote snapshots for all packages
app.get('/make-server-a36e056a/portfolio/package-snapshots', async (c) => {
  try {
    const snapshots = await kv.getByPrefix('package_snapshot:')
    
    // Convert array to map keyed by packageId for easy lookup
    const snapshotsMap: Record<string, any> = {}
    for (const snapshot of snapshots) {
      if (snapshot.packageId) {
        snapshotsMap[snapshot.packageId] = snapshot
      }
    }
    
    return c.json({ snapshots: snapshotsMap })
  } catch (error) {
    console.error('Error fetching package snapshots:', error)
    return c.json({ error: 'Failed to fetch package snapshots', details: String(error) }, 500)
  }
})

// Check if snapshot needs updating and create/update it automatically
app.post('/make-server-a36e056a/portfolio/ensure-snapshot', async (c) => {
  try {
    // Check if force parameter is set
    const url = new URL(c.req.url)
    const forceRefresh = url.searchParams.get('force') === 'true'
    
    if (forceRefresh) {
      console.log('🔄 Force refresh requested, will regenerate snapshot')
    } else {
      console.log('🔍 Checking if snapshot needs updating...')
    }
    
    // Get current snapshot
    const currentSnapshot = await kv.get('portfolio_snapshot')
    
    // Get current time in CET
    const now = new Date()
    const cetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    })
    const cetParts = cetFormatter.formatToParts(now)
    const cetYear = parseInt(cetParts.find(p => p.type === 'year')?.value || '0')
    const cetMonth = parseInt(cetParts.find(p => p.type === 'month')?.value || '0')
    const cetDate = parseInt(cetParts.find(p => p.type === 'day')?.value || '0')
    
    // Calculate yesterday's CET date (formatToParts returns month as 1-12, not 0-11)
    const yesterdayCETDate = cetDate - 1
    const yesterdayCETMonth = cetMonth
    const yesterdayCETYear = cetYear
    
    // Create yesterday's day key for comparison (use actual month numbers, not 0-indexed)
    const yesterdayDayKey = `${yesterdayCETYear}-${String(yesterdayCETMonth).padStart(2, '0')}-${String(yesterdayCETDate).padStart(2, '0')}`
    
    // Calculate what "yesterday at 23:00 CET" is in UTC
    // Create a date object for yesterday at 23:00 in CET timezone
    // We need to account for the CET/CEST offset (UTC+1 or UTC+2)
    const tempDate = new Date(cetYear, cetMonth - 1, cetDate - 1, 12, 0, 0, 0) // noon local time
    const tempCETStr = tempDate.toLocaleString('en-US', { 
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    // Now create the actual timestamp for yesterday 23:00 CET
    // Format: "04/13/2026, 23:00:00" for yesterday at 23:00 CET
    const parts = tempCETStr.split(', ')[0].split('/')
    const yesterdayAt23CET = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}T23:00:00`
    
    // Parse this as a local time, then get offset to convert to UTC
    // Create date in CET/CEST by using a formatter to convert
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    // Create a test date for yesterday at 23:00 to determine offset
    const testYesterday = new Date(`${yesterdayCETYear}-${String(yesterdayCETMonth).padStart(2, '0')}-${String(yesterdayCETDate).padStart(2, '0')}T23:00:00`)
    const testOffset = testYesterday.getTimezoneOffset() // Server's offset in minutes
    
    // Get what 23:00 would be in the server's timezone on that date
    // Then adjust for CET offset (CET is typically UTC+1 or UTC+2)
    // Simpler approach: manually construct the ISO string for yesterday 23:00 CET
    
    // CET is UTC+1 in winter, UTC+2 in summer
    // Yesterday 23:00 CET = Yesterday 22:00 UTC (winter) or 21:00 UTC (summer)
    // Detect DST by checking if a summer date has different offset than winter date
    const jan1 = new Date(yesterdayCETYear, 0, 1)
    const jul1 = new Date(yesterdayCETYear, 6, 1)
    const jan1CET = new Date(jan1.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    const jul1CET = new Date(jul1.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    
    // Actually, let's use a much simpler approach:
    // Create the ISO string directly for yesterday at 23:00 CET
    // and let the comparison use the same parsing method
    const yesterdayHour = 23
    const isDST = cetMonth >= 3 && cetMonth <= 10 // Rough DST check (April-October)
    const utcHour = isDST ? yesterdayHour - 2 : yesterdayHour - 1 // CET is UTC+1, CEST is UTC+2
    
    // Create the UTC timestamp for yesterday at 23:00 CET
    const yesterdayDate = new Date(Date.UTC(
      yesterdayCETYear,
      yesterdayCETMonth - 1, // Month is 0-indexed in Date constructor
      yesterdayCETDate,
      utcHour,
      0,
      0,
      0
    ))
    const yesterdayTimestamp = yesterdayDate.toISOString()
    
    // Check if we need to create/update snapshot
    let needsUpdate = forceRefresh // Force if requested
    let reason = forceRefresh ? 'Force refresh requested' : ''
    
    if (!forceRefresh) {
      if (!currentSnapshot) {
        needsUpdate = true
        reason = 'No snapshot exists'
      } else {
        // Check if snapshot has expired based on TIME, not calendar date
        // Snapshot is valid until the NEXT 23:00 CET after it was saved
        
        const savedAtMs = currentSnapshot.savedAt || Date.now()
        const savedAtDate = new Date(savedAtMs)
        
        // Get CET time when snapshot was saved
        const savedCETFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false
        })
        const savedCETParts = savedCETFormatter.formatToParts(savedAtDate)
        const savedCETYear = parseInt(savedCETParts.find(p => p.type === 'year')?.value || '0')
        const savedCETMonth = parseInt(savedCETParts.find(p => p.type === 'month')?.value || '0')
        const savedCETDay = parseInt(savedCETParts.find(p => p.type === 'day')?.value || '0')
        const savedCETHour = parseInt(savedCETParts.find(p => p.type === 'hour')?.value || '0')
        const savedCETMinute = parseInt(savedCETParts.find(p => p.type === 'minute')?.value || '0')
        
        // Calculate when this snapshot expires (next 23:00 CET after it was saved)
        let expiryDay = savedCETDay
        let expiryMonth = savedCETMonth
        let expiryYear = savedCETYear
        
        // If saved before 23:00, expires at 23:00 same day
        // If saved at or after 23:00, expires at 23:00 next day
        if (savedCETHour >= 23) {
          // Expires tomorrow at 23:00
          expiryDay += 1
          // Handle month/year rollover
          const daysInMonth = new Date(expiryYear, expiryMonth, 0).getDate()
          if (expiryDay > daysInMonth) {
            expiryDay = 1
            expiryMonth += 1
            if (expiryMonth > 12) {
              expiryMonth = 1
              expiryYear += 1
            }
          }
        }
        // else: Expires today at 23:00
        
        // Get current CET time components (already calculated above)
        const currentCETHour = parseInt(cetParts.find(p => p.type === 'hour')?.value || '0')
        const currentCETMinute = parseInt(cetParts.find(p => p.type === 'minute')?.value || '0')
        
        // Create comparable keys for date and time
        const currentDayKey = `${cetYear}-${String(cetMonth).padStart(2, '0')}-${String(cetDate).padStart(2, '0')}`
        const expiryDayKey = `${expiryYear}-${String(expiryMonth).padStart(2, '0')}-${String(expiryDay).padStart(2, '0')}`
        
        const currentTimeMinutes = currentCETHour * 60 + currentCETMinute
        const expiryTimeMinutes = 23 * 60 // 23:00 = 1380 minutes
        
        console.log(`  Snapshot saved at: Day ${savedCETYear}-${String(savedCETMonth).padStart(2, '0')}-${String(savedCETDay).padStart(2, '0')} ${String(savedCETHour).padStart(2, '0')}:${String(savedCETMinute).padStart(2, '0')} CET`)
        console.log(`  Snapshot expires at: Day ${expiryDayKey} 23:00 CET`)
        console.log(`  Current time: Day ${currentDayKey} ${String(currentCETHour).padStart(2, '0')}:${String(currentCETMinute).padStart(2, '0')} CET`)
        
        // Check if current time >= expiry time
        if (currentDayKey > expiryDayKey || (currentDayKey === expiryDayKey && currentTimeMinutes >= expiryTimeMinutes)) {
          needsUpdate = true
          reason = `Snapshot expired (saved at ${savedCETDay}.${String(savedCETMonth).padStart(2, '0')}.${savedCETYear} ${String(savedCETHour).padStart(2, '0')}:${String(savedCETMinute).padStart(2, '0')}, expires at ${expiryDayKey} 23:00)`
        } else {
          // Also check maximum age (24 hours)
          const ageHours = (Date.now() - savedAtMs) / (1000 * 60 * 60)
          if (ageHours > 24) {
            needsUpdate = true
            reason = `Snapshot too old (${ageHours.toFixed(1)} hours)`
          }
        }
      }
    }
    
    if (!needsUpdate) {
      console.log('✓ Snapshot is up to date, no action needed')
      console.log(`  Using snapshot from ${currentSnapshot.timestamp}`)
      return c.json({ 
        needsUpdate: false, 
        snapshot: currentSnapshot,
        message: 'Snapshot is current'
      })
    }
    
    console.log(`⚠️ Snapshot needs update: ${reason}`)
    console.log('📊 Creating snapshot using API previousQuote data...')
    
    // Get all packages
    const packages = await kv.getByPrefix('package:')
    
    if (packages.length === 0) {
      console.log('⚠️ No packages found, skipping snapshot creation')
      return c.json({ 
        needsUpdate: false, 
        message: 'No packages to snapshot'
      })
    }
    
    // Get unique ISINs only (avoid duplicates)
    const isins = [...new Set(packages.map(pkg => pkg.isin))]
    
    // Fetch current quotes (which include previousQuote)
    let totalPreviousValue = 0
    const packageQuotes: any[] = []
    
    console.log(`📥 Fetching quotes for ${isins.length} unique ISINs (${packages.length} total packages)...`)
    
    for (let i = 0; i < isins.length; i++) {
      const isin = isins[i]
      
      try {
        // Add small delay between requests to avoid rate limiting (except first request)
        if (i > 0) {
          await sleep(500) // 500ms delay between requests
        }
        
        const cached = await kv.get(`quote:${isin}`)
        let quoteData = cached?.data
        
        // Always fetch fresh data for snapshot creation (don't use old cache)
        console.log(`  Fetching fresh quote for ${isin}`)
        
        try {
          quoteData = await fetchQuoteFromAPI(isin)
          
          // Update cache with fresh data
          await kv.set(`quote:${isin}`, {
            data: quoteData,
            timestamp: Date.now(),
            isin
          })
          console.log(`  ✓ Fetched fresh quote for ${isin}`)
        } catch (fetchError: any) {
          console.error(`  ⚠️ Failed to fetch fresh quote for ${isin}: ${fetchError.message}`)
          
          // Fall back to cached data if available
          if (cached?.data) {
            console.log(`  ℹ️ Using cached quote for ${isin} (age: ${((Date.now() - cached.timestamp) / 1000 / 60).toFixed(1)} minutes)`)
            quoteData = cached.data
          } else {
            console.error(`  ✗ No cached data available for ${isin}, skipping`)
            throw fetchError
          }
        }
        
        if (quoteData && quoteData.previousQuote) {
          // Find ALL packages with this ISIN (not just the first one)
          const packagesWithIsin = packages.filter(p => p.isin === isin)
          
          for (const pkg of packagesWithIsin) {
            // Extract the raw numeric value from previousQuote
            const previousQuote = typeof quoteData.previousQuote === 'number' 
              ? quoteData.previousQuote 
              : quoteData.previousQuote?.raw || 0
            
            const previousValue = previousQuote * pkg.quantity
            totalPreviousValue += previousValue
            
            packageQuotes.push({
              packageId: pkg.id,
              isin: pkg.isin,
              quote: previousQuote
            })
            
            console.log(`  ✓ ${isin} (pkg ${pkg.id}): previousQuote=${previousQuote}, quantity=${pkg.quantity}, value=${previousValue.toFixed(2)}`)
          }
        } else {
          console.error(`  ✗ No previousQuote data available for ${isin}`)
        }
      } catch (error: any) {
        console.error(`  ✗ Failed to process quote for ${isin}:`, error.message)
        // Continue to next ISIN - the package(s) with this ISIN won't be included
      }
    }
    
    if (totalPreviousValue === 0) {
      console.log('⚠️ Could not calculate previous portfolio value, skipping snapshot')
      return c.json({ 
        needsUpdate: false, 
        message: 'Could not fetch quote data'
      })
    }
    
    // Save the snapshot with yesterday's timestamp
    const snapshot = {
      value: totalPreviousValue,
      timestamp: yesterdayTimestamp,
      savedAt: Date.now(),
      autoCreated: true
    }
    
    await kv.set('portfolio_snapshot', snapshot)
    console.log(`✓ Saved portfolio snapshot: €${totalPreviousValue.toFixed(2)} for ${yesterdayTimestamp}`)
    
    // Save individual package snapshots
    console.log(`💾 Saving ${packageQuotes.length} package snapshots...`)
    for (const pkgQuote of packageQuotes) {
      const packageSnapshot = {
        packageId: pkgQuote.packageId,
        isin: pkgQuote.isin,
        quote: pkgQuote.quote,
        timestamp: yesterdayTimestamp,
        savedAt: Date.now(),
        autoCreated: true
      }
      
      await kv.set(`package_snapshot:${pkgQuote.packageId}`, packageSnapshot)
      console.log(`  ✓ Saved snapshot for package ${pkgQuote.packageId}`)
    }
    
    console.log('✅ Snapshot creation complete')
    
    return c.json({ 
      needsUpdate: true, 
      snapshot,
      packagesUpdated: packageQuotes.length,
      message: 'Snapshot created successfully'
    })
  } catch (error) {
    console.error('Error ensuring snapshot:', error)
    return c.json({ error: 'Failed to ensure snapshot', details: String(error) }, 500)
  }
})

// Endpoint to create snapshot at 23:00 with LIVE values
app.post('/make-server-a36e056a/portfolio/snapshot-live', async (c) => {
  try {
    console.log('📸 Creating LIVE snapshot at 23:00 CET...')
    
    // Get current time in CET
    const now = new Date()
    const cetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    })
    const cetParts = cetFormatter.formatToParts(now)
    const cetYear = parseInt(cetParts.find(p => p.type === 'year')?.value || '0')
    const cetMonth = parseInt(cetParts.find(p => p.type === 'month')?.value || '0')
    const cetDate = parseInt(cetParts.find(p => p.type === 'day')?.value || '0')
    
    // Create snapshot timestamp for today at 23:00 CET in UTC
    // CET is UTC+1 in winter, UTC+2 in summer (CEST)
    const isDST = cetMonth >= 3 && cetMonth <= 10 // Rough DST check (April-October)
    const utcHour = isDST ? 23 - 2 : 23 - 1 // Convert 23:00 CET to UTC
    
    const snapshotTime = new Date(Date.UTC(
      cetYear,
      cetMonth - 1, // Month is 0-indexed in Date constructor
      cetDate,
      utcHour,
      0,
      0,
      0
    ))
    const snapshotTimestamp = snapshotTime.toISOString()
    
    // Get all packages
    const packages = await kv.getByPrefix('package:')
    
    if (packages.length === 0) {
      return c.json({ success: false, message: 'No packages to snapshot' })
    }
    
    // Get unique ISINs
    const isins = [...new Set(packages.map(pkg => pkg.isin))]
    
    // Calculate total portfolio value using CURRENT latestQuote values
    let totalValue = 0
    const packageSnapshots: any[] = []
    
    console.log(`📥 Fetching LIVE quotes for ${isins.length} unique ISINs...`)
    
    for (const isin of isins) {
      try {
        // Get cached quote (should be fresh from recent refresh)
        const cached = await kv.get(`quote:${isin}`)
        const quoteData = cached?.data
        
        if (quoteData && quoteData.latestQuote) {
          // Find ALL packages with this ISIN
          const packagesWithIsin = packages.filter(p => p.isin === isin)
          
          for (const pkg of packagesWithIsin) {
            // Extract the raw numeric value from latestQuote
            const latestQuote = typeof quoteData.latestQuote === 'number' 
              ? quoteData.latestQuote 
              : quoteData.latestQuote?.raw || 0
            
            // Calculate total dividends for this package
            const totalDividends = (pkg.dividends || []).reduce((sum, div) => sum + div.amount, 0)
            
            // IMPORTANT: Calculate value as (quote × quantity) + dividends (same as displayed currentValue)
            const packageValue = (latestQuote * pkg.quantity) + totalDividends
            totalValue += packageValue
            
            packageSnapshots.push({
              packageId: pkg.id,
              isin: pkg.isin,
              quote: latestQuote,
              dividends: totalDividends,
              value: packageValue // Store the calculated value for verification
            })
            
            console.log(`  ✓ ${isin} (pkg ${pkg.id}): latestQuote=${latestQuote}, quantity=${pkg.quantity}, dividends=${totalDividends.toFixed(2)}, value=${packageValue.toFixed(2)}`)
          }
        } else {
          console.error(`  ✗ No quote data available for ${isin}`)
        }
      } catch (error: any) {
        console.error(`  ✗ Failed to process quote for ${isin}:`, error.message)
      }
    }
    
    if (totalValue === 0) {
      console.log('⚠️ Could not calculate portfolio value')
      return c.json({ success: false, message: 'Could not calculate portfolio value' })
    }
    
    // Save the snapshot with today's 23:00 timestamp
    const snapshot = {
      value: totalValue,
      timestamp: snapshotTimestamp,
      savedAt: Date.now(),
      liveCapture: true // Mark as live capture at 23:00
    }
    
    await kv.set('portfolio_snapshot', snapshot)
    console.log(`✓ Saved LIVE portfolio snapshot: €${totalValue.toFixed(2)} for ${snapshotTimestamp}`)
    
    // Save individual package snapshots
    console.log(`💾 Saving ${packageSnapshots.length} package snapshots...`)
    for (const pkgSnap of packageSnapshots) {
      const packageSnapshot = {
        packageId: pkgSnap.packageId,
        isin: pkgSnap.isin,
        quote: pkgSnap.quote,
        timestamp: snapshotTimestamp,
        savedAt: Date.now(),
        liveCapture: true
      }
      
      await kv.set(`package_snapshot:${pkgSnap.packageId}`, packageSnapshot)
      console.log(`  ✓ Saved snapshot for package ${pkgSnap.packageId}`)
    }
    
    console.log('✅ LIVE snapshot creation complete')
    
    return c.json({ 
      success: true,
      snapshot,
      packagesUpdated: packageSnapshots.length,
      message: 'Live snapshot captured successfully'
    })
  } catch (error) {
    console.error('Error creating live snapshot:', error)
    return c.json({ error: 'Failed to create live snapshot', details: String(error) }, 500)
  }
})

// Endpoint to ensure snapshot exists and is valid for yesterday at 23:00
app.post('/make-server-a36e056a/portfolio/ensure-snapshot-yesterday', async (c) => {
  try {
    // Check if force parameter is set
    const url = new URL(c.req.url)
    const forceRefresh = url.searchParams.get('force') === 'true'
    
    if (forceRefresh) {
      console.log('🔄 Force refresh requested, will regenerate snapshot')
    } else {
      console.log('🔍 Checking if snapshot needs updating...')
    }
    
    // Get current snapshot
    const currentSnapshot = await kv.get('portfolio_snapshot')
    
    // Get current time in CET
    const now = new Date()
    const cetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    })
    const cetParts = cetFormatter.formatToParts(now)
    const cetYear = parseInt(cetParts.find(p => p.type === 'year')?.value || '0')
    const cetMonth = parseInt(cetParts.find(p => p.type === 'month')?.value || '0')
    const cetDate = parseInt(cetParts.find(p => p.type === 'day')?.value || '0')
    
    // Calculate yesterday's CET date (formatToParts returns month as 1-12, not 0-11)
    const yesterdayCETDate = cetDate - 1
    const yesterdayCETMonth = cetMonth
    const yesterdayCETYear = cetYear
    
    // Create yesterday's day key for comparison (use actual month numbers, not 0-indexed)
    const yesterdayDayKey = `${yesterdayCETYear}-${String(yesterdayCETMonth).padStart(2, '0')}-${String(yesterdayCETDate).padStart(2, '0')}`
    
    // Calculate what "yesterday at 23:00 CET" is in UTC
    // Create a date object for yesterday at 23:00 in CET timezone
    // We need to account for the CET/CEST offset (UTC+1 or UTC+2)
    const tempDate = new Date(cetYear, cetMonth - 1, cetDate - 1, 12, 0, 0, 0) // noon local time
    const tempCETStr = tempDate.toLocaleString('en-US', { 
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    // Now create the actual timestamp for yesterday 23:00 CET
    // Format: "04/13/2026, 23:00:00" for yesterday at 23:00 CET
    const parts = tempCETStr.split(', ')[0].split('/')
    const yesterdayAt23CET = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}T23:00:00`
    
    // Parse this as a local time, then get offset to convert to UTC
    // Create date in CET/CEST by using a formatter to convert
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    // Create a test date for yesterday at 23:00 to determine offset
    const testYesterday = new Date(`${yesterdayCETYear}-${String(yesterdayCETMonth).padStart(2, '0')}-${String(yesterdayCETDate).padStart(2, '0')}T23:00:00`)
    const testOffset = testYesterday.getTimezoneOffset() // Server's offset in minutes
    
    // Get what 23:00 would be in the server's timezone on that date
    // Then adjust for CET offset (CET is typically UTC+1 or UTC+2)
    // Simpler approach: manually construct the ISO string for yesterday 23:00 CET
    
    // CET is UTC+1 in winter, UTC+2 in summer
    // Yesterday 23:00 CET = Yesterday 22:00 UTC (winter) or 21:00 UTC (summer)
    // Detect DST by checking if a summer date has different offset than winter date
    const jan1 = new Date(yesterdayCETYear, 0, 1)
    const jul1 = new Date(yesterdayCETYear, 6, 1)
    const jan1CET = new Date(jan1.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    const jul1CET = new Date(jul1.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    
    // Actually, let's use a much simpler approach:
    // Create the ISO string directly for yesterday at 23:00 CET
    // and let the comparison use the same parsing method
    const yesterdayHour = 23
    const isDST = cetMonth >= 3 && cetMonth <= 10 // Rough DST check (April-October)
    const utcHour = isDST ? yesterdayHour - 2 : yesterdayHour - 1 // CET is UTC+1, CEST is UTC+2
    
    // Create the UTC timestamp for yesterday at 23:00 CET
    const yesterdayDate = new Date(Date.UTC(
      yesterdayCETYear,
      yesterdayCETMonth - 1, // Month is 0-indexed in Date constructor
      yesterdayCETDate,
      utcHour,
      0,
      0,
      0
    ))
    const yesterdayTimestamp = yesterdayDate.toISOString()
    
    // Check if we need to create/update snapshot
    let needsUpdate = forceRefresh // Force if requested
    let reason = forceRefresh ? 'Force refresh requested' : ''
    
    if (!forceRefresh) {
      if (!currentSnapshot) {
        needsUpdate = true
        reason = 'No snapshot exists'
      } else {
        // Check if snapshot has expired based on TIME, not calendar date
        // Snapshot is valid until the NEXT 23:00 CET after it was saved
        
        const savedAtMs = currentSnapshot.savedAt || Date.now()
        const savedAtDate = new Date(savedAtMs)
        
        // Get CET time when snapshot was saved
        const savedCETFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false
        })
        const savedCETParts = savedCETFormatter.formatToParts(savedAtDate)
        const savedCETYear = parseInt(savedCETParts.find(p => p.type === 'year')?.value || '0')
        const savedCETMonth = parseInt(savedCETParts.find(p => p.type === 'month')?.value || '0')
        const savedCETDay = parseInt(savedCETParts.find(p => p.type === 'day')?.value || '0')
        const savedCETHour = parseInt(savedCETParts.find(p => p.type === 'hour')?.value || '0')
        const savedCETMinute = parseInt(savedCETParts.find(p => p.type === 'minute')?.value || '0')
        
        // Calculate when this snapshot expires (next 23:00 CET after it was saved)
        let expiryDay = savedCETDay
        let expiryMonth = savedCETMonth
        let expiryYear = savedCETYear
        
        // If saved before 23:00, expires at 23:00 same day
        // If saved at or after 23:00, expires at 23:00 next day
        if (savedCETHour >= 23) {
          // Expires tomorrow at 23:00
          expiryDay += 1
          // Handle month/year rollover
          const daysInMonth = new Date(expiryYear, expiryMonth, 0).getDate()
          if (expiryDay > daysInMonth) {
            expiryDay = 1
            expiryMonth += 1
            if (expiryMonth > 12) {
              expiryMonth = 1
              expiryYear += 1
            }
          }
        }
        // else: Expires today at 23:00
        
        // Get current CET time components (already calculated above)
        const currentCETHour = parseInt(cetParts.find(p => p.type === 'hour')?.value || '0')
        const currentCETMinute = parseInt(cetParts.find(p => p.type === 'minute')?.value || '0')
        
        // Create comparable keys for date and time
        const currentDayKey = `${cetYear}-${String(cetMonth).padStart(2, '0')}-${String(cetDate).padStart(2, '0')}`
        const expiryDayKey = `${expiryYear}-${String(expiryMonth).padStart(2, '0')}-${String(expiryDay).padStart(2, '0')}`
        
        const currentTimeMinutes = currentCETHour * 60 + currentCETMinute
        const expiryTimeMinutes = 23 * 60 // 23:00 = 1380 minutes
        
        console.log(`  Snapshot saved at: Day ${savedCETYear}-${String(savedCETMonth).padStart(2, '0')}-${String(savedCETDay).padStart(2, '0')} ${String(savedCETHour).padStart(2, '0')}:${String(savedCETMinute).padStart(2, '0')} CET`)
        console.log(`  Snapshot expires at: Day ${expiryDayKey} 23:00 CET`)
        console.log(`  Current time: Day ${currentDayKey} ${String(currentCETHour).padStart(2, '0')}:${String(currentCETMinute).padStart(2, '0')} CET`)
        
        // Check if current time >= expiry time
        if (currentDayKey > expiryDayKey || (currentDayKey === expiryDayKey && currentTimeMinutes >= expiryTimeMinutes)) {
          needsUpdate = true
          reason = `Snapshot expired (saved at ${savedCETDay}.${String(savedCETMonth).padStart(2, '0')}.${savedCETYear} ${String(savedCETHour).padStart(2, '0')}:${String(savedCETMinute).padStart(2, '0')}, expires at ${expiryDayKey} 23:00)`
        } else {
          // Also check maximum age (24 hours)
          const ageHours = (Date.now() - savedAtMs) / (1000 * 60 * 60)
          if (ageHours > 24) {
            needsUpdate = true
            reason = `Snapshot too old (${ageHours.toFixed(1)} hours)`
          }
        }
      }
    }
    
    if (!needsUpdate) {
      console.log('✓ Snapshot is up to date, no action needed')
      console.log(`  Using snapshot from ${currentSnapshot.timestamp}`)
      return c.json({ 
        needsUpdate: false, 
        snapshot: currentSnapshot,
        message: 'Snapshot is current'
      })
    }
    
    console.log(`⚠️ Snapshot needs update: ${reason}`)
    console.log('📊 Creating snapshot using API previousQuote data...')
    
    // Get all packages
    const packages = await kv.getByPrefix('package:')
    
    if (packages.length === 0) {
      console.log('⚠️ No packages found, skipping snapshot creation')
      return c.json({ 
        needsUpdate: false, 
        message: 'No packages to snapshot'
      })
    }
    
    // Get unique ISINs only (avoid duplicates)
    const isins = [...new Set(packages.map(pkg => pkg.isin))]
    
    // Fetch current quotes (which include previousQuote)
    let totalPreviousValue = 0
    const packageQuotes: any[] = []
    
    console.log(`📥 Fetching quotes for ${isins.length} unique ISINs (${packages.length} total packages)...`)
    
    for (let i = 0; i < isins.length; i++) {
      const isin = isins[i]
      
      try {
        // Add small delay between requests to avoid rate limiting (except first request)
        if (i > 0) {
          await sleep(500) // 500ms delay between requests
        }
        
        const cached = await kv.get(`quote:${isin}`)
        let quoteData = cached?.data
        
        // Always fetch fresh data for snapshot creation (don't use old cache)
        console.log(`  Fetching fresh quote for ${isin}`)
        
        try {
          quoteData = await fetchQuoteFromAPI(isin)
          
          // Update cache with fresh data
          await kv.set(`quote:${isin}`, {
            data: quoteData,
            timestamp: Date.now(),
            isin
          })
          console.log(`  ✓ Fetched fresh quote for ${isin}`)
        } catch (fetchError: any) {
          console.error(`  ⚠️ Failed to fetch fresh quote for ${isin}: ${fetchError.message}`)
          
          // Fall back to cached data if available
          if (cached?.data) {
            console.log(`  ℹ️ Using cached quote for ${isin} (age: ${((Date.now() - cached.timestamp) / 1000 / 60).toFixed(1)} minutes)`)
            quoteData = cached.data
          } else {
            console.error(`  ✗ No cached data available for ${isin}, skipping`)
            throw fetchError
          }
        }
        
        if (quoteData && quoteData.previousQuote) {
          // Find ALL packages with this ISIN (not just the first one)
          const packagesWithIsin = packages.filter(p => p.isin === isin)
          
          for (const pkg of packagesWithIsin) {
            // Extract the raw numeric value from previousQuote
            const previousQuote = typeof quoteData.previousQuote === 'number' 
              ? quoteData.previousQuote 
              : quoteData.previousQuote?.raw || 0
            
            const previousValue = previousQuote * pkg.quantity
            totalPreviousValue += previousValue
            
            packageQuotes.push({
              packageId: pkg.id,
              isin: pkg.isin,
              quote: previousQuote
            })
            
            console.log(`  ✓ ${isin} (pkg ${pkg.id}): previousQuote=${previousQuote}, quantity=${pkg.quantity}, value=${previousValue.toFixed(2)}`)
          }
        } else {
          console.error(`  ✗ No previousQuote data available for ${isin}`)
        }
      } catch (error: any) {
        console.error(`  ✗ Failed to process quote for ${isin}:`, error.message)
        // Continue to next ISIN - the package(s) with this ISIN won't be included
      }
    }
    
    if (totalPreviousValue === 0) {
      console.log('⚠️ Could not calculate previous portfolio value, skipping snapshot')
      return c.json({ 
        needsUpdate: false, 
        message: 'Could not fetch quote data'
      })
    }
    
    // Save the snapshot with yesterday's timestamp
    const snapshot = {
      value: totalPreviousValue,
      timestamp: yesterdayTimestamp,
      savedAt: Date.now(),
      autoCreated: true
    }
    
    await kv.set('portfolio_snapshot', snapshot)
    console.log(`✓ Saved portfolio snapshot: €${totalPreviousValue.toFixed(2)} for ${yesterdayTimestamp}`)
    
    // Save individual package snapshots
    console.log(`💾 Saving ${packageQuotes.length} package snapshots...`)
    for (const pkgQuote of packageQuotes) {
      const packageSnapshot = {
        packageId: pkgQuote.packageId,
        isin: pkgQuote.isin,
        quote: pkgQuote.quote,
        timestamp: yesterdayTimestamp,
        savedAt: Date.now(),
        autoCreated: true
      }
      
      await kv.set(`package_snapshot:${pkgQuote.packageId}`, packageSnapshot)
      console.log(`  ✓ Saved snapshot for package ${pkgQuote.packageId}`)
    }
    
    console.log('✅ Snapshot creation complete')
    
    return c.json({ 
      needsUpdate: true, 
      snapshot,
      packagesUpdated: packageQuotes.length,
      message: 'Snapshot created successfully'
    })
  } catch (error) {
    console.error('Error ensuring snapshot:', error)
    return c.json({ error: 'Failed to ensure snapshot', details: String(error) }, 500)
  }
})

// Start the server
Deno.serve(app.fetch)