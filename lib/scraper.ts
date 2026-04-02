import Firecrawl from '@mendable/firecrawl-js'

export async function scrapeUrl(url: string): Promise<string | null> {
  const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! })
  try {
    const doc = await app.scrape(url, {
      formats: ['markdown'],
      proxy: 'stealth',
      timeout: 30000,
    })
    if (doc.markdown && doc.markdown.trim().length >= 300) return doc.markdown
    return null
  } catch {
    return null
  }
}

/** Deep Scan: waits for JS to render + scrolls to capture lazy-loaded content.
 *  Uses ~2× the time of a standard scrape (up to 60s). */
export async function deepScrapeUrl(url: string): Promise<string | null> {
  const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! })
  try {
    const doc = await app.scrape(url, {
      formats: ['markdown'],
      proxy: 'stealth',
      timeout: 60000,
      waitFor: 3000,
      actions: [
        { type: 'scroll', direction: 'down' },
        { type: 'wait', milliseconds: 1500 },
        { type: 'scroll', direction: 'down' },
        { type: 'wait', milliseconds: 1000 },
      ],
    })
    if (doc.markdown && doc.markdown.trim().length >= 300) return doc.markdown
    return null
  } catch {
    return null
  }
}
