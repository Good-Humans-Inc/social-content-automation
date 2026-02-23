import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Container, Typography, Card, CardContent, Box, Chip, Paper, Divider, Alert } from '@mui/material'
import { ArrowForward } from '@mui/icons-material'

export default async function Home() {
  const supabase = await createClient()

  // Initialize default values
  let assetsCount = { count: 0, error: null as any }
  let templatesCount = { count: 0, error: null as any }
  let accountsCount = { count: 0, error: null as any }
  let recentLogs = { data: [] as any[], error: null as any }
  let failures = { data: [] as any[], error: null as any }
  let errorMessage: string | null = null

  try {
    // Get stats with individual error handling
    const [assetsResult, templatesResult, accountsResult, recentLogsResult] = await Promise.all([
      supabase.from('assets').select('*', { count: 'exact', head: true }),
      supabase.from('templates').select('*', { count: 'exact', head: true }),
      supabase.from('accounts').select('*', { count: 'exact', head: true }),
      supabase
        .from('post_logs')
        .select('*, accounts(*), templates(*)')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    // Handle each query result separately
    if (assetsResult.error) {
      console.error('Error fetching assets count:', assetsResult.error)
      assetsCount.error = assetsResult.error
    } else {
      assetsCount = assetsResult
    }

    if (templatesResult.error) {
      console.error('Error fetching templates count:', templatesResult.error)
      templatesCount.error = templatesResult.error
    } else {
      templatesCount = templatesResult
    }

    if (accountsResult.error) {
      console.error('Error fetching accounts count:', accountsResult.error)
      accountsCount.error = accountsResult.error
    } else {
      accountsCount = accountsResult
    }

    if (recentLogsResult.error) {
      console.error('Error fetching recent logs:', recentLogsResult.error)
      recentLogs.error = recentLogsResult.error
    } else {
      recentLogs = recentLogsResult
    }

    // Get recent failures
    const failuresResult = await supabase
      .from('post_logs')
      .select('*, accounts(*), templates(*)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(5)

    if (failuresResult.error) {
      console.error('Error fetching failures:', failuresResult.error)
      failures.error = failuresResult.error
    } else {
      failures = failuresResult
    }
  } catch (err) {
    console.error('Dashboard error:', err)
    errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred while loading dashboard data'
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, sm: 4, md: 5 }, px: { xs: 2, sm: 3 } }}>
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}
      
      {(assetsCount.error || templatesCount.error || accountsCount.error) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Some data could not be loaded. Please check your database connection and try refreshing the page.
        </Alert>
      )}

      <Box sx={{ mb: { xs: 3, sm: 4, md: 5 } }}>
        <Typography 
          variant="h4" 
          component="h1" 
          fontWeight="bold"
          sx={{ mb: 0.5 }}
        >
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Overview of your automation system
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Box 
        sx={{ 
          display: 'flex',
          gap: 3,
          mb: { xs: 4, md: 5 },
          flexDirection: { xs: 'column', sm: 'row' }
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Card 
            sx={{ 
              height: '100%',
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': { 
                transform: 'translateY(-4px)',
                boxShadow: 4
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography 
                variant="body2" 
                color="text.secondary" 
                sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
              >
                Assets
              </Typography>
              <Typography 
                variant="h3" 
                color="primary.main" 
                fontWeight="bold"
                sx={{ mb: 2.5 }}
              >
                {assetsCount.count?.toLocaleString() || 0}
              </Typography>
              <Link href="/assets" style={{ textDecoration: 'none' }}>
                <Box 
                  sx={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    color: 'primary.main',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    '&:hover': {
                      color: 'primary.dark',
                      textDecoration: 'underline'
                    },
                    transition: 'color 0.2s'
                  }}
                >
                  View all <ArrowForward sx={{ ml: 0.5, fontSize: 18 }} />
                </Box>
              </Link>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Card 
            sx={{ 
              height: '100%',
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': { 
                transform: 'translateY(-4px)',
                boxShadow: 4
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography 
                variant="body2" 
                color="text.secondary" 
                sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
              >
                Templates
              </Typography>
              <Typography 
                variant="h3" 
                color="success.main" 
                fontWeight="bold"
                sx={{ mb: 2.5 }}
              >
                {templatesCount.count?.toLocaleString() || 0}
              </Typography>
              <Link href="/templates" style={{ textDecoration: 'none' }}>
                <Box 
                  sx={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    color: 'success.main',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    '&:hover': {
                      color: 'success.dark',
                      textDecoration: 'underline'
                    },
                    transition: 'color 0.2s'
                  }}
                >
                  View all <ArrowForward sx={{ ml: 0.5, fontSize: 18 }} />
                </Box>
              </Link>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Card 
            sx={{ 
              height: '100%',
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': { 
                transform: 'translateY(-4px)',
                boxShadow: 4
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography 
                variant="body2" 
                color="text.secondary" 
                sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
              >
                Accounts
              </Typography>
              <Typography 
                variant="h3" 
                color="secondary.main" 
                fontWeight="bold"
                sx={{ mb: 2.5 }}
              >
                {accountsCount.count?.toLocaleString() || 0}
              </Typography>
              <Link href="/accounts" style={{ textDecoration: 'none' }}>
                <Box 
                  sx={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    color: 'secondary.main',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    '&:hover': {
                      color: 'secondary.dark',
                      textDecoration: 'underline'
                    },
                    transition: 'color 0.2s'
                  }}
                >
                  View all <ArrowForward sx={{ ml: 0.5, fontSize: 18 }} />
                </Box>
              </Link>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Recent Posts */}
      <Paper 
        elevation={0}
        sx={{ 
          mb: { xs: 4, md: 5 },
          border: 1,
          borderColor: 'divider',
          borderRadius: 2
        }}
      >
        <Box 
          sx={{ 
            p: { xs: 2.5, sm: 3 }, 
            borderBottom: 1, 
            borderColor: 'divider',
            bgcolor: 'grey.50'
          }}
        >
          <Typography variant="h6" fontWeight="semibold">
            Recent Posts
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Latest posting activity
          </Typography>
        </Box>
        <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
          {recentLogs.data && recentLogs.data.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentLogs.data.map((log: any) => (
                <Box
                  key={log.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    p: 2.5,
                    bgcolor: 'grey.50',
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    transition: 'background-color 0.2s, border-color 0.2s',
                    '&:hover': {
                      bgcolor: 'grey.100',
                      borderColor: 'primary.light'
                    }
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="body1" fontWeight="medium" noWrap>
                        {log.accounts?.display_name || log.account_id}
                      </Typography>
                      <Chip
                        label={log.status}
                        color={log.status === 'success' ? 'success' : 'error'}
                        size="small"
                        sx={{ height: 24, fontSize: '0.7rem' }}
                      />
                    </Box>
                    <Typography 
                      variant="body2" 
                      color="text.secondary"
                      sx={{ mb: 1, wordBreak: 'break-word' }}
                    >
                      {log.templates?.caption || 'No caption'}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{ display: 'block' }}
                    >
                      {new Date(log.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Box 
              sx={{ 
                textAlign: 'center', 
                py: 6,
                px: 2
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No posts yet
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Posts will appear here once you start creating content
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Recent Failures */}
      {failures && failures.data && failures.data.length > 0 && (
        <Paper 
          elevation={0}
          sx={{ 
            border: 1,
            borderColor: 'error.light',
            borderRadius: 2,
            bgcolor: 'error.light',
            opacity: 0.1
          }}
        >
          <Box 
            sx={{ 
              p: { xs: 2.5, sm: 3 }, 
              borderBottom: 1, 
              borderColor: 'error.main',
              bgcolor: 'error.light',
              opacity: 1
            }}
          >
            <Typography variant="h6" fontWeight="semibold" color="error.main">
              Recent Failures
            </Typography>
            <Typography variant="caption" color="error.dark">
              Issues that need attention
            </Typography>
          </Box>
          <Box sx={{ p: { xs: 2.5, sm: 3 }, bgcolor: 'error.light', opacity: 0.1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {failures.data.map((log: any) => (
                <Box
                  key={log.id}
                  sx={{
                    p: 2.5,
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'error.main',
                    transition: 'box-shadow 0.2s',
                    '&:hover': {
                      boxShadow: 2
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="body1" fontWeight="medium">
                      {log.accounts?.display_name || log.account_id}
                    </Typography>
                    <Chip
                      label="Failed"
                      color="error"
                      size="small"
                      sx={{ height: 24, fontSize: '0.7rem' }}
                    />
                  </Box>
                  <Typography 
                    variant="body2" 
                    color="error.main"
                    sx={{ mb: 1, wordBreak: 'break-word' }}
                  >
                    {log.error_message}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                    {new Date(log.created_at).toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Paper>
      )}
    </Container>
  )
}
