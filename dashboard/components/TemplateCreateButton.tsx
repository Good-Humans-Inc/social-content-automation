'use client'

import { useState } from 'react'
import TemplateCreateForm from './TemplateCreateForm'
import TemplateImportForm from './TemplateImportForm'
import { Button, Box, Dialog } from '@mui/material'

export default function TemplateCreateButton() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const handleSuccess = () => {
    setShowCreateModal(false)
    setShowImportModal(false)
    // Refresh the page to show new templates
    window.location.reload()
  }

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          onClick={() => setShowCreateModal(true)}
          variant="contained"
          color="primary"
        >
          + Create Template
        </Button>
        <Button
          onClick={() => setShowImportModal(true)}
          variant="contained"
          color="secondary"
        >
          📥 Import JSONL
        </Button>
      </Box>

      <Dialog
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth="md"
        fullWidth
      >
        <TemplateCreateForm onSuccess={handleSuccess} onCancel={() => setShowCreateModal(false)} />
      </Dialog>

      <Dialog
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        maxWidth="md"
        fullWidth
      >
        <TemplateImportForm onSuccess={handleSuccess} onCancel={() => setShowImportModal(false)} />
      </Dialog>
    </>
  )
}
