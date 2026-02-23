'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Divider,
} from '@mui/material'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      if (data.user) {
        // Wait a moment for cookies to be set
        await new Promise(resolve => setTimeout(resolve, 100))
        router.push('/')
        router.refresh()
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
          GeeLark Automation
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Sign in to your account
        </Typography>
      </Box>

      <Paper elevation={3} sx={{ p: 4 }}>
        <form onSubmit={handleLogin}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            id="email"
            name="email"
            type="email"
            label="Email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            sx={{ mb: 3 }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{ mb: 3 }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <Divider sx={{ my: 3 }}>
          <Typography variant="body2" color="text.secondary">
            New to GeeLark?
          </Typography>
        </Divider>

        <Typography variant="body2" color="text.secondary" textAlign="center">
          For development, you can create an account in Supabase Dashboard or use magic link.
        </Typography>
      </Paper>
    </Container>
  )
}
