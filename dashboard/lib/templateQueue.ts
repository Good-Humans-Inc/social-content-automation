export interface TemplateScrapeTask {
  template_id: string
  target_urls: string[]
  source_type: string
  search_terms: string[]
  max_posts: number
  created_at: number
}

const templateQueue: TemplateScrapeTask[] = []

export function addToTemplateQueue(task: Omit<TemplateScrapeTask, 'created_at'>) {
  templateQueue.push({ ...task, created_at: Date.now() })
}

export function getQueueStatus() {
  return {
    pending: templateQueue.length,
    items: templateQueue.map((t) => ({
      template_id: t.template_id,
      search_terms: t.search_terms,
      created_at: t.created_at,
    })),
  }
}

export function popFromTemplateQueue(): TemplateScrapeTask | undefined {
  return templateQueue.shift()
}

export function clearTemplateQueue() {
  templateQueue.length = 0
}
