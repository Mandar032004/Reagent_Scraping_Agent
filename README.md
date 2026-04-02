# Reagent — AI Talent Intelligence Engine

> Autonomous candidate discovery powered by Google Dorking, Firecrawl, and Gemini 2.5 Flash.

Reagent is a full-stack Next.js application that finds real people on the internet who match a job role — without LinkedIn Recruiter, ATS systems, or manual sourcing. It generates Google dork queries, scrapes the resulting pages, and uses Gemini as a strict AI gatekeeper to extract structured candidate profiles.

---

## Architecture

```
Role + Location
      │
      ▼
┌─────────────────┐
│  Dork Generator │  →  6 broad search queries (GitHub, LinkedIn, dev blogs, portfolios)
└─────────────────┘
      │
      ▼
┌─────────────────┐
│  Serper API     │  →  Executes queries against Google Search, returns deduplicated URLs
└─────────────────┘
      │
      ▼
┌─────────────────┐
│  Firecrawl      │  →  Scrapes each URL to clean Markdown (stealth proxy, JS rendering)
└─────────────────┘
      │
      ▼
┌─────────────────┐     ┌──────────────────────────────────────────┐
│  Gemini 2.5     │  →  │ GATEKEEPER: ignore if completely          │
│  Flash Parser   │     │ unrelated (recruiter, graphic designer…)  │
└─────────────────┘     │ EXTRACTOR: name, role, skills, experience │
      │                 │ SCORER: 0–100% JD match + reasoning        │
      ▼                 └──────────────────────────────────────────┘
┌─────────────────┐
│  Profile Cards  │  →  Rendered in the Command Center UI
└─────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Components) |
| Language | TypeScript 5 |
| Search | [Serper.dev](https://serper.dev) — Google Search API |
| Scraping | [Firecrawl](https://firecrawl.dev) — stealth proxy, JS rendering, Markdown output |
| AI Parsing | [Gemini 2.5 Flash](https://ai.google.dev) via `@google/genai` — structured JSON output with Zod schema |
| Schema Validation | Zod + `zod-to-json-schema` |
| Styling | Tailwind CSS v3 + inline styles |
| Runtime | Node.js 20+ |

---

## Key Features

### Wide-Net Dorking
Generates 6 simple, broad search queries targeting GitHub profiles, LinkedIn, GitHub Pages portfolios, Topmate, and dev blogs. No over-specified tech keywords — maximum URL yield, relevance handled downstream.

### The Gatekeeper (AI Filtering)
Every scraped page passes through a two-step Gemini prompt:

1. **Gate Check** — Sets `ignore: true` only for pages that are completely unrelated (graphic designers, recruiters, job listings). Adjacent roles are accepted (e.g. "ML Engineer" and "LLM Engineer" for "AI Engineer").
2. **Profile Extraction** — Extracts name, current role, tech stack, years of experience, location, experience history, notable projects, and a "vibe check" sentence.

### JD Match Scoring
Paste a job description into the center panel. Gemini scores each candidate 0–100% and generates a "Why This Candidate?" explanation in natural language.

### Deep Scan Mode
Activates Firecrawl's JS rendering + scroll actions for SPA-heavy pages (LinkedIn, Topmate). Uses 2× Firecrawl credits and adds ~30s per run.

### Command Center UI
Three-column layout: Search parameters sidebar → JD textarea + results grid → Live activity log with pipeline steps and final stats.

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Mandar032004/Reagent_Scraping_Agent.git
cd Reagent_Scraping_Agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```env
# Google Search — https://serper.dev (free tier: 2,500 queries/month)
SERPER_API_KEY=your_serper_api_key_here

# Web Scraping — https://firecrawl.dev (free tier: 500 credits/month)
FIRECRAWL_API_KEY=your_firecrawl_api_key_here

# AI Parsing — https://aistudio.google.com/apikey (free tier available)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. Enter a **Role** (e.g. `AI Engineer`) and **Location** (e.g. `Mumbai`) in the left sidebar.
2. Optionally paste a **Job Description** in the center panel to enable 0–100% match scoring.
3. Set the **Target Count** (1–15 profiles) and toggle **Deep Scan** if needed.
4. Click **Run Search**.
5. Watch the Activity Log on the right as the pipeline executes in real time.
6. Expand any card to see skills breakdown, career history, notable projects, and JD match reasoning.
7. Export results as **JSON** or **CSV**.

---

## Environment Variable Reference

| Variable | Source | Notes |
|---|---|---|
| `SERPER_API_KEY` | [serper.dev](https://serper.dev) | Used for Google Search dorking |
| `FIRECRAWL_API_KEY` | [firecrawl.dev](https://firecrawl.dev) | Used for page scraping; 1 credit per standard scrape, 2 for Deep Scan |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Used for structured profile extraction |

---

## Project Structure

```
reagent/
├── app/
│   ├── api/poach/route.ts   # Main pipeline API route (Dork → Scrape → Parse)
│   ├── page.tsx             # Command Center UI (3-column layout)
│   ├── layout.tsx           # Root layout + metadata
│   └── globals.css          # Tailwind base styles
├── lib/
│   ├── dorker.ts            # Google dork query generator
│   ├── serper.ts            # Serper API client + URL deduplication
│   ├── scraper.ts           # Firecrawl scraper (standard + deep scan)
│   └── parser.ts            # Gemini prompt + Zod schema + gatekeeper logic
└── .env.local               # API keys (never committed)
```

---

## Deployment

Deploy to Vercel in one click. Set the three environment variables in your Vercel project settings. The API route has `export const maxDuration = 300` to support Vercel's 5-minute function timeout on Pro plans.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mandar032004/Reagent_Scraping_Agent)

---

## License

MIT
