import { createClient } from '@/lib/supabase/server'
import LogsList from '@/components/LogsList'
import { Container, Typography, Box, Card, CardContent } from '@mui/material'

export default async function LogsPage() {
  const supabase = await createClient()

  const { data: logsData } = await supabase
    .from('logs')
    .select('*, accounts(*), templates(*)')
    .order('created_at', { ascending: false })
    .limit(200)

  const logs = (logsData || []).map((row) => ({
    ...row,
    logType: row.type === 'warmup' ? ('warmup' as const) : ('post' as const),
  }))

  const { count: totalCount } = await supabase
    .from('logs')
    .select('*', { count: 'exact', head: true })

  const { count: successCount } = await supabase
    .from('logs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'success')

  const { count: failedCount } = await supabase
    .from('logs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')

  // Success rate = successful / (successful + failed) only; exclude pending/skipped/etc.
  const completedCount = (successCount || 0) + (failedCount || 0)
  const successRate =
    completedCount > 0 ? ((successCount || 0) / completedCount) * 100 : null

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 4 }}>
        Logs
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        All logs: video posting, warmup runs, and other GeeLark tasks. Click &quot;GeeLark detail&quot; for full task logs when available.
      </Typography>

      {/* Stats */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          mb: 4,
          '& > *': {
            flex: '1 1 200px',
            minWidth: 0,
          },
        }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Total Posts
            </Typography>
            <Typography variant="h4" fontWeight="bold">
              {totalCount || 0}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Successful
            </Typography>
            <Typography variant="h4" fontWeight="bold" color="success.main">
              {successCount || 0}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Failed
            </Typography>
            <Typography variant="h4" fontWeight="bold" color="error.main">
              {failedCount || 0}
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Success Rate
            </Typography>
            <Typography variant="h4" fontWeight="bold" color="primary.main">
              {successRate != null ? `${successRate.toFixed(1)}%` : '—'}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <LogsList initialLogs={logs || []} />
    </Container>
  )
}
