'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Button,
  Select,
  MenuItem,
  TextField,
  FormControl,
  InputLabel,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import TemplateSelector from '@/components/TemplateSelector'

interface Video {
  id: string
  video_url: string
  template_id?: string
  account_id: string
  post_type?: string
  slide_urls?: string[]
  created_at?: string
  templates?: {
    caption: string
  }
  accounts?: {
    display_name: string
  }
}

interface Account {
  id: string
  display_name: string
}


type Timezone = 'Asia/Jakarta' | 'Europe/London'

const TIMEZONE_LABELS: Record<Timezone, string> = {
  'Asia/Jakarta': 'Jakarta (WIB)',
  'Europe/London': 'London (GMT/BST)',
}

function toLocalDatetimeString(date: Date, tz: Timezone): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function fromLocalDatetimeString(value: string, tz: Timezone): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  // Parse the local datetime value
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  // Build a date in the target timezone by trying offsets
  // Start with a rough UTC guess
  const rough = new Date(Date.UTC(year, month - 1, day, hour, minute))

  // Get the offset for that rough date in the target timezone
  const inTz = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(rough)

  const tzHour = parseInt(inTz.find((p) => p.type === 'hour')?.value || '0')
  const tzMinute = parseInt(inTz.find((p) => p.type === 'minute')?.value || '0')
  const tzDay = parseInt(inTz.find((p) => p.type === 'day')?.value || '0')
  const tzMonth = parseInt(inTz.find((p) => p.type === 'month')?.value || '0')

  // Calculate offset between UTC and tz
  const roughInTzMinutes = (tzDay - rough.getUTCDate()) * 1440 + (tzHour - rough.getUTCHours()) * 60 + (tzMinute - rough.getUTCMinutes())

  // Adjust: we want the date where tz shows the desired time
  const adjusted = new Date(rough.getTime() - roughInTzMinutes * 60000)
  return adjusted
}

interface VideoUploaderProps {
  videos: Video[]
  onUploadSuccess?: () => void
}

export default function VideoUploader({ videos, onUploadSuccess }: VideoUploaderProps) {
  const [selectedVideo, setSelectedVideo] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [caption, setCaption] = useState('')
  const [timezone, setTimezone] = useState<Timezone>('Asia/Jakarta')
  const [scheduleDatetime, setScheduleDatetime] = useState('')
  const [uploading, setUploading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Initialize schedule datetime to 2 hours from now in the selected timezone
  useEffect(() => {
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000)
    setScheduleDatetime(toLocalDatetimeString(twoHoursFromNow, timezone))
  }, [timezone])

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedVideo) {
      const video = videos.find((v) => v.video_url === selectedVideo)
      if (video && video.account_id) {
        setSelectedAccount(video.account_id)
      }
      if (video && video.template_id) {
        setSelectedTemplate(video.template_id)
        // Fetch template to fill caption
        fetch(`/api/templates?q=${encodeURIComponent(video.template_id)}&limit=1`)
          .then((res) => res.ok ? res.json() : null)
          .then((json) => {
            const t = json?.data?.[0]
            if (t?.caption) setCaption(t.caption)
          })
          .catch(() => {})
      }
    }
  }, [selectedVideo, videos])

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts')
      if (response.ok) {
        const result = await response.json()
        const accountsArray = result?.data || result || []
        setAccounts(Array.isArray(accountsArray) ? accountsArray : [])
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
      setAccounts([])
    }
  }

  const scheduleMinutesFromNow = useMemo(() => {
    if (!scheduleDatetime) return 120
    const target = fromLocalDatetimeString(scheduleDatetime, timezone)
    const diffMs = target.getTime() - Date.now()
    return Math.max(1, Math.round(diffMs / 60000))
  }, [scheduleDatetime, timezone])

  const formattedPreview = useMemo(() => {
    if (!scheduleDatetime) return ''
    const target = fromLocalDatetimeString(scheduleDatetime, timezone)
    const otherTz: Timezone = timezone === 'Asia/Jakarta' ? 'Europe/London' : 'Asia/Jakarta'
    const fmt = (tz: Timezone) =>
      target.toLocaleString('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' })
    return `${TIMEZONE_LABELS[timezone]}: ${fmt(timezone)}  |  ${TIMEZONE_LABELS[otherTz]}: ${fmt(otherTz)}`
  }, [scheduleDatetime, timezone])

  const handleUpload = async () => {
    if (!selectedVideo || !selectedAccount) {
      setError('Please select a video and account')
      return
    }

    if (scheduleMinutesFromNow < 1) {
      setError('Scheduled time must be in the future')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const video = videos.find((v) => v.video_url === selectedVideo)
      const templateId = selectedTemplate || video?.template_id || null
      const isCarousel = video?.post_type === 'carousel' && Array.isArray(video?.slide_urls) && video.slide_urls.length > 0

      const response = await fetch('/api/videos/upload-geelark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: isCarousel ? undefined : selectedVideo,
          account_id: selectedAccount,
          template_id: templateId,
          caption: caption || undefined,
          schedule_minutes: scheduleMinutesFromNow,
          ...(isCarousel && {
            post_type: 'carousel',
            slide_urls: video!.slide_urls,
          }),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setSuccess(
        data.carousel
          ? `Carousel (${data.slideCount} slides) uploaded successfully! Task ID: ${data.taskId}. Scheduled for ${new Date(data.scheduledTime).toLocaleString()}`
          : `Video uploaded successfully! Task ID: ${data.taskId}. Scheduled for ${new Date(data.scheduledTime).toLocaleString()}`
      )

      setSelectedVideo('')
      setSelectedAccount('')
      setSelectedTemplate('')
      setCaption('')

      if (onUploadSuccess) {
        onUploadSuccess()
      }
    } catch (error: any) {
      setError(error.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Paper sx={{ p: 3, mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Upload Video to GeeLark
      </Typography>

      <Stack spacing={3}>
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

        <FormControl fullWidth>
          <InputLabel id="select-video-label">Select Video</InputLabel>
          <Select
            labelId="select-video-label"
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            label="Select Video"
            disabled={uploading}
            displayEmpty
            renderValue={(v) => {
              if (!v) return videos.length === 0 ? 'No videos available' : 'Choose a video...'
              const video = videos.find((x) => x.video_url === v)
              const caption = (video?.templates?.caption ?? video?.template_id ?? 'Video').toString().substring(0, 35)
              const account = video?.accounts?.display_name ?? video?.account_id ?? ''
              return `${caption}${caption.length >= 35 ? '...' : ''} - ${account}`
            }}
          >
            {videos.length === 0 ? (
              <MenuItem disabled value="">
                No videos available. Generate a video in the Create Video tab first.
              </MenuItem>
            ) : (
              videos.map((video) => (
                <MenuItem key={video.id} value={video.video_url}>
                  {video.templates?.caption?.substring(0, 40) || video.template_id || 'Unknown'}
                  {' - '}
                  {video.accounts?.display_name || video.account_id}
                  {video.created_at && ` (${new Date(video.created_at).toLocaleDateString()})`}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel>Select Account</InputLabel>
          <Select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            label="Select Account"
            disabled={uploading}
          >
            {Array.isArray(accounts) && accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                {account.display_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TemplateSelector
          value={selectedTemplate}
          onChange={(templateId, template) => {
            setSelectedTemplate(templateId)
            if (template) setCaption(template.caption)
          }}
          label="Select Template (Optional)"
          allowEmpty
          disabled={uploading}
        />

        <TextField
          label="Caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          fullWidth
          multiline
          rows={3}
          disabled={uploading}
          placeholder="Enter caption for the post..."
        />

        {/* Timezone selector */}
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Timezone
          </Typography>
          <ToggleButtonGroup
            value={timezone}
            exclusive
            onChange={(_, val) => { if (val) setTimezone(val) }}
            size="small"
            fullWidth
          >
            <ToggleButton value="Asia/Jakarta">Jakarta (WIB, UTC+7)</ToggleButton>
            <ToggleButton value="Europe/London">London (GMT/BST)</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Date/time picker */}
        <TextField
          label={`Schedule Date & Time (${TIMEZONE_LABELS[timezone]})`}
          type="datetime-local"
          value={scheduleDatetime}
          onChange={(e) => setScheduleDatetime(e.target.value)}
          fullWidth
          disabled={uploading}
          InputLabelProps={{ shrink: true }}
          helperText={formattedPreview}
        />

        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={uploading || !selectedVideo || !selectedAccount}
          startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
          size="large"
        >
          {uploading ? 'Uploading...' : 'Upload to GeeLark'}
        </Button>
      </Stack>
    </Paper>
  )
}
