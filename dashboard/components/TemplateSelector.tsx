'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  TextField,
  InputAdornment,
  Chip,
  Pagination,
  Typography,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemText,
  InputLabel,
  FormControl,
  FormHelperText,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'

export interface TemplateOption {
  id: string
  persona: string
  fandom: string
  intensity: string
  caption: string
  overlay?: string[]
  carousel_type?: string | null
  grid_images?: number | null
}

const PAGE_SIZE = 15
const INTENSITY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'T0', label: 'T0' },
  { value: 'T1', label: 'T1' },
  { value: 'T2', label: 'T2' },
] as const

const FANDOM_LABELS: Record<string, string> = {
  love_and_deepspace: 'Love & Deepspace',
  jujutsu_kaisen: 'JJK',
  genshin_impact: 'Genshin',
  honkai_star_rail: 'HSR',
  blue_lock: 'Blue Lock',
  demon_slayer: 'Demon Slayer',
  my_hero_academia: 'MHA',
}

function getFandomLabel(value: string): string {
  return value ? (FANDOM_LABELS[value] ?? value.replace(/_/g, ' ')) : 'All'
}

interface TemplateSelectorProps {
  value: string
  onChange: (templateId: string, template: TemplateOption | null) => void
  label?: string
  required?: boolean
  disabled?: boolean
  allowEmpty?: boolean
  selectedTemplate?: TemplateOption | null
  helperText?: string
}

export default function TemplateSelector({
  value,
  onChange,
  label = 'Template',
  required = false,
  disabled = false,
  allowEmpty = false,
  selectedTemplate = null,
  helperText,
}: TemplateSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [intensity, setIntensity] = useState<string>('')
  const [fandom, setFandom] = useState<string>('')
  const [page, setPage] = useState(1)
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(false)
  const [fandomList, setFandomList] = useState<string[]>([])

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      if (intensity) params.set('intensity', intensity)
      if (fandom) params.set('fandom', fandom)
      if (search) params.set('q', search)
      const res = await fetch(`/api/templates?${params}`)
      if (!res.ok) throw new Error('Failed to load templates')
      const json = await res.json()
      setTemplates(json.data ?? [])
      setPagination({
        total: json.pagination?.total ?? 0,
        totalPages: json.pagination?.totalPages ?? 0,
      })
    } catch {
      setTemplates([])
      setPagination({ total: 0, totalPages: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, intensity, fandom, search])

  useEffect(() => {
    if (open) {
      setSearchInput('')
      setSearch('')
      setIntensity('')
      setFandom('')
      setPage(1)
    }
  }, [open])

  // Fetch fandoms for current intensity (only fandoms that have templates in this tier)
  useEffect(() => {
    if (!open) return
    const params = intensity ? `?intensity=${encodeURIComponent(intensity)}` : ''
    fetch(`/api/templates/fandoms${params}`)
      .then((res) => (res.ok ? res.json() : { fandoms: [] }))
      .then((data) => setFandomList(data.fandoms ?? []))
      .catch(() => setFandomList([]))
  }, [open, intensity])

  useEffect(() => {
    if (open) fetchTemplates()
  }, [open, page, intensity, fandom, search, fetchTemplates])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleIntensityChange = (v: string) => {
    setIntensity(v)
    setFandom('') // clear fandom so list only shows fandoms for this tier
    setPage(1)
  }

  const handleFandomChange = (v: string) => {
    setFandom(v)
    setPage(1)
  }

  const handleSelect = (template: TemplateOption) => {
    onChange(template.id, template)
    setOpen(false)
  }

  const handleClear = () => {
    onChange('', null)
    setOpen(false)
  }

  const displayValue = selectedTemplate
    ? `${selectedTemplate.id} — ${selectedTemplate.persona} • ${selectedTemplate.fandom} • ${selectedTemplate.intensity}`
    : value
    ? `Template ID: ${value}`
    : allowEmpty
    ? 'Choose a template...'
    : ''

  return (
    <FormControl fullWidth required={required} disabled={disabled} error={required && !value}>
      <InputLabel shrink sx={{ bgcolor: 'background.paper', px: 0.5 }}>
        {label}
      </InputLabel>
      <TextField
        fullWidth
        size="small"
        value={displayValue}
        onClick={() => !disabled && setOpen(true)}
        placeholder={allowEmpty ? 'None' : 'Select template...'}
        InputProps={{
          readOnly: true,
          endAdornment: <ArrowDropDownIcon sx={{ color: 'action.active' }} />,
          sx: { cursor: disabled ? 'default' : 'pointer' },
        }}
        sx={{ mt: 1 }}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select template</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
            <TextField
              placeholder="Search by ID, caption, persona, fandom…"
              size="small"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {INTENSITY_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value || 'all'}
                  label={opt.label}
                  onClick={() => handleIntensityChange(opt.value)}
                  color={
                    opt.value
                      ? (opt.value === 'T0' ? 'success' : opt.value === 'T1' ? 'warning' : 'error')
                      : 'default'
                  }
                  variant={intensity === opt.value ? 'filled' : 'outlined'}
                />
              ))}
              {allowEmpty && (
                <Chip label="Clear selection" onClick={handleClear} variant="outlined" />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Fandom:
              </Typography>
              <Chip
                label="All"
                onClick={() => handleFandomChange('')}
                variant={fandom === '' ? 'filled' : 'outlined'}
                size="small"
              />
              {fandomList.map((f) => (
                <Chip
                  key={f}
                  label={getFandomLabel(f)}
                  onClick={() => handleFandomChange(f)}
                  variant={fandom === f ? 'filled' : 'outlined'}
                  size="small"
                />
              ))}
            </Box>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <List dense sx={{ maxHeight: 320, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  {templates.map((template) => (
                    <ListItemButton
                      key={template.id}
                      selected={template.id === value}
                      onClick={() => handleSelect(template)}
                    >
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight="medium">
                            {template.id}
                          </Typography>
                        }
                        secondary={`${template.persona} • ${template.fandom} • ${template.intensity}`}
                      />
                    </ListItemButton>
                  ))}
                </List>
                {templates.length === 0 && !loading && (
                  <Typography color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                    No templates found
                  </Typography>
                )}
                {pagination.totalPages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                    <Pagination
                      count={pagination.totalPages}
                      page={page}
                      onChange={(_, p) => setPage(p)}
                      color="primary"
                      size="small"
                    />
                  </Box>
                )}
                {pagination.total > 0 && (
                  <Typography variant="caption" color="text.secondary" textAlign="center">
                    {pagination.total} template{pagination.total !== 1 ? 's' : ''} total
                  </Typography>
                )}
              </>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </FormControl>
  )
}
