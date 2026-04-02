interface SerperOrganic {
  title: string
  link: string
  snippet: string
}

interface SerperResponse {
  organic?: SerperOrganic[]
}

/**
 * Patterns that indicate a URL is a listing/directory/job page rather than
 * an individual candidate profile. Any match → discard the URL.
 */
const BLOCK_PATTERNS: RegExp[] = [
  // Job listing paths
  /\/jobs?\//i,
  /\/job-/i,
  /\/careers?\//i,
  /\/hiring/i,
  // Topmate/Linktr.ee category/directory pages
  /topusers/i,
  /\/explore\b/i,
  // Known job/recruitment portals that leak through via broad dorks
  /cutshort\.io/i,
  /freshers/i,
  /placementadda/i,
  /notification.{0,4}job/i,
  /careerportal/i,
  // Pages that are clearly listing aggregators, not people
  /\/company\//i,
  /\/companies\//i,
  /\/organization\//i,
  // URLs with query parameters are usually search/filter pages, not profiles
  /\?[a-z]+=.{3,}/i,
]

function isProfileUrl(url: string): boolean {
  return !BLOCK_PATTERNS.some(p => p.test(url))
}

export async function searchDork(query: string): Promise<string[]> {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 10 }),
    })

    if (!res.ok) return []

    const data: SerperResponse = await res.json()
    return (data.organic ?? []).map((item) => item.link).filter(Boolean)
  } catch {
    return []
  }
}

export async function searchAllDorks(dorks: string[]): Promise<string[]> {
  const results = await Promise.allSettled(dorks.map(searchDork))

  const allUrls: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allUrls.push(...result.value)
    }
  }

  // Deduplicate then drop obvious non-profile URLs
  return [...new Set(allUrls)].filter(isProfileUrl)
}
