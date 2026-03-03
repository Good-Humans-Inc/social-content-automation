/**
 * Upload files to GCS buckets (babymilu-images, babymilu-musics, babymilu-videos).
 *
 * Local: set GOOGLE_APPLICATION_CREDENTIALS to the path to your service account JSON.
 * Vercel: set GOOGLE_APPLICATION_CREDENTIALS_JSON to the full JSON string of the key
 * (Project Settings → Environment Variables; paste the entire key file content as the value).
 */

const BUCKET_IMAGES = process.env.GCS_BUCKET_IMAGES || 'babymilu-images'
const BUCKET_MUSIC = process.env.GCS_BUCKET_MUSIC || 'babymilu-musics'
const BUCKET_VIDEOS = process.env.GCS_BUCKET_VIDEOS || 'babymilu-videos'

export function getGcsBucketImages(): string {
  return BUCKET_IMAGES
}

export function getGcsBucketMusic(): string {
  return BUCKET_MUSIC
}

export function getGcsBucketVideos(): string {
  return BUCKET_VIDEOS
}

/** Return true if GCS upload is configured (credentials). */
export function isGcsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  )
}

function getStorageOptions(): { credentials?: object } {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (json && json.trim()) {
    try {
      return { credentials: JSON.parse(json) as object }
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Upload a buffer to a GCS bucket and return the public URL.
 * Bucket must be publicly readable for the returned URL to work.
 */
export async function uploadToGcs(
  bucketName: string,
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { Storage } = await import(/* webpackIgnore: true */ '@google-cloud/storage')
  const storage = new Storage(getStorageOptions())
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(objectPath)
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: 'public, max-age=3600' },
  })
  return `https://storage.googleapis.com/${bucketName}/${objectPath}`
}

/**
 * List subfolder names (subcategories) under assets/{category}/ in the images bucket.
 * Uses the bucket structure as source of truth (e.g. assets/jjk/kasumi_miwa/ -> kasumi_miwa).
 * Returns empty array if GCS is not configured or listing fails.
 */
export async function listSubcategoriesFromGcs(category: string): Promise<string[]> {
  if (!isGcsConfigured()) return []
  const bucketName = getGcsBucketImages()
  const prefix = `assets/${category}/`
  try {
    const { Storage } = await import(/* webpackIgnore: true */ '@google-cloud/storage')
    const storage = new Storage(getStorageOptions())
    const bucket = storage.bucket(bucketName)
    const [files] = await bucket.getFiles({
      prefix,
      maxResults: 2000,
      autoPaginate: false,
    })
    const subcategories = new Set<string>()
    for (const file of files || []) {
      const name = typeof (file as any).name === 'string' ? (file as any).name : (file as any).metadata?.name ?? ''
      const afterPrefix = name.startsWith(prefix) ? name.slice(prefix.length) : name
      const segment = afterPrefix.split('/')[0]
      if (segment && segment !== '') {
        subcategories.add(segment)
      }
    }
    return Array.from(subcategories).sort()
  } catch (err) {
    console.error('[GCS] listSubcategories failed:', err)
    return []
  }
}
