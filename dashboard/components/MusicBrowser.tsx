'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  CircularProgress,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  Alert,
  LinearProgress,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import MusicNoteIcon from '@mui/icons-material/MusicNote'
import UploadIcon from '@mui/icons-material/Upload'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import SyncIcon from '@mui/icons-material/Sync'
import { createClient } from '@/lib/supabase/client'

interface MusicAsset {
  id: string
  url: string
  storage_path?: string
  tags?: string[]
  metadata?: any
  created_at: string
}

// Supported music tags
const MUSIC_TAGS = ['japan', 'anime', 'edm', 'phonk', 'lofi', 'trap', 'piano']

// Extract tags from filename
function extractTagsFromFilename(filename: string): string[] {
  const lowerFilename = filename.toLowerCase()
  const extractedTags: string[] = []
  
  MUSIC_TAGS.forEach(tag => {
    if (lowerFilename.includes(tag)) {
      extractedTags.push(tag)
    }
  })
  
  return extractedTags
}

export default function MusicBrowser() {
  const [musicAssets, setMusicAssets] = useState<MusicAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [editingAsset, setEditingAsset] = useState<MusicAsset | null>(null)
  const [editTags, setEditTags] = useState<string[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioRefs, setAudioRefs] = useState<Map<string, HTMLAudioElement>>(new Map())
  const [syncing, setSyncing] = useState(false)

  const supabase = createClient()

  // Fetch music assets: query only music (category=music or path in music bucket) so we don't hit the 1000-row default limit
  const fetchMusicAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('assets')
        .select('*')
        .or('category.eq.music,storage_path.ilike.music/%')
        .order('created_at', { ascending: false })
        .limit(500)

      if (fetchError) throw fetchError

      setMusicAssets(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load music')
      console.error('Error fetching music:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const handleSyncFromBucket = useCallback(async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/assets/sync-music', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSuccess(data.message || `Synced ${data.synced ?? 0} file(s) from bucket.`)
      await fetchMusicAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync from bucket')
    } finally {
      setSyncing(false)
    }
  }, [fetchMusicAssets])

  useEffect(() => {
    fetchMusicAssets()
  }, [fetchMusicAssets])

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)
    setSuccess(null)

    try {
      const fileArray = Array.from(files)
      let uploadedCount = 0
      let failedCount = 0
      const totalFiles = fileArray.length

      // Upload files sequentially to avoid FormData parsing issues with multiple files
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        
        try {
          // Upload one file at a time
          const formData = new FormData()
          formData.append('file', file) // Use 'file' (singular) to match single-file pattern

          const response = await fetch('/api/assets/upload-music', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || `Failed to upload ${file.name}`)
          }

          uploadedCount++
          // Update progress
          const progress = ((i + 1) / totalFiles) * 100
          setUploadProgress(progress)
        } catch (fileError) {
          failedCount++
          console.error(`Error uploading ${file.name}:`, fileError)
          // Continue with other files even if one fails
        }
      }

      if (uploadedCount > 0) {
        setSuccess(`Successfully uploaded ${uploadedCount} of ${totalFiles} music file(s)${failedCount > 0 ? ` (${failedCount} failed)` : ''}`)
      } else {
        setError(`Failed to upload all ${totalFiles} file(s)`)
      }
      
      await fetchMusicAssets()
      setUploadProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload music')
      console.error('Error uploading music:', err)
    } finally {
      setUploading(false)
      setUploadProgress(0)
      // Reset file input
      event.target.value = ''
    }
  }

  // Handle edit tags
  const handleEditTags = (asset: MusicAsset) => {
    setEditingAsset(asset)
    setEditTags(asset.tags || [])
  }

  const handleSaveTags = async () => {
    if (!editingAsset) return

    try {
      // Use API route to update tags (bypasses RLS using admin client)
      const response = await fetch(`/api/assets/${editingAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: editTags }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update tags')
      }

      setSuccess('Tags updated successfully')
      setEditingAsset(null)
      await fetchMusicAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tags')
    }
  }

  // Handle delete
  const handleDelete = async (assetId: string, storagePath?: string) => {
    if (!confirm('Are you sure you want to delete this music file?')) return

    setDeleting(assetId)
    setError(null)

    // Stop playing if this track is currently playing
    if (playingId === assetId) {
      const audio = audioRefs.get(assetId)
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setPlayingId(null)
    }

    try {
      // Use API route to delete (bypasses RLS using admin client)
      // The API route will also handle storage deletion
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete music')
      }

      // Clean up audio ref
      const newRefs = new Map(audioRefs)
      newRefs.delete(assetId)
      setAudioRefs(newRefs)

      setSuccess('Music file deleted successfully')
      await fetchMusicAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete music')
    } finally {
      setDeleting(null)
    }
  }

  // Handle play/pause
  const handlePlayPause = (asset: MusicAsset) => {
    let audio = audioRefs.get(asset.id)

    // Create audio element if it doesn't exist
    if (!audio) {
      audio = new Audio(asset.url)
      audio.preload = 'metadata'
      
      // Handle audio events
      audio.addEventListener('ended', () => {
        setPlayingId(null)
      })
      
      audio.addEventListener('error', () => {
        setError(`Failed to load audio: ${asset.metadata?.filename || 'Unknown'}`)
        setPlayingId(null)
      })

      const newRefs = new Map(audioRefs)
      newRefs.set(asset.id, audio)
      setAudioRefs(newRefs)
    }

    // If this track is playing, pause it
    if (playingId === asset.id) {
      audio.pause()
      setPlayingId(null)
    } else {
      // Pause any currently playing track
      if (playingId) {
        const currentAudio = audioRefs.get(playingId)
        if (currentAudio) {
          currentAudio.pause()
          currentAudio.currentTime = 0
        }
      }
      
      // Play this track
      audio.play().catch((err) => {
        console.error('Error playing audio:', err)
        setError('Failed to play audio. Please check if the file is accessible.')
        setPlayingId(null)
      })
      setPlayingId(asset.id)
    }
  }

  // Cleanup audio refs on unmount
  useEffect(() => {
    return () => {
      audioRefs.forEach((audio) => {
        audio.pause()
        audio.src = ''
      })
      setAudioRefs(new Map())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" fontWeight="bold">
          Music Library
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <input
            accept="audio/*"
            style={{ display: 'none' }}
            id="music-upload-input"
            multiple
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <label htmlFor="music-upload-input">
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              component="span"
              disabled={uploading}
            >
              Upload Music
            </Button>
          </label>
          <Button
            variant="outlined"
            startIcon={syncing ? <CircularProgress size={18} /> : <SyncIcon />}
            onClick={handleSyncFromBucket}
            disabled={loading || uploading || syncing}
          >
            {syncing ? 'Syncing...' : 'Sync from bucket'}
          </Button>
          <Button
            variant="outlined"
            onClick={fetchMusicAssets}
            disabled={loading || uploading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Uploading music files...
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Music List */}
      {!loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {musicAssets.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <MusicNoteIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No music files found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload music here, or if you added files directly in Supabase Storage → music bucket, click &quot;Sync from bucket&quot; to list them here.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<SyncIcon />}
                onClick={handleSyncFromBucket}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : 'Sync from bucket'}
              </Button>
            </Box>
          ) : (
            musicAssets.map((asset) => (
              <Card 
                key={asset.id} 
                sx={{ 
                  '&:hover': { boxShadow: 4 },
                  ...(playingId === asset.id && { 
                    border: '2px solid',
                    borderColor: 'primary.main',
                    bgcolor: 'action.selected'
                  })
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      {/* Play/Pause Button */}
                      <Tooltip title={playingId === asset.id ? 'Pause' : 'Play'}>
                        <IconButton
                          color="primary"
                          onClick={() => handlePlayPause(asset)}
                          disabled={deleting === asset.id}
                          sx={{ 
                            mt: -1,
                            ...(playingId === asset.id && { 
                              bgcolor: 'primary.main',
                              color: 'primary.contrastText',
                              '&:hover': { bgcolor: 'primary.dark' }
                            })
                          }}
                        >
                          {playingId === asset.id ? <PauseIcon /> : <PlayArrowIcon />}
                        </IconButton>
                      </Tooltip>
                      
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <MusicNoteIcon color="primary" />
                          <Typography variant="h6" component="div">
                            {asset.metadata?.filename || asset.storage_path?.split('/').pop() || 'Unknown'}
                          </Typography>
                          {playingId === asset.id && (
                            <Chip 
                              label="Playing" 
                              size="small" 
                              color="primary" 
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Box>
                        {asset.tags && asset.tags.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                            {asset.tags.map((tag, idx) => (
                              <Chip
                                key={idx}
                                label={tag}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {new Date(asset.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Edit Tags">
                        <IconButton
                          size="small"
                          onClick={() => handleEditTags(asset)}
                          disabled={deleting === asset.id || playingId === asset.id}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(asset.id, asset.storage_path)}
                          disabled={deleting === asset.id}
                        >
                          {deleting === asset.id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <DeleteIcon />
                          )}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </Box>
      )}

      {/* Edit Tags Dialog */}
      <Dialog open={!!editingAsset} onClose={() => setEditingAsset(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Tags</DialogTitle>
        <DialogContent>
          <Autocomplete
            multiple
            options={MUSIC_TAGS}
            value={editTags}
            onChange={(_, newValue) => setEditTags(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Tags"
                placeholder="Select tags"
                sx={{ mt: 2 }}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option}
                  label={option}
                  size="small"
                />
              ))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingAsset(null)}>Cancel</Button>
          <Button onClick={handleSaveTags} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
