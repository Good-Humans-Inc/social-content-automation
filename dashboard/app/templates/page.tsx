import { createClient } from '@/lib/supabase/server'
import TemplatesList from '@/components/TemplatesList'
import TemplateCreateButton from '@/components/TemplateCreateButton'
import { Container, Typography, Box, Button } from '@mui/material'
import Link from 'next/link'

export default async function TemplatesPage() {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Templates
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TemplateCreateButton />
          <Link href="/api/templates/export" style={{ textDecoration: 'none' }}>
            <Button
              variant="contained"
              color="success"
            >
              Export JSONL
            </Button>
          </Link>
        </Box>
      </Box>
      <TemplatesList initialTemplates={templates || []} />
    </Container>
  )
}
