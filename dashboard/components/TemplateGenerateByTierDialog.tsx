'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Box,
  Typography,
  IconButton,
  Chip,
  Stack,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'

const TIERS = ['T0', 'T1', 'T2'] as const

interface FandomOption {
  id: string
  short_id: string
  display_name: string
}

interface TemplateGenerateByTierDialogProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function TemplateGenerateByTierDialog({
  open,
  onClose,
  onSuccess,
}: TemplateGenerateByTierDialogProps) {
  const [tier, setTier] = useState<'T0' | 'T1' | 'T2'>('T0')
  const [n, setN] = useState(10)
  const [persona, setPersona] = useState('anime_otome')
  const [fandomFilter, setFandomFilter] = useState<string>('')
  const [customFandom, setCustomFandom] = useState('')
  const [customFandomOnly, setCustomFandomOnly] = useState(false)
  const [autoStartId, setAutoStartId] = useState(true)
  const [startId, setStartId] = useState<number>(1)
  const [fandoms, setFandoms] = useState<FandomOption[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingNextId, setFetchingNextId] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; start_id: number; ids: string[]; errors?: string[] } | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/fandoms')
      .then((res) => (res.ok ? res.json() : { fandoms: [] }))
      .then((data) => setFandoms(data.fandoms ?? []))
      .catch(() => setFandoms([]))
  }, [open])

  useEffect(() => {
    if (!open || !autoStartId || !persona.trim()) return
    setFetchingNextId(true)
    fetch(`/api/templates/next-id?persona=${encodeURIComponent(persona.trim())}`)
      .then((res) => (res.ok ? res.json() : { next_id: 1 }))
      .then((data) => {
        setStartId(data.next_id ?? 1)
      })
      .catch(() => setStartId(1))
      .finally(() => setFetchingNextId(false))
  }, [open, autoStartId, persona])

  const handleGenerate = async () => {
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        tier,
        n,
        persona: persona.trim() || 'anime_otome',
      }
      if (!autoStartId) {
        body.start_id = startId
      }
      if (fandomFilter && !customFandomOnly) {
        body.fandom = fandomFilter
      }
      if (customFandom.trim()) {
        body.custom_fandom = customFandom.trim()
        if (customFandomOnly) {
          body.custom_fandom_only = true
        }
      }
      const res = await fetch('/api/templates/generate-by-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`)
      }
      setResult({
        created: data.created ?? 0,
        start_id: data.start_id ?? startId,
        ids: data.ids ?? [],
        errors: data.errors,
      })
      if (data.created > 0 && onSuccess) {
        onSuccess()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate templates')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setError(null)
    setResult(null)
    setCustomFandom('')
    setCustomFandomOnly(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHighIcon color="primary" />
          <span>Generate templates by tier</span>
        </Box>
        <IconButton size="small" onClick={handleClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Tier
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {TIERS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  onClick={() => setTier(t)}
                  color={t === 'T0' ? 'success' : t === 'T1' ? 'warning' : 'error'}
                  variant={tier === t ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </Box>

          <TextField
            label="Number of templates"
            type="number"
            value={n}
            onChange={(e) => setN(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
            inputProps={{ min: 1, max: 100 }}
            fullWidth
            size="small"
          />

          <TextField
            label="Persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="e.g. anime_otome"
            fullWidth
            size="small"
            helperText="Used for template IDs (e.g. anime_otome_00001)"
          />

          {!customFandomOnly && (
            <FormControl fullWidth size="small">
              <InputLabel>Fandom filter</InputLabel>
              <Select
                value={fandomFilter}
                label="Fandom filter"
                onChange={(e) => setFandomFilter(e.target.value)}
              >
                <MenuItem value="">All fandoms</MenuItem>
                {fandoms.map((f) => (
                  <MenuItem key={f.id} value={f.short_id}>
                    {f.display_name} ({f.short_id})
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Optional. Leave as &quot;All&quot; to let the model choose from all fandoms.
              </Typography>
            </FormControl>
          )}

          <TextField
            label="Custom fandom (new)"
            value={customFandom}
            onChange={(e) => setCustomFandom(e.target.value)}
            placeholder="e.g. One Piece, Spy x Family"
            fullWidth
            size="small"
            helperText="Use a fandom not in the list. Normalized key is auto-generated (e.g. one_piece)."
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={customFandomOnly}
                onChange={(e) => setCustomFandomOnly(e.target.checked)}
                disabled={loading || !customFandom.trim()}
              />
            }
            label="Use only this fandom (ignore list above)"
          />

          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoStartId}
                  onChange={(e) => setAutoStartId(e.target.checked)}
                  disabled={loading}
                />
              }
              label="Auto start ID from database (sequential)"
            />
            {!autoStartId && (
              <TextField
                label="Start ID"
                type="number"
                value={startId}
                onChange={(e) => setStartId(Math.max(1, parseInt(e.target.value, 10) || 1))}
                inputProps={{ min: 1 }}
                size="small"
                sx={{ mt: 1, width: 140 }}
              />
            )}
            {autoStartId && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Next ID for this persona: {fetchingNextId ? '…' : startId}
              </Typography>
            )}
          </Box>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {result && (
            <Alert severity={result.created > 0 ? 'success' : 'info'}>
              Created {result.created} template(s) starting at ID {result.start_id}.
              {result.errors && result.errors.length > 0 && (
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Warnings: {result.errors.slice(0, 3).join('; ')}
                  {result.errors.length > 3 && ` (+${result.errors.length - 3} more)`}
                </Typography>
              )}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={
            loading ||
            !persona.trim() ||
            (autoStartId && fetchingNextId) ||
            (customFandomOnly && !customFandom.trim())
          }
        >
          {loading ? 'Generating…' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
