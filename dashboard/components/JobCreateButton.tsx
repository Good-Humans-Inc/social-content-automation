'use client'

import { useState } from 'react'
import JobCreateForm from './JobCreateForm'
import { Button, Dialog } from '@mui/material'

export default function JobCreateButton() {
  const [showModal, setShowModal] = useState(false)

  const handleSuccess = () => {
    setShowModal(false)
    window.location.reload()
  }

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        variant="contained"
        color="primary"
      >
        + Create Job
      </Button>

      <Dialog
        open={showModal}
        onClose={() => setShowModal(false)}
        maxWidth="md"
        fullWidth
      >
        <JobCreateForm onSuccess={handleSuccess} onCancel={() => setShowModal(false)} />
      </Dialog>
    </>
  )
}
