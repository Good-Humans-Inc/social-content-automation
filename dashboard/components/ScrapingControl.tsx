'use client'

import { useState } from 'react'
import { animeConfigs, generatePinterestUrl, generateGoogleImagesUrl, type AnimeConfig } from '../lib/animeConfig'
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
} from '@mui/material'

type SourceType = 'pinterest' | 'google_images'
type InputMode = 'manual' | 'anime_selection'

export default function ScrapingControl() {
  const [sourceType, setSourceType] = useState<SourceType>('pinterest')
  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [pinterestUrls, setPinterestUrls] = useState('')
  const [googleSearchTerms, setGoogleSearchTerms] = useState('')
  const [maxPosts, setMaxPosts] = useState<string>('200')
  const [loading, setLoading] = useState(false)
  
  // Anime selection state
  const [selectedCharacters, setSelectedCharacters] = useState<Record<string, Set<string>>>({})

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

  // Handle select all characters for an anime
  const handleSelectAll = (anime: AnimeConfig) => {
    const allCharacters = new Set(anime.characters)
    setSelectedCharacters(prev => ({
      ...prev,
      [anime.id]: allCharacters
    }))
  }

  // Handle deselect all characters for an anime
  const handleDeselectAll = (animeId: string) => {
    setSelectedCharacters(prev => {
      const updated = { ...prev }
      delete updated[animeId]
      return updated
    })
  }

  const handleStart = async () => {
    console.log('[DEBUG] handleStart called')
    console.log('[DEBUG] State:', {
      sourceType,
      inputMode,
      maxPosts,
      selectedCharacters,
      pinterestUrls: pinterestUrls.substring(0, 50) + '...',
      googleSearchTerms: googleSearchTerms.substring(0, 50) + '...'
    })
    
    setLoading(true)
    try {
      let targetUrls: string[] = []
      let searchTerms: string[] = []

      if (inputMode === 'anime_selection') {
        console.log('[DEBUG] Anime selection mode - generating URLs')
        // Generate URLs from selected characters
        for (const anime of animeConfigs) {
          const selected = selectedCharacters[anime.id] || new Set()
          console.log(`[DEBUG] Anime ${anime.id}: ${selected.size} characters selected`)
          for (const character of selected) {
            if (sourceType === 'pinterest') {
              const url = generatePinterestUrl(anime, character)
              console.log(`[DEBUG] Generated Pinterest URL for ${anime.id} - ${character}:`, url)
              targetUrls.push(url)
            } else if (sourceType === 'google_images') {
              const url = generateGoogleImagesUrl(anime, character)
              console.log(`[DEBUG] Generated Google Images URL for ${anime.id} - ${character}:`, url)
              targetUrls.push(url)
              searchTerms.push(`${anime.fullName} ${character}`)
            }
          }
        }
        
        console.log(`[DEBUG] Total URLs generated: ${targetUrls.length}`)
        if (targetUrls.length === 0) {
          console.log('[DEBUG] No characters selected, showing alert')
          alert('Please select at least one character to scrape')
          setLoading(false)
          return
        }
      } else if (sourceType === 'pinterest') {
        console.log('[DEBUG] Manual Pinterest mode')
        targetUrls = pinterestUrls
          .split('\n')
          .map((url) => url.trim())
          .filter((url) => url.length > 0 && url.includes('pinterest.com'))
        
        console.log(`[DEBUG] Parsed ${targetUrls.length} Pinterest URLs`)
        if (targetUrls.length === 0) {
          console.log('[DEBUG] No valid URLs, showing alert')
          alert('Please enter at least one valid Pinterest URL')
          setLoading(false)
          return
        }
      } else {
        console.log('[DEBUG] Google Images mode')
        // Google Images - convert search terms to URLs
        searchTerms = googleSearchTerms
          .split('\n')
          .map((term) => term.trim())
          .filter((term) => term.length > 0)
        
        console.log(`[DEBUG] Parsed ${searchTerms.length} search terms`)
        if (searchTerms.length === 0) {
          console.log('[DEBUG] No search terms, showing alert')
          alert('Please enter at least one search term')
          setLoading(false)
          return
        }

        // Convert search terms to Google Images search URLs
        targetUrls = searchTerms.map(term => {
          const encoded = encodeURIComponent(term)
          return `https://www.google.com/search?q=${encoded}&tbm=isch`
        })
        console.log(`[DEBUG] Generated ${targetUrls.length} Google Images URLs`)
      }

      // Parse max posts (default to 200 if invalid)
      const maxPostsNum = parseInt(maxPosts) || 200
      console.log(`[DEBUG] Max posts: ${maxPostsNum}`)
      if (maxPostsNum < 1) {
        console.log('[DEBUG] Invalid max posts, showing alert')
        alert('Max posts must be at least 1')
        setLoading(false)
        return
      }

      const requestBody = {
        target_urls: targetUrls,
        source_type: sourceType,
        search_terms: sourceType === 'google_images' ? searchTerms : [],
        max_posts: maxPostsNum,
      }
      
      console.log('[DEBUG] Sending request to /api/scraping/trigger')
      console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2))

      // Trigger extension directly - no job queue
      const response = await fetch('/api/scraping/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      console.log('[DEBUG] Response status:', response.status)
      console.log('[DEBUG] Response ok:', response.ok)

      if (response.ok) {
        const responseData = await response.json()
        console.log('[DEBUG] Response data:', responseData)
        
        setPinterestUrls('')
        setGoogleSearchTerms('')
        // Clear selected characters after successful start
        if (inputMode === 'anime_selection') {
          setSelectedCharacters({})
        }
        
        // Show success message
        const characterCount = inputMode === 'anime_selection' 
          ? Object.values(selectedCharacters).reduce((sum, chars) => sum + chars.size, 0)
          : targetUrls.length
        console.log(`[DEBUG] Success! Starting scraping for ${characterCount} character(s)`)
        alert(`Starting scraping for ${characterCount} character(s)! The extension will scrape ${maxPostsNum} images per character.`)
      } else {
        const error = await response.json()
        console.error('[DEBUG] Error response:', error)
        alert(`Failed to trigger scraping: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('[DEBUG] Exception caught:', error)
      console.error('Error starting scraping job:', error)
      alert(`Error starting scraping job: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      console.log('[DEBUG] Setting loading to false')
      setLoading(false)
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" fontWeight="semibold" sx={{ mb: 3 }}>
        Start New Scraping Job
      </Typography>
      
      {/* Source Type Selector */}
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

      {/* Input Mode Selector */}
      <FormControl sx={{ mb: 3 }}>
        <FormLabel>Input Mode</FormLabel>
        <RadioGroup
          row
          value={inputMode}
          onChange={(e) => setInputMode(e.target.value as InputMode)}
        >
          <FormControlLabel value="manual" control={<Radio />} label="Manual URLs" />
          <FormControlLabel value="anime_selection" control={<Radio />} label="Anime & Character Selection" />
        </RadioGroup>
      </FormControl>

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

      {/* Max Posts Input */}
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
    </Paper>
  )
}
