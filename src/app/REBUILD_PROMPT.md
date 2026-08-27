# ETF Portfolio Manager - Complete Application Specification

Build a full-stack ETF Portfolio Manager application that allows users to track their ETF investments with real-time market data, performance analytics, and historical tracking.

---

## CORE FEATURES

### 1. Portfolio Management
- **Add ETF Packages**: Each package represents a specific ETF purchase with:
  - Name (required)
  - Short Name (optional, used for display)
  - ISIN (required, format: 2 letters + 10 alphanumeric)
  - Purchase Date (required)
  - Quantity (required, number)
  - Purchase Price per unit (required, in EUR)
  - Commission (optional, flat fee in EUR, defaults to 0)
  - Dividends (optional array, each with date and amount in EUR)

- **Edit Packages**: Modify any existing package details
- **Delete Packages**: Remove packages from portfolio
- **View Details**: Click any package to see full details including:
  - All purchase information
  - Current market data and quotes
  - Performance metrics (gain/loss in EUR and %)
  - Dividend history with add/edit/delete functionality
  - Daily performance (change from yesterday)

### 2. Real-Time Market Data Integration
- **API**: JustETF API endpoint: `https://www.justetf.com/api/etfs/{ISIN}/quote`
- **Quote Structure**: API returns JSON with nested structure like:
  ```json
  {
    "latestQuote": { "raw": 123.45 },
    "previousQuote": { "raw": 122.50 },
    "dtdPrc": { "raw": 0.77 },
    "dtdAmt": { "raw": 0.95 }
  }
  ```
- **Data Extraction**: Extract raw numeric values from nested objects
- **Caching**: Cache quotes on server for 5 minutes to reduce API calls
- **Batch Fetching**: Fetch quotes for all ISINs in a single server call
- **Error Handling**: 
  - Retry logic with exponential backoff (3 attempts)
  - 15-second timeout per request
  - 500ms delay between sequential requests to avoid rate limiting
  - Fallback to cached data if fresh fetch fails
  - Never skip ISINs unless absolutely no data available

### 3. Performance Calculations

#### **Current Value Per Package**
```
Current Value = (Latest Quote × Quantity) + Total Dividends
```

#### **Purchase Cost Per Package**
```
Purchase Cost = (Purchase Price × Quantity) + Commission
```

#### **Gain/Loss Per Package**
```
Gain/Loss Value = Current Value - Purchase Cost
Gain/Loss % = (Gain/Loss Value / Purchase Cost) × 100
```

#### **Portfolio Totals**
```
Total Portfolio Value = Sum of all Current Values
Total Gain/Loss = Sum of all Gain/Loss Values
Total Cost = Sum of all Purchase Costs
Total Gain/Loss % = (Total Gain/Loss / Total Cost) × 100
```

#### **Daily Performance**
```
If Snapshot Exists:
  Daily Change = Current Total Value - Yesterday's Snapshot Value
  Daily % = (Daily Change / Yesterday's Snapshot Value) × 100
  
Else (Fallback):
  Yesterday Value = Sum of (Previous Quote × Quantity) for all packages
  Daily Change = Current Total Value - Yesterday Value
  Daily % = (Daily Change / Yesterday Value) × 100
```

### 4. Historical Tracking System

#### **Snapshot Mechanism**
- **Purpose**: Capture portfolio value at 23:00 CET each day for accurate historical comparison
- **Storage**: Two types of snapshots:
  1. Portfolio Snapshot: Total portfolio value for yesterday at 23:00 CET
  2. Package Snapshots: Individual quote for each package at yesterday 23:00 CET

#### **Snapshot Creation Logic**
- **When**: Automatically creates snapshot representing "yesterday at 23:00 CET"
- **Trigger**: Only when needed (date has changed), NOT on every page load
- **Calculation**: Uses `previousQuote` from API (which represents previous close)
- **Formula for Portfolio Snapshot**:
  ```
  Portfolio Value = Sum of (previousQuote × quantity) for all packages
  ```
- **Timestamp**: Always set to yesterday at 23:00 CET
- **Persistence**: Once created for a specific date, NEVER recalculate unless forced
- **Important**: If valid snapshot exists for yesterday at 23:00, keep it until next day

#### **Snapshot Rules**
- **No Auto-Recalculation**: Don't recalculate based on age (6 hours, 24 hours, etc.)
- **Date-Based Only**: Only create new snapshot when date changes
- **Unique ISINs**: When fetching quotes, use unique ISINs only to avoid duplicate calculations
- **Package Mapping**: After fetching quote for ISIN, apply it to ALL packages with that ISIN

### 5. Statistics Page
Display comprehensive portfolio analytics:
- **Allocation Chart**: Pie chart showing portfolio allocation by ETF
- **Top Performers**: List of best-performing packages by gain/loss %
- **Performance Metrics**:
  - Best performing package
  - Worst performing package
  - Average gain/loss %
  - Total dividends received
  - Largest position by value
  - Smallest position by value

### 6. History Page
Compare current portfolio with yesterday's snapshot:
- **Yesterday Portfolio Value**: From 23:00 CET snapshot
- **Today Portfolio Value**: Current real-time value
- **Package Quote Comparison Table**: Shows yesterday quote vs current quote for each package
- **No Refresh Button**: Snapshot is persistent, page reload doesn't trigger recalculation

---

## TECHNICAL ARCHITECTURE

### **Frontend**
- React with TypeScript
- Tailwind CSS v4 for styling
- React Router (Data mode) for navigation with routes:
  - `/` - Main portfolio page
  - Mobile uses hash-based history for browser back gesture support
- Responsive design:
  - Desktop: Dialogs for detail/stats/history views
  - Mobile: Full-page views with back buttons
- Icons: lucide-react
- Charts: recharts library
- Toast notifications: sonner

### **Backend**
- Supabase Edge Functions (Hono web server)
- Server path: `/supabase/functions/server/index.tsx`
- All routes prefixed with: `/make-server-a36e056a/`
- Base URL: `https://${projectId}.supabase.co/functions/v1/make-server-a36e056a`
- Authorization: `Bearer ${publicAnonKey}` in headers

### **Database**
- Pre-existing KV store table: `kv_store_a36e056a`
- Access via: `/supabase/functions/server/kv_store.tsx`
- Available functions: get, set, del, mget, mset, mdel, getByPrefix
- Do NOT create migrations or DDL statements
- Do NOT modify kv_store.tsx file (protected)

---

## API ENDPOINTS

### **Package Management**
```
GET    /packages               - Fetch all packages with quotes
POST   /packages               - Create new package
PUT    /packages/:id           - Update package
DELETE /packages/:id           - Delete package
```

### **Quote Management**
```
POST   /quotes/batch           - Fetch quotes for multiple ISINs
  Body: { isins: string[], forceRefresh: boolean }
  Returns: { quotes: Array<{ isin, quote }>, needsRefresh: boolean }
```

### **Snapshot Management**
```
GET    /portfolio/snapshot              - Get portfolio snapshot
GET    /portfolio/package-snapshots     - Get all package snapshots
POST   /portfolio/ensure-snapshot       - Ensure snapshot exists for yesterday
       ?force=true                       - Force recalculation (for manual refresh)
```

---

## DATA MODELS

### **ETFPackage**
```typescript
{
  id: string                    // UUID
  name: string                  // Full ETF name
  shortName?: string            // Optional display name
  isin: string                  // ISIN code (2 letters + 10 alphanumeric)
  purchaseDate: string          // ISO date string
  quantity: number              // Number of shares
  purchasePrice: number         // Price per share in EUR
  commission?: number           // Transaction fee in EUR (default 0)
  dividends?: Array<{
    date: string                // ISO date string
    amount: number              // Dividend amount in EUR
  }>
}
```

### **ETFQuote**
```typescript
{
  latestQuote: number           // Current price in EUR
  previousQuote: number         // Previous close price in EUR
  dtdPrc: number               // Day-to-day percentage change
  dtdAmt: number               // Day-to-day amount change
}
```

### **PackageWithQuote** (Frontend calculated)
```typescript
{
  ...ETFPackage                // All package fields
  quote: ETFQuote | null       // Market data
  currentValue: number          // Calculated total value
  gainLossValue: number         // Calculated gain/loss in EUR
  gainLossPercentage: number    // Calculated gain/loss in %
}
```

### **Portfolio Snapshot**
```typescript
{
  value: number                 // Total portfolio value at snapshot time
  timestamp: string             // ISO string - always yesterday at 23:00 CET
  savedAt?: number             // Unix timestamp when snapshot was created
  autoCreated?: boolean        // Flag indicating auto-creation
}
```

### **Package Snapshot**
```typescript
{
  packageId: string            // Package UUID
  isin: string                 // ISIN code
  quote: number                // Quote value at snapshot time
  timestamp: string            // ISO string - always yesterday at 23:00 CET
  savedAt?: number            // Unix timestamp when snapshot was created
  autoCreated?: boolean       // Flag indicating auto-creation
}
```

---

## UI/UX SPECIFICATIONS

### **Currency Formatting**
- All currency values in EUR
- European format: `€1.234,56` (using `de-DE` locale)
- Implementation: `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`

### **Color Coding**
- Positive values: Green text
- Negative values: Red text
- Zero/neutral: Default text color

### **Responsive Breakpoints**
- Mobile: < 768px (useIsMobile hook)
- Desktop: >= 768px
- Mobile Navigation:
  - Use window.history.pushState for back gesture support
  - Hash-based URLs: `#detail-{id}`, `#stats`, `#history`
  - Listen to popstate events for browser back button

### **Main Portfolio Page Layout**

#### Desktop View:
1. Header with title and action buttons (Refresh, Stats, History, Add Package)
2. Portfolio Summary cards showing:
   - Total Portfolio Value (large, prominent)
   - Total Gain/Loss (EUR and %)
   - Daily Performance (%)
   - Last refresh timestamp
3. Packages table with columns:
   - Name (clickable for details)
   - ISIN (clickable link to JustETF URL: `https://www.justetf.com/en/etf-profile.html?isin={ISIN}`)
   - Quantity
   - Purchase Price
   - Current Price
   - Current Value
   - Gain/Loss (EUR and %)
   - Daily % (from yesterday snapshot)

#### Mobile View:
- Same layout but stacked vertically
- Condensed table (fewer columns visible)
- Full-page views replace dialogs
- Back buttons instead of close buttons

### **Package Detail View**
Display in dialog (desktop) or full page (mobile):
- All package information
- Market data section
- Performance section with visual indicators
- Dividends section with table and add/edit functionality
- Edit and Delete buttons

### **Statistics Page**
- Portfolio allocation pie chart (using recharts)
- Key metrics in cards:
  - Best/worst performer
  - Average gain/loss %
  - Total dividends
  - Largest/smallest position
- Top performers list

### **History Page**
- Two summary cards:
  - Yesterday Portfolio Value (from 23:00 CET snapshot)
  - Today Portfolio Value (current)
- Table comparing yesterday quote vs current quote for each package
- NO refresh button (snapshots are persistent)

---

## BEHAVIORAL REQUIREMENTS

### **Auto-Refresh Logic**
1. **On Mount**: Load portfolio once
2. **Every 15 Minutes**: Auto-refresh in background
3. **On Page Visibility**: Refresh if >5 minutes elapsed or empty state
4. **Manual Refresh**: User clicks refresh button
5. **Background Refresh**: Poll for updates 3 seconds after server indicates refresh needed

### **Snapshot Loading**
- Load snapshots on mount (fetchPortfolioSnapshot, fetchPackageSnapshots)
- Do NOT call ensureSnapshot on mount
- Only create snapshots when explicitly needed
- Cache-bust snapshot requests with timestamp query param

### **Error Handling**
- Toast notifications for user actions (success/error)
- Console logging for debugging
- Graceful degradation if quotes unavailable
- Timeout protection (30s for package fetch, 15s for quote fetch)

### **ISIN Linking**
- ISINs in main table are clickable links
- Open in new tab: `https://www.justetf.com/en/etf-profile.html?isin={ISIN}`
- Use `target="_blank"` and `rel="noopener noreferrer"`

### **Loading States**
- Initial load: Full-page loading spinner with "Loading your portfolio..." message
- Refresh: Spinning refresh icon in button
- Empty state: Helpful message with call-to-action to add first package

---

## CRITICAL IMPLEMENTATION NOTES

### **Snapshot System - IMPORTANT**
1. **Never recalculate** snapshots based on time elapsed (6 hours, 24 hours, etc.)
2. **Only recalculate** when date changes (need new yesterday snapshot)
3. **Unique ISINs only**: When creating snapshot, fetch quotes for unique ISINs, then apply to all packages
4. **Preserve snapshots**: If valid snapshot exists for yesterday at 23:00, keep it unchanged
5. **Force flag**: Allow manual recalculation with `?force=true` parameter, but this is for maintenance only

### **Quote Fetching - IMPORTANT**
1. **Retry logic**: 3 attempts with exponential backoff (1s, 2s, 4s)
2. **Timeout**: 15 seconds per request
3. **Rate limiting**: 500ms delay between sequential requests
4. **Fallback**: If fresh fetch fails, use cached data
5. **Never skip**: Only skip ISIN if absolutely no data available (no cache, all retries failed)

### **Performance Calculations - IMPORTANT**
1. **Always include commission** in purchase cost
2. **Always include dividends** in current value
3. **Use correct formulas** (see Performance Calculations section)
4. **Handle edge cases**: Zero purchase cost, missing quotes, etc.

### **Date Handling - IMPORTANT**
1. **Timezone**: Always use CET (Europe/Paris) for snapshot timestamps
2. **Yesterday calculation**: Current date in CET minus 1 day, at 23:00
3. **Format**: ISO string format for storage and comparison

---

## PROTECTED FILES (DO NOT MODIFY)
- `/supabase/functions/server/kv_store.tsx`
- `/src/app/components/figma/ImageWithFallback.tsx`
- `/utils/supabase/info.tsx`

---

## DEPLOYMENT NOTES
- Supabase project with environment variables:
  - SUPABASE_URL
  - SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - SUPABASE_DB_URL
- No additional API keys required (JustETF API is public)
- Works as both web app and mobile PWA

---

## TESTING CHECKLIST

### Core Functionality
- [ ] Add/Edit/Delete packages works correctly
- [ ] Quotes fetch successfully with retry logic
- [ ] Performance calculations are accurate (include commission and dividends)
- [ ] Currency formatting uses European format (€1.234,56)

### Snapshot System
- [ ] Snapshot created for yesterday at 23:00 CET
- [ ] Snapshot NOT recalculated on page reload
- [ ] Snapshot persists until next day
- [ ] Duplicate ISINs handled correctly (no value multiplication)
- [ ] Unique ISINs used for quote fetching

### Responsive Design
- [ ] Desktop: Dialogs for detail/stats/history
- [ ] Mobile: Full-page views with back buttons
- [ ] Browser back gesture works on mobile
- [ ] Table readable on mobile (condensed columns)

### Error Handling
- [ ] Timeout errors don't crash app
- [ ] Failed quote fetches fall back to cache
- [ ] Missing data handled gracefully
- [ ] User-friendly error messages

### Performance
- [ ] Auto-refresh every 15 minutes
- [ ] Batch quote fetching (all ISINs in one call)
- [ ] 5-minute cache on server
- [ ] Background refresh polling

---

## SAMPLE DATA FOR TESTING

```typescript
[
  {
    name: "iShares Core MSCI World UCITS ETF USD (Acc)",
    shortName: "MSCI World",
    isin: "IE00B4L5Y983",
    purchaseDate: "2024-01-15",
    quantity: 50,
    purchasePrice: 75.50,
    commission: 2.50
  },
  {
    name: "Xtrackers MSCI Emerging Markets UCITS ETF",
    shortName: "EM",
    isin: "IE00BTJRMP35",
    purchaseDate: "2024-02-01",
    quantity: 30,
    purchasePrice: 45.20,
    commission: 2.00,
    dividends: [
      { date: "2024-03-15", amount: 12.50 }
    ]
  }
]
```

---

## SUCCESS CRITERIA
The application is complete when:
1. Users can manage their ETF portfolio (add/edit/delete packages)
2. Real-time quotes display with proper error handling and caching
3. Performance calculations are accurate and include all costs
4. Historical snapshots work correctly (persistent, not recalculated)
5. Responsive design works on both desktop and mobile
6. Browser back button works correctly on mobile
7. All currency values display in European format (EUR)
8. ISINs link to JustETF pages
9. Statistics and history pages provide meaningful insights
