'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Paper,
  Typography,
  Button,
  Box,
  Stack,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  CircularProgress,
  Divider,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PersonIcon from '@mui/icons-material/Person'
import GroupsIcon from '@mui/icons-material/Groups'
import SyncIcon from '@mui/icons-material/Sync'

interface Character {
  id: string
  fandom_id: string
  name: string
  aliases: string[]
  created_at: string
}

interface Fandom {
  id: string
  short_id: string
  display_name: string
  full_name: string
  aliases: string[]
  characters: Character[]
  created_at: string
}

export default function FandomsManager() {
  const [fandoms, setFandoms] = useState<Fandom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fandom dialog state
  const [fandomDialogOpen, setFandomDialogOpen] = useState(false)
  const [editingFandom, setEditingFandom] = useState<Fandom | null>(null)
  const [fandomForm, setFandomForm] = useState({
    short_id: '',
    display_name: '',
    full_name: '',
    aliases: '',
  })

  // Character dialog state
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [characterFandomId, setCharacterFandomId] = useState<string>('')
  const [characterForm, setCharacterForm] = useState({
    name: '',
    aliases: '',
  })

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'fandom' | 'character'
    id: string
    name: string
  } | null>(null)

  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchFandoms = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/fandoms')
      if (!res.ok) throw new Error('Failed to fetch fandoms')
      const data = await res.json()
      setFandoms(data.fandoms || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFandoms()
  }, [fetchFandoms])

  // Fandom CRUD
  const openAddFandom = () => {
    setEditingFandom(null)
    setFandomForm({ short_id: '', display_name: '', full_name: '', aliases: '' })
    setFandomDialogOpen(true)
  }

  const openEditFandom = (fandom: Fandom) => {
    setEditingFandom(fandom)
    setFandomForm({
      short_id: fandom.short_id,
      display_name: fandom.display_name,
      full_name: fandom.full_name,
      aliases: fandom.aliases.join(', '),
    })
    setFandomDialogOpen(true)
  }

  const handleSaveFandom = async () => {
    try {
      const aliases = fandomForm.aliases
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)

      if (editingFandom) {
        const res = await fetch('/api/fandoms', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingFandom.id,
            ...fandomForm,
            aliases,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update fandom')
        }
      } else {
        const res = await fetch('/api/fandoms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fandomForm, aliases }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create fandom')
        }
      }

      setFandomDialogOpen(false)
      fetchFandoms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // Character CRUD
  const openAddCharacter = (fandomId: string) => {
    setEditingCharacter(null)
    setCharacterFandomId(fandomId)
    setCharacterForm({ name: '', aliases: '' })
    setCharacterDialogOpen(true)
  }

  const openEditCharacter = (character: Character) => {
    setEditingCharacter(character)
    setCharacterFandomId(character.fandom_id)
    setCharacterForm({
      name: character.name,
      aliases: character.aliases.join(', '),
    })
    setCharacterDialogOpen(true)
  }

  const handleSaveCharacter = async () => {
    try {
      const aliases = characterForm.aliases
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)

      if (!aliases.includes(characterForm.name.toLowerCase().trim())) {
        aliases.unshift(characterForm.name.toLowerCase().trim())
      }

      if (editingCharacter) {
        const res = await fetch('/api/fandoms/characters', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingCharacter.id,
            name: characterForm.name,
            aliases,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update character')
        }
      } else {
        const res = await fetch('/api/fandoms/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fandom_id: characterFandomId,
            name: characterForm.name,
            aliases,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create character')
        }
      }

      setCharacterDialogOpen(false)
      fetchFandoms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // Delete
  const openDeleteConfirm = (type: 'fandom' | 'character', id: string, name: string) => {
    setDeleteTarget({ type, id, name })
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const endpoint =
        deleteTarget.type === 'fandom'
          ? `/api/fandoms?id=${deleteTarget.id}`
          : `/api/fandoms/characters?id=${deleteTarget.id}`

      const res = await fetch(endpoint, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }

      setDeleteDialogOpen(false)
      setDeleteTarget(null)
      fetchFandoms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleSyncFromTemplates = async () => {
    setSyncLoading(true)
    setSyncMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/fandoms/sync-from-templates', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSyncMessage(data.message || 'Sync complete.')
      fetchFandoms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncLoading(false)
    }
  }

  // Filter fandoms (and characters) by search query
  const searchLower = searchQuery.trim().toLowerCase()
  const filteredFandoms = searchLower
    ? fandoms
        .map((f) => {
          const fandomMatches =
            f.display_name.toLowerCase().includes(searchLower) ||
            f.short_id.toLowerCase().includes(searchLower) ||
            f.full_name.toLowerCase().includes(searchLower) ||
            (f.aliases || []).some((a) => String(a).toLowerCase().includes(searchLower))
          const matchingCharacters = (f.characters || []).filter(
            (c) =>
              c.name.toLowerCase().includes(searchLower) ||
              (c.aliases || []).some((a) => String(a).toLowerCase().includes(searchLower))
          )
          const characterMatches = matchingCharacters.length > 0
          if (fandomMatches) return { ...f, characters: f.characters }
          if (characterMatches) return { ...f, characters: matchingCharacters }
          return null
        })
        .filter((f): f is Fandom => f != null)
    : fandoms

  // Auto-generate short_id from display name
  const handleDisplayNameChange = (value: string) => {
    setFandomForm((prev) => ({
      ...prev,
      display_name: value,
      full_name: prev.full_name || value.toLowerCase(),
      short_id:
        prev.short_id || editingFandom
          ? prev.short_id
          : value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '')
              .substring(0, 20),
    }))
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {syncMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSyncMessage(null)}>
          {syncMessage}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" fontWeight="semibold">
            Manage Fandoms
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={syncLoading ? <CircularProgress size={18} /> : <SyncIcon />}
              onClick={handleSyncFromTemplates}
              disabled={syncLoading}
            >
              {syncLoading ? 'Syncing...' : 'Sync from templates'}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddFandom}>
              Add Fandom
            </Button>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Fandoms and characters are used for scraping, asset categorization, and organizing your content library.
          Adding a new fandom or character here will automatically make it available in scraping and asset upload.
        </Typography>

        <TextField
          fullWidth
          size="small"
          placeholder="Search fandoms or characters…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />

        {fandoms.length === 0 ? (
          <Alert severity="info">
            No fandoms configured yet. Click &quot;Add Fandom&quot; to get started.
          </Alert>
        ) : filteredFandoms.length === 0 ? (
          <Alert severity="info">
            No fandoms or characters match &quot;{searchQuery.trim()}&quot;. Try a different search or clear the search bar.
          </Alert>
        ) : (
          <Stack spacing={1}>
            {filteredFandoms.map((fandom) => (
              <Accordion key={fandom.id} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                    <GroupsIcon color="primary" />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography fontWeight="bold">{fandom.display_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: {fandom.short_id} &middot; Search name: &quot;{fandom.full_name}&quot; &middot;{' '}
                        {fandom.characters.length} character{fandom.characters.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Box
                      sx={{ display: 'flex', gap: 0.5 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Tooltip title="Edit fandom">
                        <IconButton size="small" onClick={() => openEditFandom(fandom)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete fandom">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => openDeleteConfirm('fandom', fandom.id, fandom.display_name)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {fandom.aliases.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                        Detection aliases:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {fandom.aliases.map((alias) => (
                          <Chip key={alias} label={alias} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}

                  <Divider sx={{ my: 1 }} />

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, mt: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Characters ({fandom.characters.length})
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => openAddCharacter(fandom.id)}
                    >
                      Add Character
                    </Button>
                  </Box>

                  {fandom.characters.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No characters added yet.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {fandom.characters.map((char) => (
                        <Chip
                          key={char.id}
                          icon={<PersonIcon />}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <span>{char.name}</span>
                              {char.aliases.length > 1 && (
                                <Typography
                                  component="span"
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ ml: 0.5 }}
                                >
                                  ({char.aliases.filter((a) => a !== char.name).join(', ')})
                                </Typography>
                              )}
                            </Box>
                          }
                          onDelete={() => openDeleteConfirm('character', char.id, char.name)}
                          onClick={() => openEditCharacter(char)}
                          sx={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}
      </Paper>

      {/* Add/Edit Fandom Dialog */}
      <Dialog
        open={fandomDialogOpen}
        onClose={() => setFandomDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingFandom ? 'Edit Fandom' : 'Add New Fandom'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Display Name"
              value={fandomForm.display_name}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="e.g., Genshin Impact"
              fullWidth
              required
              helperText="The name shown in the UI"
            />
            <TextField
              label="Short ID"
              value={fandomForm.short_id}
              onChange={(e) =>
                setFandomForm((prev) => ({
                  ...prev,
                  short_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                }))
              }
              placeholder="e.g., genshin"
              fullWidth
              required
              helperText="Used for asset folder names and internal references (lowercase, no spaces)"
              disabled={!!editingFandom}
            />
            <TextField
              label="Full Name (for search queries)"
              value={fandomForm.full_name}
              onChange={(e) =>
                setFandomForm((prev) => ({ ...prev, full_name: e.target.value }))
              }
              placeholder="e.g., genshin impact"
              fullWidth
              required
              helperText="Used when generating Pinterest/Google search queries"
            />
            <TextField
              label="Detection Aliases (comma-separated)"
              value={fandomForm.aliases}
              onChange={(e) =>
                setFandomForm((prev) => ({ ...prev, aliases: e.target.value }))
              }
              placeholder="e.g., genshin, genshin impact, gi"
              fullWidth
              helperText="Words that trigger this fandom in search terms during categorization"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFandomDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveFandom}
            disabled={!fandomForm.short_id || !fandomForm.display_name || !fandomForm.full_name}
          >
            {editingFandom ? 'Save Changes' : 'Add Fandom'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Character Dialog */}
      <Dialog
        open={characterDialogOpen}
        onClose={() => setCharacterDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingCharacter ? 'Edit Character' : 'Add New Character'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Character Name"
              value={characterForm.name}
              onChange={(e) =>
                setCharacterForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., zhongli"
              fullWidth
              required
              helperText="Full character name (lowercase)"
            />
            <TextField
              label="Aliases (comma-separated)"
              value={characterForm.aliases}
              onChange={(e) =>
                setCharacterForm((prev) => ({ ...prev, aliases: e.target.value }))
              }
              placeholder="e.g., zhongli, rex lapis, geo archon"
              fullWidth
              helperText="Alternative names used to detect this character in search queries. The character name is automatically included."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCharacterDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveCharacter}
            disabled={!characterForm.name.trim()}
          >
            {editingCharacter ? 'Save Changes' : 'Add Character'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{' '}
            {deleteTarget?.type === 'fandom' ? 'fandom' : 'character'}{' '}
            <strong>&quot;{deleteTarget?.name}&quot;</strong>?
            {deleteTarget?.type === 'fandom' &&
              ' This will also delete all characters in this fandom.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
