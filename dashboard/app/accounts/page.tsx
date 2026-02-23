import { createClient } from '@/lib/supabase/server'
import AccountsList from '@/components/AccountsList'
import { Container, Typography } from '@mui/material'

export default async function AccountsPage() {
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 4 }}>
        Accounts
      </Typography>
      <AccountsList initialAccounts={accounts || []} />
    </Container>
  )
}
