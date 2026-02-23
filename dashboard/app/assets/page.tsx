import AssetsBrowser from '@/components/AssetsBrowser'
import ReorganizeButton from '@/components/ReorganizeButton'
import { Container, Typography, Box } from '@mui/material'

export default async function AssetsPage() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Asset Library
        </Typography>
        <ReorganizeButton />
      </Box>
      <AssetsBrowser 
        initialAssets={[]} 
        fandoms={[]}
        categories={[]}
      />
    </Container>
  )
}
