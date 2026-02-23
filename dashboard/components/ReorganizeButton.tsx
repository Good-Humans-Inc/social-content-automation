'use client'

import { useState } from 'react'
import { Box, Button, Alert, Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

export default function ReorganizeButton() {
  const [loading, setLoading] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [result, setResult] = useState<{
    success?: boolean
    message?: string
    moved?: number
    updated?: number
    total?: number
    categorized?: number
    checked?: number
    found?: number
    deleted?: number
    errors?: string[]
    debug?: {
      processed?: number
      toUpdate?: number
      details?: Array<{
        id: string
        searchQuery: string | null
        category: string | null
        subcategory: string | null
        reason: string
      }>
    }
  } | null>(null)

  const handleReorganize = async () => {
    if (!confirm('This will reorganize assets to fix nested folder structure. Files will be moved from assets/{category}/{category}/ to assets/{category}/{character}/. This will process both LADS and JJK categories. Continue?')) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      // Reorganize both lads and jjk
      const categories = ['lads', 'jjk']
      let totalMoved = 0
      let totalUpdated = 0
      const allErrors: string[] = []

      for (const category of categories) {
        const response = await fetch('/api/assets/reorganize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category }),
        })

        const data = await response.json()

        if (response.ok && data.success) {
          totalMoved += data.moved || 0
          totalUpdated += data.updated || 0
          if (data.errors && data.errors.length > 0) {
            allErrors.push(...data.errors)
          }
        } else {
          allErrors.push(`Failed to reorganize ${category}: ${data.error || 'Unknown error'}`)
        }
      }

      setResult({
        success: totalMoved > 0 || totalUpdated > 0,
        message: `Reorganization complete! Processed ${categories.length} categories.`,
        moved: totalMoved,
        updated: totalUpdated,
        total: totalMoved,
        errors: allErrors.length > 0 ? allErrors : undefined,
      })
      
      // Reload page after 2 seconds to show updated structure
      if (totalMoved > 0 || totalUpdated > 0) {
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Error reorganizing assets',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCategorize = async () => {
    if (!confirm('This will categorize uncategorized assets based on their metadata/search queries. This will help organize assets into anime categories (Jujutsu Kaisen, Love and Deepspace, etc.). Continue?')) {
      return
    }

    setCategorizing(true)
    setResult(null)

    try {
      const response = await fetch('/api/assets/categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 1000 }), // Process up to 1000 assets
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: data.categorized > 0,
          message: data.message,
          categorized: data.categorized,
          total: data.total,
          debug: data.debug,
        })
        
        // Reload page after 2 seconds to show updated categories
        if (data.categorized > 0) {
          setTimeout(() => {
            window.location.reload()
          }, 2000)
        }
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to categorize assets',
        })
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Error categorizing assets',
      })
    } finally {
      setCategorizing(false)
    }
  }

  const handleCleanup = async () => {
    if (!confirm('This will check all assets and delete database records for images that no longer exist in storage. This cannot be undone. Continue?')) {
      return
    }

    setCleaning(true)
    setResult(null)

    try {
      const response = await fetch('/api/assets/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 10000 }), // Check up to 10,000 assets
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: data.message,
          checked: data.checked,
          found: data.found,
          deleted: data.deleted,
          errors: data.errors,
        })
        
        // Reload page after 2 seconds to show updated asset count
        if (data.deleted > 0) {
          setTimeout(() => {
            window.location.reload()
          }, 2000)
        }
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to cleanup assets',
        })
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Error cleaning up assets',
      })
    } finally {
      setCleaning(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          onClick={handleCategorize}
          disabled={categorizing || loading || cleaning}
          variant="contained"
          color="primary"
          size="small"
        >
          {categorizing ? 'Categorizing...' : 'Categorize Assets'}
        </Button>
        <Button
          onClick={handleReorganize}
          disabled={loading || categorizing || cleaning}
          variant="contained"
          color="warning"
          size="small"
        >
          {loading ? 'Reorganizing...' : 'Tidy Up Folders'}
        </Button>
        <Button
          onClick={handleCleanup}
          disabled={cleaning || loading || categorizing}
          variant="contained"
          color="error"
          size="small"
        >
          {cleaning ? 'Cleaning...' : 'Clean Missing Images'}
        </Button>
      </Box>
      
      {result && (
        <Alert
          severity={result.success ? 'success' : 'error'}
          sx={{ maxWidth: 'md', width: '100%' }}
        >
          <Typography variant="body2" fontWeight="medium" gutterBottom>
            {result.message}
          </Typography>
          {result.success !== undefined && (
            <Box sx={{ mt: 1 }}>
              {result.categorized !== undefined && (
                <Typography variant="caption" display="block">
                  Categorized: {result.categorized} assets | Total: {result.total}
                </Typography>
              )}
              {result.moved !== undefined && (
                <Typography variant="caption" display="block">
                  Moved: {result.moved} files | Updated: {result.updated} records | Total: {result.total}
                </Typography>
              )}
              {result.checked !== undefined && (
                <Typography variant="caption" display="block">
                  Checked: {result.checked} assets | Found: {result.found} missing | Deleted: {result.deleted} records
                </Typography>
              )}
              {result.debug && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                    Debug Info:
                  </Typography>
                  <Typography variant="caption" display="block">
                    Processed: {result.debug.processed} | To Update: {result.debug.toUpdate}
                  </Typography>
                  {result.debug.details && result.debug.details.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="caption">
                            View details ({result.debug.details.length} items)
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Box sx={{ maxHeight: 160, overflow: 'auto', bgcolor: 'grey.50', p: 1, borderRadius: 1 }}>
                            {result.debug.details.map((detail, idx) => (
                              <Box key={idx} sx={{ mb: 1, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }} display="block">
                                  ID: {detail.id.substring(0, 8)}...
                                </Typography>
                                <Typography variant="caption" display="block">
                                  Search Query: {detail.searchQuery || '(none)'}
                                </Typography>
                                <Typography variant="caption" display="block">
                                  Category: {detail.category || '(none)'}
                                </Typography>
                                <Typography variant="caption" display="block">
                                  Subcategory: {detail.subcategory || '(none)'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Reason: {detail.reason}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}
          {result.errors && result.errors.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" fontWeight="medium" display="block" gutterBottom>
                Errors:
              </Typography>
              <Box component="ul" sx={{ pl: 2, m: 0 }}>
                {result.errors.slice(0, 3).map((error, idx) => (
                  <Typography key={idx} component="li" variant="caption">
                    {error}
                  </Typography>
                ))}
                {result.errors.length > 3 && (
                  <Typography component="li" variant="caption">
                    ... and {result.errors.length - 3} more
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </Alert>
      )}
    </Box>
  )
}
