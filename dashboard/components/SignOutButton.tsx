'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@mui/material'

export default function SignOutButton() {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <Button
      onClick={handleSignOut}
      color="inherit"
      sx={{ textTransform: 'none' }}
    >
      Sign Out
    </Button>
  )
}
