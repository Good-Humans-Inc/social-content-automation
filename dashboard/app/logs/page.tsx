import { createClient } from '@/lib/supabase/server'
import LogsList from '@/components/LogsList'
import { Container, Typography, Grid, Card, CardContent } from '@mui/material'

export default async function LogsPage() {
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('post_logs')
    .select('*, accounts(*), templates(*)')
    .order('created_at', { ascending: false })
    .limit(100)

  // Get stats
  const { count: totalCount } = await supabase
    .from('post_logs')
    .select('*', { count: 'exact', head: true })

  const { count: successCount } = await supabase
    .from('post_logs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'success')

  const { count: failedCount } = await supabase
    .from('post_logs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')

  const successRate =
    totalCount && totalCount > 0 ? ((successCount || 0) / totalCount) * 100 : 0

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 4 }}>
        Posting Logs
      </Typography>

      {/* Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
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
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
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
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
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
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Success Rate
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="primary.main">
                {successRate.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <LogsList initialLogs={logs || []} />
    </Container>
  )
}
