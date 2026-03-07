'use client'

import { useState, useEffect, useCallback } from 'react'
import { Paper, Box, Typography, Chip, Stack, Button, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Slider, IconButton, Collapse, Checkbox, FormControlLabel, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SyncIcon from '@mui/icons-material/Sync'
import EditIcon from '@mui/icons-material/Edit'
import SaveIcon from '@mui/icons-material/Save'
import CloseIcon from '@mui/icons-material/Close'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ScreenshotMonitorIcon from '@mui/icons-material/ScreenshotMonitor'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'

interface Account {
  id: string
  display_name: string
  env_id: string
  cloud_phone_id: string
  persona: string
  preferred_fandoms?: string[]
  preferred_intensity?: string
  video_source?: string
  daily_post_target?: number
  intensity_ratio?: { T0: number; T1: number; T2: number }
  logged_in?: boolean
  created_at: string
}

interface AccountsListProps {
  initialAccounts: Account[]
}

interface GeeLarkPhone {
  id: string
  serialName?: string
  serialNo?: string
  status?: string
  remark?: string
  group?: {
    name?: string
  }
  tags?: string[]
  chargeMode?: number
  equipmentInfo?: {
    phoneNumber?: string
    countryName?: string
    deviceBrand?: string
    deviceModel?: string
    osVersion?: string
  }
}

interface WarmupProfileLog {
  accountId: string
  displayName: string
  envId: string
  cloudPhoneId: string
  status: 'success' | 'failed' | 'skipped'
  message?: string
  taskId?: string
}

export default function AccountsList({ initialAccounts }: AccountsListProps) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [geelarkPhones, setGeeLarkPhones] = useState<GeeLarkPhone[]>([])
  const [loadingPhones, setLoadingPhones] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState(2)
  const [editRatio, setEditRatio] = useState<[number, number, number]>([50, 30, 20])
  const [saving, setSaving] = useState(false)
  const [warmupSectionOpen, setWarmupSectionOpen] = useState(false)
  const [warmupSelectedIds, setWarmupSelectedIds] = useState<Set<string>>(new Set())
  const [warmupRunning, setWarmupRunning] = useState(false)
  const [warmupLogs, setWarmupLogs] = useState<WarmupProfileLog[]>([])
  const [warmupPlanName, setWarmupPlanName] = useState('warmup-plan')
  const [warmupKeywords, setWarmupKeywords] = useState('')
  const [warmupDurationMinutes, setWarmupDurationMinutes] = useState(10)
  const [warmupAction, setWarmupAction] = useState<'search profile' | 'search video' | 'browse video'>('browse video')
  const [screenshotAccount, setScreenshotAccount] = useState<Account | null>(null)
  const [screenshotLoading, setScreenshotLoading] = useState(false)
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null)
  const [screenshotError, setScreenshotError] = useState<string | null>(null)
  const [screenshotSteps, setScreenshotSteps] = useState<string[]>([])
  const [screenshotTaskId, setScreenshotTaskId] = useState<string | null>(null)
  const [screenshotTiktokInstalled, setScreenshotTiktokInstalled] = useState<boolean | null>(null)
  const [taskFlows, setTaskFlows] = useState<Array<{ id: string; title?: string; desc?: string }>>([])
  const [taskFlowsLoading, setTaskFlowsLoading] = useState(false)
  const [profileViewFlowId, setProfileViewFlowId] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    setTaskFlowsLoading(true)
    fetch('/api/geelark/task-flows?pageSize=50')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.items) setTaskFlows(data.items)
      })
      .catch(() => { if (!cancelled) setTaskFlows([]) })
      .finally(() => { if (!cancelled) setTaskFlowsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const startEditing = useCallback((account: Account) => {
    setEditingId(account.id)
    setEditTarget(account.daily_post_target ?? 2)
    const r = account.intensity_ratio ?? { T0: 0.5, T1: 0.3, T2: 0.2 }
    setEditRatio([Math.round(r.T0 * 100), Math.round(r.T1 * 100), Math.round(r.T2 * 100)])
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingId(null)
  }, [])

  const saveEditing = useCallback(async (accountId: string) => {
    setSaving(true)
    try {
      const response = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: accountId,
          daily_post_target: editTarget,
          intensity_ratio: {
            T0: editRatio[0] / 100,
            T1: editRatio[1] / 100,
            T2: editRatio[2] / 100,
          },
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }
      const result = await response.json()
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, ...result.data } : a))
      setEditingId(null)
    } catch (err: any) {
      setError(err.message || 'Failed to save account settings')
    } finally {
      setSaving(false)
    }
  }, [editTarget, editRatio])

  // Auto-fetch GeeLark phones on component mount
  useEffect(() => {
    fetchGeeLarkPhones()
  }, [])

  // Auto-sync if no accounts exist and phones are fetched
  useEffect(() => {
    if (
      accounts.length === 0 &&
      geelarkPhones.length > 0 &&
      !loadingPhones &&
      !syncing &&
      initialAccounts.length === 0 // Only auto-sync if there were no accounts initially
    ) {
      // Auto-sync phones to accounts if no accounts exist
      syncPhonesToAccounts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geelarkPhones.length, accounts.length, loadingPhones, syncing])

  const fetchGeeLarkPhones = async () => {
    setLoadingPhones(true)
    setError(null)
    try {
      const response = await fetch('/api/geelark/phones')
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch phones')
      }
      const result = await response.json()
      // Handle the response structure: { success: true, data: [...] }
      // The API route should already extract phones from data[0].items, so result.data should be the phones array
      let phonesArray: any[] = []
      
      if (result?.success && result?.data) {
        // API route returns { success: true, data: phonesArray }
        // But check if data is nested structure: [{ items: [...] }]
        if (Array.isArray(result.data)) {
          if (result.data.length > 0 && result.data[0]?.items && Array.isArray(result.data[0].items)) {
            // Nested structure: data: [{ items: [...] }]
            phonesArray = result.data[0].items || []
          } else {
            // Direct array of phones
            phonesArray = result.data
          }
        } else {
          phonesArray = []
        }
      } else if (Array.isArray(result?.data)) {
        // Fallback: check if data is nested structure: [{ items: [...] }]
        if (result.data.length > 0 && Array.isArray(result.data[0]?.items)) {
          phonesArray = result.data[0].items || []
        } else {
          // Direct array of phones
          phonesArray = result.data
        }
      } else if (Array.isArray(result)) {
        phonesArray = result
      }
      
      setGeeLarkPhones(Array.isArray(phonesArray) ? phonesArray : [])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch phones from GeeLark')
      setGeeLarkPhones([]) // Reset to empty array on error
    } finally {
      setLoadingPhones(false)
    }
  }

  const syncPhonesToAccounts = async () => {
    if (geelarkPhones.length === 0) {
      setError('No phones to sync. Please fetch phones from GeeLark first.')
      return
    }

    setSyncing(true)
    setError(null)
    try {
      const response = await fetch('/api/geelark/sync-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: geelarkPhones }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to sync accounts')
      }

      const result = await response.json()
      
      // Refresh accounts list
      const accountsResponse = await fetch('/api/accounts')
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json()
        setAccounts(accountsData.data || accountsData || [])
      }

      setError(null)
      setDialogOpen(false)
    } catch (err: any) {
      setError(err.message || 'Failed to sync accounts')
    } finally {
      setSyncing(false)
    }
  }

  const toggleWarmupAccount = (accountId: string) => {
    setWarmupSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  const selectAllWarmup = () => {
    if (warmupSelectedIds.size === accounts.length) {
      setWarmupSelectedIds(new Set())
    } else {
      setWarmupSelectedIds(new Set(accounts.map((a) => a.id)))
    }
  }

  const runWarmupForIds = async (accountIds: string[]) => {
    if (accountIds.length === 0) {
      setError('No accounts to run warmup.')
      return
    }
    setWarmupRunning(true)
    setError(null)
    setWarmupLogs([])
    try {
      const keywordsList = warmupKeywords
        ? warmupKeywords.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean)
        : undefined
      const response = await fetch('/api/geelark/warmup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountIds,
          planName: warmupPlanName || 'warmup-plan',
          action: warmupAction,
          keywords: keywordsList,
          durationMinutes: warmupDurationMinutes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Warmup request failed')
      }
      setWarmupLogs(data.logs || [])
      if (data.message) {
        setError(null)
      }
    } catch (err: any) {
      setError(err.message || 'Warmup failed')
      setWarmupLogs([])
    } finally {
      setWarmupRunning(false)
    }
  }

  const runWarmup = async () => {
    const ids = Array.from(warmupSelectedIds)
    if (ids.length === 0) {
      setError('Select at least one account to run warmup.')
      return
    }
    await runWarmupForIds(ids)
  }

  const runWarmupAll = async () => {
    if (accounts.length === 0) {
      setError('No accounts to run warmup.')
      return
    }
    await runWarmupForIds(accounts.map((a) => a.id))
  }

  const checkLoginScreenshot = useCallback(async (account: Account) => {
    const phoneId = account.env_id
    if (!phoneId?.trim()) {
      setError('Account has no env_id (GeeLark cloud phone ID).')
      return
    }
    setScreenshotAccount(account)
    setScreenshotLoading(true)
    setScreenshotImage(null)
    setScreenshotError(null)
    setScreenshotSteps([])
    setScreenshotTaskId(null)
    setScreenshotTiktokInstalled(null)
    try {
      const res = await fetch('/api/geelark/check-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneId,
          fullWorkflow: true,
          bootWaitSeconds: 30,
          appWaitSeconds: 5,
          ...(profileViewFlowId ? { profileViewFlowId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScreenshotError(data.error || 'Check login failed')
        return
      }
      setScreenshotSteps(data.steps || [])
      setScreenshotTaskId(data.taskId || null)
      setScreenshotTiktokInstalled(data.tiktokInstalled ?? true)
      const src = data.imageUrl || (data.imageBase64 ? `data:image/png;base64,${data.imageBase64}` : null)
      setScreenshotImage(src || null)
      if (!src && !data.taskId) setScreenshotError('No image or taskId returned.')
      else if (!src) setScreenshotError(null)
    } catch (err: any) {
      setScreenshotError(err.message || 'Check login failed')
    } finally {
      setScreenshotLoading(false)
    }
  }, [profileViewFlowId])

  const closeScreenshotDialog = useCallback(() => {
    setScreenshotAccount(null)
    setScreenshotImage(null)
    setScreenshotError(null)
    setScreenshotSteps([])
    setScreenshotTaskId(null)
    setScreenshotTiktokInstalled(null)
  }, [])

  const setAccountLoggedIn = useCallback(async (accountId: string, loggedIn: boolean) => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, logged_in: loggedIn }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update')
      }
      const result = await response.json()
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, ...result.data } : a))
      )
    } catch (err: any) {
      setError(err.message || 'Failed to update login status')
    }
  }, [])

  return (
    <Paper>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h6">
            Accounts ({accounts.length})
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="profile-flow-label">Check login → profile flow</InputLabel>
              <Select
                labelId="profile-flow-label"
                value={profileViewFlowId}
                label="Check login → profile flow"
                onChange={(e) => setProfileViewFlowId(e.target.value)}
                disabled={taskFlowsLoading}
              >
                <MenuItem value="">None (screenshot For You feed)</MenuItem>
                {taskFlows.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.title || f.desc || f.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={loadingPhones ? <CircularProgress size={20} /> : <RefreshIcon />}
              onClick={fetchGeeLarkPhones}
              disabled={loadingPhones}
            >
              {loadingPhones ? 'Fetching...' : 'Fetch from GeeLark'}
            </Button>
            {geelarkPhones.length > 0 && (
              <Button
                variant="contained"
                startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
                onClick={syncPhonesToAccounts}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : `Sync ${geelarkPhones.length} Phone(s)`}
              </Button>
            )}
          </Box>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Warmup section */}
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              bgcolor: 'grey.50',
              cursor: 'pointer',
              borderBottom: warmupSectionOpen ? 1 : 0,
              borderColor: 'divider',
            }}
            onClick={() => setWarmupSectionOpen((o) => !o)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalFireDepartmentIcon color="primary" />
              <Typography variant="h6">Warmup accounts</Typography>
              <Chip
                size="small"
                label={`${warmupSelectedIds.size} selected`}
                color={warmupSelectedIds.size > 0 ? 'primary' : 'default'}
                variant={warmupSelectedIds.size > 0 ? 'filled' : 'outlined'}
              />
            </Box>
            {warmupSectionOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
          <Collapse in={warmupSectionOpen}>
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Start cloud phones, run GeeLark warmup RPA on selected accounts, then stop phones. Results are logged below.
              </Typography>
              {accounts.length === 0 ? (
                <Typography color="text.secondary">No accounts to warm up. Sync from GeeLark first.</Typography>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={accounts.length > 0 && warmupSelectedIds.size === accounts.length}
                          indeterminate={warmupSelectedIds.size > 0 && warmupSelectedIds.size < accounts.length}
                          onChange={selectAllWarmup}
                        />
                      }
                      label="Select all"
                    />
                    {accounts.map((account) => (
                      <FormControlLabel
                        key={account.id}
                        control={
                          <Checkbox
                            checked={warmupSelectedIds.has(account.id)}
                            onChange={() => toggleWarmupAccount(account.id)}
                            disabled={warmupRunning}
                          />
                        }
                        label={account.display_name}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Uses GeeLark task/add warmup (taskType 2): scheduleAt, envId, action, duration in minutes.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <TextField
                        size="small"
                        label="Plan name"
                        value={warmupPlanName}
                        onChange={(e) => setWarmupPlanName(e.target.value)}
                        sx={{ minWidth: 200 }}
                        disabled={warmupRunning}
                      />
                      <TextField
                        size="small"
                        select
                        label="Action"
                        value={warmupAction}
                        onChange={(e) => setWarmupAction(e.target.value as 'search profile' | 'search video' | 'browse video')}
                        SelectProps={{ native: true }}
                        sx={{ minWidth: 200 }}
                        disabled={warmupRunning}
                      >
                        <option value="browse video">Randomly browse videos</option>
                        <option value="search video">Search short videos</option>
                        <option value="search profile">Search personal profile</option>
                      </TextField>
                      <TextField
                        size="small"
                        label="Keywords"
                        value={warmupKeywords}
                        onChange={(e) => setWarmupKeywords(e.target.value)}
                        placeholder="e.g. anime (required for search)"
                        sx={{ minWidth: 180 }}
                        disabled={warmupRunning}
                        helperText="Required for search actions; optional for browse"
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Duration (minutes)"
                        value={warmupDurationMinutes}
                        onChange={(e) => setWarmupDurationMinutes(Math.max(1, parseInt(e.target.value, 10) || 10))}
                        inputProps={{ min: 1, max: 120 }}
                        sx={{ width: 130 }}
                        disabled={warmupRunning}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      startIcon={warmupRunning ? <CircularProgress size={20} color="inherit" /> : <LocalFireDepartmentIcon />}
                      onClick={runWarmup}
                      disabled={warmupRunning || warmupSelectedIds.size === 0}
                    >
                      {warmupRunning ? 'Running warmup…' : 'Run warmup'}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={warmupRunning ? <CircularProgress size={20} color="inherit" /> : <LocalFireDepartmentIcon />}
                      onClick={runWarmupAll}
                      disabled={warmupRunning || accounts.length === 0}
                    >
                      Run warmup for all accounts
                    </Button>
                    </Box>
                  </Box>
                  {warmupLogs.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Results
                      </Typography>
                      <Stack spacing={1}>
                        {warmupLogs.map((log) => (
                          <Box
                            key={log.accountId}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              flexWrap: 'wrap',
                              p: 1.5,
                              bgcolor: 'grey.50',
                              borderRadius: 1,
                              border: 1,
                              borderColor: 'divider',
                            }}
                          >
                            <Typography variant="body2" fontWeight="medium">
                              {log.displayName}
                            </Typography>
                            <Chip
                              size="small"
                              label={log.status}
                              color={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'default'}
                              variant="outlined"
                            />
                            {log.message && (
                              <Typography variant="caption" color="text.secondary">
                                {log.message}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Collapse>
        </Paper>

        <Stack spacing={2}>
          {accounts.map((account) => {
            const isEditing = editingId === account.id
            const ratio = account.intensity_ratio ?? { T0: 0.5, T1: 0.3, T2: 0.2 }
            return (
              <Paper
                key={account.id}
                variant="outlined"
                sx={{ p: 2, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" fontWeight="medium">
                      {account.display_name}
                    </Typography>
                    <Chip label={account.persona} size="small" color="primary" />
                    <Chip
                      label={account.logged_in === true ? 'Logged in' : account.logged_in === false ? 'Not logged in' : 'Login unknown'}
                      size="small"
                      color={account.logged_in === true ? 'success' : account.logged_in === false ? 'warning' : 'default'}
                      variant="outlined"
                    />
                    <Box sx={{ flex: 1 }} />
                    {!isEditing && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => setAccountLoggedIn(account.id, account.logged_in === false)}
                          title={account.logged_in === false ? 'Mark as logged in' : 'Mark as not logged in'}
                        >
                          {account.logged_in === false ? (
                            <LoginIcon fontSize="small" color="success" />
                          ) : (
                            <LogoutIcon fontSize="small" color="warning" />
                          )}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => checkLoginScreenshot(account)}
                          title="Check if TikTok is logged in (screenshot via GeeLark)"
                        >
                          <ScreenshotMonitorIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => startEditing(account)} title="Edit posting settings">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </Box>
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary">
                      ID: {account.id}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Env ID: {account.env_id}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cloud Phone ID: {account.cloud_phone_id}
                    </Typography>
                    {account.preferred_fandoms && account.preferred_fandoms.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Preferred Fandoms: {account.preferred_fandoms.join(', ')}
                      </Typography>
                    )}
                    {account.preferred_intensity && (
                      <Typography variant="body2" color="text.secondary">
                        Preferred Intensity: {account.preferred_intensity}
                      </Typography>
                    )}
                    {!isEditing && (
                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
                        <Chip
                          label={`Daily target: ${account.daily_post_target ?? 2}`}
                          size="small"
                          variant="outlined"
                          color="info"
                        />
                        <Chip
                          label={`T0 ${Math.round(ratio.T0 * 100)}% / T1 ${Math.round(ratio.T1 * 100)}% / T2 ${Math.round(ratio.T2 * 100)}%`}
                          size="small"
                          variant="outlined"
                          color="secondary"
                        />
                      </Box>
                    )}
                  </Stack>

                  <Collapse in={isEditing}>
                    <Box sx={{ mt: 1, p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.50' }}>
                      <Typography variant="subtitle2" sx={{ mb: 2 }}>Posting Settings</Typography>
                      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start' }}>
                        <TextField
                          type="number"
                          label="Daily Post Target"
                          value={editTarget}
                          onChange={(e) => setEditTarget(Math.max(1, parseInt(e.target.value) || 1))}
                          inputProps={{ min: 1, max: 50 }}
                          size="small"
                          sx={{ width: 160 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 260 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            Intensity Ratio: T0 {editRatio[0]}% / T1 {editRatio[1]}% / T2 {editRatio[2]}%
                          </Typography>
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" sx={{ width: 24 }}>T0</Typography>
                              <Slider
                                value={editRatio[0]}
                                onChange={(_, v) => {
                                  const val = v as number
                                  const remaining = 100 - val
                                  const oldSum = editRatio[1] + editRatio[2]
                                  if (oldSum > 0) {
                                    setEditRatio([val, Math.round((editRatio[1] / oldSum) * remaining), remaining - Math.round((editRatio[1] / oldSum) * remaining)])
                                  } else {
                                    setEditRatio([val, Math.round(remaining / 2), remaining - Math.round(remaining / 2)])
                                  }
                                }}
                                min={0} max={100} size="small"
                              />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" sx={{ width: 24 }}>T1</Typography>
                              <Slider
                                value={editRatio[1]}
                                onChange={(_, v) => {
                                  const val = Math.min(v as number, 100 - editRatio[0])
                                  setEditRatio([editRatio[0], val, 100 - editRatio[0] - val])
                                }}
                                min={0} max={100 - editRatio[0]} size="small"
                              />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" sx={{ width: 24 }}>T2</Typography>
                              <Typography variant="body2">{editRatio[2]}%</Typography>
                            </Box>
                          </Stack>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                        <Button size="small" onClick={cancelEditing} startIcon={<CloseIcon />} disabled={saving}>
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => saveEditing(account.id)}
                          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </Stack>
              </Paper>
            )
          })}
        </Stack>
        {accounts.length === 0 && (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
            No accounts found. Click "Fetch from GeeLark" to get phones, then "Sync" to import them as accounts.
          </Typography>
        )}
      </Box>

      {/* GeeLark Phones Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>GeeLark Phones ({Array.isArray(geelarkPhones) ? geelarkPhones.length : 0})</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!Array.isArray(geelarkPhones) || geelarkPhones.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" sx={{ py: 2 }}>
                No phones found in GeeLark
              </Typography>
            ) : (
              geelarkPhones.map((phone) => (
                <Paper key={phone.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body1" fontWeight="medium">
                        {phone.serialName || phone.serialNo || phone.id}
                      </Typography>
                      {phone.status !== undefined && (
                        <Chip 
                          label={typeof phone.status === 'number' ? `Status ${phone.status}` : phone.status} 
                          size="small" 
                          color="primary" 
                        />
                      )}
                      {phone.group?.name && (
                        <Chip label={phone.group.name} size="small" variant="outlined" />
                      )}
                    </Box>
                    <Stack spacing={0.5}>
                      <Typography variant="body2" color="text.secondary">
                        ID: {phone.id}
                      </Typography>
                      {phone.serialNo && (
                        <Typography variant="body2" color="text.secondary">
                          Serial: {phone.serialNo}
                        </Typography>
                      )}
                      {phone.remark && (
                        <Typography variant="body2" color="text.secondary">
                          Remark: {phone.remark}
                        </Typography>
                      )}
                      {phone.group?.name && (
                        <Typography variant="body2" color="text.secondary">
                          Group: {phone.group.name}
                        </Typography>
                      )}
                      {phone.tags && phone.tags.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          Tags: {phone.tags.map((tag: any) => tag.name || tag).join(', ')}
                        </Typography>
                      )}
                      {phone.chargeMode !== undefined && (
                        <Typography variant="body2" color="text.secondary">
                          Charge Mode: {phone.chargeMode}
                        </Typography>
                      )}
                      {phone.equipmentInfo && (
                        <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                          <Typography variant="caption" fontWeight="bold" display="block" mb={0.5}>
                            Equipment Info:
                          </Typography>
                          {phone.equipmentInfo.phoneNumber && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              Phone: {phone.equipmentInfo.phoneNumber}
                            </Typography>
                          )}
                          {phone.equipmentInfo.countryName && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              Country: {phone.equipmentInfo.countryName}
                            </Typography>
                          )}
                          {phone.equipmentInfo.deviceModel && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              Device: {phone.equipmentInfo.deviceBrand} {phone.equipmentInfo.deviceModel}
                            </Typography>
                          )}
                          {phone.equipmentInfo.osVersion && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              OS: {phone.equipmentInfo.osVersion}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
            onClick={syncPhonesToAccounts}
            disabled={syncing || geelarkPhones.length === 0}
          >
            {syncing ? 'Syncing...' : 'Sync to Accounts'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Check login – full workflow (start → boot → open TikTok → screenshot) */}
      <Dialog open={!!screenshotAccount} onClose={closeScreenshotDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Check login – {screenshotAccount?.display_name ?? 'Account'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Starts the cloud phone, opens TikTok, then takes a screenshot so you can verify the account is logged in.
          </Typography>
          {screenshotLoading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 2 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                Starting phone → opening TikTok → capturing screenshot…
              </Typography>
            </Box>
          )}
          {screenshotTiktokInstalled === false && !screenshotLoading && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              TikTok is not installed on this cloud phone. Install the TikTok app on the device, then run Check login again to verify the account.
            </Alert>
          )}
          {screenshotSteps.length > 0 && !screenshotLoading && (
            <Stack component="ul" sx={{ pl: 2, mb: 2, '& li': { mb: 0.5 } }}>
              {screenshotSteps.map((step, i) => (
                <Typography key={i} component="li" variant="body2" color="text.secondary">
                  {step}
                </Typography>
              ))}
            </Stack>
          )}
          {screenshotError && !screenshotLoading && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {screenshotError}
            </Alert>
          )}
          {screenshotTaskId && !screenshotImage && !screenshotLoading && !screenshotError && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Screenshot requested. Task ID: {screenshotTaskId}. The image may be delivered to your callback URL.
            </Typography>
          )}
          {screenshotImage && !screenshotLoading && (
            <Box
              component="img"
              src={screenshotImage}
              alt="Cloud phone screenshot – verify TikTok login"
              sx={{
                width: '100%',
                height: 'auto',
                maxHeight: '70vh',
                objectFit: 'contain',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeScreenshotDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
