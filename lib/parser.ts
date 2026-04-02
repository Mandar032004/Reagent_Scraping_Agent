import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

/* ─── Schema ─────────────────────────────────────────────────────────────── */

export const ExperienceEntrySchema = z.object({
  company: z.string(),
  role: z.string(),
  duration: z.string().nullable(),
  description: z.string().nullable(),
})

export const PoachedProfileSchema = z.object({
  // ── gatekeeper ───────────────────────────────────────────────────────────
  // true → skip this profile entirely (wrong role, job listing, no candidate)
  ignore: z.boolean().catch(false),

  // ── core fields ─────────────────────────────────────────────────────────
  name: z.string(),
  currentRole: z.string(),
  techStack: z.array(z.string()).catch([]),
  yearsOfExperience: z.number().nullable(),
  location: z.string().nullable(),
  contactHint: z.string().nullable(),
  sourceUrl: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),

  // ── relevance gate ───────────────────────────────────────────────────────
  // false → page is not about a candidate matching the requested role.
  // Defaults to true on parse failure so we don't silently drop valid profiles.
  roleMatch: z.boolean().catch(true),

  // ── intelligence fields ──────────────────────────────────────────────────
  vibeCheck: z.string().nullable(),

  skills: z.object({
    Languages: z.array(z.string()).catch([]),
    Tools: z.array(z.string()).catch([]),
    Domain: z.array(z.string()).catch([]),
  }).catch({ Languages: [], Tools: [], Domain: [] }),

  experienceHistory: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string().nullable(),
      description: z.string().nullable(),
    })
  ).catch([]),

  generatedJobDescription: z.string().nullable(),
  projects: z.array(z.string()).catch([]),

  // ── similarity (populated only when jobDescription is supplied) ──────────
  similarityScore: z.number().nullable(),
  similarityReason: z.string().nullable(),
})

export type PoachedProfile = z.infer<typeof PoachedProfileSchema>
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>

const profileJsonSchema = zodToJsonSchema(PoachedProfileSchema)

/* ─── Parser ─────────────────────────────────────────────────────────────── */

export async function parseProfile(
  markdown: string,
  sourceUrl: string,
  requestedRole: string,
  jobDescription?: string
): Promise<PoachedProfile | null> {
  try {
    const truncated = markdown.slice(0, 8000)

    const similarityBlock = jobDescription
      ? `
Job Description to score against:
"""
${jobDescription.slice(0, 2000)}
"""
- similarityScore: integer 0-100 measuring how well this candidate fits the above JD
- similarityReason: one sentence explaining the score`
      : `- similarityScore: null
- similarityReason: null`

    const prompt = `You are a talent analyst helping a recruiter discover candidates.

Source URL: ${sourceUrl}
Requested Role: "${requestedRole}"

Content:
${truncated}
${similarityBlock}

━━━ STEP 1 — GATE CHECK ━━━
Set "ignore": true ONLY IF the page clearly has NO relevant candidate — e.g.:
  • Pure job listing / job board page with no individual candidate
  • The person is COMPLETELY unrelated: Graphic Designer, Visual Artist, Recruiter, HR, Sales,
    Marketing, or Finance professional when a technical/engineering role was requested
  • The page has no identifiable person at all (404, login wall, empty page)

Set "ignore": false (ACCEPT the profile) if:
  • The person works in the same broad technical domain as "${requestedRole}"
  • Accept adjacent roles — e.g. for "AI Engineer" also accept: ML Engineer, Generative AI Developer,
    Full Stack AI, Data Scientist with AI focus, LLM Engineer, Applied AI, AI Researcher
  • Partial information is fine — accept and mark confidence as "low"
  • Low similarity to the JD is fine — still show the candidate, let the recruiter decide
  • When in doubt, ACCEPT and set ignore: false

If "ignore" is true, fill ALL required string fields with "" and all arrays with [].

━━━ STEP 2 — PROFILE EXTRACTION ━━━
- name: full name of the person
- currentRole: current or most recent job title (exactly as stated)
- techStack: flat array of ALL technologies, languages, frameworks, tools mentioned
- yearsOfExperience: total years of professional experience as an integer, or null
- location: city and/or country if found, else null
- contactHint: first email, @handle, topmate link, or booking URL found, else null
- confidence: "high" if name + role + 2+ skills clearly present; "medium" if partial; "low" if mostly inferred
- roleMatch: true if person is in the same broad technical domain as "${requestedRole}", false only if completely unrelated
- vibeCheck: ONE punchy sentence capturing their professional personality (e.g. "ML researcher turned startup founder")
- skills.Languages: programming languages only (Python, TypeScript, Go, etc.)
- skills.Tools: frameworks, databases, cloud platforms, DevOps tools (React, Docker, GCP, etc.)
- skills.Domain: business domains and specializations (Machine Learning, NLP, Fintech, etc.)
- experienceHistory: up to 4 most recent positions — company, role, duration ("2021–2023"), 1-sentence description
- generatedJobDescription: 2–3 sentences describing their IDEAL NEXT ROLE based on trajectory
- projects: up to 5 notable projects, repos, or open-source contributions (short strings)

IMPORTANT: every array field MUST be an array ([] if nothing found, never null).
Return only valid JSON matching the schema exactly.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: profileJsonSchema,
      },
    })

    const raw = JSON.parse(response.text ?? '{}')

    // Gatekeeper fast-exit: if Gemini flagged this page as irrelevant, skip immediately
    if (raw.ignore === true) {
      console.log(`[parser] IGNORED by gatekeeper — sourceUrl: ${sourceUrl}`)
      return null
    }

    // Primary parse
    const parsed = PoachedProfileSchema.safeParse(raw)
    if (parsed.success) {
      return { ...parsed.data, sourceUrl }
    }

    // Lenient fallback: coerce array fields to [] and retry
    const coerced = {
      ...raw,
      sourceUrl,
      ignore: raw.ignore === true ? true : false,
      techStack: Array.isArray(raw.techStack) ? raw.techStack : [],
      projects: Array.isArray(raw.projects) ? raw.projects : [],
      experienceHistory: Array.isArray(raw.experienceHistory) ? raw.experienceHistory : [],
      skills: {
        Languages: Array.isArray(raw.skills?.Languages) ? raw.skills.Languages : [],
        Tools: Array.isArray(raw.skills?.Tools) ? raw.skills.Tools : [],
        Domain: Array.isArray(raw.skills?.Domain) ? raw.skills.Domain : [],
      },
      confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low',
      name: raw.name ?? 'Unknown',
      currentRole: raw.currentRole ?? 'Unknown',
      roleMatch: typeof raw.roleMatch === 'boolean' ? raw.roleMatch : true,
    }

    const fallback = PoachedProfileSchema.safeParse(coerced)
    if (!fallback.success) return null
    if (fallback.data.ignore) return null
    return { ...fallback.data, sourceUrl }
  } catch {
    return null
  }
}
