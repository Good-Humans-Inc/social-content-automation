'use client'

import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Checkbox,
  Collapse,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'

interface AutoGenerateButtonProps {
  onSuccess?: () => void
}

// Fandom options for auto-generate (value = assets category sent to API)
const FANDOM_OPTIONS: { value: string; label: string }[] = [
  { value: 'jjk', label: 'Jujutsu Kaisen (JJK)' },
  { value: 'lads', label: 'Love and Deepspace (LADS)' },
  { value: 'genshin', label: 'Genshin Impact' },
  { value: 'generic_anime', label: 'Generic Anime' },
]

// Generation mode: video = rapid videos only; carousel = 4-image grid carousels only; both = both (scalable for future modes)
const MODE_OPTIONS: { value: 'video' | 'carousel' | 'both'; label: string; description: string }[] = [
  { value: 'video', label: 'Videos only', description: 'Rapid slideshow video jobs (35 images, 0.2s each)' },
  { value: 'carousel', label: 'Carousels only', description: '4-image grid carousel jobs (character_grid templates)' },
  { value: 'both', label: 'Videos and carousels', description: 'Create both video and carousel jobs' },
]

export default function AutoGenerateButton({ onSuccess }: AutoGenerateButtonProps) {
  const [open, setOpen] = useState(false)
  const [fandom, setFandom] = useState('')
  const [mode, setMode] = useState<'video' | 'carousel' | 'both'>('video')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    created: number
    createdVideos?: number
    createdCarousels?: number
    accountsUsed?: number
    errors?: string[]
    debug?: {
      subcategoriesInDb: string[]
      subcategoriesFromGcs?: string[]
      summary?: string
      failedTemplates: Array<{
        template_id: string
        raw_tags: unknown
        normalized_tags: string[]
        candidate_tags: string[]
        subcategories: string[]
      }>
    }
  } | null>(null)
  const [includeDebug, setIncludeDebug] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  const handleGenerate = async () => {
    if (!fandom) {
      setError('Please select a fandom')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/jobs/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fandom, mode, debug: includeDebug }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Auto-generate failed')
        return
      }
      setResult({
        created: data.created?.length ?? 0,
        createdVideos: data.createdVideos?.length ?? 0,
        createdCarousels: data.createdCarousels?.length ?? 0,
        accountsUsed: data.accountsUsed,
        errors: data.errors,
        debug: data.debug,
      })
      if (data.debug) setShowDebug(true)
      if (data.created?.length) {
        onSuccess?.()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setResult(null)
    setError(null)
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outlined"
        color="primary"
        startIcon={<AutoAwesomeIcon />}
      >
        Auto Generate
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Auto Generate Jobs</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Creates jobs for every unused template in the selected fandom. Choose whether to
            generate videos (rapid slideshow), carousels (4-image grid), or both. Jobs are
            distributed across accounts. Character images are chosen from tags; templates whose
            character isn&apos;t scraped yet are skipped and listed below.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth required>
              <InputLabel>Fandom</InputLabel>
              <Select
                value={fandom}
                onChange={(e) => setFandom(e.target.value)}
                label="Fandom"
              >
                {FANDOM_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel>Generate</InputLabel>
              <Select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'video' | 'carousel' | 'both')}
                label="Generate"
              >
                {MODE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">{opt.label}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">{opt.description}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeDebug}
                  onChange={(e) => setIncludeDebug(e.target.checked)}
                />
              }
              label="Include debug info (shows template tags vs asset subcategories when no jobs created)"
            />
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {result && (
              <Alert severity={result.created > 0 ? 'success' : 'info'}>
                {result.created > 0
                  ? (() => {
                      const parts: string[] = []
                      if (result.createdVideos) parts.push(`${result.createdVideos} video(s)`)
                      if (result.createdCarousels) parts.push(`${result.createdCarousels} carousel(s)`)
                      return `Created ${parts.join(' and ')} across ${result.accountsUsed ?? '?'} account(s).`
                    })()
                  : 'No jobs were created.'}
                {result.errors?.length ? (
                  <Box component="ul" sx={{ mt: 1, pl: 2, mb: 0 }}>
                    {result.errors.slice(0, 5).map((msg, i) => (
                      <li key={i}>
                        <Typography variant="body2">{msg}</Typography>
                      </li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>
                        <Typography variant="body2">
                          … and {result.errors.length - 5} more
                        </Typography>
                      </li>
                    )}
                  </Box>
                ) : null}
              </Alert>
            )}
            {result?.debug && (
              <Box sx={{ mt: 2 }}>
                <Button size="small" onClick={() => setShowDebug((v) => !v)}>
                  {showDebug ? 'Hide' : 'Show'} debug
                </Button>
                <Collapse in={showDebug}>
                  <Box sx={{ mt: 1, p: 1.5, bgcolor: 'grey.100', borderRadius: 1, overflow: 'auto' }}>
                    {result.debug.summary && (
                      <Alert severity="info" sx={{ mb: 1.5 }}>
                        {result.debug.summary}
                      </Alert>
                    )}
                    <Typography variant="caption" fontWeight="bold" display="block">
                      Character folders used for matching (DB + bucket when GCS configured):
                    </Typography>
                    <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                      {result.debug.subcategoriesInDb?.length
                        ? result.debug.subcategoriesInDb.join(', ')
                        : '(none)'}
                    </Typography>
                    {result.debug.subcategoriesFromGcs?.length ? (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        From GCS bucket structure: {result.debug.subcategoriesFromGcs.join(', ')}
                      </Typography>
                    ) : null}
                    {result.debug.failedTemplates?.length > 0 && (
                      <>
                        <Typography variant="caption" fontWeight="bold" sx={{ mt: 1 }} display="block">
                          First failed template (tags vs subcategories):
                        </Typography>
                        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}>
                          {JSON.stringify(result.debug.failedTemplates[0], null, 2)}
                        </Typography>
                      </>
                    )}
                  </Box>
                </Collapse>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleGenerate}
            variant="contained"
            disabled={loading || !fandom}
            startIcon={loading ? <CircularProgress size={16} /> : null}
          >
            {loading ? 'Generating…' : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
