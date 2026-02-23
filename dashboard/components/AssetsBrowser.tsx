'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Button,
  Paper,
  Chip,
  CircularProgress,
  Stack,
  Breadcrumbs,
  Link as MuiLink,
  Checkbox,
  IconButton,
  Tooltip,
  Skeleton,
  Tabs,
  Tab,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import BuildIcon from '@mui/icons-material/Build'
import SyncIcon from '@mui/icons-material/Sync'
import EditIcon from '@mui/icons-material/Edit'
import MusicNoteIcon from '@mui/icons-material/MusicNote'
import ImageIcon from '@mui/icons-material/Image'

interface Asset {
  id: string
  url: string
  fandom?: string
  category?: string
  subcategory?: string
  tags?: string[]
  metadata?: any
  created_at: string
}

interface GroupedAssets {
  [category: string]: {
    [subcategory: string]: Asset[]
  }
}

interface AssetsBrowserProps {
  initialAssets: Asset[]
  fandoms: string[]
  categories: string[]
}

type View = 'animes' | 'characters' | 'images'

// Dynamically import MusicBrowser to avoid SSR issues
const MusicBrowser = dynamic(() => import('./MusicBrowser'), { ssr: false })

// Memoized ImageCard component for performance optimization
const ImageCard = memo(({ 
  asset, 
  isSelected, 
  onToggleSelect, 
  onDelete, 
  deleting 
}: {
  asset: Asset
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
  deleting: boolean
}) => {
  return (
    <Box 
      sx={{ 
        flex: '0 1 calc(16.666% - 10px)', 
        minWidth: { 
          xs: 'calc(50% - 8px)', 
          sm: 'calc(33.333% - 11px)', 
          md: 'calc(25% - 12px)', 
          lg: 'calc(16.666% - 10px)' 
        },
        maxWidth: {
          xs: 'calc(50% - 8px)', 
          sm: 'calc(33.333% - 11px)', 
          md: 'calc(25% - 12px)', 
          lg: 'calc(16.666% - 10px)'
        },
        position: 'relative'
      }}
    >
      <Card
        sx={{
          height: '100%',
          border: isSelected ? 2 : 1,
          borderColor: isSelected ? 'primary.main' : 'divider',
          '&:hover': { boxShadow: 4 },
          transition: 'box-shadow 0.2s',
        }}
      >
        {/* Checkbox overlay */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 2,
            bgcolor: 'background.paper',
            borderRadius: '50%',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation()
              onToggleSelect(asset.id)
            }}
            disabled={deleting}
            sx={{ 
              p: 0.5,
              '& .MuiSvgIcon-root': {
                transition: 'none'
              }
            }}
            size="small"
          />
        </Box>
        
        {/* Delete button overlay */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(asset.id)
              }}
              disabled={deleting}
              sx={{
                bgcolor: 'error.main',
                color: 'white',
                '&:hover': { bgcolor: 'error.dark' },
                '&.Mui-disabled': {
                  bgcolor: 'action.disabledBackground',
                  color: 'action.disabled'
                }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <CardMedia sx={{ position: 'relative', aspectRatio: '1/1' }}>
          <Image
            src={asset.url}
            alt={asset.subcategory || 'Asset'}
            fill
            style={{ objectFit: 'cover' }}
            unoptimized
            loading="lazy"
          />
          {isSelected && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'primary.main',
                opacity: 0.2,
                pointerEvents: 'none',
                transition: 'none',
              }}
            />
          )}
        </CardMedia>
        {asset.tags && asset.tags.length > 0 && (
          <CardContent sx={{ p: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {asset.tags.slice(0, 2).map((tag, idx) => (
                <Chip
                  key={idx}
                  label={tag}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.625rem', height: 20 }}
                />
              ))}
            </Box>
          </CardContent>
        )}
      </Card>
    </Box>
  )
}, (prevProps, nextProps) => {
  // Only re-render if selection state, deleting state, or asset ID/URL changes for THIS card
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.deleting === nextProps.deleting &&
    prevProps.asset.id === nextProps.asset.id &&
    prevProps.asset.url === nextProps.asset.url
  )
})

ImageCard.displayName = 'ImageCard'

interface DebugInfo {
  totalAssetsInDatabase?: number
  totalAssetsFetched?: number
  assetsWithCategory?: number
  assetsWithSearchQuery?: number
  assetsWithBoth?: number
  assetsWithNeither?: number
  processedCount?: number
  skippedCount?: number
  categoriesFound?: number
  totalGroupedAssets?: number
}

export default function AssetsBrowser({ initialAssets, fandoms, categories }: AssetsBrowserProps) {
  const [groupedAssets, setGroupedAssets] = useState<GroupedAssets>({})
  const [loading, setLoading] = useState(false)
  const [currentView, setCurrentView] = useState<View>('animes')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('')
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [fixingUrls, setFixingUrls] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'images' | 'music'>('images')

  // Cache keys
  const CACHE_KEY = 'assets_grouped_cache'
  const CACHE_TIMESTAMP_KEY = 'assets_grouped_cache_timestamp'
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  // Fetch grouped assets function (memoized)
  const fetchGroupedAssets = useCallback(async (useCache = true) => {
    // Check cache first
    if (useCache) {
      try {
        const cachedData = sessionStorage.getItem(CACHE_KEY)
        const cacheTimestamp = sessionStorage.getItem(CACHE_TIMESTAMP_KEY)
        
        if (cachedData && cacheTimestamp) {
          const timestamp = parseInt(cacheTimestamp, 10)
          const now = Date.now()
          
          // Use cache if it's less than 5 minutes old
          if (now - timestamp < CACHE_DURATION) {
            const parsed = JSON.parse(cachedData)
            setGroupedAssets(parsed.grouped || {})
            setDebugInfo(parsed.debug || null)
            console.log('[DEBUG] Using cached assets data')
            return
          }
        }
      } catch (error) {
        console.warn('Error reading cache:', error)
      }
    }

    // Fetch fresh data
    setLoading(true)
    try {
      const response = await fetch('/api/assets/grouped')
      const result = await response.json()
      
      if (result.error) {
        console.error('Error fetching grouped assets:', result.error)
        setGroupedAssets({})
        setDebugInfo(null)
      } else {
        const data = {
          grouped: result.grouped || {},
          debug: result.debug || null
        }
        setGroupedAssets(data.grouped)
        setDebugInfo(data.debug)
        
        // Cache the data
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
          sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
          console.log('[DEBUG] Assets fetched and cached:', result.debug)
        } catch (error) {
          console.warn('Error caching data:', error)
        }
      }
    } catch (error) {
      console.error('Error fetching grouped assets:', error)
      setGroupedAssets({})
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch grouped assets on mount with caching
  useEffect(() => {
    fetchGroupedAssets()
  }, [fetchGroupedAssets])

  // Manual refresh function
  const handleRefresh = () => {
    sessionStorage.removeItem(CACHE_KEY)
    sessionStorage.removeItem(CACHE_TIMESTAMP_KEY)
    fetchGroupedAssets(false)
  }

  // Fix URLs for current category/subcategory
  const handleFixUrls = async () => {
    if (!selectedCategory || !selectedSubcategory) return
    
    setFixingUrls(true)
    try {
      const response = await fetch('/api/assets/fix-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          subcategory: selectedSubcategory
        })
      })
      
      const result = await response.json()
      
      if (response.ok) {
        // Clear cache and refresh
        sessionStorage.removeItem(CACHE_KEY)
        sessionStorage.removeItem(CACHE_TIMESTAMP_KEY)
        await fetchGroupedAssets(false)
        alert(`Successfully fixed ${result.fixed} out of ${result.total} asset URLs`)
      } else {
        alert(`Error: ${result.error || 'Failed to fix URLs'}`)
      }
    } catch (error: any) {
      console.error('Error fixing URLs:', error)
      alert(`Error: ${error.message || 'Failed to fix URLs'}`)
    } finally {
      setFixingUrls(false)
    }
  }

  // Sync storage files to database (scoped to current folder if in images view)
  const handleSyncStorage = async () => {
    // If in images view, sync only the current character folder
    // If on main page, ask for confirmation before syncing all
    if (currentView === 'images' && selectedCategory && selectedSubcategory) {
      // Scoped sync - no confirmation needed
      setSyncing(true)
      try {
        const response = await fetch('/api/assets/sync-storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: selectedCategory,
            subcategory: selectedSubcategory
          })
        })
        
        const result = await response.json()
        
        if (response.ok) {
          // Clear cache and refresh
          sessionStorage.removeItem(CACHE_KEY)
          sessionStorage.removeItem(CACHE_TIMESTAMP_KEY)
          await fetchGroupedAssets(false)
          alert(`Successfully synced ${result.synced} files from storage for ${selectedCategory}/${selectedSubcategory}${result.skipped > 0 ? `, skipped ${result.skipped} existing files` : ''}`)
        } else {
          alert(`Error: ${result.error || 'Failed to sync storage'}`)
        }
      } catch (error: any) {
        console.error('Error syncing storage:', error)
        alert(`Error: ${error.message || 'Failed to sync storage'}`)
      } finally {
        setSyncing(false)
      }
    } else {
      // Full sync - ask for confirmation
      if (!confirm('This will sync ALL files from storage. This may take a while. Continue?')) {
        return
      }
      
      setSyncing(true)
      try {
        const response = await fetch('/api/assets/sync-storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        
        const result = await response.json()
        
        if (response.ok) {
          // Clear cache and refresh
          sessionStorage.removeItem(CACHE_KEY)
          sessionStorage.removeItem(CACHE_TIMESTAMP_KEY)
          await fetchGroupedAssets(false)
          alert(`Successfully synced ${result.synced} files from storage${result.skipped > 0 ? `, skipped ${result.skipped} existing files` : ''}`)
        } else {
          alert(`Error: ${result.error || 'Failed to sync storage'}`)
        }
      } catch (error: any) {
        console.error('Error syncing storage:', error)
        alert(`Error: ${error.message || 'Failed to sync storage'}`)
      } finally {
        setSyncing(false)
      }
    }
  }

  // Format category name for display
  const formatCategoryName = (category: string) => {
    const categoryMap: Record<string, string> = {
      'lads': 'Love and Deepspace',
      'jjk': 'Jujutsu Kaisen',
      'genshin': 'Genshin Impact',
      'generic_anime': 'Generic Anime',
      'stores': 'General Items',
      'uncategorized': 'Uncategorized'
    }
    return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1)
  }

  // Format subcategory (character) name for display
  const formatSubcategoryName = (subcategory: string) => {
    const storeSubcategoryMap: Record<string, string> = {
      'figure_shop': 'Figure Shops',
      'figure_collection': 'Figure Collections',
      'blind_box_store': 'Blind Box Stores',
      'blind_box_stores': 'Blind Box Stores',
      'comic_book_store': 'Comic Book Stores',
      'comic_shop': 'Comic Shops',
      'anime_convention': 'Anime Conventions',
      'comic_convention': 'Comic Conventions',
      'anime_store': 'Anime Stores',
      'manga_shop': 'Manga Shops'
    }
    
    if (storeSubcategoryMap[subcategory]) {
      return storeSubcategoryMap[subcategory]
    }
    
    return subcategory
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Get anime categories (excluding stores)
  const animeCategories = ['lads', 'jjk', 'genshin', 'generic_anime']
  const generalCategories = ['stores']

  // Get available categories
  const availableAnimeCategories = Object.keys(groupedAssets)
    .filter(cat => animeCategories.includes(cat))
    .sort()
  const availableGeneralCategories = Object.keys(groupedAssets)
    .filter(cat => generalCategories.includes(cat))
    .sort()

  // Handle anime card click
  const handleAnimeClick = (category: string) => {
    setSelectedCategory(category)
    setCurrentView('characters')
    setSelectedAssets(new Set())
  }

  // Handle character click
  const handleCharacterClick = (subcategory: string) => {
    setSelectedSubcategory(subcategory)
    setCurrentView('images')
    setSelectedAssets(new Set())
  }

  // Handle back navigation
  const handleBack = () => {
    if (currentView === 'images') {
      setCurrentView('characters')
      setSelectedSubcategory('')
    } else if (currentView === 'characters') {
      setCurrentView('animes')
      setSelectedCategory('')
    }
  }

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = (view: View, category?: string, subcategory?: string) => {
    if (view === 'animes') {
      setCurrentView('animes')
      setSelectedCategory('')
      setSelectedSubcategory('')
      setSelectedAssets(new Set())
    } else if (view === 'characters' && category) {
      setCurrentView('characters')
      setSelectedCategory(category)
      setSelectedSubcategory('')
      setSelectedAssets(new Set())
    } else if (view === 'images' && category && subcategory) {
      setCurrentView('images')
      setSelectedCategory(category)
      setSelectedSubcategory(subcategory)
      setSelectedAssets(new Set())
    }
  }

  // Handle asset selection (optimized with useCallback and immediate feedback)
  const handleToggleSelect = useCallback((assetId: string) => {
    // Use functional update for immediate state change
    setSelectedAssets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(assetId)) {
        newSet.delete(assetId)
      } else {
        newSet.add(assetId)
      }
      return newSet
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (!selectedCategory || !selectedSubcategory) return
    const assets = groupedAssets[selectedCategory]?.[selectedSubcategory] || []
    setSelectedAssets(new Set(assets.map(a => a.id)))
  }, [selectedCategory, selectedSubcategory, groupedAssets])

  const handleDeselectAll = useCallback(() => {
    setSelectedAssets(new Set())
  }, [])

  // Optimistically update grouped assets after deletion
  const updateGroupedAssetsAfterDelete = useCallback((deletedIds: string[]) => {
    setGroupedAssets(prev => {
      const updated = { ...prev }
      const idsSet = new Set(deletedIds)
      
      Object.keys(updated).forEach(category => {
        Object.keys(updated[category]).forEach(subcategory => {
          updated[category][subcategory] = updated[category][subcategory].filter(
            (asset: Asset) => !idsSet.has(asset.id)
          )
        })
      })
      
      return updated
    })
  }, [])

  // Handle delete operations (optimized with optimistic updates)
  const handleDeleteAsset = useCallback(async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) {
      return
    }

    // Optimistic update - remove from UI immediately
    updateGroupedAssetsAfterDelete([assetId])
    setSelectedAssets(prev => {
      const newSet = new Set(prev)
      newSet.delete(assetId)
      return newSet
    })

    setDeleting(true)
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        // Revert optimistic update on error
        await fetchGroupedAssets(false)
        alert(`Failed to delete asset: ${error.error || 'Unknown error'}`)
        return
      }

      // Clear cache and refresh in background (non-blocking)
      sessionStorage.removeItem(CACHE_KEY)
      sessionStorage.removeItem(CACHE_TIMESTAMP_KEY)
      
      // Refresh in background without blocking UI
      fetch('/api/assets/grouped')
        .then(res => res.json())
        .then(result => {
          if (result.grouped) {
            setGroupedAssets(result.grouped)
            setDebugInfo(result.debug || null)
            // Update cache
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                grouped: result.grouped,
                debug: result.debug || null
              }))
              sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
            } catch (error) {
              console.warn('Error updating cache:', error)
            }
          }
        })
        .catch(err => console.error('Background refresh error:', err))
    } catch (error) {
      // Revert optimistic update on error
      await fetchGroupedAssets(false)
      alert(`Error deleting asset: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeleting(false)
    }
  }, [updateGroupedAssetsAfterDelete, fetchGroupedAssets])

  const handleBulkDelete = useCallback(async () => {
    if (selectedAssets.size === 0) return

    const count = selectedAssets.size
    const idsToDelete = Array.from(selectedAssets)
    
    if (!confirm(`Are you sure you want to delete ${count} asset(s)?`)) {
      return
    }

    // Optimistic update - remove from UI immediately
    updateGroupedAssetsAfterDelete(idsToDelete)
    setSelectedAssets(new Set())

    setDeleting(true)
    try {
      const response = await fetch('/api/assets/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: idsToDelete }),
      })

      if (!response.ok) {
        const error = await response.json()
        // Revert optimistic update on error
        await fetchGroupedAssets(false)
        alert(`Failed to delete assets: ${error.error || 'Unknown error'}`)
        return
      }

      // Clear cache and refresh in background (non-blocking)
      sessionStorage.removeItem(CACHE_KEY)
      sessionStorage.removeItem(CACHE_TIMESTAMP_KEY)
      
      // Refresh in background without blocking UI
      fetch('/api/assets/grouped')
        .then(res => res.json())
        .then(result => {
          if (result.grouped) {
            setGroupedAssets(result.grouped)
            setDebugInfo(result.debug || null)
            // Update cache
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                grouped: result.grouped,
                debug: result.debug || null
              }))
              sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
            } catch (error) {
              console.warn('Error updating cache:', error)
            }
          }
        })
        .catch(err => console.error('Background refresh error:', err))
    } catch (error) {
      // Revert optimistic update on error
      await fetchGroupedAssets(false)
      alert(`Error deleting assets: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeleting(false)
    }
  }, [selectedAssets, updateGroupedAssetsAfterDelete, fetchGroupedAssets])

  // Get character list for selected anime
  const getCharactersForCategory = (category: string) => {
    const subcategories = Object.keys(groupedAssets[category] || {})
      .filter(sub => {
        // Skip 'other' and 'general' for character-based categories
        const isCharacterCategory = animeCategories.includes(category)
        if (isCharacterCategory && (sub === 'other' || sub === 'general')) {
          return false
        }
        return true
      })
      .sort()
    return subcategories
  }

  // Get assets for selected character
  const getAssetsForCharacter = useCallback(() => {
    if (!selectedCategory || !selectedSubcategory) return []
    return groupedAssets[selectedCategory]?.[selectedSubcategory] || []
  }, [selectedCategory, selectedSubcategory, groupedAssets])

  // Memoize assets for images view (must be at top level, not conditional)
  const assetsForImages = useMemo(() => {
    if (currentView === 'images' && selectedCategory && selectedSubcategory) {
      return getAssetsForCharacter()
    }
    return []
  }, [currentView, selectedCategory, selectedSubcategory, getAssetsForCharacter])

  // Get preview image for anime (first image from first character)
  const getAnimePreview = (category: string) => {
    const subcategories = getCharactersForCategory(category)
    if (subcategories.length > 0) {
      const firstSubcategory = subcategories[0]
      const assets = groupedAssets[category]?.[firstSubcategory] || []
      return assets.length > 0 ? assets[0].url : null
    }
    return null
  }

  // Get preview image for character
  const getCharacterPreview = (subcategory: string, category?: string) => {
    const cat = category || selectedCategory
    if (!cat) return null
    const assets = groupedAssets[cat]?.[subcategory] || []
    return assets.length > 0 ? assets[0].url : null
  }

  // Get total asset count for anime
  const getAnimeAssetCount = (category: string) => {
    const subcategories = getCharactersForCategory(category)
    let total = 0
    subcategories.forEach(sub => {
      total += groupedAssets[category]?.[sub]?.length || 0
    })
    return total
  }

  // Get asset count for character
  const getCharacterAssetCount = (subcategory: string) => {
    if (!selectedCategory) return 0
    return groupedAssets[selectedCategory]?.[subcategory]?.length || 0
  }

  // Skeleton loader for category cards
  const CategoryCardSkeleton = () => (
    <Box sx={{ flex: '0 1 calc(25% - 12px)', minWidth: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)', lg: 'calc(25% - 12px)' }, maxWidth: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)', lg: 'calc(25% - 12px)' } }}>
      <Card sx={{ height: '100%' }}>
        <Skeleton variant="rectangular" height={180} />
        <CardContent sx={{ p: 2 }}>
          <Skeleton variant="text" width="80%" height={24} sx={{ mb: 1 }} />
          <Skeleton variant="text" width="50%" height={20} />
        </CardContent>
      </Card>
    </Box>
  )

  // Skeleton loader for character cards
  const CharacterCardSkeleton = () => (
    <Box sx={{ flex: '0 1 calc(20% - 10px)', minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)', lg: 'calc(20% - 10px)' }, maxWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)', lg: 'calc(20% - 10px)' } }}>
      <Card sx={{ height: '100%' }}>
        <Skeleton variant="rectangular" height={200} />
        <CardContent sx={{ p: 2 }}>
          <Skeleton variant="text" width="70%" height={20} sx={{ mb: 1 }} />
          <Skeleton variant="text" width="40%" height={16} />
        </CardContent>
      </Card>
    </Box>
  )

  // Skeleton loader for image cards
  const ImageCardSkeleton = () => (
    <Box sx={{ flex: '0 1 calc(16.666% - 10px)', minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)', lg: 'calc(16.666% - 10px)' }, maxWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)', lg: 'calc(16.666% - 10px)' } }}>
      <Card sx={{ height: '100%' }}>
        <Skeleton variant="rectangular" height={200} />
        <CardContent sx={{ p: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Skeleton variant="rectangular" width={60} height={20} />
            <Skeleton variant="rectangular" width={60} height={20} />
          </Box>
        </CardContent>
      </Card>
    </Box>
  )

  if (loading) {
    return (
      <Stack spacing={4}>
        {/* Statistics skeleton */}
        <Paper variant="outlined" sx={{ p: 3, bgcolor: 'grey.50', border: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Skeleton variant="text" width={150} height={24} />
            <Skeleton variant="circular" width={32} height={32} />
          </Box>
          <Box>
            <Skeleton variant="text" width={120} height={20} sx={{ mb: 1 }} />
            <Skeleton variant="text" width={100} height={40} />
          </Box>
        </Paper>

        {/* Category cards skeleton */}
        <Box>
          <Skeleton variant="text" width={100} height={32} sx={{ mb: 3 }} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {[...Array(8)].map((_, i) => (
              <CategoryCardSkeleton key={i} />
            ))}
          </Box>
        </Box>
      </Stack>
    )
  }

  // Anime Cards View (Main Page)
  if (currentView === 'animes') {
    return (
      <Stack spacing={4}>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab icon={<ImageIcon />} iconPosition="start" label="Images" value="images" />
            <Tab icon={<MusicNoteIcon />} iconPosition="start" label="Music" value="music" />
          </Tabs>
        </Box>

        {/* Tab Content */}
        {activeTab === 'music' ? (
          <MusicBrowser />
        ) : (
          <>
        {/* Debug Information */}
        {debugInfo && (
          <Paper variant="outlined" sx={{ p: 3, bgcolor: 'grey.50', border: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" fontWeight="semibold" color="text.primary">
                Asset Statistics
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Tooltip title="Sync ALL files from storage to database (will ask for confirmation)">
                  <Button
                    size="small"
                    variant="outlined"
                    color="info"
                    startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                    onClick={handleSyncStorage}
                    disabled={loading || syncing}
                  >
                    {syncing ? 'Syncing...' : 'Sync All Storage'}
                  </Button>
                </Tooltip>
                <Tooltip title="Refresh data">
                  <IconButton
                    size="small"
                    onClick={handleRefresh}
                    disabled={loading || syncing}
                    sx={{ ml: 1 }}
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight="medium" sx={{ mb: 1 }}>
                Total in Database
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="text.primary">
                {debugInfo.totalAssetsInDatabase?.toLocaleString() || 0}
              </Typography>
            </Box>
          </Paper>
        )}
        {/* Anime Section */}
        {availableAnimeCategories.length > 0 && (
          <Box>
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
              Anime
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {availableAnimeCategories.map((category) => {
                const preview = getAnimePreview(category)
                const count = getAnimeAssetCount(category)
                return (
                  <Box key={category} sx={{ flex: '1 1 calc(25% - 12px)', minWidth: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)', lg: 'calc(25% - 12px)' }, maxWidth: { lg: 'calc(25% - 12px)' } }}>
                    <Card
                      sx={{
                        cursor: 'pointer',
                        height: '100%',
                        '&:hover': { boxShadow: 6 },
                        transition: 'box-shadow 0.3s',
                      }}
                      onClick={() => handleAnimeClick(category)}
                    >
                      <CardMedia sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: 'grey.200' }}>
                        {preview ? (
                          <Image
                            src={preview}
                            alt={formatCategoryName(category)}
                            fill
                            style={{ objectFit: 'cover' }}
                            unoptimized
                          />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                            No preview
                          </Box>
                        )}
                      </CardMedia>
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="subtitle1" fontWeight="semibold" gutterBottom>
                          {formatCategoryName(category)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {count} {count === 1 ? 'asset' : 'assets'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}

        {/* General Items Section */}
        {availableGeneralCategories.length > 0 && (
          <Box>
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
              General Items
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {availableGeneralCategories.map((category) => {
                const subcategories = Object.keys(groupedAssets[category] || {}).sort()
                return subcategories.map((subcategory) => {
                  const preview = getCharacterPreview(subcategory, category)
                  const assets = groupedAssets[category]?.[subcategory] || []
                  const count = assets.length
                  return (
                    <Box key={`${category}-${subcategory}`} sx={{ flex: '1 1 calc(25% - 12px)', minWidth: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)', lg: 'calc(25% - 12px)' }, maxWidth: { lg: 'calc(25% - 12px)' } }}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          height: '100%',
                          '&:hover': { boxShadow: 6 },
                          transition: 'box-shadow 0.3s',
                        }}
                        onClick={() => {
                          setSelectedCategory(category)
                          setSelectedSubcategory(subcategory)
                          setCurrentView('images')
                        }}
                      >
                        <CardMedia sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: 'grey.200' }}>
                          {preview ? (
                            <Image
                              src={preview}
                              alt={formatSubcategoryName(subcategory)}
                              fill
                              style={{ objectFit: 'cover' }}
                              unoptimized
                            />
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                              No preview
                            </Box>
                          )}
                        </CardMedia>
                        <CardContent sx={{ p: 2 }}>
                          <Typography variant="subtitle1" fontWeight="semibold" gutterBottom>
                            {formatSubcategoryName(subcategory)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {count} {count === 1 ? 'asset' : 'assets'}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Box>
                  )
                })
              })}
            </Box>
          </Box>
        )}

        {availableAnimeCategories.length === 0 && availableGeneralCategories.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">No assets found</Typography>
          </Box>
        )}
          </>
        )}
      </Stack>
    )
  }

  // Characters View
  if (currentView === 'characters') {
    const characters = getCharactersForCategory(selectedCategory)
    
    return (
      <Stack spacing={3}>
        {/* Breadcrumb Navigation */}
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          aria-label="breadcrumb"
        >
          <MuiLink
            component="button"
            variant="body2"
            onClick={() => handleBreadcrumbClick('animes')}
            sx={{
              cursor: 'pointer',
              color: 'text.primary',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' }
            }}
          >
            Assets
          </MuiLink>
          <Typography variant="body2" color="text.primary" fontWeight="medium">
            {formatCategoryName(selectedCategory)}
          </Typography>
        </Breadcrumbs>

        {/* Header */}
        <Box>
          <Typography variant="h5" fontWeight="bold">
            {formatCategoryName(selectedCategory)} - Characters
          </Typography>
        </Box>

        {/* Character grid */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {characters.map((subcategory) => {
            const preview = getCharacterPreview(subcategory, selectedCategory)
            const count = getCharacterAssetCount(subcategory)
            return (
              <Box key={subcategory} sx={{ flex: '1 1 calc(20% - 10px)', minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)', lg: 'calc(20% - 10px)' }, maxWidth: { lg: 'calc(20% - 10px)' } }}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    height: '100%',
                    '&:hover': { boxShadow: 6 },
                    transition: 'box-shadow 0.3s',
                  }}
                  onClick={() => handleCharacterClick(subcategory)}
                >
                  <CardMedia sx={{ position: 'relative', aspectRatio: '1/1', bgcolor: 'grey.200' }}>
                    {preview ? (
                      <Image
                        src={preview}
                        alt={formatSubcategoryName(subcategory)}
                        fill
                        style={{ objectFit: 'cover' }}
                        unoptimized
                      />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                        No preview
                      </Box>
                    )}
                  </CardMedia>
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle2" fontWeight="semibold" gutterBottom>
                      {formatSubcategoryName(subcategory)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {count} {count === 1 ? 'asset' : 'assets'}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            )
          })}
        </Box>

        {characters.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">No characters found</Typography>
          </Box>
        )}
      </Stack>
    )
  }

  // Images View
  if (currentView === 'images') {
    const assets = assetsForImages
    
    return (
      <Stack spacing={3}>
        {/* Breadcrumb Navigation */}
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          aria-label="breadcrumb"
        >
          <MuiLink
            component="button"
            variant="body2"
            onClick={() => handleBreadcrumbClick('animes')}
            sx={{
              cursor: 'pointer',
              color: 'text.primary',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' }
            }}
          >
            Assets
          </MuiLink>
          <MuiLink
            component="button"
            variant="body2"
            onClick={() => handleBreadcrumbClick('characters', selectedCategory)}
            sx={{
              cursor: 'pointer',
              color: 'text.primary',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' }
            }}
          >
            {formatCategoryName(selectedCategory)}
          </MuiLink>
          <Typography variant="body2" color="text.primary" fontWeight="medium">
            {formatSubcategoryName(selectedSubcategory)}
          </Typography>
        </Breadcrumbs>

        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              {formatCategoryName(selectedCategory)} - {formatSubcategoryName(selectedSubcategory)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
              {selectedAssets.size > 0 && ` • ${selectedAssets.size} selected`}
            </Typography>
          </Box>
          {selectedAssets.size > 0 && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                size="small"
                onClick={handleDeselectAll}
                disabled={deleting}
              >
                Deselect All
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleBulkDelete}
                disabled={deleting}
                size="small"
              >
                Delete Selected ({selectedAssets.size})
              </Button>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedAssets.size === 0 && assets.length > 0 && (
              <Button
                size="small"
                onClick={handleSelectAll}
                disabled={deleting || fixingUrls}
              >
                Select All
              </Button>
            )}
            {/* Temporary Fix URLs Button */}
            <Tooltip title="Fix image URLs for this character folder">
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={fixingUrls ? <CircularProgress size={16} /> : <BuildIcon />}
                onClick={handleFixUrls}
                disabled={deleting || fixingUrls || syncing || !selectedCategory || !selectedSubcategory}
              >
                {fixingUrls ? 'Fixing...' : 'Fix URLs'}
              </Button>
            </Tooltip>
            {/* Sync Storage Button - Scoped to current character folder */}
            <Tooltip title={`Sync files from storage for ${selectedCategory}/${selectedSubcategory}`}>
              <Button
                size="small"
                variant="outlined"
                color="info"
                startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                onClick={handleSyncStorage}
                disabled={deleting || fixingUrls || syncing || !selectedCategory || !selectedSubcategory}
              >
                {syncing ? 'Syncing...' : 'Sync Storage'}
              </Button>
            </Tooltip>
          </Box>
        </Box>

        {/* Image grid */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {assets.map((asset) => (
            <ImageCard
              key={asset.id}
              asset={asset}
              isSelected={selectedAssets.has(asset.id)}
              onToggleSelect={handleToggleSelect}
              onDelete={handleDeleteAsset}
              deleting={deleting}
            />
          ))}
        </Box>

        {assets.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">No images found</Typography>
          </Box>
        )}
      </Stack>
    )
  }

  return null
}
