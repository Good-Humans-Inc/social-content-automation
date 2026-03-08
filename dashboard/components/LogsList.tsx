'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Paper,
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  IconButton,
} from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloseIcon from '@mui/icons-material/Close'
import RefreshIcon from '@mui/icons-material/Refresh'

interface PostLog {
  id: string
  logType: 'post'
  account_id: string
  post_type: string
  status: string
  error_message?: string
  scheduled_time?: string
  video_url?: string
  created_at: string
  task_id?: string
  accounts?: { display_name: string }
  templates?: { caption: string }
}

interface WarmupLog {
  id: string
  logType: 'warmup'
  account_id: string
  display_name?: string
  env_id?: string
  cloud_phone_id?: string
  status: string
  error_message?: string
  message?: string
  task_id?: string
  plan_name?: string
  action?: string
  duration_minutes?: number
  scheduled_time?: string
  schedule_at?: string
  created_at: string
}

type Log = PostLog | WarmupLog

interface LogsListProps {
  initialLogs: Log[]
}

interface TaskDetail {
  id: string
  planName?: string
  taskType?: number
  serialName?: string
  envId?: string
  scheduleAt?: number
  status?: number
  failCode?: number
  failDesc?: string
  cost?: number
  resultImages?: string[]
  logs?: string[]
  logContinue?: boolean
  searchAfter?: unknown
}

const STATUS_LABELS: Record<number, string> = {
  1: 'Waiting',
  2: 'In progress',
  3: 'Completed',
  4: 'Failed',
  7: 'Cancelled',
}

export default function LogsList({ initialLogs }: LogsListProps) {
  const router = useRouter()
  const [logs, setLogs] = useState<Log[]>(initialLogs)
  const [refreshing, setRefreshing] = useState(false)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailLogs, setDetailLogs] = useState<string[]>([])
  const [detailSearchAfter, setDetailSearchAfter] = useState<unknown>(undefined)

  useEffect(() => {
    setLogs(initialLogs)
    setRefreshing(false)
  }, [initialLogs])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      // Sync pending log statuses from GeeLark so tags update without opening each GeeLark detail
      await fetch('/api/logs/sync-status', { method: 'POST' })
    } catch {
      // Non-blocking: still refresh from DB
    }
    router.refresh()
  }, [router])

  const loadTaskDetail = useCallback(async (taskId: string, searchAfter?: unknown) => {
    setDetailLoading(true)
    try {
      const url = searchAfter != null
        ? `/api/geelark/task/${encodeURIComponent(taskId)}?searchAfter=${encodeURIComponent(JSON.stringify(searchAfter))}`
        : `/api/geelark/task/${encodeURIComponent(taskId)}`
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load task detail')
      const data = json.data as TaskDetail
      setDetail(data)
      setDetailLogs((prev) => (searchAfter == null ? (data.logs || []) : [...prev, ...(data.logs || [])]))
      setDetailSearchAfter(data.logContinue ? data.searchAfter : undefined)
      // Sync log status from GeeLark: update our list and revalidate so Logs + Daily Summary show correct success/failed
      const updated = json.updatedLog as { id: string; status: string; error_message: string | null } | undefined
      if (updated?.id) {
        setLogs((prev) =>
          prev.map((l) =>
            l.id === updated.id
              ? { ...l, status: updated.status, error_message: updated.error_message ?? l.error_message }
              : l
          )
        )
        router.refresh()
      }
    } catch (err) {
      setDetail(null)
      setDetailLogs([])
      console.error(err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openDetail = useCallback((taskId: string) => {
    setDetailTaskId(taskId)
    setDetail(null)
    setDetailLogs([])
    setDetailSearchAfter(undefined)
    loadTaskDetail(taskId)
  }, [loadTaskDetail])

  const closeDetail = useCallback(() => {
    setDetailTaskId(null)
    setDetail(null)
    setDetailLogs([])
    setDetailSearchAfter(undefined)
  }, [])

  const displayName = (log: Log) =>
    log.logType === 'post'
      ? (log.accounts?.display_name || log.account_id)
      : (log as WarmupLog).display_name || (log as WarmupLog).account_id

  const scheduledTime = (log: Log) =>
    (log as PostLog | WarmupLog).scheduled_time ?? (log as WarmupLog).schedule_at

  const executionStatus = (log: Log) => {
    const status = log.status
    const msg = log.logType === 'post' ? (log as PostLog).error_message : ((log as WarmupLog).message ?? (log as WarmupLog).error_message)
    if (status === 'failed') return { text: 'Task failed', color: 'error' as const, msg }
    if (status === 'success' || status === 'completed') return { text: 'Task completed', color: 'success' as const, msg }
    if (status === 'skipped') return { text: 'Skipped', color: 'default' as const, msg }
    if (status === 'pending') return { text: 'Pending', color: 'warning' as const, msg }
    return { text: status || 'Unknown', color: 'default' as const, msg }
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={refreshing ? <CircularProgress size={18} /> : <RefreshIcon />}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh logs'}
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Profile / Account</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Scheduled time</TableCell>
              <TableCell>Runtime / Created</TableCell>
              <TableCell>Execution status</TableCell>
              <TableCell align="right">Operation</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log) => {
              const statusInfo = executionStatus(log)
              return (
                <TableRow key={`${log.logType}-${log.id}`} hover>
                  <TableCell>{displayName(log)}</TableCell>
                  <TableCell>
                    <Chip label={(log as Log & { type?: string }).type ?? (log.logType === 'post' ? (log as PostLog).post_type : 'warmup')} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {scheduledTime(log)
                      ? new Date(scheduledTime(log)!).toLocaleString()
                      : '-'}
                  </TableCell>
                  <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Box>
                      <Chip label={statusInfo.text} size="small" color={statusInfo.color} sx={{ mr: 0.5 }} />
                      {statusInfo.msg && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                          {statusInfo.msg}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {(log as PostLog | WarmupLog).task_id ? (
                      <Button
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => openDetail((log as PostLog | WarmupLog).task_id!)}
                      >
                        GeeLark detail
                      </Button>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {logs.length === 0 && (
        <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
          No logs found
        </Typography>
      )}

      <Dialog open={!!detailTaskId} onClose={closeDetail} maxWidth="md" fullWidth>
        <DialogTitle>
          GeeLark task detail
          {detailTaskId && <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>({detailTaskId})</Typography>}
        </DialogTitle>
        <DialogContent>
          {detailLoading && !detail && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {detail && !detailLoading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip label={detail.serialName || '—'} size="small" />
                <Chip label={STATUS_LABELS[detail.status!] ?? `Status ${detail.status}`} size="small" color={detail.status === 4 ? 'error' : detail.status === 3 ? 'success' : 'default'} />
                {detail.failDesc && (
                  <Chip label={detail.failDesc} size="small" color="error" variant="outlined" />
                )}
                {detail.cost != null && <Typography variant="caption">Cost: {detail.cost}s</Typography>}
              </Box>
              {detail.failDesc && (
                <Typography variant="body2" color="error">
                  {detail.failDesc}
                </Typography>
              )}
              <Typography variant="subtitle2">Task logs (from GeeLark)</Typography>
              <Paper variant="outlined" sx={{ p: 2, maxHeight: 360, overflow: 'auto', bgcolor: 'grey.50' }}>
                {detailLogs.length === 0 && !detail.logContinue && (
                  <Typography variant="body2" color="text.secondary">No log lines returned.</Typography>
                )}
                {detailLogs.map((line, i) => (
                  <Typography key={i} component="pre" variant="caption" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {line}
                  </Typography>
                ))}
                {detail.logContinue && detail.searchAfter != null && (
                  <Button
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => detailTaskId && loadTaskDetail(detailTaskId, detail.searchAfter)}
                    disabled={detailLoading}
                  >
                    {detailLoading ? 'Loading…' : 'Load more logs'}
                  </Button>
                )}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <IconButton onClick={closeDetail} size="small">
            <CloseIcon />
          </IconButton>
          <Button onClick={closeDetail}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
