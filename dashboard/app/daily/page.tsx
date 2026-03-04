'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Container,
  Typography,
  Box,
  Paper,
  Card,
  CardContent,
  Chip,
  Button,
  Alert,
  CircularProgress,
  TextField,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import Checkbox from '@mui/material/Checkbox'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

interface AccountSummary {
  name: string
  success: number
  failed: number
  pending: number
  total: number
  target: number
  byIntensity: Record<string, number>
  available_videos: number
  posted_today: number
}

interface DailySummary {
  date: string
  totalPosts: number
  successCount: number
  failedCount: number
  pendingCount: number
  intensityTotals: Record<string, number>
  byAccount: Record<string, AccountSummary>
  topFailReasons: { reason: string; count: number }[]
  recentLogs: any[]
  totalAvailable: number
  totalPostedToday: number
}

interface VideoDetail {
  id: string
  template_id: string
  video_url?: string
  caption: string
  fandom: string
  intensity: string
  created_at: string
}

interface RunDailyPlanItem {
  account_id: string
  display_name: string
  daily_target: number
  already_posted: number
  remaining: number
  available_videos: number
  will_post: number
  video_ids?: string[]
  all_videos?: VideoDetail[]
}

interface RunDailyResult {
  dry_run: boolean
  date: string
  plan: RunDailyPlanItem[]
  total_to_post?: number
  total_posted?: number
  total_failed?: number
  results?: Array<{
    video_job_id: string
    account_id: string
    status: 'success' | 'failed'
    error?: string
  }>
}

export default function DailyPage() {
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])

  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runPlan, setRunPlan] = useState<RunDailyResult | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<RunDailyResult | null>(null)

  // Per-account overrides: will_post count and selected video IDs
  const [willPostOverrides, setWillPostOverrides] = useState<Record<string, number>>({})
  const [selectedVideoIds, setSelectedVideoIds] = useState<Record<string, Set<string>>>({})
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [previewVideo, setPreviewVideo] = useState<{ url: string; caption: string } | null>(null)
  const [scheduleAtLondon, setScheduleAtLondon] = useState('20:00')

  const fetchSummary = useCallback(async (targetDate: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/daily-summary?date=${targetDate}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSummary(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load summary')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary(date)
  }, [date, fetchSummary])

  const handleDryRun = async () => {
    setRunLoading(true)
    setRunError(null)
    setRunResult(null)
    try {
      const res = await fetch('/api/run-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRunPlan(data)
      // Initialize overrides from plan defaults
      const wpOverrides: Record<string, number> = {}
      const vidSelections: Record<string, Set<string>> = {}
      for (const item of (data.plan || [])) {
        wpOverrides[item.account_id] = item.will_post
        vidSelections[item.account_id] = new Set(item.video_ids || [])
      }
      setWillPostOverrides(wpOverrides)
      setSelectedVideoIds(vidSelections)
      setExpandedAccounts(new Set())
      setRunDialogOpen(true)
    } catch (err: any) {
      setRunError(err.message || 'Failed to preview')
    } finally {
      setRunLoading(false)
    }
  }

  const handleExecute = async () => {
    setRunLoading(true)
    setRunError(null)
    try {
      // Build overrides from user selections
      const overrides: Record<string, { will_post: number; video_ids: string[] }> = {}
      for (const item of (runPlan?.plan || [])) {
        const wp = willPostOverrides[item.account_id] ?? item.will_post
        const ids = selectedVideoIds[item.account_id]
        overrides[item.account_id] = {
          will_post: wp,
          video_ids: ids ? Array.from(ids) : (item.video_ids || []),
        }
      }
      const res = await fetch('/api/run-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false, overrides, schedule_at_london: scheduleAtLondon }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRunResult(data)
      fetchSummary(date)
    } catch (err: any) {
      setRunError(err.message || 'Failed to run daily')
    } finally {
      setRunLoading(false)
    }
  }

  const accountEntries = summary ? Object.entries(summary.byAccount) : []

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 4, md: 5 }, px: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 0.5 }}>
            Daily Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View posting activity and upload generated videos to accounts
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            size="small"
            InputProps={{ startAdornment: <CalendarTodayIcon sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }} /> }}
          />
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchSummary(date)}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={runLoading ? <CircularProgress size={18} /> : <PlayArrowIcon />}
            onClick={handleDryRun}
            disabled={runLoading}
            color="success"
          >
            Run Daily
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {runError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setRunError(null)}>
          {runError}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }} color="text.secondary">Loading summary...</Typography>
        </Box>
      ) : summary ? (
        <>
          {/* Top-Level Stats */}
          <Box sx={{ display: 'flex', gap: 3, mb: 4, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                  Videos Available
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="h3" fontWeight="bold" color="info.main">
                    {summary.totalAvailable}
                  </Typography>
                  <VideoLibraryIcon sx={{ color: 'info.main', fontSize: 28 }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Ready to post (unposted)
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                  Posted Today
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="h3" fontWeight="bold" color="success.main">
                    {summary.totalPostedToday}
                  </Typography>
                  <CheckCircleIcon sx={{ color: 'success.main', fontSize: 28 }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Uploaded via GeeLark
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                  Total Logs
                </Typography>
                <Typography variant="h3" fontWeight="bold" color="primary.main">
                  {summary.totalPosts}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {summary.successCount} success, {summary.failedCount} failed
                  {(summary.pendingCount ?? 0) > 0 && `, ${summary.pendingCount} pending`}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                  Intensity Mix
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                  {Object.entries(summary.intensityTotals).map(([tier, count]) => (
                    <Chip
                      key={tier}
                      label={`${tier}: ${count}`}
                      size="small"
                      color={tier === 'T0' ? 'success' : tier === 'T1' ? 'warning' : 'error'}
                      variant="outlined"
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Per-Account Breakdown */}
          <Paper elevation={0} sx={{ mb: 4, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
              <Typography variant="h6" fontWeight="semibold">
                Per-Account Breakdown
              </Typography>
            </Box>
            <Box sx={{ p: 3 }}>
              {accountEntries.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                  No account data for this date
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {accountEntries.map(([id, acct]) => {
                    const progress = acct.target > 0 ? Math.min(100, (acct.posted_today / acct.target) * 100) : 0
                    return (
                      <Paper key={id} variant="outlined" sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body1" fontWeight="medium">{acct.name}</Typography>
                          <Chip
                            label={`${acct.posted_today}/${acct.target} posted`}
                            size="small"
                            color={acct.posted_today >= acct.target ? 'success' : 'warning'}
                          />
                          <Chip
                            icon={<VideoLibraryIcon sx={{ fontSize: 16 }} />}
                            label={`${acct.available_videos} available`}
                            size="small"
                            color="info"
                            variant="outlined"
                          />
                          {acct.failed > 0 && (
                            <Chip label={`${acct.failed} failed`} size="small" color="error" variant="outlined" />
                          )}
                          {(acct.pending ?? 0) > 0 && (
                            <Chip label={`${acct.pending} pending`} size="small" color="warning" variant="outlined" />
                          )}
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          sx={{ height: 8, borderRadius: 4, mb: 1 }}
                          color={progress >= 100 ? 'success' : 'primary'}
                        />
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {Object.entries(acct.byIntensity).map(([tier, cnt]) => (
                            cnt > 0 && <Chip key={tier} label={`${tier}: ${cnt}`} size="small" variant="outlined" />
                          ))}
                        </Box>
                      </Paper>
                    )
                  })}
                </Stack>
              )}
            </Box>
          </Paper>

          {/* Top Fail Reasons */}
          {summary.topFailReasons.length > 0 && (
            <Paper elevation={0} sx={{ mb: 4, border: 1, borderColor: 'error.light', borderRadius: 2 }}>
              <Box sx={{ p: 3, borderBottom: 1, borderColor: 'error.light', bgcolor: 'error.50' }}>
                <Typography variant="h6" fontWeight="semibold" color="error.main">
                  Top Failure Reasons
                </Typography>
              </Box>
              <Box sx={{ p: 3 }}>
                <Stack spacing={1}>
                  {summary.topFailReasons.map((fr, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ wordBreak: 'break-word', flex: 1 }}>
                        {fr.reason}
                      </Typography>
                      <Chip label={`x${fr.count}`} size="small" color="error" sx={{ ml: 1 }} />
                    </Box>
                  ))}
                </Stack>
              </Box>
            </Paper>
          )}
        </>
      ) : null}

      {/* Run Daily Dialog */}
      <Dialog open={runDialogOpen} onClose={() => setRunDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Run Daily — Post Generated Videos</DialogTitle>
        <DialogContent>
          {runPlan && !runResult && (() => {
            const totalSelected = Object.values(selectedVideoIds).reduce((s, ids) => s + ids.size, 0)
            return (
            <Box sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                {totalSelected === 0
                  ? 'All accounts have met their daily quota or have no available videos.'
                  : `${totalSelected} video(s) will be posted across ${Object.values(selectedVideoIds).filter((s) => s.size > 0).length} account(s).`}
              </Alert>
              <TextField
                type="time"
                label="Post at (London time)"
                value={scheduleAtLondon}
                onChange={(e) => setScheduleAtLondon(e.target.value || '20:00')}
                inputProps={{ step: 3600 }}
                size="small"
                sx={{ mb: 2, minWidth: 160 }}
                helperText="Posts will be scheduled on GeeLark for this time (Europe/London). Use 24h format."
              />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 40 }} />
                      <TableCell><strong>Account</strong></TableCell>
                      <TableCell align="center"><strong>Target</strong></TableCell>
                      <TableCell align="center"><strong>Posted Today</strong></TableCell>
                      <TableCell align="center"><strong>Remaining</strong></TableCell>
                      <TableCell align="center"><strong>Available</strong></TableCell>
                      <TableCell align="center"><strong>Will Post</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {runPlan.plan.map((item) => {
                      const wp = willPostOverrides[item.account_id] ?? item.will_post
                      const selected = selectedVideoIds[item.account_id] ?? new Set()
                      const expanded = expandedAccounts.has(item.account_id)
                      const allVideos = item.all_videos || []
                      const maxAllowed = Math.min(2, item.daily_target, item.available_videos)
                      return (
                        <React.Fragment key={item.account_id}>
                          <TableRow>
                            <TableCell sx={{ px: 0.5 }}>
                              {allVideos.length > 0 && (
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setExpandedAccounts((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(item.account_id)) next.delete(item.account_id)
                                      else next.add(item.account_id)
                                      return next
                                    })
                                  }}
                                  sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
                                >
                                  <ExpandMoreIcon fontSize="small" />
                                </IconButton>
                              )}
                            </TableCell>
                            <TableCell>{item.display_name}</TableCell>
                            <TableCell align="center">{item.daily_target}</TableCell>
                            <TableCell align="center">{item.already_posted}</TableCell>
                            <TableCell align="center">{item.remaining}</TableCell>
                            <TableCell align="center">
                              <Chip
                                label={item.available_videos}
                                size="small"
                                color={item.available_videos > 0 ? 'info' : 'default'}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              {item.available_videos > 0 && item.remaining > 0 ? (
                                <Select
                                  size="small"
                                  value={wp}
                                  onChange={(e) => {
                                    const newCount = Number(e.target.value)
                                    setWillPostOverrides((prev) => ({ ...prev, [item.account_id]: newCount }))
                                    // Auto-select first N videos when count changes
                                    const autoSelected = new Set(allVideos.slice(0, newCount).map((v) => v.id))
                                    setSelectedVideoIds((prev) => ({ ...prev, [item.account_id]: autoSelected }))
                                  }}
                                  sx={{ minWidth: 60 }}
                                >
                                  {Array.from({ length: maxAllowed + 1 }, (_, i) => (
                                    <MenuItem key={i} value={i}>{i === 0 ? 'Skip' : `+${i}`}</MenuItem>
                                  ))}
                                </Select>
                              ) : (
                                <Chip
                                  label={item.remaining === 0 ? 'Quota met' : 'No videos'}
                                  size="small"
                                  color={item.remaining === 0 ? 'success' : 'default'}
                                  variant="outlined"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                          {allVideos.length > 0 && (
                            <TableRow>
                              <TableCell colSpan={7} sx={{ p: 0, border: expanded ? undefined : 'none' }}>
                                <Collapse in={expanded} timeout="auto" unmountOnExit>
                                  <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                      Select which videos to post ({selected.size} of {allVideos.length} selected)
                                    </Typography>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell sx={{ width: 40 }} />
                                          <TableCell sx={{ width: 40 }} />
                                          <TableCell><strong>Video ID</strong></TableCell>
                                          <TableCell><strong>Caption</strong></TableCell>
                                          <TableCell><strong>Fandom</strong></TableCell>
                                          <TableCell><strong>Intensity</strong></TableCell>
                                          <TableCell><strong>Created</strong></TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {allVideos.map((v) => (
                                          <TableRow
                                            key={v.id}
                                            hover
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => {
                                              setSelectedVideoIds((prev) => {
                                                const current = new Set(prev[item.account_id] || [])
                                                if (current.has(v.id)) {
                                                  current.delete(v.id)
                                                } else if (current.size < maxAllowed) {
                                                  current.add(v.id)
                                                }
                                                const newCount = current.size
                                                setWillPostOverrides((wp) => ({ ...wp, [item.account_id]: newCount }))
                                                return { ...prev, [item.account_id]: current }
                                              })
                                            }}
                                          >
                                            <TableCell sx={{ px: 0.5 }}>
                                              <Checkbox
                                                size="small"
                                                checked={selected.has(v.id)}
                                                tabIndex={-1}
                                              />
                                            </TableCell>
                                            <TableCell sx={{ px: 0.5 }} onClick={(e) => e.stopPropagation()}>
                                              {v.video_url && (
                                                <IconButton
                                                  size="small"
                                                  onClick={() => setPreviewVideo({ url: v.video_url!, caption: v.caption || '' })}
                                                  title="Preview video"
                                                  color="primary"
                                                >
                                                  <PlayCircleOutlineIcon fontSize="small" />
                                                </IconButton>
                                              )}
                                            </TableCell>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                              {v.id.slice(0, 8)}...
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {v.caption || '—'}
                                            </TableCell>
                                            <TableCell>{v.fandom || '—'}</TableCell>
                                            <TableCell>
                                              <Chip label={v.intensity || '—'} size="small" variant="outlined" />
                                            </TableCell>
                                            <TableCell sx={{ fontSize: '0.75rem' }}>
                                              {new Date(v.created_at).toLocaleDateString()}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
            )
          })()}
          {runResult && (
            <Box sx={{ mt: 1 }}>
              <Alert severity={runResult.total_failed === 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
                Posted {runResult.total_posted} video(s) successfully.
                {(runResult.total_failed ?? 0) > 0 && ` ${runResult.total_failed} failed.`}
              </Alert>
              {runResult.results && runResult.results.length > 0 && (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Account</strong></TableCell>
                        <TableCell><strong>Video Job</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell><strong>Error</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {runResult.results.map((r, i) => {
                        const accountName = runResult.plan.find((p) => p.account_id === r.account_id)?.display_name || r.account_id
                        return (
                          <TableRow key={i}>
                            <TableCell>{accountName}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {r.video_job_id.slice(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={r.status}
                                size="small"
                                color={r.status === 'success' ? 'success' : 'error'}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="error.main">
                                {r.error || '—'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
          {runError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {runError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRunDialogOpen(false); setRunResult(null); setRunPlan(null) }}>
            Close
          </Button>
          {!runResult && (() => {
            const totalSelected = Object.values(selectedVideoIds).reduce((s, ids) => s + ids.size, 0)
            return (
              <Button
                variant="contained"
                color="success"
                onClick={handleExecute}
                disabled={runLoading || totalSelected === 0}
                startIcon={runLoading ? <CircularProgress size={18} /> : <PlayArrowIcon />}
              >
                {runLoading ? 'Posting...' : `Confirm & Post (${totalSelected})`}
              </Button>
            )
          })()}
        </DialogActions>
      </Dialog>

      {/* Video preview dialog */}
      <Dialog
        open={!!previewVideo}
        onClose={() => setPreviewVideo(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'black' } }}
      >
        {previewVideo && (
          <>
            <DialogTitle sx={{ color: 'white', py: 1 }}>
              Video preview
            </DialogTitle>
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <video
                src={previewVideo.url}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '70vh', display: 'block' }}
              />
              {previewVideo.caption && (
                <Typography sx={{ p: 2, color: 'white', width: '100%' }} variant="body2">
                  {previewVideo.caption}
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'grey.900' }}>
              <Button onClick={() => setPreviewVideo(null)} color="inherit">
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  )
}
