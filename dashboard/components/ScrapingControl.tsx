'use client'

import { useState, useEffect } from 'react'
import { animeConfigs as staticAnimeConfigs, generatePinterestUrl, generateGoogleImagesUrl, type AnimeConfig } from '../lib/animeConfig'
import {
  Paper,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Button,
  Box,
  Checkbox,
  Stack,
  Select,
  MenuItem,
  InputLabel,
  Alert,
  Chip,
  LinearProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Collapse,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'

type SourceType = 'pinterest' | 'google_images'
type InputMode = 'manual' | 'anime_selection' | 'template_scrape'

interface QueuedTemplate {
  template_id: string
  search_query: string
  pinterest_url: string
}

interface QueueStatus {
  pending: number
  items: { template_id: string; search_terms: string[]; created_at: number }[]
}

export default function ScrapingControl() {
  const [sourceType, setSourceType] = useState<SourceType>('pinterest')
  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [pinterestUrls, setPinterestUrls] = useState('')
  const [googleSearchTerms, setGoogleSearchTerms] = useState('')
  const [maxPosts, setMaxPosts] = useState<string>('200')
  const [loading, setLoading] = useState(false)

  // Dynamic anime configs from DB (falls back to static)
  const [animeConfigs, setAnimeConfigs] = useState<AnimeConfig[]>(staticAnimeConfigs)

  // Anime selection state
  const [selectedCharacters, setSelectedCharacters] = useState<Record<string, Set<string>>>({})

  // Template scrape state
  const [templateFandom, setTemplateFandom] = useState<string>('')
  const [templateIntensity, setTemplateIntensity] = useState<string>('T0')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [queuedTemplates, setQueuedTemplates] = useState<QueuedTemplate[]>([])
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [showQueueDetails, setShowQueueDetails] = useState(false)
  const [fandomList, setFandomList] = useState<string[]>([])

  // Fetch dynamic fandom/character config from DB
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const res = await fetch('/api/fandoms/config')
        if (res.ok) {
          const data = await res.json()
          if (data.config && Array.isArray(data.config) && data.config.length > 0) {
            setAnimeConfigs(data.config)
          }
        }
      } catch {
        // Keep static fallback
      }
    }
    fetchConfigs()
  }, [])

  // Fetch fandoms from API (same list as Templates page) when in template scrape mode
  useEffect(() => {
    if (inputMode !== 'template_scrape') return
    const fetchFandoms = async () => {
      try {
        const intensity = templateIntensity || undefined
        const url = intensity ? `/api/templates/fandoms?intensity=${encodeURIComponent(intensity)}` : '/api/templates/fandoms'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setFandomList(data.fandoms || [])
        }
      } catch {
        setFandomList([])
      }
    }
    fetchFandoms()
  }, [inputMode, templateIntensity])

  // Poll queue status when in template mode
  useEffect(() => {
    if (inputMode !== 'template_scrape') return
    
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/scraping/template-scrape')
        if (res.ok) {
          const data = await res.json()
          setQueueStatus(data.queue_status)
        }
      } catch {
        // ignore polling errors
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [inputMode])

  // Handle character selection
  const handleCharacterToggle = (animeId: string, character: string) => {
    setSelectedCharacters(prev => {
      const newSet = new Set(prev[animeId] || [])
      if (newSet.has(character)) {
        newSet.delete(character)
      } else {
        newSet.add(character)
      }
      return { ...prev, [animeId]: newSet }
    })
  }

  const handleSelectAll = (anime: AnimeConfig) => {
    const allCharacters = new Set(anime.characters)
    setSelectedCharacters(prev => ({
      ...prev,
      [anime.id]: allCharacters
    }))
  }

  const handleDeselectAll = (animeId: string) => {
    setSelectedCharacters(prev => {
      const updated = { ...prev }
      delete updated[animeId]
      return updated
    })
  }

  const handleTemplateScrape = async () => {
    setTemplateLoading(true)
    setTemplateError(null)
    setQueuedTemplates([])

    try {
      const body: any = {}
      if (templateFandom) body.fandom = templateFandom
      if (templateIntensity) body.intensity = templateIntensity
      body.limit = 'all'

      const res = await fetch('/api/scraping/template-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setTemplateError(data.error || 'Failed to generate template scraping tasks')
        return
      }

      setQueuedTemplates(data.queued || [])
      setQueueStatus(data.queue_status || null)

      if (data.errors?.length) {
        setTemplateError(`${data.queued?.length || 0} queued, ${data.errors.length} failed: ${data.errors[0]}`)
      }
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setTemplateLoading(false)
    }
  }

  const handleClearQueue = async () => {
    try {
      await fetch('/api/scraping/trigger', { method: 'DELETE' })
      setQueueStatus(null)
      setQueuedTemplates([])
    } catch {
      // ignore
    }
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      let targetUrls: string[] = []
      let searchTerms: string[] = []

      if (inputMode === 'anime_selection') {
        for (const anime of animeConfigs) {
          const selected = selectedCharacters[anime.id] || new Set()
          for (const character of selected) {
            if (sourceType === 'pinterest') {
              const url = generatePinterestUrl(anime, character)
              targetUrls.push(url)
            } else if (sourceType === 'google_images') {
              const url = generateGoogleImagesUrl(anime, character)
              targetUrls.push(url)
              searchTerms.push(`${anime.fullName} ${character}`)
            }
          }
        }
        
        if (targetUrls.length === 0) {
          alert('Please select at least one character to scrape')
          setLoading(false)
          return
        }
      } else if (sourceType === 'pinterest') {
        targetUrls = pinterestUrls
          .split('\n')
          .map((url) => url.trim())
          .filter((url) => url.length > 0 && url.includes('pinterest.com'))
        
        if (targetUrls.length === 0) {
          alert('Please enter at least one valid Pinterest URL')
          setLoading(false)
          return
        }
      } else {
        searchTerms = googleSearchTerms
          .split('\n')
          .map((term) => term.trim())
          .filter((term) => term.length > 0)
        
        if (searchTerms.length === 0) {
          alert('Please enter at least one search term')
          setLoading(false)
          return
        }

        targetUrls = searchTerms.map(term => {
          const encoded = encodeURIComponent(term)
          return `https://www.google.com/search?q=${encoded}&tbm=isch`
        })
      }

      const maxPostsNum = parseInt(maxPosts) || 200
      if (maxPostsNum < 1) {
        alert('Max posts must be at least 1')
        setLoading(false)
        return
      }

      const response = await fetch('/api/scraping/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_urls: targetUrls,
          source_type: sourceType,
          search_terms: sourceType === 'google_images' ? searchTerms : [],
          max_posts: maxPostsNum,
        }),
      })

      if (response.ok) {
        setPinterestUrls('')
        setGoogleSearchTerms('')
        if (inputMode === 'anime_selection') {
          setSelectedCharacters({})
        }
        
        const characterCount = inputMode === 'anime_selection' 
          ? Object.values(selectedCharacters).reduce((sum, chars) => sum + chars.size, 0)
          : targetUrls.length
        alert(`Starting scraping for ${characterCount} character(s)! The extension will scrape ${maxPostsNum} images per character.`)
      } else {
        const error = await response.json()
        alert(`Failed to trigger scraping: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error starting scraping job: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight="semibold" sx={{ mb: 3 }}>
        Start New Scraping Job
      </Typography>
      
      {/* Input Mode Selector */}
      <FormControl sx={{ mb: 3 }}>
        <FormLabel>Scraping Mode</FormLabel>
        <RadioGroup
          row
          value={inputMode}
          onChange={(e) => setInputMode(e.target.value as InputMode)}
        >
          <FormControlLabel value="manual" control={<Radio />} label="Manual URLs" />
          <FormControlLabel value="anime_selection" control={<Radio />} label="Anime & Character" />
          <FormControlLabel
            value="template_scrape"
            control={<Radio />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AutoFixHighIcon fontSize="small" />
                Template + AI Scrape
              </Box>
            }
          />
        </RadioGroup>
      </FormControl>

      {/* Template AI Scrape Mode */}
      {inputMode === 'template_scrape' && (
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            AI will analyze each unused template&apos;s caption, tags, and fandom to generate specific Pinterest search queries. Each template will get 35 unique images scraped and linked directly to it.
          </Alert>

          <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
            <FormControl sx={{ minWidth: 160 }}>
              <InputLabel>Intensity</InputLabel>
              <Select
                value={templateIntensity}
                label="Intensity"
                onChange={(e) => setTemplateIntensity(e.target.value)}
                size="small"
              >
                <MenuItem value="T0">T0</MenuItem>
                <MenuItem value="T1">T1</MenuItem>
                <MenuItem value="T2">T2</MenuItem>
                <MenuItem value="">All</MenuItem>
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 220 }}>
              <InputLabel>Fandom (optional)</InputLabel>
              <Select
                value={templateFandom}
                label="Fandom (optional)"
                onChange={(e) => setTemplateFandom(e.target.value)}
                size="small"
                displayEmpty
              >
                <MenuItem value="">All fandoms</MenuItem>
                {fandomList.map((f) => (
                  <MenuItem key={f} value={f}>
                    {f}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              onClick={handleTemplateScrape}
              disabled={templateLoading}
              startIcon={<AutoFixHighIcon />}
            >
              {templateLoading ? 'Generating...' : 'Generate & Queue Scraping'}
            </Button>

            {queueStatus && queueStatus.pending > 0 && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleClearQueue}
                startIcon={<DeleteSweepIcon />}
              >
                Clear Queue ({queueStatus.pending})
              </Button>
            )}
          </Stack>

          {templateLoading && <LinearProgress sx={{ mb: 2 }} />}

          {templateError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {templateError}
            </Alert>
          )}

          {/* Queue Status */}
          {queueStatus && queueStatus.pending > 0 && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {queueStatus.pending} template(s) in queue. The extension will process them one by one (35 images each).
            </Alert>
          )}

          {/* Results Table */}
          {queuedTemplates.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                  Queued Templates ({queuedTemplates.length})
                </Typography>
                <IconButton size="small" onClick={() => setShowQueueDetails(!showQueueDetails)}>
                  {showQueueDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>
              <Collapse in={showQueueDetails}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Template ID</TableCell>
                      <TableCell>AI-Generated Search Query</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queuedTemplates.map((t) => (
                      <TableRow key={t.template_id}>
                        <TableCell>
                          <Chip label={t.template_id} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                        </TableCell>
                        <TableCell>{t.search_query}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Collapse>
            </Box>
          )}
        </Box>
      )}

      {/* Source Type Selector - only for manual/anime modes */}
      {inputMode !== 'template_scrape' && (
        <FormControl sx={{ mb: 3 }}>
          <FormLabel>Source Type</FormLabel>
          <RadioGroup
            row
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value as SourceType)
            }}
          >
            <FormControlLabel value="pinterest" control={<Radio />} label="Pinterest" />
            <FormControlLabel value="google_images" control={<Radio />} label="Google Images" />
          </RadioGroup>
        </FormControl>
      )}

      {/* Anime & Character Selection */}
      {inputMode === 'anime_selection' && (
        <Box sx={{ mb: 3 }}>
          <FormLabel sx={{ mb: 2, display: 'block' }}>Select Anime and Characters</FormLabel>
          <Box sx={{ maxHeight: 400, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
            <Stack spacing={3}>
              {animeConfigs.map((anime) => (
                <Box key={anime.id} sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, '&:last-child': { borderBottom: 0 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight="medium">
                      {anime.displayName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() => handleSelectAll(anime)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        Select All
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleDeselectAll(anime.id)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        Deselect All
                      </Button>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      mt: 1,
                      '& > *': {
                        flex: '1 1 120px',
                        minWidth: 0,
                      },
                    }}
                  >
                    {anime.characters.map((character) => {
                      const isSelected = (selectedCharacters[anime.id] || new Set()).has(character)
                      return (
                        <FormControlLabel
                          key={character}
                          control={
                            <Checkbox
                              checked={isSelected}
                              onChange={() => handleCharacterToggle(anime.id, character)}
                              size="small"
                            />
                          }
                          label={character.charAt(0).toUpperCase() + character.slice(1)}
                          sx={{ m: 0 }}
                        />
                      )
                    })}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Selected: {(selectedCharacters[anime.id] || new Set()).size} / {anime.characters.length}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {sourceType === 'pinterest' 
              ? 'Pinterest URLs will be automatically generated for each selected character using the format: "anime full name character"'
              : 'Google Images search URLs will be automatically generated for each selected character using the format: "anime full name character"'}
          </Typography>
        </Box>
      )}

      {/* Pinterest Input - Manual Mode */}
      {sourceType === 'pinterest' && inputMode === 'manual' && (
        <TextField
          fullWidth
          id="pinterest-urls"
          label="Pinterest URLs (one per line)"
          multiline
          rows={6}
          value={pinterestUrls}
          onChange={(e) => setPinterestUrls(e.target.value)}
          placeholder="https://www.pinterest.com/pin/123456789/&#10;https://www.pinterest.com/board/username/board-name/&#10;https://www.pinterest.com/search/pins/?q=anime"
          disabled={loading}
          sx={{ mb: 3 }}
          helperText="Enter Pinterest pin URLs, board URLs, or search result URLs"
        />
      )}

      {/* Google Images Input - Manual Mode */}
      {sourceType === 'google_images' && inputMode === 'manual' && (
        <TextField
          fullWidth
          id="google-terms"
          label="Search Terms (one per line)"
          multiline
          rows={6}
          value={googleSearchTerms}
          onChange={(e) => setGoogleSearchTerms(e.target.value)}
          placeholder="anime character art&#10;manga store display&#10;jujutsu kaisen fanart"
          disabled={loading}
          sx={{ mb: 3 }}
          helperText="Enter search terms. Each term will be searched on Google Images"
        />
      )}

      {/* Max Posts Input - only for manual/anime modes */}
      {inputMode !== 'template_scrape' && (
        <TextField
          fullWidth
          id="max-posts"
          label="Max Posts to Scrape"
          type="number"
          inputProps={{ min: 1, max: 1000 }}
          value={maxPosts}
          onChange={(e) => setMaxPosts(e.target.value)}
          placeholder="50"
          disabled={loading}
          sx={{ mb: 3 }}
          helperText="Maximum number of posts to scrape per URL/character (default: 200). The scraper will auto-scroll to load more posts for both Pinterest and Google Images."
        />
      )}

      {/* Start button - only for manual/anime modes */}
      {inputMode !== 'template_scrape' && (
        <Box>
          <Button
            onClick={handleStart}
            variant="contained"
            disabled={
              loading ||
              (sourceType === 'pinterest' && inputMode === 'manual' && !pinterestUrls.trim()) ||
              (sourceType === 'pinterest' && inputMode === 'anime_selection' && 
                Object.values(selectedCharacters).every(chars => chars.size === 0)) ||
              (sourceType === 'google_images' && inputMode === 'manual' && !googleSearchTerms.trim()) ||
              (sourceType === 'google_images' && inputMode === 'anime_selection' && 
                Object.values(selectedCharacters).every(chars => chars.size === 0))
            }
          >
            {loading ? 'Starting...' : 'Start Scraping'}
          </Button>
          {inputMode === 'anime_selection' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Total characters selected: {Object.values(selectedCharacters).reduce((sum, chars) => sum + chars.size, 0)}
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  )
}
