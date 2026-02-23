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
  Alert,
  Stack,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import TemplatesList from './TemplatesList'
import TemplateCreateButton from './TemplateCreateButton'
import Link from 'next/link'
import { Button, Container } from '@mui/material'

const PAGE_SIZE = 10
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

export default function TemplatesPageContent() {
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [intensity, setIntensity] = useState<string>('')
  const [fandom, setFandom] = useState<string>('')
  const [fandomList, setFandomList] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [templates, setTemplates] = useState<any[]>([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      if (intensity) params.set('intensity', intensity)
      if (fandom) params.set('fandom', fandom)
      if (search) params.set('q', search)
      const res = await fetch(`/api/templates?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load templates')
      }
      const json = await res.json()
      setTemplates(json.data ?? [])
      setPagination({
        total: json.pagination?.total ?? 0,
        totalPages: json.pagination?.totalPages ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [page, intensity, fandom, search])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // Fetch fandoms for current intensity (only fandoms that have templates in this tier)
  useEffect(() => {
    const params = intensity ? `?intensity=${encodeURIComponent(intensity)}` : ''
    fetch(`/api/templates/fandoms${params}`)
      .then((res) => (res.ok ? res.json() : { fandoms: [] }))
      .then((data) => setFandomList(data.fandoms ?? []))
      .catch(() => setFandomList([]))
  }, [intensity])

  // Debounce search input -> search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleIntensityChange = (value: string) => {
    setIntensity(value)
    setFandom('') // clear fandom so list only shows fandoms for this tier
    setPage(1)
  }

  const handleFandomChange = (value: string) => {
    setFandom(value)
    setPage(1)
  }

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value)
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Templates
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TemplateCreateButton />
          <Link href="/api/templates/export" style={{ textDecoration: 'none' }}>
            <Button variant="contained" color="success">
              Export JSONL
            </Button>
          </Link>
        </Box>
      </Box>

      <Stack spacing={2} sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <TextField
            placeholder="Search by ID, caption, persona, fandom…"
            size="small"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            {INTENSITY_OPTIONS.map((opt) => (
              <Chip
                key={opt.value || 'all'}
                label={opt.label}
                onClick={() => handleIntensityChange(opt.value)}
                color={opt.value ? (opt.value === 'T0' ? 'success' : opt.value === 'T1' ? 'warning' : 'error') : 'default'}
                variant={intensity === opt.value ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
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
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TemplatesList
              initialTemplates={templates}
              onDeleteSuccess={fetchTemplates}
            />
            {pagination.totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 3 }}>
                <Pagination
                  count={pagination.totalPages}
                  page={page}
                  onChange={handlePageChange}
                  color="primary"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
            {pagination.total > 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Page {page} of {pagination.totalPages} · {pagination.total} template{pagination.total !== 1 ? 's' : ''} total
              </Typography>
            )}
          </>
        )}
      </Stack>
    </Container>
  )
}
