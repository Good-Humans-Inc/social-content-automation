'use client'

import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ListIcon from '@mui/icons-material/List'

interface CategoryMappingTemplate {
  template_id: string
  fandom: string
  tags: string[]
  matched_subcategory: string | null
}

interface SubcategoryInfo {
  name: string
  asset_count: number
}

interface CategoryMappingItem {
  category: string
  label: string
  subcategories: SubcategoryInfo[]
  templates: CategoryMappingTemplate[]
}

export default function CategoryMappingButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{ categories: CategoryMappingItem[] } | null>(null)

  const handleOpen = async () => {
    setOpen(true)
    setError(null)
    setData(null)
    setLoading(true)
    try {
      const res = await fetch('/api/jobs/category-mapping')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Failed to load mapping')
        return
      }
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setData(null)
    setError(null)
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        variant="outlined"
        color="primary"
        startIcon={<ListIcon />}
      >
        Category / subcategory mapping
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Categories, subcategories & template match</DialogTitle>
        <DialogContent>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {data?.categories?.length === 0 && !loading && (
            <Typography color="text.secondary">No categories or templates found.</Typography>
          )}
          {data?.categories?.map((cat) => (
            <Accordion key={cat.category} defaultExpanded={cat.category === 'jjk'}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography fontWeight="medium">{cat.label}</Typography>
                  <Chip label={`${cat.subcategories.length} subcategories`} size="small" variant="outlined" />
                  <Chip label={`${cat.templates.length} templates`} size="small" variant="outlined" />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
                  Subcategories (character folders):
                </Typography>
                {cat.subcategories.length ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                    {cat.subcategories.map((sub) => (
                      <Chip
                        key={sub.name}
                        label={`${sub.name} (${sub.asset_count})`}
                        size="small"
                        color={sub.asset_count >= 35 ? 'success' : sub.asset_count > 0 ? 'warning' : 'default'}
                        variant="outlined"
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    — no scraped character folders found
                  </Typography>
                )}
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Template ID</TableCell>
                        <TableCell>Fandom</TableCell>
                        <TableCell>Tags</TableCell>
                        <TableCell>Matches subcategory</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cat.templates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                            No templates in this fandom
                          </TableCell>
                        </TableRow>
                      ) : (
                        cat.templates.map((t) => (
                          <TableRow key={t.template_id}>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {t.template_id}
                            </TableCell>
                            <TableCell>{t.fandom}</TableCell>
                            <TableCell sx={{ maxWidth: 200 }}>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {(t.tags || []).slice(0, 5).map((tag, i) => (
                                  <Chip key={i} label={tag} size="small" sx={{ fontSize: '0.7rem' }} />
                                ))}
                                {(t.tags?.length || 0) > 5 && (
                                  <Chip label={`+${(t.tags?.length || 0) - 5}`} size="small" />
                                )}
                              </Box>
                            </TableCell>
                            <TableCell>
                              {t.matched_subcategory ? (
                                <Chip label={t.matched_subcategory} size="small" color="success" />
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  —
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
