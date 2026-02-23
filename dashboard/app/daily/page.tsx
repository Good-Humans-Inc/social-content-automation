'use client'

import { useState, useEffect, useCallback } from 'react'
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
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'

interface AccountSummary {
  name: string
  success: number
  failed: number
  total: number
  target: number
  byIntensity: Record<string, number>
}

interface DailySummary {
  date: string
  totalPosts: number
  successCount: number
  failedCount: number
  intensityTotals: Record<string, number>
  byAccount: Record<string, AccountSummary>
  topFailReasons: { reason: string; count: number }[]
  recentLogs: any[]
}

interface RunDailyPlan {
  account_id: string
  display_name: string
  daily_target: number
  already_posted: number
  remaining: number
  next_intensity: string | null
}

interface RunDailyResult {
  dry_run: boolean
  date: string
  plan: RunDailyPlan[]
  total_remaining?: number
  jobs_created?: number
  job_ids?: string[]
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
      const res = await fetch('/api/run-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
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
            View posting activity and trigger daily orchestration
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
                  Total Posts
                </Typography>
                <Typography variant="h3" fontWeight="bold" color="primary.main">
                  {summary.totalPosts}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                  Successful
                </Typography>
                <Typography variant="h3" fontWeight="bold" color="success.main">
                  {summary.successCount}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
                  Failed
                </Typography>
                <Typography variant="h3" fontWeight="bold" color="error.main">
                  {summary.failedCount}
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
                    const progress = acct.target > 0 ? Math.min(100, (acct.success / acct.target) * 100) : 0
                    return (
                      <Paper key={id} variant="outlined" sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="body1" fontWeight="medium">{acct.name}</Typography>
                          <Chip label={`${acct.success}/${acct.target}`} size="small" color={acct.success >= acct.target ? 'success' : 'warning'} />
                          {acct.failed > 0 && (
                            <Chip label={`${acct.failed} failed`} size="small" color="error" variant="outlined" />
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
        <DialogTitle>Run Daily Orchestration</DialogTitle>
        <DialogContent>
          {runPlan && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Preview: {runPlan.total_remaining} job(s) will be created across {runPlan.plan.filter(p => p.remaining > 0).length} account(s).
              </Alert>
              <Stack spacing={1.5}>
                {runPlan.plan.map((item) => (
                  <Paper key={item.account_id} variant="outlined" sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body1" fontWeight="medium">{item.display_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.already_posted}/{item.daily_target} posted today
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {item.remaining > 0 ? (
                          <>
                            <Chip label={`+${item.remaining} to create`} size="small" color="primary" />
                            {item.next_intensity && (
                              <Chip label={`Next: ${item.next_intensity}`} size="small" variant="outlined" />
                            )}
                          </>
                        ) : (
                          <Chip label="Quota met" size="small" color="success" />
                        )}
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Stack>
              {runResult && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Created {runResult.jobs_created} job(s). They will be picked up by the worker.
                </Alert>
              )}
              {runError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {runError}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRunDialogOpen(false); setRunResult(null) }}>
            Close
          </Button>
          {!runResult && (
            <Button
              variant="contained"
              color="success"
              onClick={handleExecute}
              disabled={runLoading || (runPlan?.total_remaining ?? 0) === 0}
              startIcon={runLoading ? <CircularProgress size={18} /> : <PlayArrowIcon />}
            >
              {runLoading ? 'Creating Jobs...' : 'Confirm & Run'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  )
}
