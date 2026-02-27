'use client'

import { useState, useEffect } from 'react'
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
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ReplayIcon from '@mui/icons-material/Replay'
import TemplateCreateForm, { Template } from './TemplateCreateForm'

// Template interface is now imported from TemplateCreateForm
interface TemplateWithMetadata extends Template {
  used: any
  created_at: string
}

interface TemplatesListProps {
  initialTemplates: TemplateWithMetadata[]
  onDeleteSuccess?: () => void
}

export default function TemplatesList({ initialTemplates, onDeleteSuccess }: TemplatesListProps) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearingUsedId, setClearingUsedId] = useState<string | null>(null)

  useEffect(() => {
    setTemplates(initialTemplates)
  }, [initialTemplates])

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
                        {template.used && (
                          <Chip label="Used" size="small" color="error" />
                        )}
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
                    {template.tags && template.tags.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                        {template.tags.map((tag, idx) => (
                          <Chip
                            key={idx}
                            label={tag}
                            size="small"
                            variant="outlined"
                          />
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
    </>
  )
}

