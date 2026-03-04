'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Paper,
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  Dialog,
  Button,
  Alert,
  Tooltip,
  Card,
  CardMedia,
  CardActions,
  CircularProgress,
  Checkbox,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ReplayIcon from '@mui/icons-material/Replay'
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary'
import TemplateCreateForm, { Template } from './TemplateCreateForm'

const SCRAPED_ASSET_THRESHOLD = 35

interface LinkedAsset {
  id: string
  url: string
  storage_path?: string
  category?: string
  subcategory?: string
  metadata?: Record<string, unknown>
  created_at?: string
}

// Template interface is now imported from TemplateCreateForm
interface TemplateWithMetadata extends Template {
  used: any
  created_at: string
  asset_count?: number
}

interface TemplatesListProps {
  initialTemplates: TemplateWithMetadata[]
  onDeleteSuccess?: () => void
}

export default function TemplatesList({ initialTemplates, onDeleteSuccess }: TemplatesListProps) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithMetadata | null>(null)
  const [managingAssetsTemplate, setManagingAssetsTemplate] = useState<TemplateWithMetadata | null>(null)
  const [linkedAssets, setLinkedAssets] = useState<LinkedAsset[]>([])
  const [linkedAssetsLoading, setLinkedAssetsLoading] = useState(false)
  const [unlinkingAssetId, setUnlinkingAssetId] = useState<string | null>(null)
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [clearingUsedId, setClearingUsedId] = useState<string | null>(null)

  useEffect(() => {
    setTemplates(initialTemplates)
  }, [initialTemplates])

  const fetchLinkedAssets = useCallback(async (templateId: string) => {
    setLinkedAssetsLoading(true)
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/assets`)
      if (!res.ok) throw new Error('Failed to load assets')
      const json = await res.json()
      setLinkedAssets(json.data ?? [])
    } catch {
      setLinkedAssets([])
    } finally {
      setLinkedAssetsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (managingAssetsTemplate) {
      fetchLinkedAssets(managingAssetsTemplate.id)
    } else {
      setLinkedAssets([])
    }
  }, [managingAssetsTemplate, fetchLinkedAssets])

  const handleManageAssets = (template: TemplateWithMetadata) => {
    setManagingAssetsTemplate(template)
    setError(null)
  }

  const handleCloseManageAssets = () => {
    setManagingAssetsTemplate(null)
    setUnlinkingAssetId(null)
    setSelectedAssetIds(new Set())
  }

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  const handleUnlinkAsset = async (templateId: string, assetId: string) => {
    setUnlinkingAssetId(assetId)
    setError(null)
    try {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/assets/${encodeURIComponent(assetId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove image')
      }
      setLinkedAssets((prev) => prev.filter((a) => a.id !== assetId))
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, asset_count: Math.max(0, (t.asset_count ?? 0) - 1) }
            : t
        )
      )
      setSelectedAssetIds((prev) => {
        const next = new Set(prev)
        next.delete(assetId)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image')
    } finally {
      setUnlinkingAssetId(null)
    }
  }

  const handleRemoveSelected = async () => {
    if (!managingAssetsTemplate || selectedAssetIds.size === 0) return
    setError(null)
    const templateId = managingAssetsTemplate.id
    const ids = Array.from(selectedAssetIds)
    for (const assetId of ids) {
      try {
        const res = await fetch(
          `/api/templates/${encodeURIComponent(templateId)}/assets/${encodeURIComponent(assetId)}`,
          { method: 'DELETE' }
        )
        if (!res.ok) throw new Error('Failed to remove')
        setLinkedAssets((prev) => prev.filter((a) => a.id !== assetId))
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? { ...t, asset_count: Math.max(0, (t.asset_count ?? 0) - 1) }
              : t
          )
        )
      } catch {
        setError('Failed to remove some images')
        break
      }
    }
    setSelectedAssetIds(new Set())
  }

  const handleClearAll = async () => {
    if (!managingAssetsTemplate || linkedAssets.length === 0) return
    if (!confirm(`Remove all ${linkedAssets.length} images from this template?`)) return
    setError(null)
    const templateId = managingAssetsTemplate.id
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/assets`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to clear all')
      }
      setLinkedAssets([])
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, asset_count: 0 } : t))
      )
      setSelectedAssetIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear all')
    }
  }

  const handleEdit = (template: TemplateWithMetadata) => {
    setEditingTemplate(template)
  }

  const handleClearUsed = async (template: TemplateWithMetadata) => {
    setClearingUsedId(template.id)
    setError(null)
    try {
      const response = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: template.id, used: null }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to clear used')
      }
      setTemplates((prev) =>
        prev.map((t) => (t.id === template.id ? { ...t, used: null } : t))
      )
      if (onDeleteSuccess) onDeleteSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear used')
    } finally {
      setClearingUsedId(null)
    }
  }

  const handleDelete = async (template: TemplateWithMetadata) => {
    if (!confirm(`Are you sure you want to delete template "${template.id}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/templates?id=${template.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete template')
      }

      if (onDeleteSuccess) {
        onDeleteSuccess()
      } else {
        setTemplates(templates.filter(t => t.id !== template.id))
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  const handleUpdate = () => {
    // Refresh templates list
    window.location.reload()
  }

  const handleCloseEdit = () => {
    setEditingTemplate(null)
  }

  return (
    <>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper>
        <Box sx={{ p: 3 }}>
          <Stack spacing={2}>
            {templates.map((template) => {
              const isCharacterGrid = template.carousel_type === 'character_grid'
              
              return (
                <Paper
                  key={template.id}
                  variant="outlined"
                  sx={{ p: 2, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body1" fontWeight="medium">
                          {template.id}
                        </Typography>
                        <Chip label={template.persona} size="small" color="primary" />
                        <Chip label={template.fandom} size="small" color="success" />
                        <Chip label={template.intensity} size="small" color="secondary" />
                        {typeof template.asset_count === 'number' && template.asset_count >= SCRAPED_ASSET_THRESHOLD && (
                          <Chip label="Scraped" size="small" color="info" variant="outlined" />
                        )}
                        {template.used && (
                          <Chip label="Used" size="small" color="error" />
                        )}
                        {template.tags && template.tags.length > 0 && template.tags.slice(0, 5).map((tag, idx) => (
                          <Chip key={idx} label={tag} size="small" variant="outlined" sx={{ fontFamily: 'inherit' }} />
                        ))}
                        {isCharacterGrid && (
                          <Chip 
                            label={`Carousel: ${template.carousel_type} (${template.grid_images || 4} images)`} 
                            size="small" 
                            color="info"
                          />
                        )}
                        {!isCharacterGrid && template.overlay && template.overlay.length > 0 && (
                          <Chip 
                            label="Rapid Images" 
                            size="small" 
                            variant="outlined"
                          />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        {template.used && (
                          <Tooltip title="Mark unused (allow auto-generate to use this template again)">
                            <IconButton
                              size="small"
                              onClick={() => handleClearUsed(template)}
                              disabled={clearingUsedId === template.id}
                              color="default"
                              aria-label="Mark unused"
                            >
                              <ReplayIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {(typeof template.asset_count === 'number' && template.asset_count > 0) && (
                          <Tooltip title="Manage scraped images (remove from this template)">
                            <IconButton
                              size="small"
                              onClick={() => handleManageAssets(template)}
                              color="info"
                              aria-label="Manage assets"
                            >
                              <PhotoLibraryIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(template)}
                          color="primary"
                          aria-label="Edit"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(template)}
                          color="error"
                          aria-label="Delete"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {template.caption}
                    </Typography>
                    {template.overlay && template.overlay.length > 0 && (
                      <Box>
                        {template.overlay.map((line, idx) => (
                          <Typography key={idx} variant="caption" color="text.secondary" display="block">
                            {line}
                          </Typography>
                        ))}
                      </Box>
                    )}
                    {template.tags && template.tags.length > 5 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {template.tags.slice(5).map((tag, idx) => (
                          <Chip key={idx} label={tag} size="small" variant="outlined" />
                        ))}
                      </Box>
                    )}
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
          {templates.length === 0 && (
            <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              No templates found
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Edit Dialog */}
      <Dialog 
        open={!!editingTemplate} 
        onClose={handleCloseEdit} 
        maxWidth="md" 
        fullWidth
      >
        {editingTemplate && (
          <TemplateCreateForm
            initialTemplate={editingTemplate}
            isEdit={true}
            onSuccess={handleUpdate}
            onCancel={handleCloseEdit}
          />
        )}
      </Dialog>

      {/* Manage template assets dialog */}
      <Dialog
        open={!!managingAssetsTemplate}
        onClose={handleCloseManageAssets}
        maxWidth="md"
        fullWidth
      >
        {managingAssetsTemplate && (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Images linked to template: {managingAssetsTemplate.id}
            </Typography>
            {error && (
              <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select images to unlink from this template (they stay in your assets library). When you queue scraping again, only the missing amount (up to 35) will be scraped.
            </Typography>
            {linkedAssetsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : linkedAssets.length === 0 ? (
              <>
                <Typography color="text.secondary">No images linked to this template yet.</Typography>
                <Box sx={{ mt: 2 }}>
                  <Button onClick={handleCloseManageAssets}>Close</Button>
                </Box>
              </>
            ) : (
              <>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={selectedAssetIds.size === 0}
                    onClick={handleRemoveSelected}
                  >
                    Remove selected ({selectedAssetIds.size})
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={handleClearAll}
                  >
                    Clear all
                  </Button>
                  <Button size="small" onClick={handleCloseManageAssets}>
                    Close
                  </Button>
                </Stack>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.5,
                  }}
                >
                  {linkedAssets.map((asset) => (
                    <Card
                      key={asset.id}
                      variant="outlined"
                      sx={{
                        width: 100,
                        flexShrink: 0,
                        border: selectedAssetIds.has(asset.id) ? 2 : 1,
                        borderColor: selectedAssetIds.has(asset.id) ? 'primary.main' : 'divider',
                      }}
                      onClick={() => toggleAssetSelection(asset.id)}
                    >
                      <Box sx={{ position: 'relative' }}>
                        <Checkbox
                          size="small"
                          checked={selectedAssetIds.has(asset.id)}
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            zIndex: 1,
                            color: 'white',
                            '&.Mui-checked': { color: 'primary.main' },
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleAssetSelection(asset.id)}
                        />
                        <CardMedia
                          component="img"
                          image={asset.url}
                          alt=""
                          sx={{
                            width: 100,
                            height: 100,
                            objectFit: 'cover',
                          }}
                        />
                      </Box>
                      <CardActions sx={{ justifyContent: 'center', py: 0.5, px: 0.5 }}>
                        <Button
                          size="small"
                          color="error"
                          disabled={unlinkingAssetId === asset.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUnlinkAsset(managingAssetsTemplate.id, asset.id)
                          }}
                          sx={{ minWidth: 0, fontSize: '0.7rem' }}
                        >
                          Remove
                        </Button>
                      </CardActions>
                    </Card>
                  ))}
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Button onClick={handleCloseManageAssets}>Close</Button>
                </Box>
              </>
            )}
          </Box>
        )}
      </Dialog>
    </>
  )
}

