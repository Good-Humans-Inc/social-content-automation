'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material'
import SignOutButton from '@/components/SignOutButton'

export default function Navbar() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Don't show navbar on login page
  if (pathname === '/login') {
    return null
  }
  
  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <AppBar position="static" color="default" elevation={1} sx={{ visibility: 'hidden' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 4 }}>
            GeeLark Automation
          </Typography>
        </Toolbar>
      </AppBar>
    )
  }

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/scraping', label: 'Scraping' },
    { href: '/assets', label: 'Assets' },
    { href: '/templates', label: 'Templates' },
    { href: '/accounts', label: 'Accounts' },
    { href: '/videos', label: 'Videos' },
    { href: '/daily', label: 'Daily' },
    { href: '/logs', label: 'Logs' },
  ]

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar>
        <Typography
          variant="h6"
          component={Link}
          href="/"
          sx={{
            flexGrow: 0,
            mr: 4,
            fontWeight: 'bold',
            color: 'text.primary',
            textDecoration: 'none',
          }}
        >
          GeeLark Automation
        </Typography>
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, flexGrow: 1 }}>
          {navLinks.map((link) => (
            <Button
              key={link.href}
              component={Link}
              href={link.href}
              color={pathname === link.href ? 'primary' : 'inherit'}
              sx={{
                textTransform: 'none',
                borderBottom: pathname === link.href ? 2 : 0,
                borderColor: 'primary.main',
                borderRadius: 0,
              }}
            >
              {link.label}
            </Button>
          ))}
        </Box>
        <SignOutButton />
      </Toolbar>
    </AppBar>
  )
}
