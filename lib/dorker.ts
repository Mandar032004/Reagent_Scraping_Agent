export interface DorkerInput {
  role: string
  location: string
  yearsExperience?: number
}

function sanitize(str: string): string {
  return str.replace(/["\\]/g, '')
}

/**
 * Wide-net dorking strategy: broad, simple queries that maximise URL yield.
 * Filtering for relevance is handled downstream by Gemini, not here.
 */
export function generateDorks({ role, location, yearsExperience }: DorkerInput): string[] {
  const r = sanitize(role)
  const l = sanitize(location)
  const exp = yearsExperience ? `"${yearsExperience}+ years"` : ''

  // Helper: joins non-empty parts with a space
  const q = (...parts: string[]) => parts.filter(Boolean).join(' ')

  return [
    // Broad web — finds portfolios, blogs, personal sites, and profiles
    q(`"${r}"`, `"${l}"`),

    // GitHub user profiles and READMEs
    q(`site:github.com`, `"${r}"`, `"${l}"`),

    // LinkedIn individual profiles
    q(`site:linkedin.com/in`, `"${r}"`, `"${l}"`, exp),

    // GitHub Pages personal portfolio sites
    q(`site:github.io`, `"${r}"`, `"${l}"`),

    // Topmate individual booking/profile pages
    q(`site:topmate.io`, `"${r}"`, `"${l}"`, `-inurl:explore`, `-inurl:topusers`),

    // Dev blogs — firsthand writing by practitioners
    q(`(site:dev.to OR site:hashnode.com)`, `"${r}"`, `"${l}"`),
  ]
}
