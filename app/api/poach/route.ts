export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { generateDorks } from '@/lib/dorker'
import { searchAllDorks } from '@/lib/serper'
import { scrapeUrl, deepScrapeUrl } from '@/lib/scraper'
import { parseProfile, type PoachedProfile } from '@/lib/parser'

export const maxDuration = 300

interface PoachRequest {
  role: string
  location: string
  maxProfiles?: number
  deepDive?: boolean
  jobDescription?: string
  yearsExperience?: number
  offset?: number
}

export async function POST(request: Request) {
  try {
    const missingKey = ['SERPER_API_KEY', 'FIRECRAWL_API_KEY', 'GEMINI_API_KEY'].find(
      (key) => !process.env[key]
    )
    if (missingKey) {
      return NextResponse.json(
        { error: `Missing environment variable: ${missingKey}` },
        { status: 500 }
      )
    }

    const body: PoachRequest = await request.json()
    const role = body.role?.trim()
    const location = body.location?.trim()

    if (!role || !location) {
      return NextResponse.json(
        { error: 'Both "role" and "location" are required.' },
        { status: 400 }
      )
    }

    const maxProfiles = Math.min(body.maxProfiles ?? 5, 15)
    const deepDive = body.deepDive === true
    const jobDescription = body.jobDescription?.trim() || undefined
    const yearsExperience = body.yearsExperience && body.yearsExperience > 0
      ? Math.floor(body.yearsExperience)
      : undefined
    const offset = Math.max(0, body.offset ?? 0)

    console.log(
      `[poach] START role="${role}" location="${location}" maxProfiles=${maxProfiles} deepDive=${deepDive} matchJD=${!!jobDescription} exp=${yearsExperience ?? 'any'} offset=${offset}`
    )

    // Step 1: Generate dork queries
    const dorks = generateDorks({ role, location, yearsExperience })
    console.log('[poach] DORKS generated:', dorks)

    // Step 2: Search all dorks via Serper
    console.log('[poach] SERPER search starting...')
    const allUrls = await searchAllDorks(dorks)
    console.log(`[poach] SERPER returned ${allUrls.length} deduplicated URLs:`, allUrls)

    // Always scrape at least 5 URLs so we have enough candidates after gatekeeper filtering
    const scrapeCount = Math.max(maxProfiles, 5)
    const urlsToScrape = allUrls.slice(offset, offset + scrapeCount)
    const hasMore = allUrls.length > offset + scrapeCount
    if (urlsToScrape.length === 0) {
      console.log('[poach] No URLs found — returning empty result')
      return NextResponse.json({
        profiles: [],
        meta: { urlsSearched: 0, urlsScraped: 0, creditsUsed: 0 },
        hasMore: false,
        nextOffset: 0,
        dorks,
      })
    }

    // Step 3: Scrape URLs in parallel (standard or deep)
    const scraper = deepDive ? deepScrapeUrl : scrapeUrl
    console.log(`[poach] FIRECRAWL ${deepDive ? 'DEEP' : 'STANDARD'} scraping ${urlsToScrape.length} URLs:`, urlsToScrape)
    const scrapeResults = await Promise.allSettled(urlsToScrape.map(scraper))

    const scrapedPairs: { markdown: string; sourceUrl: string }[] = []
    for (let i = 0; i < scrapeResults.length; i++) {
      const result = scrapeResults[i]
      if (result.status === 'fulfilled' && result.value !== null) {
        console.log(`[poach] FIRECRAWL OK: ${urlsToScrape[i]} (${result.value.length} chars)`)
        scrapedPairs.push({ markdown: result.value, sourceUrl: urlsToScrape[i] })
      } else {
        const reason = result.status === 'rejected' ? result.reason : 'null markdown'
        console.log(`[poach] FIRECRAWL SKIP: ${urlsToScrape[i]} — ${reason}`)
      }
    }
    console.log(`[poach] FIRECRAWL done — ${scrapedPairs.length}/${urlsToScrape.length} succeeded`)

    // Step 4: Parse via Gemini (pass requested role for roleMatch gate)
    console.log('[poach] GEMINI parsing starting...')
    const parseResults = await Promise.allSettled(
      scrapedPairs.map(({ markdown, sourceUrl }) =>
        parseProfile(markdown, sourceUrl, role, jobDescription)
      )
    )

    const profiles: PoachedProfile[] = []
    for (const result of parseResults) {
      if (result.status === 'fulfilled' && result.value !== null) {
        const p = result.value
        if (p.roleMatch === false) {
          console.log(`[poach] GEMINI FILTERED (roleMatch=false): "${p.name}" — "${p.currentRole}"`)
          continue
        }
        console.log(`[poach] GEMINI OK: parsed "${p.name}" (${p.confidence}) roleMatch=${p.roleMatch}`)
        profiles.push(p)
      } else {
        const reason = result.status === 'rejected' ? result.reason : 'null profile'
        console.log(`[poach] GEMINI SKIP — ${reason}`)
      }
    }
    // Safety-net: strip any profiles the gatekeeper flagged (parser normally returns null for these)
    const filtered = profiles.filter(p => !p.ignore)
    console.log(`[poach] DONE — ${filtered.length} profiles returned (${profiles.length - filtered.length} safety-filtered)`)

    return NextResponse.json({
      profiles: filtered,
      meta: {
        urlsSearched: allUrls.length,
        urlsScraped: scrapedPairs.length,
        creditsUsed: scrapedPairs.length,
      },
      hasMore,
      nextOffset: offset + scrapeCount,
      dorks,
    })
  } catch (err) {
    console.error('[poach] UNEXPECTED ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
