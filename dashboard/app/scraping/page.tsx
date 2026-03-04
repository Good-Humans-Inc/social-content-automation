import ScrapingControl from '@/components/ScrapingControl'
import { Container, Typography, Paper, Box, List, ListItem, ListItemText, Divider } from '@mui/material'

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

        <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 2 }}>
          Template + AI Scrape (Recommended)
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="1. Select 'Template + AI Scrape' mode" />
          </ListItem>
          <ListItem>
            <ListItemText primary="2. Optionally filter by fandom (or leave as All to process every unscraped template)" />
          </ListItem>
          <ListItem>
            <ListItemText primary="3. Click 'Generate & Queue Scraping' - AI analyzes each template and generates Pinterest search terms" />
          </ListItem>
          <ListItem>
            <ListItemText primary="4. The extension processes templates one by one, scraping 35 images per template" />
          </ListItem>
          <ListItem>
            <ListItemText primary="5. Each scraped image is automatically linked to its template" />
          </ListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" fontWeight="bold">
          Manual / Anime &amp; Character Mode
        </Typography>
        <List dense>
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
