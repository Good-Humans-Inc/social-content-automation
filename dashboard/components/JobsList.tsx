'use client'

import { useState, useEffect } from 'react'
import {
  Paper,
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  LinearProgress,
  Dialog,
  Button,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CancelIcon from '@mui/icons-material/Cancel'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ReplayIcon from '@mui/icons-material/Replay'
import DeleteIcon from '@mui/icons-material/Delete'

interface Job {
  id: string
  template_id: string
  account_id: string
  post_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  logs: Array<{ timestamp: string; level: string; message: string }>
  error_message?: string
  video_url?: string
  created_at: string
  started_at?: string
  completed_at?: string
  templates?: { id: string; caption: string; persona: string; fandom: string }
  accounts?: { id: string; display_name: string }
}

interface JobsListPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface JobsListProps {
  initialJobs: Job[]
  pagination?: JobsListPagination
  statusFilter?: string
  dateFrom?: string
  dateTo?: string
  onPageChange?: (event: React.ChangeEvent<unknown>, page: number) => void
  onStatusFilterChange?: (status: string) => void
  onDateFilterChange?: (dateFrom: string, dateTo: string) => void
  onRefresh?: () => void
  loading?: boolean
}

export default function JobsList({
  initialJobs,
  pagination,
  statusFilter = '',
  dateFrom = '',
  dateTo = '',
  onPageChange,
  onStatusFilterChange,
  onDateFilterChange,
  onRefresh,
  loading: externalLoading = false,
}: JobsListProps) {
  const [jobs, setJobs] = useState(initialJobs)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(false)

  // Sync jobs from parent when pagination is used
  useEffect(() => {
    if (pagination !== undefined) {
      setJobs(initialJobs)
    }
  }, [initialJobs, pagination])

  const refreshJobs = async () => {
    if (onRefresh) {
      onRefresh()
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/jobs?limit=100')
      const data = await response.json()
      setJobs(data.data || [])
    } catch (err) {
      console.error('Failed to refresh jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (job: Job) => {
    if (!confirm(`Are you sure you want to cancel job "${job.id}"?`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to cancel job')
      }

      await refreshJobs()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel job')
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (job: Job) => {
    if (!job.id) {
      alert('Job ID is missing. Cannot retry job.')
      return
    }

    if (!confirm(`Are you sure you want to retry job "${job.id}"?`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'pending',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || errorData.details || 'Failed to retry job')
      }

      await refreshJobs()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry job')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (job: Job) => {
    if (!confirm(`Are you sure you want to delete job "${job.id}"? This will also delete the video from storage.`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || errorData.details || 'Failed to delete job')
      }

      await refreshJobs()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete job')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      case 'processing':
        return 'info'
      case 'cancelled':
        return 'default'
      default:
        return 'warning'
    }
  }

  // Auto-refresh every 5 seconds for processing jobs
  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessing = jobs.some(j => j.status === 'processing' || j.status === 'pending')
      if (hasProcessing) {
        refreshJobs()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [jobs])

  return (
    <>
      <Paper>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h6">Job Queue</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {onStatusFilterChange && (
                <ToggleButtonGroup
                  value={statusFilter || 'all'}
                  exclusive
                  onChange={(_e, value) => value != null && onStatusFilterChange(value === 'all' ? '' : value)}
                  size="small"
                  aria-label="Filter by status"
                  disabled={externalLoading}
                >
                  <ToggleButton value="all" aria-label="All">All</ToggleButton>
                  <ToggleButton value="pending" aria-label="Pending">Pending</ToggleButton>
                  <ToggleButton value="failed" aria-label="Failed">Failed</ToggleButton>
                  <ToggleButton value="completed" aria-label="Successfully created">Successfully created</ToggleButton>
                </ToggleButtonGroup>
              )}
              {onDateFilterChange && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    label="From date"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFilterChange(e.target.value, dateTo)}
                    InputLabelProps={{ shrink: true }}
                    disabled={externalLoading}
                    sx={{ width: 150 }}
                    inputProps={{ max: dateTo || undefined }}
                  />
                  <TextField
                    size="small"
                    label="To date"
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateFilterChange(dateFrom, e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    disabled={externalLoading}
                    sx={{ width: 150 }}
                    inputProps={{ min: dateFrom || undefined }}
                  />
                  {(dateFrom || dateTo) && (
                    <Button
                      size="small"
                      onClick={() => onDateFilterChange('', '')}
                      disabled={externalLoading}
                    >
                      Clear dates
                    </Button>
                  )}
                </Box>
              )}
              <IconButton onClick={refreshJobs} disabled={loading || externalLoading} size="small">
                <RefreshIcon />
              </IconButton>
            </Box>
          </Box>

          {externalLoading && (
            <LinearProgress sx={{ mb: 2 }} />
          )}

          {pagination && pagination.total > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </Typography>
          )}

          <Stack spacing={2}>
            {jobs.map((job) => (
              <Paper key={job.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" fontFamily="monospace">
                        {job.id.slice(0, 8)}...
                      </Typography>
                      <Chip label={job.status} size="small" color={getStatusColor(job.status) as any} />
                      <Chip label={job.post_type} size="small" variant="outlined" />
                      {job.templates && (
                        <Chip label={job.templates.caption} size="small" />
                      )}
                      {job.accounts && (
                        <Chip label={job.accounts.display_name} size="small" color="primary" />
                      )}
                    </Box>
                    <Box>
                      {job.status === 'failed' && (
                        <IconButton
                          size="small"
                          onClick={() => handleRetry(job)}
                          color="primary"
                          title="Retry job"
                        >
                          <ReplayIcon />
                        </IconButton>
                      )}
                      {(job.status === 'pending' || job.status === 'processing') && (
                        <IconButton
                          size="small"
                          onClick={() => handleCancel(job)}
                          color="error"
                          title="Cancel job"
                        >
                          <CancelIcon />
                        </IconButton>
                      )}
                      {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(job)}
                          color="error"
                          title="Delete job and video"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => setSelectedJob(job)}
                        title="View details"
                      >
                        <PlayArrowIcon />
                      </IconButton>
                    </Box>
                  </Box>

                  {job.status === 'processing' && (
                    <Box>
                      <LinearProgress variant="determinate" value={job.progress} />
                      <Typography variant="caption" color="text.secondary">
                        {job.progress}%
                      </Typography>
                    </Box>
                  )}

                  {job.error_message && (
                    <Alert severity="error" sx={{ py: 0 }}>
                      {job.error_message}
                    </Alert>
                  )}

                  {job.video_url && (
                    <Box>
                      <video src={job.video_url} controls style={{ width: '100%', maxHeight: '300px' }} />
                    </Box>
                  )}

                  <Typography variant="caption" color="text.secondary">
                    Created: {new Date(job.created_at).toLocaleString()}
                    {job.started_at && ` | Started: ${new Date(job.started_at).toLocaleString()}`}
                    {job.completed_at && ` | Completed: ${new Date(job.completed_at).toLocaleString()}`}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>

          {jobs.length === 0 && (
            <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              No jobs found
            </Typography>
          )}

          {pagination && onPageChange && pagination.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={pagination.totalPages}
                page={pagination.page}
                onChange={onPageChange}
                color="primary"
                showFirstButton
                showLastButton
                disabled={externalLoading}
              />
            </Box>
          )}
        </Box>
      </Paper>

      {/* Job Details Dialog */}
      <Dialog open={!!selectedJob} onClose={() => setSelectedJob(null)} maxWidth="md" fullWidth>
        {selectedJob && (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Job Details
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell><strong>ID</strong></TableCell>
                    <TableCell>{selectedJob.id}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell>
                      <Chip label={selectedJob.status} size="small" color={getStatusColor(selectedJob.status) as any} />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Progress</strong></TableCell>
                    <TableCell>{selectedJob.progress}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Post Type</strong></TableCell>
                    <TableCell>{selectedJob.post_type}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Template</strong></TableCell>
                    <TableCell>{selectedJob.template_id}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Account</strong></TableCell>
                    <TableCell>{selectedJob.account_id}</TableCell>
                  </TableRow>
                  {selectedJob.video_url && (
                    <TableRow>
                      <TableCell><strong>Video URL</strong></TableCell>
                      <TableCell>
                        <a href={selectedJob.video_url} target="_blank" rel="noopener noreferrer">
                          {selectedJob.video_url}
                        </a>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {selectedJob.logs && selectedJob.logs.length > 0 && (
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Logs ({selectedJob.logs.length})</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {selectedJob.logs.map((log, idx) => (
                      <Typography
                        key={idx}
                        variant="caption"
                        display="block"
                        sx={{
                          fontFamily: 'monospace',
                          color: log.level === 'error' ? 'error.main' : 'text.secondary',
                          py: 0.5,
                        }}
                      >
                        [{new Date(log.timestamp).toLocaleTimeString()}] [{log.level.toUpperCase()}] {log.message}
                      </Typography>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
              <Button onClick={() => setSelectedJob(null)}>Close</Button>
            </Box>
          </Box>
        )}
      </Dialog>
    </>
  )
}
