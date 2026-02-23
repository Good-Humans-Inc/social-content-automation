'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  IconButton,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  CardMedia,
  Checkbox,
  FormControlLabel,
  Stack,
  Autocomplete,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ImageIcon from '@mui/icons-material/Image'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import TemplateSelector, { TemplateOption } from '@/components/TemplateSelector'

interface JobCreateFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

interface Account {
  id: string
  display_name: string
  persona: string
}

interface Asset {
  id: string
  url: string
  storage_path: string
  fandom?: string
  category?: string
  subcategory?: string
  character?: string
}

// Memoized Image Card Component for better performance
const ImageCard = memo(({ 
  asset, 
  isSelected, 
  onToggle 
}: { 
  asset: Asset
  isSelected: boolean
  onToggle: (id: string) => void
}) => {
  // Direct handler without useCallback to avoid any potential closure issues
  const handleToggle = () => {
    onToggle(asset.id)
  }

  return (
    <Card
      sx={{
        position: 'relative',
        height: '100%',
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? 'primary.main' : 'divider',
        cursor: 'pointer',
        '&:hover': { boxShadow: 4 },
        transition: 'box-shadow 0.2s',
      }}
      onClick={handleToggle}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 2,
          bgcolor: 'background.paper',
          borderRadius: '50%',
        }}
        onClick={(e) => {
          e.stopPropagation()
          handleToggle()
        }}
      >
        <Checkbox
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation()
            handleToggle()
          }}
          onClick={(e) => e.stopPropagation()}
          size="small"
          sx={{ 
            p: 0.5,
            '& .MuiSvgIcon-root': {
              transition: 'none'
            }
          }}
        />
      </Box>
      <CardMedia sx={{ position: 'relative', aspectRatio: '1/1' }}>
        <Image
          src={asset.url}
          alt={asset.subcategory || asset.category || 'Asset'}
          fill
          style={{ objectFit: 'cover' }}
          loading="lazy"
          sizes="(max-width: 600px) 50vw, (max-width: 960px) 33vw, (max-width: 1280px) 25vw, 20vw"
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
      <Box sx={{ p: 0.5 }}>
        <Typography variant="caption" noWrap>
          {asset.subcategory || asset.category || 'Image'}
        </Typography>
      </Box>
    </Card>
  )
}, (prevProps, nextProps) => {
  // Only re-render if selection state or asset ID/URL changes for THIS card
  // This prevents unnecessary re-renders when other cards are selected
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.asset.id === nextProps.asset.id &&
    prevProps.asset.url === nextProps.asset.url
  )
})

ImageCard.displayName = 'ImageCard'

// Memoized Category Card Component
const CategoryCard = memo(({
  category,
  groupedAssets,
  formatCategoryName,
  onClick
}: {
  category: string
  groupedAssets: { [category: string]: { [subcategory: string]: Asset[] } }
  formatCategoryName: (category: string) => string
  onClick: () => void
}) => {
  const subcategories = Object.keys(groupedAssets[category] || {})
  const totalImages = useMemo(
    () => subcategories.reduce((sum, subcat) => 
      sum + (groupedAssets[category][subcat]?.length || 0), 0
    ),
    [subcategories, groupedAssets, category]
  )
  
  const thumbnailAsset = useMemo(() => {
    if (subcategories.length > 0) {
      const lastSubcategory = subcategories[subcategories.length - 1]
      const assets = groupedAssets[category][lastSubcategory] || []
      return assets.length > 0 ? assets[assets.length - 1] : null
    }
    return null
  }, [subcategories, groupedAssets, category])

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': { boxShadow: 4 },
        transition: 'all 0.2s',
        width: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
        minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
        maxWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onClick}
    >
      <CardMedia 
        sx={{ 
          position: 'relative', 
          aspectRatio: '1/1',
          width: '100%',
          flexShrink: 0
        }}
      >
        {thumbnailAsset ? (
          <Image
            src={thumbnailAsset.url}
            alt={formatCategoryName(category)}
            fill
            style={{ objectFit: 'cover' }}
            loading="lazy"
            sizes="(max-width: 600px) 50vw, (max-width: 960px) 33vw, 25vw"
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ImageIcon sx={{ fontSize: 48, color: 'grey.400' }} />
          </Box>
        )}
      </CardMedia>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 80 }}>
        <Typography variant="h6" fontWeight="medium" sx={{ mb: 0.5 }}>
          {formatCategoryName(category)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totalImages} images
        </Typography>
      </CardContent>
    </Card>
  )
})

CategoryCard.displayName = 'CategoryCard'

// Memoized Subcategory Card Component
const SubcategoryCard = memo(({
  subcategory,
  assets,
  formatSubcategoryName,
  onClick
}: {
  subcategory: string
  assets: Asset[]
  formatSubcategoryName: (subcategory: string) => string
  onClick: () => void
}) => {
  const lastAsset = useMemo(() => assets.length > 0 ? assets[assets.length - 1] : null, [assets])

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': { boxShadow: 4 },
        transition: 'all 0.2s',
        width: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
        minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
        maxWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onClick}
    >
      <CardMedia 
        sx={{ 
          position: 'relative', 
          aspectRatio: '1/1',
          width: '100%',
          flexShrink: 0
        }}
      >
        {lastAsset ? (
          <Image
            src={lastAsset.url}
            alt={formatSubcategoryName(subcategory)}
            fill
            style={{ objectFit: 'cover' }}
            loading="lazy"
            sizes="(max-width: 600px) 50vw, (max-width: 960px) 33vw, 25vw"
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ImageIcon sx={{ fontSize: 48, color: 'grey.400' }} />
          </Box>
        )}
      </CardMedia>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 80 }}>
        <Typography variant="h6" fontWeight="medium" sx={{ mb: 0.5 }}>
          {formatSubcategoryName(subcategory)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {assets.length} image{assets.length !== 1 ? 's' : ''}
        </Typography>
      </CardContent>
    </Card>
  )
})

SubcategoryCard.displayName = 'SubcategoryCard'

export default function JobCreateForm({ onSuccess, onCancel }: JobCreateFormProps) {
  const [formData, setFormData] = useState({
    template_id: '',
    account_id: '',
    post_type: 'video' as 'video' | 'slideshow' | 'carousel',
    image_asset_ids: [] as string[],
    video_source: '',
    image_duration: 3.0,
    rapid_mode: false,
    music_asset_id: '',
    music_url: '',
    character_name: '',
    carousel_id: '',
    visual_type: 'A' as 'A' | 'B' | 'C',
    effect_preset: 'none' as 'none' | 'random' | 'cinematic' | 'energetic',
    output_as_slides: false,
  })

  const [selectedTemplateObject, setSelectedTemplateObject] = useState<TemplateOption | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [musicAssets, setMusicAssets] = useState<Asset[]>([])
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  
  // Asset selection dialog state
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [groupedAssets, setGroupedAssets] = useState<{ [category: string]: { [subcategory: string]: Asset[] } }>({})
  const [filteredAssets, setFilteredAssets] = useState<Asset[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [currentView, setCurrentView] = useState<'categories' | 'subcategories' | 'images'>('categories')

  const supabase = createClient()

  // Cache keys for sessionStorage
  const CACHE_KEY = 'job_create_grouped_assets'
  const CACHE_TIMESTAMP_KEY = 'job_create_grouped_assets_timestamp'
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load accounts
        const { data: accountsData } = await supabase
          .from('accounts')
          .select('*')
          .order('created_at', { ascending: false })
        setAccounts(accountsData || [])

        // Load music assets from storage (category=music or path in music bucket)
        try {
          const musicRes = await fetch('/api/assets?category=music&limit=200')
          const musicJson = await musicRes.json()
          if (musicJson.data && Array.isArray(musicJson.data)) {
            setMusicAssets(musicJson.data)
          } else {
            const { data: musicData } = await supabase
              .from('assets')
              .select('*')
              .or('category.eq.music,storage_path.ilike.%music/%')
              .order('created_at', { ascending: false })
              .limit(200)
            setMusicAssets(musicData || [])
          }
        } catch (_) {
          setMusicAssets([])
        }

        // Assets will be loaded via grouped API when dialog opens

        setLoadingData(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
        setLoadingData(false)
      }
    }

    loadData()
  }, [supabase])

  const selectedTemplate = selectedTemplateObject
  const isCharacterGrid = selectedTemplate?.carousel_type === 'character_grid'

  // Memoized function to load grouped assets with caching
  const loadGroupedAssets = useCallback(async (useCache = true) => {
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
            console.log('[DEBUG] Using cached assets data')
            return
          }
        }
      } catch (error) {
        console.warn('Error reading cache:', error)
      }
    }

    // Fetch fresh data
    setLoadingAssets(true)
    try {
      const response = await fetch('/api/assets/grouped')
      const result = await response.json()
      
      if (result.error) {
        console.error('Error fetching grouped assets:', result.error)
        setGroupedAssets({})
      } else {
        const data = {
          grouped: result.grouped || {},
          debug: result.debug || null
        }
        setGroupedAssets(data.grouped)
        
        // Cache the data
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
          sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
          console.log('[DEBUG] Assets fetched and cached')
        } catch (error) {
          console.warn('Error caching data:', error)
        }
      }
    } catch (err) {
      console.error('Error loading grouped assets:', err)
      setGroupedAssets({})
    } finally {
      setLoadingAssets(false)
    }
  }, [])

  // Load grouped assets when dialog opens
  useEffect(() => {
    if (!assetDialogOpen) return
    loadGroupedAssets()
  }, [assetDialogOpen, loadGroupedAssets])

  // Memoize format functions
  const formatCategoryName = useCallback((category: string) => {
    const categoryMap: Record<string, string> = {
      'lads': 'Love and Deepspace',
      'jjk': 'Jujutsu Kaisen',
      'genshin': 'Genshin Impact',
      'generic_anime': 'Generic Anime',
      'stores': 'General Items',
      'uncategorized': 'Uncategorized'
    }
    return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')
  }, [])

  const formatSubcategoryName = useCallback((subcategory: string) => {
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
  }, [])

  // Memoize available categories and subcategories
  const availableCategories = useMemo(
    () => Object.keys(groupedAssets).sort(),
    [groupedAssets]
  )
  const availableSubcategories = useMemo(
    () => filterCategory 
      ? Object.keys(groupedAssets[filterCategory] || {}).sort()
      : [],
    [filterCategory, groupedAssets]
  )

  // Update view and filtered assets when category/subcategory changes
  useEffect(() => {
    if (!filterCategory) {
      // Show categories view
      setFilteredAssets([])
      setCurrentView('categories')
    } else if (!filterSubcategory) {
      // Show subcategories view for the selected category
      setFilteredAssets([])
      setCurrentView('subcategories')
    } else {
      // Show images for the selected category and subcategory
      const assets = groupedAssets[filterCategory]?.[filterSubcategory] || []
      setFilteredAssets(assets)
      setCurrentView('images')
    }
  }, [filterCategory, filterSubcategory, groupedAssets])

  // Initialize selected asset IDs from selectedAssets when dialog opens
  useEffect(() => {
    if (assetDialogOpen) {
      setSelectedAssetIds(new Set(selectedAssets.map(a => a.id)))
    }
  }, [assetDialogOpen, selectedAssets])

  const handleOpenAssetDialog = useCallback(() => {
    setAssetDialogOpen(true)
    setFilterCategory('')
    setFilterSubcategory('')
    setCurrentView('categories')
  }, [])

  const handleCloseAssetDialog = useCallback(() => {
    setAssetDialogOpen(false)
  }, [])

  const handleConfirmAssetSelection = useCallback(() => {
    const selected = filteredAssets.filter(a => selectedAssetIds.has(a.id))
    setSelectedAssets(selected)
    setFormData(prev => ({ 
      ...prev, 
      image_asset_ids: selected.map(a => a.id),
      // Clear video source if images are selected
      video_source: selected.length > 0 && prev.post_type === 'video' ? '' : prev.video_source
    }))
    setAssetDialogOpen(false)
  }, [filteredAssets, selectedAssetIds])

  const handleToggleAssetSelect = useCallback((assetId: string) => {
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(assetId)) {
        newSet.delete(assetId)
      } else {
        newSet.add(assetId)
      }
      return newSet
    })
  }, [])

  // Batch toggle for multiple selections
  const handleToggleMultipleAssets = useCallback((assetIds: string[]) => {
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev)
      assetIds.forEach(id => {
        if (newSet.has(id)) {
          newSet.delete(id)
        } else {
          newSet.add(id)
        }
      })
      return newSet
    })
  }, [])

  // Select all / Deselect all handlers
  const handleSelectAll = useCallback(() => {
    setSelectedAssetIds(new Set(filteredAssets.map(a => a.id)))
  }, [filteredAssets])

  const handleDeselectAll = useCallback(() => {
    setSelectedAssetIds(new Set())
  }, [])

  // Memoized breadcrumb navigation handlers
  const handleNavigateToCategories = useCallback(() => {
    setFilterCategory('')
    setFilterSubcategory('')
    setCurrentView('categories')
  }, [])

  const handleNavigateToSubcategories = useCallback(() => {
    setFilterSubcategory('')
    setCurrentView('subcategories')
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!formData.template_id) {
      setError('Template is required')
      return
    }
    if (!formData.account_id) {
      setError('Account is required')
      return
    }
    if ((formData.post_type === 'carousel' || formData.post_type === 'slideshow') && formData.image_asset_ids.length === 0) {
      setError('At least one image asset is required for ' + formData.post_type)
      return
    }

    setLoading(true)

    try {
      const payload: any = {
        template_id: formData.template_id,
        account_id: formData.account_id,
        post_type: formData.post_type,
        image_asset_ids: formData.image_asset_ids,
        image_duration: formData.image_duration,
        rapid_mode: formData.rapid_mode,
        visual_type: formData.visual_type,
        effect_preset: formData.effect_preset,
        output_as_slides: formData.output_as_slides,
      }

      if (formData.video_source) {
        payload.video_source = formData.video_source
      }
      if (formData.music_asset_id) {
        payload.music_asset_id = formData.music_asset_id
      }
      if (formData.music_url) {
        payload.music_url = formData.music_url
      }
      if (formData.character_name) {
        payload.character_name = formData.character_name
      }
      if (formData.carousel_id) {
        payload.carousel_id = formData.carousel_id
      }

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create job')
      }

      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }, [formData, onSuccess])

  if (loadingData) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 4, maxHeight: '90vh', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" fontWeight="bold" sx={{ fontSize: '1.5rem' }}>
          Create Video Generation Job
        </Typography>
        {onCancel && (
          <IconButton onClick={onCancel} disabled={loading} size="medium" sx={{ color: 'text.secondary' }}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Basic Information Section */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Basic Information
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TemplateSelector
              value={formData.template_id}
              onChange={(templateId, template) => {
                setFormData(prev => ({ ...prev, template_id: templateId }))
                setSelectedTemplateObject(template ?? null)
              }}
              label="Template"
              required
              selectedTemplate={selectedTemplateObject}
            />
            {selectedTemplate && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip label={selectedTemplate.persona} size="small" color="primary" />
                <Chip label={selectedTemplate.fandom} size="small" color="success" />
                <Chip label={selectedTemplate.intensity} size="small" color="secondary" />
                {isCharacterGrid && (
                  <Chip label="Character Grid" size="small" color="info" />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  Caption: {selectedTemplate.caption}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
              <FormControl required sx={{ flex: 1 }}>
                <InputLabel>Account</InputLabel>
                <Select
                  value={formData.account_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, account_id: e.target.value }))}
                  label="Account"
                  sx={{ fontSize: '0.95rem' }}
                >
                  {accounts.map((account) => (
                    <MenuItem key={account.id} value={account.id} sx={{ fontSize: '0.95rem' }}>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {account.display_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {account.persona}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl required sx={{ flex: 1 }}>
                <InputLabel>Post Type</InputLabel>
                <Select
                  value={formData.post_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, post_type: e.target.value as any }))}
                  label="Post Type"
                  sx={{ fontSize: '0.95rem' }}
                >
                  <MenuItem value="video" sx={{ fontSize: '0.95rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">Video with Overlay Text</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Base video or rapid images with text overlay
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="slideshow" sx={{ fontSize: '0.95rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">Slideshow</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Each image gets its own text overlay slide, concatenated into one video
                      </Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="carousel" sx={{ fontSize: '0.95rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">Carousel (Multi-Slide)</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Text-only first slide + image slides (e.g., "Your month", "Your character")
                      </Typography>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Visual Type & Effect Preset */}
            <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Visual Type</InputLabel>
                <Select
                  value={formData.visual_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, visual_type: e.target.value as any }))}
                  label="Visual Type"
                  sx={{ fontSize: '0.95rem' }}
                >
                  <MenuItem value="A" sx={{ fontSize: '0.95rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">A - Static Image + Text</Typography>
                      <Typography variant="caption" color="text.secondary">Image with optional Ken Burns & grain</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="B" sx={{ fontSize: '0.95rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">B - Image + Animated Text</Typography>
                      <Typography variant="caption" color="text.secondary">Still image, text appears line-by-line or fades in</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="C" sx={{ fontSize: '0.95rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">C - Video Base + Text</Typography>
                      <Typography variant="caption" color="text.secondary">Loopable video background with text overlay</Typography>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <InputLabel>Effect Preset</InputLabel>
                <Select
                  value={formData.effect_preset}
                  onChange={(e) => setFormData(prev => ({ ...prev, effect_preset: e.target.value as any }))}
                  label="Effect Preset"
                  sx={{ fontSize: '0.95rem' }}
                >
                  <MenuItem value="none" sx={{ fontSize: '0.95rem' }}>None (clean render)</MenuItem>
                  <MenuItem value="random" sx={{ fontSize: '0.95rem' }}>Random (auto-diversify all effects)</MenuItem>
                  <MenuItem value="cinematic" sx={{ fontSize: '0.95rem' }}>Cinematic (Ken Burns + grain + vignette)</MenuItem>
                  <MenuItem value="energetic" sx={{ fontSize: '0.95rem' }}>Energetic (shake + mirror + high contrast)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Box>

        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              Content Settings
              <Typography component="span" sx={{ color: 'error.main' }}>*</Typography>
            </Typography>
            {formData.post_type === 'video' && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Choose either Video Source OR Image Assets (required for video posts)
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {formData.post_type === 'video' && (
              <TextField
                fullWidth
                label="Video Source"
                value={formData.video_source}
                onChange={(e) => {
                  const newVideoSource = e.target.value
                  setFormData(prev => ({ 
                    ...prev, 
                    video_source: newVideoSource,
                    // Clear image assets if video source is provided
                    image_asset_ids: newVideoSource ? [] : prev.image_asset_ids
                  }))
                  if (newVideoSource) {
                    setSelectedAssets([])
                  }
                }}
                placeholder="Path to base video file (or leave empty to use account default)"
                disabled={formData.image_asset_ids.length > 0}
                sx={{ '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
              />
            )}

            {(formData.post_type === 'carousel' || formData.post_type === 'video' || formData.post_type === 'slideshow') && (
              <Box>
                <TextField
                  fullWidth
                  label="Image Assets"
                  value={selectedAssets.length > 0 ? `${selectedAssets.length} image${selectedAssets.length !== 1 ? 's' : ''} selected` : ''}
                  onClick={handleOpenAssetDialog}
                  placeholder={formData.post_type === 'video' ? "Click to select images for rapid video" : "Click to select images"}
                  helperText={
                    isCharacterGrid
                      ? `Select images for character grid (multiple of ${selectedTemplate?.grid_images || 4})`
                      : formData.post_type === 'carousel'
                      ? `Select ${selectedTemplate?.overlay?.length || 1} images matching overlay lines`
                      : formData.post_type === 'slideshow'
                      ? `Select images matching overlay lines (${selectedTemplate?.overlay?.length || '?'} needed)`
                      : 'Click to browse and select images by category/character'
                  }
                  disabled={formData.post_type === 'video' && !!formData.video_source}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <IconButton onClick={handleOpenAssetDialog} disabled={formData.post_type === 'video' && !!formData.video_source}>
                        <ImageIcon />
                      </IconButton>
                    ),
                  }}
                  sx={{ '& .MuiInputBase-input': { fontSize: '0.95rem', cursor: 'pointer' } }}
                />
                {selectedAssets.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selectedAssets.slice(0, 5).map((asset) => {
                      const label = asset.subcategory || asset.category || asset.storage_path?.split('/').pop() || asset.id.slice(0, 8)
                      return (
                        <Chip
                          key={asset.id}
                          label={label.length > 20 ? `${label.substring(0, 20)}...` : label}
                          size="small"
                          onDelete={() => {
                            const newSelected = selectedAssets.filter(a => a.id !== asset.id)
                            setSelectedAssets(newSelected)
                            setFormData(prev => ({ 
                              ...prev, 
                              image_asset_ids: newSelected.map(a => a.id)
                            }))
                          }}
                          sx={{ fontSize: '0.75rem' }}
                        />
                      )
                    })}
                    {selectedAssets.length > 5 && (
                      <Chip
                        label={`+${selectedAssets.length - 5} more`}
                        size="small"
                        sx={{ fontSize: '0.75rem' }}
                      />
                    )}
                  </Box>
                )}
              </Box>
            )}

            {formData.post_type === 'video' && formData.image_asset_ids.length > 0 && (
              <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Image Duration (seconds)"
                  value={formData.rapid_mode ? 0.2 : formData.image_duration}
                  onChange={(e) => {
                    if (!formData.rapid_mode) {
                      setFormData(prev => ({ ...prev, image_duration: parseFloat(e.target.value) || 3.0 }))
                    }
                  }}
                  disabled={formData.rapid_mode}
                  inputProps={{ min: 0.1, step: 0.1 }}
                  helperText={
                    formData.rapid_mode 
                      ? "Locked at 0.2s (Rapid Mode enabled)" 
                      : "How long each image is shown in the video"
                  }
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                />
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel>Rapid Mode</InputLabel>
                  <Select
                    value={formData.rapid_mode ? 'true' : 'false'}
                    onChange={(e) => setFormData(prev => ({ ...prev, rapid_mode: e.target.value === 'true' }))}
                    label="Rapid Mode"
                    sx={{ fontSize: '0.95rem' }}
                  >
                    <MenuItem value="false" sx={{ fontSize: '0.95rem' }}>Normal (use image duration)</MenuItem>
                    <MenuItem value="true" sx={{ fontSize: '0.95rem' }}>Rapid (0.2s per image)</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}
            {formData.post_type === 'video' && formData.image_asset_ids.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Rapid mode creates fast-paced videos with quick image transitions
              </Typography>
            )}

            {formData.post_type === 'slideshow' && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.output_as_slides}
                    onChange={(e) => setFormData(prev => ({ ...prev, output_as_slides: e.target.checked }))}
                  />
                }
                label="Also export individual slides for GeeLark carousel publishing"
              />
            )}

            {(formData.post_type === 'carousel' || formData.post_type === 'video' || formData.post_type === 'slideshow') && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Music URL (Optional)"
                  value={formData.music_url}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    music_url: e.target.value,
                    music_asset_id: e.target.value ? '' : prev.music_asset_id,
                  }))}
                  placeholder="https://example.com/music.mp3"
                  helperText="Enter a direct URL to a music/audio file (e.g., from Pixabay Music API). This will be downloaded on-demand during video generation."
                  sx={{ '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                />
                <Autocomplete
                  options={musicAssets}
                  getOptionLabel={(option) => {
                    const path = option.storage_path || option.id
                    const name = path.replace(/^music\//, '').trim() || option.id
                    return name.length > 50 ? `${name.substring(0, 50)}...` : name
                  }}
                  value={musicAssets.find(a => a.id === formData.music_asset_id) || null}
                  onChange={(_, newValue) => {
                    setFormData(prev => ({
                      ...prev,
                      music_asset_id: newValue?.id || '',
                      music_url: newValue ? '' : prev.music_url,
                    }))
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Or select from music storage"
                      helperText="Choose an audio file already uploaded to your music storage (Assets → Music)"
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                    />
                  )}
                  sx={{ '& .MuiAutocomplete-input': { fontSize: '0.95rem' } }}
                />
              </Box>
            )}

            {formData.post_type === 'carousel' && (
              <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                <TextField
                  fullWidth
                  label="Character Name (Optional)"
                  value={formData.character_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, character_name: e.target.value }))}
                  placeholder="e.g., xavier, pochita"
                  helperText="Character name for carousel first slide"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                />
                <TextField
                  fullWidth
                  label="Carousel ID (Optional)"
                  value={formData.carousel_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, carousel_id: e.target.value }))}
                  placeholder="Auto-generated if not provided"
                  helperText="Custom identifier for this carousel"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.95rem' } }}
                />
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: 2, 
          pt: 3, 
          mt: 2,
          borderTop: 1, 
          borderColor: 'divider' 
        }}>
          {onCancel && (
            <Button
              type="button"
              onClick={onCancel}
              disabled={loading}
              variant="outlined"
              size="large"
              sx={{ minWidth: 120, fontSize: '0.95rem' }}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={loading}
            variant="contained"
            size="large"
            sx={{ minWidth: 150, fontSize: '0.95rem', fontWeight: 600 }}
          >
            {loading ? 'Creating...' : 'Create Job'}
          </Button>
        </Box>
      </Box>

      {/* Asset Selection Dialog */}
      <Dialog 
        open={assetDialogOpen} 
        onClose={handleCloseAssetDialog} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: { height: '90vh' }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Select Images</Typography>
            <IconButton onClick={handleCloseAssetDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            {/* Navigation Breadcrumbs */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                onClick={handleNavigateToCategories}
                disabled={currentView === 'categories'}
              >
                Categories
              </Button>
              {filterCategory && (
                <>
                  <Typography>/</Typography>
                  <Button
                    size="small"
                    onClick={handleNavigateToSubcategories}
                    disabled={currentView === 'subcategories'}
                  >
                    {formatCategoryName(filterCategory)}
                  </Button>
                </>
              )}
              {filterSubcategory && (
                <>
                  <Typography>/</Typography>
                  <Button size="small" disabled>
                    {formatSubcategoryName(filterSubcategory)}
                  </Button>
                </>
              )}
              <Box sx={{ flex: 1 }} />
              {currentView === 'images' && filteredAssets.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button size="small" onClick={handleSelectAll} variant="outlined">
                    Select All
                  </Button>
                  <Button size="small" onClick={handleDeselectAll} variant="outlined">
                    Deselect All
                  </Button>
                </Box>
              )}
              <Typography variant="body2" color="text.secondary">
                {selectedAssetIds.size} selected
              </Typography>
            </Box>

            {/* Content Area */}
            {loadingAssets ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
              </Box>
            ) : currentView === 'categories' ? (
              <Box sx={{ 
                overflow: 'auto', 
                flex: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 2 
                }}>
                  {availableCategories.map((category) => (
                    <CategoryCard
                      key={category}
                      category={category}
                      groupedAssets={groupedAssets}
                      formatCategoryName={formatCategoryName}
                      onClick={() => {
                        setFilterCategory(category)
                        setCurrentView('subcategories')
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ) : currentView === 'subcategories' ? (
              <Box sx={{ 
                overflow: 'auto', 
                flex: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 2 
                }}>
                  {availableSubcategories.map((subcategory) => {
                    const assets = groupedAssets[filterCategory]?.[subcategory] || []
                    return (
                      <SubcategoryCard
                        key={subcategory}
                        subcategory={subcategory}
                        assets={assets}
                        formatSubcategoryName={formatSubcategoryName}
                        onClick={() => {
                          setFilterSubcategory(subcategory)
                          setCurrentView('images')
                        }}
                      />
                    )
                  })}
                </Box>
              </Box>
            ) : filteredAssets.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <Typography color="text.secondary">
                  No images found.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ 
                overflow: 'auto', 
                flex: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2
              }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {filteredAssets.map((asset) => (
                    <Box
                      key={asset.id}
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
                      }}
                    >
                      <ImageCard
                        asset={asset}
                        isSelected={selectedAssetIds.has(asset.id)}
                        onToggle={handleToggleAssetSelect}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssetDialog}>Cancel</Button>
          <Button 
            onClick={handleConfirmAssetSelection} 
            variant="contained"
            disabled={selectedAssetIds.size === 0}
          >
            Select {selectedAssetIds.size} Image{selectedAssetIds.size !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
