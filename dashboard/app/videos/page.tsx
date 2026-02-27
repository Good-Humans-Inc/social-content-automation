'use client'

import { useState, useEffect } from 'react'
import { 
  Container, 
  Typography, 
  Box, 
  Card, 
  CardContent, 
  Chip, 
  Stack, 
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material'
import VideoUploader from '@/components/VideoUploader'
import JobsList from '@/components/JobsList'
import JobCreateButton from '@/components/JobCreateButton'
import AutoGenerateButton from '@/components/AutoGenerateButton'

interface Video {
  id: string
  template_id: string
  account_id: string
  post_type: string
  status: string
  video_url: string
  created_at: string
  scheduled_time?: string
  accounts?: {
    display_name: string
  }
  templates?: {
    caption: string
  }
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`video-tabpanel-${index}`}
      aria-labelledby={`video-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  )
}

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

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [tabValue, setTabValue] = useState(0)

  useEffect(() => {
    fetchVideos()
    fetchJobs()
  }, [])

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos')
      const data = await response.json().catch(() => ({}))
      if (response.ok && Array.isArray(data)) {
        setVideos(data)
      } else {
        setVideos([])
        if (!response.ok) {
          console.error('Videos API error:', response.status, data?.error || data?.details)
        }
      }
    } catch (error) {
      console.error('Error fetching videos:', error)
      setVideos([])
    }
  }

  const fetchJobs = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/jobs?limit=100')
      if (response.ok) {
        const data = await response.json()
        setJobs(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
    if (newValue === 1) {
      fetchVideos()
    }
  }

  const handleUploadSuccess = () => {
    // Refresh videos list after successful upload
    fetchVideos()
  }

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Videos
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="video tabs">
          <Tab label="Create Video" />
          <Tab label="Upload Video" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 3 }}>
          <AutoGenerateButton onSuccess={fetchJobs} />
          <JobCreateButton />
        </Box>
        <JobsList initialJobs={jobs} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <VideoUploader videos={videos} onUploadSuccess={handleUploadSuccess} />

        {videos.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">
              No videos found. Videos will appear here after they are generated.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 3,
              mt: 2,
              '& > *': {
                flex: '1 1 280px',
                minWidth: 0,
              },
            }}
          >
            {videos.map((video) => (
              <Card key={video.id}>
                <Box sx={{ position: 'relative', width: '100%', bgcolor: 'black' }}>
                  <video
                    controls
                    style={{
                      width: '100%',
                      maxHeight: '400px',
                      display: 'block',
                    }}
                    src={video.video_url}
                    preload="metadata"
                  >
                    Your browser does not support the video tag.
                  </video>
                </Box>
                <CardContent>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1" fontWeight="medium">
                        {video.accounts?.display_name || video.account_id}
                      </Typography>
                      <Chip
                        label={video.status}
                        size="small"
                        color={video.status === 'success' ? 'success' : 'error'}
                      />
                      <Chip label={video.post_type} size="small" color="primary" />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ minHeight: '40px' }}>
                      {video.templates?.caption || 'No caption'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(video.created_at).toLocaleString()}
                      {video.scheduled_time &&
                        ` | Scheduled: ${new Date(video.scheduled_time).toLocaleString()}`}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </TabPanel>
    </Container>
  )
}
