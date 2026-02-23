import ScrapingControl from '@/components/ScrapingControl'
import { Container, Typography, Paper, Box, List, ListItem, ListItemText } from '@mui/material'

export default function ScrapingPage() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 4 }}>
        Scraping Control
      </Typography>

      <ScrapingControl />

      <Paper sx={{ mt: 4, p: 3 }}>
        <Typography variant="h6" fontWeight="semibold" sx={{ mb: 2 }}>
          How It Works
        </Typography>
        <List>
          <ListItem>
            <ListItemText primary="1. Enter Pinterest URLs or Google Images search terms" />
          </ListItem>
          <ListItem>
            <ListItemText primary="2. Click 'Start Scraping'" />
          </ListItem>
          <ListItem>
            <ListItemText primary="3. The extension will automatically open tabs and start scraping" />
          </ListItem>
          <ListItem>
            <ListItemText primary="4. Images will be uploaded to the Assets library" />
          </ListItem>
        </List>
      </Paper>
    </Container>
  )
}
