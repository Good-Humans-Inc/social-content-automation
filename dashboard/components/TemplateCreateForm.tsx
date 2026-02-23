'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  IconButton,
  Grid,
  Paper,
  Collapse,
  List,
  ListItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'

interface Template {
  id: string
  persona: string
  fandom: string
  intensity: string
  overlay: string[]
  caption: string
  tags: string[]
  carousel_type?: string | null
  grid_images?: number | null
}

export interface Template {
  id: string
  persona: string
  fandom: string
  intensity: string
  overlay: string[]
  caption: string
  tags: string[]
  carousel_type?: string | null
  grid_images?: number | null
}

interface TemplateCreateFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  initialTemplate?: Template | null
  isEdit?: boolean
}

const PERSONAS = [
  'anime_otome',
  'anime_shounen',
  'anime_casual',
  'gacha_gamer',
  'weeb_culture',
]

const FANDOMS = [
  'love_and_deepspace',
  'jujutsu_kaisen',
  'genshin_impact',
  'honkai_star_rail',
  'blue_lock',
  'demon_slayer',
  'my_hero_academia',
]

const INTENSITY_TIERS = [
  { value: 'T0', label: 'T0 - Pure fandom (50% of content)', description: 'No BabyMilu mention, just relatable memes' },
  { value: 'T1', label: 'T1 - Soft mention (30% of content)', description: 'Mentions AI plush/Discord without naming' },
  { value: 'T2', label: 'T2 - Direct mention (20% of content)', description: 'Explicit BabyMilu Discord mention' },
]

const OVERLAY_FORMATS = [
  'POV: [relatable situation]',
  'Today I [action]',
  'Vote: [option A] or [option B]?',
  'Question: [rhetorical question]',
  'Rant: [complaint]',
  'Emo: [emotional statement]',
  'Me: [action] / Also me: [reaction]',
]

type TemplateType = 'rapid_images' | 'character_grid'

export default function TemplateCreateForm({ onSuccess, onCancel, initialTemplate, isEdit = false }: TemplateCreateFormProps) {
  const isCharacterGrid = initialTemplate?.carousel_type === 'character_grid'
  const [templateType, setTemplateType] = useState<TemplateType>(
    isCharacterGrid ? 'character_grid' : 'rapid_images'
  )
  const [formData, setFormData] = useState({
    id: initialTemplate?.id || '',
    persona: initialTemplate?.persona || '',
    fandom: initialTemplate?.fandom || '',
    intensity: initialTemplate?.intensity || 'T0',
    overlay: initialTemplate?.overlay && initialTemplate.overlay.length > 0 
      ? initialTemplate.overlay 
      : ['', ''],
    caption: initialTemplate?.caption || '',
    tags: initialTemplate?.tags && initialTemplate.tags.length > 0 
      ? initialTemplate.tags 
      : ['', '', '', '', ''],
    carousel_type: initialTemplate?.carousel_type || '',
    grid_images: initialTemplate?.grid_images || 4,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFormatHints, setShowFormatHints] = useState(false)

  const generateId = () => {
    if (formData.persona && formData.fandom) {
      const base = `${formData.persona}_${formData.fandom}`
      // Generate a simple ID - in production, you might want to check for duplicates
      const timestamp = Date.now().toString().slice(-6)
      return `${base}_${timestamp}`
    }
    return ''
  }

  const handlePersonaChange = (persona: string) => {
    setFormData({ ...formData, persona })
    if (!formData.id) {
      setFormData((prev) => ({ ...prev, id: generateId() }))
    }
  }

  const handleFandomChange = (fandom: string) => {
    setFormData({ ...formData, fandom })
    if (!formData.id) {
      setFormData((prev) => ({ ...prev, id: generateId() }))
    }
  }

  const handleOverlayChange = (index: number, value: string) => {
    const newOverlay = [...formData.overlay]
    newOverlay[index] = value
    setFormData({ ...formData, overlay: newOverlay })
  }

  const addOverlayLine = () => {
    setFormData({ ...formData, overlay: [...formData.overlay, ''] })
  }

  const removeOverlayLine = (index: number) => {
    if (formData.overlay.length > 1) {
      const newOverlay = formData.overlay.filter((_, i) => i !== index)
      setFormData({ ...formData, overlay: newOverlay })
    }
  }

  const handleTagChange = (index: number, value: string) => {
    const newTags = [...formData.tags]
    newTags[index] = value
    setFormData({ ...formData, tags: newTags })
  }

  const validateForm = () => {
    if (!formData.id.trim()) {
      setError('Template ID is required')
      return false
    }
    if (!formData.persona) {
      setError('Persona is required')
      return false
    }
    if (!formData.fandom) {
      setError('Fandom is required')
      return false
    }
    if (!formData.intensity) {
      setError('Intensity tier is required')
      return false
    }
    
    // For rapid images, overlay is required
    if (templateType === 'rapid_images') {
      if (formData.overlay.filter((line) => line.trim()).length < 1) {
        setError('At least one overlay line is required for rapid images video')
        return false
      }
    }
    
    // For character grid, carousel_type and grid_images are required
    if (templateType === 'character_grid') {
      if (!formData.carousel_type.trim()) {
        setError('Carousel type is required for character grid templates')
        return false
      }
      if (!formData.grid_images || formData.grid_images < 1) {
        setError('Grid images count must be at least 1')
        return false
      }
    }
    
    if (!formData.caption.trim()) {
      setError('Caption is required')
      return false
    }
    const validTags = formData.tags.filter((tag) => tag.trim())
    if (validTags.length < 3) {
      setError('At least 3 tags are required')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const payload: any = {
        id: formData.id.trim(),
        persona: formData.persona,
        fandom: formData.fandom,
        intensity: formData.intensity,
        overlay: templateType === 'character_grid' ? [] : formData.overlay.filter((line) => line.trim()),
        caption: formData.caption.trim(),
        tags: formData.tags.filter((tag) => tag.trim()).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)),
      }
      
      // Add carousel fields if character grid type, otherwise set to null
      if (templateType === 'character_grid') {
        payload.carousel_type = formData.carousel_type.trim()
        payload.grid_images = formData.grid_images
      } else {
        payload.carousel_type = null
        payload.grid_images = null
      }

      const response = await fetch('/api/templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create template')
      }

      // Reset form
      setTemplateType('rapid_images')
      setFormData({
        id: '',
        persona: '',
        fandom: '',
        intensity: 'T0',
        overlay: ['', ''],
        caption: '',
        tags: ['', '', '', '', ''],
        carousel_type: '',
        grid_images: 4,
      })

      if (onSuccess) {
        onSuccess()
      } else {
        window.location.reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">
          {isEdit ? 'Edit Template' : 'Create New Template'}
        </Typography>
        {onCancel && (
          <IconButton onClick={onCancel} disabled={loading} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Template Type Selection */}
        <FormControl>
          <FormLabel>Template Type</FormLabel>
          <RadioGroup
            row
            value={templateType}
            onChange={(e) => {
              const newType = e.target.value as TemplateType
              setTemplateType(newType)
              // Reset overlay for character grid
              if (newType === 'character_grid') {
                setFormData({ 
                  ...formData, 
                  overlay: [], 
                  carousel_type: formData.carousel_type || 'character_grid',
                  grid_images: formData.grid_images || 4
                })
              } else {
                setFormData({ 
                  ...formData, 
                  overlay: formData.overlay.length > 0 ? formData.overlay : ['', ''], 
                  carousel_type: '', 
                  grid_images: 4 
                })
              }
            }}
          >
            <FormControlLabel
              value="rapid_images"
              control={<Radio />}
              label="Rapid Images Video (with overlay text)"
            />
            <FormControlLabel
              value="character_grid"
              control={<Radio />}
              label="Character Grid Carousel (4 images in grid)"
            />
          </RadioGroup>
        </FormControl>

        {/* Basic Info */}
        {/* Template ID - Full width row */}
        <TextField
          fullWidth
          label="Template ID"
          required
          value={formData.id}
          onChange={(e) => setFormData({ ...formData, id: e.target.value })}
          placeholder="anime_otome_001"
          helperText={isEdit ? "Template ID cannot be changed" : "Auto-generated when persona/fandom selected"}
          disabled={isEdit}
          sx={{ mb: 2 }}
        />

        {/* Persona and Fandom - Side by side */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          <FormControl required sx={{ flex: 1 }}>
            <InputLabel>Persona</InputLabel>
            <Select
              value={formData.persona}
              onChange={(e) => handlePersonaChange(e.target.value)}
              label="Persona"
            >
              {PERSONAS.map((persona) => (
                <MenuItem key={persona} value={persona}>
                  {persona}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl required sx={{ flex: 1 }}>
            <InputLabel>Fandom</InputLabel>
            <Select
              value={formData.fandom}
              onChange={(e) => handleFandomChange(e.target.value)}
              label="Fandom"
            >
              {FANDOMS.map((fandom) => (
                <MenuItem key={fandom} value={fandom}>
                  {fandom.replace(/_/g, ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Intensity Tier - Full width row */}
        <FormControl fullWidth required sx={{ mb: 2 }}>
          <InputLabel>Intensity Tier</InputLabel>
          <Select
            value={formData.intensity}
            onChange={(e) => setFormData({ ...formData, intensity: e.target.value })}
            label="Intensity Tier"
          >
            {INTENSITY_TIERS.map((tier) => (
              <MenuItem key={tier.value} value={tier.value}>
                {tier.label}
              </MenuItem>
            ))}
          </Select>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {INTENSITY_TIERS.find((t) => t.value === formData.intensity)?.description}
          </Typography>
        </FormControl>

        {/* Character Grid Settings */}
        {templateType === 'character_grid' && (
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Carousel Type"
                required
                value={formData.carousel_type}
                onChange={(e) => setFormData({ ...formData, carousel_type: e.target.value })}
                placeholder="character_grid"
                helperText="Type of carousel (e.g., 'character_grid')"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Grid Images"
                required
                type="number"
                value={formData.grid_images}
                onChange={(e) => setFormData({ ...formData, grid_images: parseInt(e.target.value) || 4 })}
                inputProps={{ min: 1, max: 9 }}
                helperText="Number of images in grid (typically 4 for 2x2)"
              />
            </Grid>
          </Grid>
        )}

        {/* Overlay Lines - Only for Rapid Images */}
        {templateType === 'rapid_images' && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" fontWeight="medium">
                Overlay Text (2-3 lines) <span style={{ color: 'red' }}>*</span>
              </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                type="button"
                size="small"
                onClick={() => setShowFormatHints(!showFormatHints)}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {showFormatHints ? 'Hide' : 'Show'} Format Hints
              </Button>
              <Button
                type="button"
                size="small"
                variant="outlined"
                onClick={addOverlayLine}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                + Add Line
              </Button>
            </Box>
          </Box>

          <Collapse in={showFormatHints}>
            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'info.light' }}>
              <Typography variant="caption" fontWeight="medium" display="block" gutterBottom>
                Format Examples:
              </Typography>
              <List dense sx={{ listStyle: 'disc', pl: 2 }}>
                {OVERLAY_FORMATS.map((format, idx) => (
                  <ListItem key={idx} sx={{ display: 'list-item', py: 0.5 }}>
                    <Typography variant="caption">{format}</Typography>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Collapse>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {formData.overlay.map((line, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  value={line}
                  onChange={(e) => handleOverlayChange(index, e.target.value)}
                  placeholder={`Overlay line ${index + 1} (max 15 words)`}
                  size="small"
                />
                {formData.overlay.length > 1 && (
                  <IconButton
                    type="button"
                    onClick={() => removeOverlayLine(index)}
                    color="error"
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Short, relatable lines. Use formats like "POV:", "Me:", "Today I", etc.
            </Typography>
          </Box>
        )}

        {/* Caption */}
        <TextField
          fullWidth
          required
          label="Caption"
          value={formData.caption}
          onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
          placeholder="time is fake when resin exists"
          helperText="Casual, lowercase, relatable (5-10 words). No salesy language."
        />

        {/* Tags */}
        <Box>
          <Typography variant="body2" fontWeight="medium" sx={{ mb: 1 }}>
            Tags (5 recommended) <span style={{ color: 'red' }}>*</span>
          </Typography>
          <Grid container spacing={1}>
            {formData.tags.map((tag, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <TextField
                  fullWidth
                  value={tag}
                  onChange={(e) => handleTagChange(index, e.target.value)}
                  placeholder={`Tag ${index + 1}${index < 2 ? ' (fandom)' : index === 2 ? ' (general)' : index === 3 ? ' (emotional)' : ' (traffic)'}`}
                  size="small"
                />
              </Grid>
            ))}
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Structure: 2 fandom tags, 1 general anime/gaming, 1 emotional/interactive, 1 traffic (#fyp). # will be added automatically.
          </Typography>
        </Box>

        {/* Submit Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          {onCancel && (
            <Button
              type="button"
              onClick={onCancel}
              disabled={loading}
              variant="outlined"
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={loading}
            variant="contained"
          >
            {loading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Template' : 'Create Template')}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
