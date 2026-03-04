// Anime and character configuration for automated scraping
export interface AnimeConfig {
  id: string
  displayName: string
  fullName: string
  characters: string[]
  characterAliases?: Record<string, string[]>
  aliases?: string[]
}

// Static fallback used when the database is unavailable
export const animeConfigs: AnimeConfig[] = [
  {
    id: 'jjk',
    displayName: 'Jujutsu Kaisen',
    fullName: 'jujutsu kaisen',
    aliases: ['jjk', 'jujutsu', 'jujutsu kaisen'],
    characters: [
      'gojo satoru',
      'sukuna',
      'megumi fushiguro',
      'yuji itadori',
      'nobara kugisaki',
      'nanami',
      'todo',
      'yuta okkotsu',
      'toji fushiguro',
      'geto suguru',
      'panda',
      'toge inumaki',
      'maki zenin',
      'kasumi miwa',
      'yuki tsukumo',
      'kenjaku',
      'mahito',
      'jogo',
      'hanami',
      'dagon'
    ]
  },
  {
    id: 'lads',
    displayName: 'Love and Deepspace',
    fullName: 'love and deepspace',
    aliases: ['lads', 'love and deepspace', 'love and deep space'],
    characters: [
      'xavier',
      'zayne',
      'rafayel',
      'caleb',
      'sylus',
      'aislinn',
      'andrew',
      'benedict',
      'carter',
      'dimitri',
      'noah',
      'gideon',
      'greyson',
      'jenna',
      'jeremiah',
      'josephine',
      'kevi',
      'leon',
      'luke',
      'kieran',
      'lumiere',
      'mephisto',
      'nero',
      'otto',
      'philip',
      'player',
      'lucius',
      'raymond',
      'riley',
      'simone',
      'soren',
      'talia',
      'tara',
      'thomas',
      'ulysses',
      'viper',
      'yvonne'
    ]
  }
]

let cachedDynamicConfigs: AnimeConfig[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60_000 // 1 minute

/**
 * Fetch fandom/character config from the database via the API.
 * Falls back to the static hardcoded config if the API is unavailable.
 */
export async function fetchAnimeConfigs(baseUrl?: string): Promise<AnimeConfig[]> {
  const now = Date.now()
  if (cachedDynamicConfigs && now - cacheTimestamp < CACHE_TTL) {
    return cachedDynamicConfigs
  }

  try {
    const url = baseUrl
      ? `${baseUrl}/api/fandoms/config`
      : '/api/fandoms/config'
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error('API returned ' + res.status)
    const data = await res.json()

    if (data.config && Array.isArray(data.config) && data.config.length > 0) {
      cachedDynamicConfigs = data.config
      cacheTimestamp = now
      return data.config
    }
  } catch {
    // Fall through to static config
  }

  return animeConfigs
}

/**
 * Generate Pinterest search URL for an anime character
 */
export function generatePinterestUrl(anime: AnimeConfig, character: string): string {
  const searchQuery = `${anime.fullName} ${character}`
  const encoded = encodeURIComponent(searchQuery)
  const characterFirstWord = character.split(' ')[0]
  const eqQuery = `${anime.fullName} ${characterFirstWord}`
  const eqEncoded = encodeURIComponent(eqQuery)
  
  return `https://www.pinterest.com/search/pins/?q=${encoded}&rs=ac&len=${searchQuery.length}&eq=${eqEncoded}`
}

/**
 * Generate Google Images search URL for an anime character
 */
export function generateGoogleImagesUrl(anime: AnimeConfig, character: string): string {
  const searchQuery = `${anime.fullName} ${character}`
  const encoded = encodeURIComponent(searchQuery)
  
  return `https://www.google.com/search?q=${encoded}&tbm=isch`
}

/**
 * Get anime config by ID
 */
export function getAnimeConfig(animeId: string): AnimeConfig | undefined {
  return animeConfigs.find(anime => anime.id === animeId)
}
