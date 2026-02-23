// Anime and character configuration for automated scraping
export interface AnimeConfig {
  id: string
  displayName: string
  fullName: string // Full name for Pinterest search (e.g., "jujutsu kaisen", "love and deepspace")
  characters: string[]
}

export const animeConfigs: AnimeConfig[] = [
  {
    id: 'jjk',
    displayName: 'Jujutsu Kaisen',
    fullName: 'jujutsu kaisen',
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
    characters: [
      // Main characters
      'xavier',
      'zayne',
      'rafayel',
      'caleb',
      'sylus',
      // Supporting characters
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

/**
 * Generate Pinterest search URL for an anime character
 * Format matches: https://www.pinterest.com/search/pins/?q=jujutsu%20kaisen%20maki%20zenin&rs=ac&len=19&source_id=ac_hf56Dfin&eq=jujutsu%20kaisen%20maki&etslf=2941
 */
export function generatePinterestUrl(anime: AnimeConfig, character: string): string {
  const searchQuery = `${anime.fullName} ${character}`
  const encoded = encodeURIComponent(searchQuery)
  // Create a shorter query for the eq parameter (anime name + first word of character)
  const characterFirstWord = character.split(' ')[0]
  const eqQuery = `${anime.fullName} ${characterFirstWord}`
  const eqEncoded = encodeURIComponent(eqQuery)
  
  return `https://www.pinterest.com/search/pins/?q=${encoded}&rs=ac&len=${searchQuery.length}&eq=${eqEncoded}`
}

/**
 * Generate Google Images search URL for an anime character
 * Format: https://www.google.com/search?q=jujutsu%20kaisen%20gojo%20satoru&tbm=isch
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
