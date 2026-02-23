'use client'

import { Paper, Box, Typography, Chip, Stack } from '@mui/material'

interface Log {
  id: string
  template_id: string
  account_id: string
  post_type: string
  status: string
  error_message?: string
  scheduled_time?: string
  video_url?: string
  created_at: string
  accounts?: {
    display_name: string
  }
  templates?: {
    caption: string
  }
}

interface LogsListProps {
  initialLogs: Log[]
}

export default function LogsList({ initialLogs }: LogsListProps) {
  return (
    <Paper>
      <Box sx={{ p: 3 }}>
        <Stack spacing={2}>
          {initialLogs.map((log) => (
            <Paper
              key={log.id}
              variant="outlined"
              sx={{ p: 2, '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body1" fontWeight="medium">
                    {log.accounts?.display_name || log.account_id}
                  </Typography>
                  <Chip
                    label={log.status}
                    size="small"
                    color={log.status === 'success' ? 'success' : 'error'}
                  />
                  <Chip label={log.post_type} size="small" color="primary" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {log.templates?.caption || 'No caption'}
                </Typography>
                {log.video_url && (
                  <Box sx={{ mt: 2, width: '100%', maxWidth: '500px' }}>
                    <video
                      controls
                      style={{
                        width: '100%',
                        maxHeight: '300px',
                        borderRadius: '4px',
                      }}
                      src={log.video_url}
                      preload="metadata"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </Box>
                )}
                {log.error_message && (
                  <Typography variant="body2" color="error">
                    {log.error_message}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {new Date(log.created_at).toLocaleString()}
                  {log.scheduled_time &&
                    ` | Scheduled: ${new Date(log.scheduled_time).toLocaleString()}`}
                </Typography>
              </Stack>
            </Paper>
          ))}
        </Stack>
        {initialLogs.length === 0 && (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
            No logs found
          </Typography>
        )}
      </Box>
    </Paper>
  )
}
