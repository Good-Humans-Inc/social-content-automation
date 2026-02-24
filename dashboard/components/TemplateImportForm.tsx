'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  IconButton,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

interface TemplateImportFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

interface ImportResult {
  success: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

export default function TemplateImportForm({ onSuccess, onCancel }: TemplateImportFormProps) {
  const [importMethod, setImportMethod] = useState<'file' | 'paste'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [pasteContent, setPasteContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const validateTemplate = (template: any, index: number): { valid: boolean; error?: string } => {
    if (!template.id) {
      return { valid: false, error: 'Missing id field' }
    }
    if (!template.persona) {
      return { valid: false, error: 'Missing persona field' }
    }
    if (!template.fandom) {
      return { valid: false, error: 'Missing fandom field' }
    }
    if (!template.intensity) {
      return { valid: false, error: 'Missing intensity field' }
    }
    
    // For character grid, overlay can be empty but carousel_type and grid_images are required
    if (template.carousel_type === 'character_grid') {
      if (!template.grid_images || template.grid_images < 1) {
        return { valid: false, error: 'Missing or invalid grid_images field (must be >= 1 for character_grid)' }
      }
      // Overlay can be empty array for character grid
      if (template.overlay !== undefined && !Array.isArray(template.overlay)) {
        return { valid: false, error: 'Invalid overlay field (must be array)' }
      }
    } else {
      // For rapid images, overlay is required
      if (!template.overlay || !Array.isArray(template.overlay) || template.overlay.length === 0) {
        return { valid: false, error: 'Missing or invalid overlay field (must be array with at least 1 item)' }
      }
    }
    
    if (!template.caption) {
      return { valid: false, error: 'Missing caption field' }
    }
    if (!template.tags || !Array.isArray(template.tags) || template.tags.length === 0) {
      return { valid: false, error: 'Missing or invalid tags field (must be array with at least 1 item)' }
    }
    return { valid: true }
  }

  const normalizeTemplate = (template: any) => {
    const normalized: any = {
      id: template.id.trim(),
      persona: template.persona.trim(),
      fandom: template.fandom.trim(),
      intensity: template.intensity.trim(),
      overlay: Array.isArray(template.overlay) 
        ? template.overlay.filter((line: string) => line.trim())
        : [],
      caption: template.caption.trim(),
      tags: (template.tags || []).map((tag: string) => tag.trim()).filter((tag: string) => tag),
      used: null,
    }
    
    // Add carousel fields if present
    if (template.carousel_type !== undefined) {
      normalized.carousel_type = template.carousel_type || null
    }
    if (template.grid_images !== undefined) {
      normalized.grid_images = template.grid_images || null
    }
    
    return normalized
  }

  const parseJSONL = (content: string) => {
    const templates = []
    const errors: Array<{ id: string; error: string }> = []

    // Try to parse as single JSON object first
    try {
      const parsed = JSON.parse(content.trim())
      
      // Check if it's a single template object (has template-specific fields)
      if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed.id && parsed.persona) {
        const validation = validateTemplate(parsed, 0)
        if (validation.valid) {
          templates.push(normalizeTemplate(parsed))
        } else {
          errors.push({
            id: parsed.id || 'template_1',
            error: validation.error || 'Invalid template',
          })
        }
        return { templates, errors }
      }
      
      // Check if it's a nested structure with arrays of template objects
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const arrayKeys = Object.keys(parsed).filter(key =>
          Array.isArray(parsed[key]) &&
          parsed[key].length > 0 &&
          typeof parsed[key][0] === 'object' &&
          parsed[key][0] !== null
        )
        
        if (arrayKeys.length > 0) {
          let templateIndex = 0
          for (const key of arrayKeys) {
            const templateArray = parsed[key]
            for (let i = 0; i < templateArray.length; i++) {
              templateIndex++
              const template = templateArray[i]
              const validation = validateTemplate(template, templateIndex)
              
              if (validation.valid) {
                templates.push(normalizeTemplate(template))
              } else {
                errors.push({
                  id: template.id || `${key}_${i + 1}`,
                  error: validation.error || 'Invalid template',
                })
              }
            }
          }
          return { templates, errors }
        }
      }
      
      // Check if it's an array of templates
      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i++) {
          const template = parsed[i]
          const validation = validateTemplate(template, i)
          
          if (validation.valid) {
            templates.push(normalizeTemplate(template))
          } else {
            errors.push({
              id: template.id || `template_${i + 1}`,
              error: validation.error || 'Invalid template',
            })
          }
        }
        return { templates, errors }
      }
    } catch (e) {
      // Not a single JSON object, try JSONL format (one per line)
    }

    // Try JSONL format (one JSON object per line)
    const lines = content.trim().split('\n').filter((line) => line.trim())
    
    for (let i = 0; i < lines.length; i++) {
      try {
        const template = JSON.parse(lines[i])
        const validation = validateTemplate(template, i)
        
        if (validation.valid) {
          templates.push(normalizeTemplate(template))
        } else {
          errors.push({
            id: template.id || `line_${i + 1}`,
            error: validation.error || 'Invalid template',
          })
        }
      } catch (err) {
        errors.push({
          id: `line_${i + 1}`,
          error: err instanceof Error ? err.message : 'Invalid JSON',
        })
      }
    }

    return { templates, errors }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.jsonl')) {
      setError('Please select a .jsonl file')
      return
    }

    setFile(selectedFile)
    setError(null)

    // Read file content
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setPasteContent(content)
    }
    reader.readAsText(selectedFile)
  }

  const handleImport = async () => {
    setError(null)
    setResult(null)

    let content = ''
    if (importMethod === 'file') {
      if (!file) {
        setError('Please select a file')
        return
      }
      content = pasteContent // Already loaded from file
    } else {
      content = pasteContent
      if (!content.trim()) {
        setError('Please paste JSONL content')
        return
      }
    }

    const { templates, errors: parseErrors } = parseJSONL(content)

    if (templates.length === 0) {
      setError('No valid templates found in JSONL. Please check the format.')
      if (parseErrors.length > 0) {
        setResult({
          success: 0,
          failed: parseErrors.length,
          errors: parseErrors,
        })
      }
      return
    }

    setLoading(true)

    try {
      // Import templates in batches
      const batchSize = 10
      const importErrors: Array<{ id: string; error: string }> = []
      let successCount = 0

      for (let i = 0; i < templates.length; i += batchSize) {
        const batch = templates.slice(i, i + batchSize)

        for (const template of batch) {
          try {
            const response = await fetch('/api/templates', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(template),
            })

            if (!response.ok) {
              const errorData = await response.json()
              importErrors.push({
                id: template.id,
                error: errorData.error || 'Failed to import',
              })
            } else {
              successCount++
            }
          } catch (err) {
            importErrors.push({
              id: template.id,
              error: err instanceof Error ? err.message : 'Network error',
            })
          }
        }
      }

      setResult({
        success: successCount,
        failed: importErrors.length + parseErrors.length,
        errors: [...parseErrors, ...importErrors],
      })

      if (successCount > 0 && onSuccess) {
        // Wait a bit before calling onSuccess to show results
        setTimeout(() => {
          onSuccess()
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import templates')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">
          Import Templates from JSONL
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

      {result && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
            <Typography variant="body2" fontWeight="medium" color="success.main">
              ✓ Success: {result.success}
            </Typography>
            <Typography variant="body2" fontWeight="medium" color="error.main">
              ✗ Failed: {result.failed}
            </Typography>
          </Box>
          {result.errors.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">
                  View errors ({result.errors.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 160, overflow: 'auto' }}>
                  {result.errors.map((err, idx) => (
                    <Typography key={idx} variant="caption" color="error" display="block" sx={{ py: 0.5 }}>
                      <strong>{err.id}:</strong> {err.error}
                    </Typography>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Import Method Selection */}
        <FormControl>
          <FormLabel>Import Method</FormLabel>
          <RadioGroup
            row
            value={importMethod}
            onChange={(e) => setImportMethod(e.target.value as 'file' | 'paste')}
          >
            <FormControlLabel value="file" control={<Radio />} label="Upload File" />
            <FormControlLabel value="paste" control={<Radio />} label="Paste Content" />
          </RadioGroup>
        </FormControl>

        {/* File Upload */}
        {importMethod === 'file' && (
          <Box>
            <Typography variant="body2" fontWeight="medium" sx={{ mb: 1 }}>
              JSONL File <span style={{ color: 'red' }}>*</span>
            </Typography>
            <Button variant="outlined" component="label" disabled={loading} fullWidth>
              Upload File
              <input
                type="file"
                accept=".jsonl"
                onChange={handleFileChange}
                hidden
              />
            </Button>
            {file && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </Typography>
            )}
          </Box>
        )}

        {/* Paste Content */}
        {importMethod === 'paste' && (
          <TextField
            fullWidth
            label="JSONL Content"
            required
            multiline
            rows={10}
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder='{"id":"anime_otome_001","persona":"anime_otome",...}&#10;{"id":"anime_otome_002","persona":"anime_otome",...}'
            disabled={loading}
            sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            helperText="Paste one template per line in JSONL format"
          />
        )}

        {/* Example Format */}
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Typography variant="caption" fontWeight="medium" display="block" gutterBottom>
            Supported Formats:
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box>
              <Typography variant="caption" fontWeight="medium" display="block" gutterBottom>
                1. JSONL (one per line):
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, bgcolor: 'white', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {`{"id":"anime_otome_001","persona":"anime_otome","fandom":"genshin_impact","intensity":"T0","overlay":["pov: you opened genshin 'just for dailies'","suddenly it's 3 hours later"],"caption":"time is fake when resin exists","tags":["#genshinimpact","#hoyoverse","#animegaming","#otakutok","#fyp"],"used":null}
{"id":"anime_otome_002","persona":"anime_otome","fandom":"genshin_impact","intensity":"T0",...}`}
              </Paper>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight="medium" display="block" gutterBottom>
                2. Nested JSON (with arrays):
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, bgcolor: 'white', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {`{
  "T0_templates": [
    {"id":"lads_T0_001","persona":"anime_otome","fandom":"love_and_deepspace",...},
    {"id":"lads_T0_002",...}
  ],
  "T1_templates": [...],
  "T2_templates": [...]
}`}
              </Paper>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight="medium" display="block" gutterBottom>
                3. Array of templates:
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, bgcolor: 'white', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {`[
  {"id":"template_001",...},
  {"id":"template_002",...}
]`}
              </Paper>
            </Box>
          </Box>
        </Paper>

        {/* Action Buttons */}
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
            type="button"
            onClick={handleImport}
            disabled={loading || (importMethod === 'file' && !file) || (importMethod === 'paste' && !pasteContent.trim())}
            variant="contained"
          >
            {loading ? 'Importing...' : 'Import Templates'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
