/**
 * Script to process all unprocessed assets
 * 
 * Usage:
 *   node scripts/process-unprocessed-assets.js [limit]
 * 
 * Examples:
 *   node scripts/process-unprocessed-assets.js        # Process 100 at a time (default)
 *   node scripts/process-unprocessed-assets.js 50     # Process 50 at a time
 *   node scripts/process-unprocessed-assets.js all    # Process all (in batches of 100)
 */

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'

async function processAssets(limit = 100) {
  const url = `${DASHBOARD_URL}/api/assets/process`
  
  console.log(`\n🚀 Processing unprocessed assets...`)
  console.log(`📡 Dashboard URL: ${DASHBOARD_URL}`)
  console.log(`📦 Batch size: ${limit === 'all' ? '100 (repeating)' : limit}\n`)
  
  let totalProcessed = 0
  let totalFailed = 0
  let batchNumber = 1
  
  while (true) {
    try {
      console.log(`\n📦 Batch ${batchNumber}...`)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: limit === 'all' ? 100 : limit }),
      })
      
      if (!response.ok) {
        const error = await response.text()
        console.error(`❌ Error: ${response.status} - ${error}`)
        break
      }
      
      const result = await response.json()
      
      totalProcessed += result.processed || 0
      totalFailed += result.failed || 0
      
      console.log(`   ✅ Processed: ${result.processed}`)
      console.log(`   ❌ Failed: ${result.failed}`)
      console.log(`   📊 Total: ${result.total}`)
      
      if (result.errors && result.errors.length > 0) {
        console.log(`   ⚠️  Errors (first 10):`)
        result.errors.forEach((err, i) => {
          console.log(`      ${i + 1}. ${err}`)
        })
      }
      
      // If no assets were processed or we're not processing all, break
      if (result.total === 0 || (limit !== 'all' && batchNumber === 1)) {
        break
      }
      
      // If we processed fewer than the limit, we're done
      if (result.total < (limit === 'all' ? 100 : limit)) {
        break
      }
      
      batchNumber++
      
      // Small delay between batches to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`❌ Error processing batch ${batchNumber}:`, error.message)
      break
    }
  }
  
  console.log(`\n✨ Processing complete!`)
  console.log(`   ✅ Total processed: ${totalProcessed}`)
  console.log(`   ❌ Total failed: ${totalFailed}`)
  console.log(`   📦 Batches: ${batchNumber}\n`)
}

// Get limit from command line argument
const limitArg = process.argv[2]
const limit = limitArg === 'all' ? 'all' : (limitArg ? parseInt(limitArg) : 100)

if (limitArg && limitArg !== 'all' && isNaN(limit)) {
  console.error('❌ Invalid limit. Use a number or "all"')
  process.exit(1)
}

processAssets(limit).catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
