import { projectId, publicAnonKey } from './supabase/info'

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a36e056a`

// Set yesterday's snapshot at 23:00 CET
export async function setYesterdaySnapshot() {
  // Calculate yesterday at 23:00 CET
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  
  // Set to 23:00 CET (convert to UTC)
  // CET is UTC+1, CEST is UTC+2 (we'll use CET for simplicity)
  const yesterdayCET = new Date(yesterday.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  yesterdayCET.setHours(23, 0, 0, 0)
  
  const timestamp = yesterdayCET.toISOString()
  const totalValue = 46423

  try {
    const response = await fetch(`${API_BASE}/portfolio/snapshot/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ 
        totalValue, 
        timestamp 
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to set snapshot:', error)
      return
    }

    const data = await response.json()
    console.log('✓ Successfully set yesterday snapshot:', data.snapshot)
    return data.snapshot
  } catch (error) {
    console.error('Error setting snapshot:', error)
  }
}

// Call this function immediately when imported
setYesterdaySnapshot()
