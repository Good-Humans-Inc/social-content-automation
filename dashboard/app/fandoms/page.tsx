import FandomsManager from '@/components/FandomsManager'
import { Container, Typography } from '@mui/material'

export default function FandomsPage() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 4 }}>
        Fandoms &amp; Characters
      </Typography>
      <FandomsManager />
    </Container>
  )
}
