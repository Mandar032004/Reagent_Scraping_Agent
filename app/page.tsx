'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { PoachedProfile } from '@/lib/parser'

/* ─── types ──────────────────────────────────────────────────────────────── */
interface PoachMeta { urlsSearched: number; urlsScraped: number; creditsUsed: number }
type SortKey = 'default' | 'confidence' | 'score' | 'name'
interface LogEntry { ts: string; msg: string; type: 'info' | 'success' | 'error' | 'warn' }

/* ─── design tokens ──────────────────────────────────────────────────────── */
const C = {
  sidebar:     '#FFFFFF',
  workspace:   '#F9FAFB',
  card:        '#FFFFFF',
  indigo:      '#4B0082',
  indigoHov:   '#3B006A',
  indigoLt:    '#EDE9FE',
  indigoMed:   '#DDD6FE',
  black:       '#000000',
  onLight:     '#111827',
  onLight2:    '#374151',
  onLight3:    '#6B7280',
  onLight4:    '#9CA3AF',
  border:      '#E5E7EB',
  borderDark:  '#D1D5DB',
  label:       '#1F2937',
  green:       '#16A34A',
  greenBg:     '#DCFCE7',
  greenText:   '#15803D',
  amber:       '#D97706',
  amberBg:     '#FEF3C7',
  amberText:   '#B45309',
  greyBg:      '#F3F4F6',
  greyText:    '#4B5563',
  red:         '#DC2626',
  redBg:       '#FEF2F2',
  redBorder:   '#FECACA',
  redText:     '#B91C1C',
}

const CONF = {
  high:   { label: 'Verified',  rank: 0, bg: '#DCFCE7', text: '#15803D', dot: '#16A34A' },
  medium: { label: 'Partial',   rank: 1, bg: '#FEF3C7', text: '#B45309', dot: '#D97706' },
  low:    { label: 'Inferred',  rank: 2, bg: '#F3F4F6', text: '#4B5563', dot: '#9CA3AF' },
}

const SKILL_BG: Record<string, { bg: string; text: string; label: string }> = {
  Languages: { bg: '#EDE9FE', text: '#4B0082', label: 'Lang' },
  Tools:     { bg: '#F5F3FF', text: '#5B21B6', label: 'Tool' },
  Domain:    { bg: '#ECFDF5', text: '#065F46', label: 'Dom.' },
}

function scoreColor(s: number) {
  return s >= 75 ? { bg: '#DCFCE7', text: '#15803D' }
    : s >= 50   ? { bg: '#FEF3C7', text: '#B45309' }
    :             { bg: '#FEF2F2', text: '#B91C1C' }
}

const PIPELINE_STEPS = [
  'Building dork queries',
  'Querying search index',
  'Firecrawl scraping pages',
  'Gemini parsing profiles',
  'Filtering & compiling',
]

function buildStages(limit: number) {
  const scrapeWall = Math.min(32000, 5000 + limit * 1800)
  return [
    { ms: 0 },
    { ms: 2500 },
    { ms: 7000 },
    { ms: 7000 + scrapeWall },
    { ms: 7000 + scrapeWall + 9000 },
  ]
}

function toCSV(profiles: PoachedProfile[]): string {
  const headers = ['Name', 'Role', 'Location', 'Exp(yrs)', 'Tech Stack', 'Contact', 'Source URL', 'Confidence', 'Match Score', 'Vibe Check']
  const rows = profiles.map(p => [
    p.name, p.currentRole, p.location ?? '', p.yearsOfExperience ?? '',
    p.techStack.join('; '), p.contactHint ?? '', p.sourceUrl,
    p.confidence, p.similarityScore ?? '', p.vibeCheck ?? '',
  ])
  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

/* ─── styles ─────────────────────────────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box }

  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(10px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes shimmerLight {
    0%   { background-position: -600px 0 }
    100% { background-position:  600px 0 }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(4px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  @keyframes cardReveal {
    from { opacity: 0; transform: translateY(10px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  .shimmer-light {
    background: linear-gradient(90deg, #F3F4F6 0%, #E9EAED 40%, #F3F4F6 80%);
    background-size: 600px 100%;
    animation: shimmerLight 1.6s ease-in-out infinite;
  }

  .rg-input {
    width: 100%; background: #FFFFFF; border: 1px solid #E5E7EB;
    color: #111827; font-family: 'Inter', sans-serif; font-size: 13px;
    padding: 8px 10px; border-radius: 6px;
    transition: border-color 0.15s, box-shadow 0.15s; outline: none;
  }
  .rg-input:focus { border-color: #4B0082; box-shadow: 0 0 0 3px rgba(75,0,130,.08) }
  .rg-input:disabled { background: #F9FAFB; color: #9CA3AF; cursor: not-allowed }
  .rg-input::placeholder { color: #9CA3AF }

  .rg-textarea {
    width: 100%; background: #FFFFFF; border: 1px solid #E5E7EB;
    color: #111827; font-family: 'Inter', sans-serif; font-size: 13px;
    padding: 10px 12px; border-radius: 6px; resize: vertical;
    transition: border-color 0.15s, box-shadow 0.15s; outline: none; line-height: 1.6;
  }
  .rg-textarea:focus { border-color: #4B0082; box-shadow: 0 0 0 3px rgba(75,0,130,.08) }
  .rg-textarea:disabled { background: #F9FAFB; color: #9CA3AF; cursor: not-allowed }
  .rg-textarea::placeholder { color: #9CA3AF }

  .rg-card {
    background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,.05);
    transition: box-shadow 0.2s, border-color 0.2s, transform 0.2s;
  }
  .rg-card:hover {
    box-shadow: 0 4px 16px rgba(75,0,130,.1);
    border-color: #C4B5FD; transform: translateY(-1px);
  }

  .skill-chip { transition: opacity 0.12s }
  .skill-chip:hover { opacity: 0.75 }

  .run-btn:hover:not(:disabled) { background: #3B006A !important }
  .run-btn:active:not(:disabled) { transform: scale(0.99) }

  .sort-btn { transition: all 0.14s }

  .sb::-webkit-scrollbar { width: 4px }
  .sb::-webkit-scrollbar-track { background: transparent }
  .sb::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 4px }

  .ws::-webkit-scrollbar { width: 5px }
  .ws::-webkit-scrollbar-track { background: #F9FAFB }
  .ws::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px }

  .card-section-label {
    font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700;
    letter-spacing: 0.07em; color: #6B7280; text-transform: uppercase; margin-bottom: 8px;
  }
`

/* ─── hooks ──────────────────────────────────────────────────────────────── */
function useMounted() {
  const [m, setM] = useState(false)
  useEffect(() => setM(true), [])
  return m
}

/* ─── AnimatedCollapse ───────────────────────────────────────────────────── */
function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0)
  useEffect(() => { if (ref.current) setH(open ? ref.current.scrollHeight : 0) }, [open])
  useEffect(() => { if (open && ref.current) setH(ref.current.scrollHeight) })
  return (
    <div style={{ height: h, overflow: 'hidden', transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
      <div ref={ref}>{children}</div>
    </div>
  )
}

/* ─── LimitBar ───────────────────────────────────────────────────────────── */
function LimitBar({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value
  const est = Math.round(5 + display * 4.5)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight3 }}>Profiles to find</span>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight4 }}>~{est}s</span>
          <span key={display} style={{ fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 800, color: C.indigo, animation: 'countUp .2s ease forwards', lineHeight: 1 }}
            className="tabular-nums">{display}</span>
        </div>
      </div>
      <div className="flex gap-[3px] items-end" style={{ height: 28 }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" disabled={disabled}
            onClick={() => onChange(n)} onMouseEnter={() => setHover(n)}
            style={{
              flex: 1, border: 'none', borderRadius: 3,
              cursor: disabled ? 'not-allowed' : 'pointer',
              height: (n <= display) ? (n === value && hover === null ? 24 : 18) : 8,
              background: n <= display ? C.indigo : '#E5E7EB',
              opacity: disabled ? 0.5 : 1,
              transition: 'height 0.1s cubic-bezier(0.4,0,0.2,1)',
            }} />
        ))}
      </div>
      <div className="flex justify-between">
        {[1, 5, 10, 15].map(n => (
          <span key={n} style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: C.onLight4 }}>{n}</span>
        ))}
      </div>
    </div>
  )
}

/* ─── Toggle ─────────────────────────────────────────────────────────────── */
function Toggle({ active, onToggle, label, hint, disabled }: {
  active: boolean; onToggle: () => void; label: string; hint?: string; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: `1px solid ${active ? '#C4B5FD' : C.border}`,
        borderRadius: 6, padding: '8px 10px', width: '100%',
        background: active ? C.indigoLt : '#FFFFFF',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
      }}>
      <span style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: active ? C.indigo : '#FFFFFF',
        border: `1.5px solid ${active ? C.indigo : '#D1D5DB'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {active && (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: active ? C.indigo : C.onLight2, flex: 1, textAlign: 'left' }}>
        {label}
      </span>
      {hint && active && (
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.indigoHov, fontWeight: 500 }}>{hint}</span>
      )}
    </button>
  )
}

/* ─── SkeletonCard ───────────────────────────────────────────────────────── */
function SkeletonCard({ index }: { index: number }) {
  return (
    <div style={{
      animation: 'fadeSlideUp 0.3s ease forwards', animationDelay: `${index * 50}ms`, opacity: 0,
      background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8,
      padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="shimmer-light" style={{ height: 14, width: 140, borderRadius: 4, marginBottom: 6 }} />
          <div className="shimmer-light" style={{ height: 10, width: 110, borderRadius: 3 }} />
        </div>
        <div className="shimmer-light" style={{ width: 70, height: 22, borderRadius: 20 }} />
      </div>
      <div className="shimmer-light" style={{ height: 9, width: '85%', borderRadius: 3, marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        {[44, 52, 40, 48, 36].map((w, i) => (
          <div key={i} className="shimmer-light" style={{ height: 22, width: w, borderRadius: 4 }} />
        ))}
      </div>
      <div className="shimmer-light" style={{ height: 8, width: '60%', borderRadius: 3 }} />
    </div>
  )
}

/* ─── ProfileCard ────────────────────────────────────────────────────────── */
function ProfileCard({ profile, index }: { profile: PoachedProfile; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const conf = CONF[profile.confidence]
  const sc = profile.similarityScore != null ? scoreColor(profile.similarityScore) : null

  const hasExpand =
    (profile.skills && Object.values(profile.skills).some(a => a.length > 0)) ||
    (profile.experienceHistory?.length ?? 0) > 0 ||
    (profile.projects?.length ?? 0) > 0 ||
    !!profile.generatedJobDescription ||
    !!profile.similarityReason

  function copyContact() {
    if (!profile.contactHint) return
    navigator.clipboard.writeText(profile.contactHint)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="rg-card" style={{
      animation: 'cardReveal 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
      animationDelay: `${index * 60}ms`, opacity: 0,
    }}>
      <div style={{ padding: 16 }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 800, color: C.black, lineHeight: 1.3, marginBottom: 3 }}>
              {profile.name}
            </h3>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.indigo, fontWeight: 600 }} className="truncate">
              {profile.currentRole}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
            {sc != null && (
              <span style={{
                fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700,
                background: sc.bg, color: sc.text,
                padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
              }}>
                {profile.similarityScore}% Match
              </span>
            )}
            <span style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600,
              background: conf.bg, color: conf.text,
              padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: conf.dot, flexShrink: 0 }} />
              {conf.label}
            </span>
          </div>
        </div>

        {/* vibe check */}
        {profile.vibeCheck && (
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight3, fontStyle: 'italic', marginBottom: 10, lineHeight: 1.5 }}
            className="line-clamp-2">
            &ldquo;{profile.vibeCheck}&rdquo;
          </p>
        )}

        {/* tech chips */}
        {profile.techStack.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {profile.techStack.slice(0, 7).map(t => (
              <span key={t} className="skill-chip" style={{
                fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500,
                background: C.indigoLt, color: C.indigo, padding: '3px 8px', borderRadius: 4,
              }}>
                {t}
              </span>
            ))}
            {profile.techStack.length > 7 && (
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight4, alignSelf: 'center' }}>
                +{profile.techStack.length - 7}
              </span>
            )}
          </div>
        )}

        {/* location + contact + years */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {profile.location && (
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M6 1C4.07 1 2.5 2.57 2.5 4.5c0 2.7 3.5 5.5 3.5 5.5S9.5 7.2 9.5 4.5C9.5 2.57 7.93 1 6 1Z" stroke={C.onLight4} strokeWidth="1.2" />
                <circle cx="6" cy="4.5" r="1.2" fill={C.onLight4} />
              </svg>
              {profile.location}
            </span>
          )}
          {profile.yearsOfExperience !== null && (
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight3 }}>
              {profile.yearsOfExperience} yrs exp
            </span>
          )}
          {profile.contactHint && (
            <button type="button" onClick={copyContact}
              style={{
                fontFamily: "'Inter',sans-serif", fontSize: 11,
                color: copied ? C.indigo : C.onLight3,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
              title="Click to copy">
              {copied ? '✓ Copied' : profile.contactHint}
            </button>
          )}
        </div>

        {/* source + expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href={profile.sourceUrl} target="_blank" rel="noopener noreferrer"
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight4,
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: 'none', transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = C.indigo}
            onMouseLeave={e => (e.target as HTMLElement).style.color = C.onLight4}>
            ↗ {profile.sourceUrl.replace(/^https?:\/\//, '').slice(0, 55)}
          </a>
          {hasExpand && (
            <button onClick={() => setExpanded(v => !v)}
              style={{
                fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500,
                color: expanded ? C.indigo : C.onLight3,
                background: expanded ? C.indigoLt : C.workspace,
                border: `1px solid ${expanded ? '#C4B5FD' : C.border}`,
                borderRadius: 5, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
                transition: 'all 0.15s',
              }}>
              {expanded ? '▴ Less' : '▾ More'}
            </button>
          )}
        </div>

        {/* expanded */}
        <AnimatedCollapse open={expanded}>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }} className="space-y-4">

            {/* Why this candidate */}
            {profile.similarityReason && (
              <div style={{
                background: C.indigoLt, borderLeft: `3px solid ${C.indigo}`,
                borderRadius: '0 6px 6px 0', padding: '10px 12px',
              }}>
                <div className="card-section-label" style={{ color: C.indigo, marginBottom: 4 }}>Why This Candidate?</div>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.indigo, lineHeight: 1.6, fontStyle: 'italic', margin: 0 }}>
                  {profile.similarityReason}
                </p>
              </div>
            )}

            {/* skill matrix */}
            {profile.skills && Object.values(profile.skills).some(a => a.length > 0) && (
              <div>
                <div className="card-section-label">Skills</div>
                <div className="space-y-2">
                  {(Object.entries(profile.skills) as [keyof typeof SKILL_BG, string[]][])
                    .filter(([, arr]) => arr.length > 0)
                    .map(([cat, items]) => {
                      const s = SKILL_BG[cat]
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600, color: C.onLight4, paddingTop: 3, width: 28, flexShrink: 0 }}>
                            {s.label}
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {items.map(item => (
                              <span key={item} className="skill-chip" style={{
                                fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500,
                                background: s.bg, color: s.text, padding: '2px 8px', borderRadius: 4,
                              }}>
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* experience */}
            {(profile.experienceHistory?.length ?? 0) > 0 && (
              <div>
                <div className="card-section-label">Experience</div>
                <div className="space-y-3">
                  {profile.experienceHistory!.map((exp, i) => (
                    <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${C.indigoMed}` }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700, color: C.black }}>{exp.company}</span>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight2 }}>{exp.role}</span>
                        {exp.duration && <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: C.onLight4 }}>{exp.duration}</span>}
                      </div>
                      {exp.description && (
                        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight3, marginTop: 2, lineHeight: 1.5 }}>{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* projects */}
            {(profile.projects?.length ?? 0) > 0 && (
              <div>
                <div className="card-section-label">Projects</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-1">
                  {profile.projects!.map((proj, i) => (
                    <li key={i} style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight2, display: 'flex', gap: 6 }}>
                      <span style={{ color: C.indigo, fontWeight: 700, flexShrink: 0 }}>›</span>{proj}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ideal role */}
            {profile.generatedJobDescription && (
              <div>
                <div className="card-section-label">Ideal Next Role</div>
                <p style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight2,
                  lineHeight: 1.6, paddingLeft: 10, borderLeft: `2px solid ${C.indigoMed}`, fontStyle: 'italic',
                }}>
                  {profile.generatedJobDescription}
                </p>
              </div>
            )}
          </div>
        </AnimatedCollapse>
      </div>
    </div>
  )
}

/* ─── MetaBar ────────────────────────────────────────────────────────────── */
function MetaBar({ meta, count }: { meta: PoachMeta; count: number }) {
  const stats = [
    { label: 'URLs Found',    value: meta.urlsSearched, color: C.onLight2 },
    { label: 'Pages Scraped', value: meta.urlsScraped,  color: '#5B21B6'  },
    { label: 'Credits Used',  value: meta.creditsUsed,  color: C.amber    },
    { label: 'Profiles',      value: count,             color: C.indigo   },
  ]
  return (
    <div style={{
      animation: 'fadeSlideUp 0.3s ease forwards',
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', marginBottom: 14, overflow: 'hidden',
    }}>
      {stats.map(({ label, value, color }, i) => (
        <div key={label} style={{
          flex: 1, minWidth: 0, padding: '12px 14px',
          borderRight: i < 3 ? `1px solid ${C.border}` : 'none',
        }}>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 800, color, lineHeight: 1, animation: 'countUp 0.4s ease forwards' }}
            className="tabular-nums">{value}</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: C.onLight2, marginTop: 3 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

/* ─── ResultsToolbar ─────────────────────────────────────────────────────── */
function ResultsToolbar({ sortBy, onSort, total, onCopyJSON, onCopyCSV, copiedJSON, copiedCSV }: {
  sortBy: SortKey; onSort: (k: SortKey) => void; total: number
  onCopyJSON: () => void; onCopyCSV: () => void
  copiedJSON: boolean; copiedCSV: boolean
}) {
  const opts: { key: SortKey; label: string }[] = [
    { key: 'default',    label: 'Default'    },
    { key: 'confidence', label: 'Confidence' },
    { key: 'score',      label: 'Match %'    },
    { key: 'name',       label: 'A → Z'      },
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 800, color: C.black }}>{total}</span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: C.onLight3, fontWeight: 500 }}>candidates found</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight4 }}>Sort:</span>
        {opts.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => onSort(key)} className="sort-btn"
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500,
              color: sortBy === key ? '#fff' : C.onLight2,
              background: sortBy === key ? C.indigo : '#fff',
              border: `1px solid ${sortBy === key ? C.indigo : C.border}`,
              borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
            }}>
            {label}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: C.border, margin: '0 2px' }} />
        {[
          { label: copiedJSON ? '✓ JSON' : 'JSON', fn: onCopyJSON, active: copiedJSON },
          { label: copiedCSV ? '✓ CSV' : '↓ CSV', fn: onCopyCSV, active: copiedCSV },
        ].map(({ label, fn, active }) => (
          <button key={label} type="button" onClick={fn}
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11,
              background: active ? C.indigo : '#fff',
              color: active ? '#fff' : C.onLight3,
              border: `1px solid ${active ? C.indigo : C.border}`,
              borderRadius: 5, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s',
            }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── ActivityPanel ──────────────────────────────────────────────────────── */
function ActivityPanel({ logs, meta, count, loading, stage }: {
  logs: LogEntry[]; meta: PoachMeta | null; count: number; loading: boolean; stage: number
}) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const logColor: Record<LogEntry['type'], string> = {
    info:    '#6B7280',
    success: '#15803D',
    error:   '#B91C1C',
    warn:    '#B45309',
  }

  return (
    <aside className="hidden xl:flex sb"
      style={{
        width: 260, minWidth: 260, flexDirection: 'column',
        borderLeft: `1px solid ${C.border}`, background: C.sidebar,
        height: 'calc(100vh - 52px)', position: 'sticky', top: 52, overflowY: 'auto',
      }}>

      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700, color: C.onLight4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Activity
        </div>
      </div>

      {/* pipeline steps */}
      <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {PIPELINE_STEPS.map((step, i) => {
          const done = i < stage || (!loading && stage >= PIPELINE_STEPS.length - 1 && i <= stage)
          const active = loading && i === stage
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < PIPELINE_STEPS.length - 1 ? 10 : 0 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: done ? C.indigo : active ? C.indigoLt : C.greyBg,
                border: `1.5px solid ${done ? C.indigo : active ? C.indigo : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done && !active ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : active ? (
                  <svg style={{ animation: 'spin 0.8s linear infinite' }} width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke={C.indigo} strokeWidth="3" />
                    <path fill={C.indigo} d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : null}
              </div>
              <span style={{
                fontFamily: "'Inter',sans-serif", fontSize: 12,
                color: done ? C.onLight2 : active ? C.onLight : C.onLight4,
                fontWeight: active ? 600 : done ? 500 : 400,
              }}>
                {step}
              </span>
            </div>
          )
        })}
      </div>

      {/* log lines */}
      {logs.length > 0 ? (
        <div ref={logRef} style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }} className="sb">
          {logs.map((log, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, animation: 'fadeSlideUp 0.2s ease forwards' }}>
              <span style={{ fontFamily: "'Inter',monospace", fontSize: 9, color: C.onLight4, flexShrink: 0, paddingTop: 1, letterSpacing: '-0.01em' }}>
                {log.ts}
              </span>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: logColor[log.type], lineHeight: 1.4 }}>
                {log.msg}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, padding: '20px 16px', display: 'flex', alignItems: 'flex-start' }}>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight4, fontStyle: 'italic' }}>
            No activity yet. Run a search to begin.
          </span>
        </div>
      )}

      {/* stats */}
      {meta && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, color: C.onLight4, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Results
          </div>
          {[
            { label: 'URLs Found',    value: meta.urlsSearched, color: C.onLight2 },
            { label: 'Pages Scraped', value: meta.urlsScraped,  color: '#5B21B6'  },
            { label: 'Credits Used',  value: meta.creditsUsed,  color: C.amber    },
            { label: 'Profiles',      value: count,             color: C.indigo   },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight3 }}>{label}</span>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 800, color }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

/* ─── Label ──────────────────────────────────────────────────────────────── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, color: C.label, marginBottom: 5 }}>
      {children}
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function Home() {
  const mounted = useMounted()

  /* form state */
  const [role,            setRole]            = useState('')
  const [location,        setLocation]        = useState('')
  const [yearsExperience, setYearsExperience] = useState('')
  const [limit,           setLimit]           = useState(5)
  const [deepDive,        setDeepDive]        = useState(false)
  const [jobDescription,  setJobDescription]  = useState('')

  /* pipeline state */
  const [loading,     setLoading]     = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stage,       setStage]       = useState(0)

  /* results state */
  const [profiles,   setProfiles]   = useState<PoachedProfile[]>([])
  const [sortBy,     setSortBy]     = useState<SortKey>('default')
  const [meta,       setMeta]       = useState<PoachMeta | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [hasMore,    setHasMore]    = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [debugDorks, setDebugDorks] = useState<string[] | null>(null)

  /* export state */
  const [copiedJSON, setCopiedJSON] = useState(false)
  const [copiedCSV,  setCopiedCSV]  = useState(false)

  /* activity log */
  const [activityLogs, setActivityLogs] = useState<LogEntry[]>([])
  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false })
    setActivityLogs(prev => [...prev.slice(-80), { ts, msg, type }])
  }, [])

  /* stage → pipeline timing */
  useEffect(() => {
    if (!loading) { setStage(0); return }
    const stages = buildStages(limit)
    const timers = stages.slice(1).map((s, i) => setTimeout(() => setStage(i + 1), s.ms))
    return () => timers.forEach(clearTimeout)
  }, [loading, limit])

  /* stage → log entry */
  useEffect(() => {
    if (!loading) return
    const msgs: Record<number, string> = {
      0: 'Building 6 dork queries with intext: filters...',
      1: 'Querying Serper search index...',
      2: `Firecrawl scraping ${limit} page${limit > 1 ? 's' : ''}...`,
      3: 'Gemini 2.5 Flash parsing & gatekeeper filtering...',
      4: 'Compiling candidate dossiers...',
    }
    if (msgs[stage] !== undefined) addLog(msgs[stage])
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const arr = [...profiles]
    if (sortBy === 'confidence') arr.sort((a, b) => CONF[a.confidence].rank - CONF[b.confidence].rank)
    else if (sortBy === 'score') arr.sort((a, b) => (b.similarityScore ?? -1) - (a.similarityScore ?? -1))
    else if (sortBy === 'name')  arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [profiles, sortBy])

  function doCopyJSON() {
    navigator.clipboard.writeText(JSON.stringify(sorted, null, 2))
    setCopiedJSON(true); setTimeout(() => setCopiedJSON(false), 2000)
  }
  function doCopyCSV() {
    const blob = new Blob([toCSV(sorted)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `reagent_${role}_${location}.csv`.replace(/\s+/g, '_').toLowerCase()
    a.click(); URL.revokeObjectURL(url)
    setCopiedCSV(true); setTimeout(() => setCopiedCSV(false), 2000)
  }
  function handleClear() {
    setProfiles([]); setMeta(null); setError(null); setHasMore(false); setNextOffset(0); setSortBy('default'); setDebugDorks(null)
  }

  const expNum = yearsExperience.trim() ? parseInt(yearsExperience, 10) : undefined
  const hasJD  = jobDescription.trim().length > 0

  const doFetch = useCallback(async (offset: number, append: boolean) => {
    try {
      const res = await fetch('/api/poach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: role.trim(), location: location.trim(), maxProfiles: limit,
          deepDive, offset,
          yearsExperience: expNum && !isNaN(expNum) ? expNum : undefined,
          jobDescription: hasJD ? jobDescription.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        addLog(`Error: ${data.error ?? 'Unknown error'}`, 'error')
      } else {
        const count = data.profiles?.length ?? 0
        const urlCount = data.meta?.urlsSearched ?? 0

        // Capture dorks for debug — show them if no URLs were found
        if (data.dorks) setDebugDorks(data.dorks)

        if (append) {
          setProfiles(prev => [...prev, ...(data.profiles ?? [])])
          setMeta(prev => prev ? {
            urlsSearched: Math.max(prev.urlsSearched, urlCount),
            urlsScraped: prev.urlsScraped + (data.meta?.urlsScraped ?? 0),
            creditsUsed: prev.creditsUsed + (data.meta?.creditsUsed ?? 0),
          } : data.meta ?? null)
        } else {
          setProfiles(data.profiles ?? []); setMeta(data.meta ?? null)
        }
        setHasMore(data.hasMore ?? false); setNextOffset(data.nextOffset ?? 0)

        if (urlCount === 0) {
          addLog('Serper returned 0 URLs — check the debug panel below', 'warn')
        } else if (count > 0) {
          addLog(`Found ${count} matching profile${count > 1 ? 's' : ''} from ${urlCount} URLs`, 'success')
        } else {
          addLog(`Scraped ${data.meta?.urlsScraped ?? 0} pages, 0 passed gatekeeper filter`, 'warn')
        }
      }
    } catch {
      setError('Network error — could not reach the server.')
      addLog('Network error — could not reach the server', 'error')
    }
  }, [role, location, limit, deepDive, jobDescription, expNum, hasJD, addLog])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role.trim() || !location.trim()) return
    setActivityLogs([])
    addLog(`Searching for "${role}" in ${location}${hasJD ? ' with JD matching' : ''}`)
    setLoading(true); setError(null); setProfiles([]); setMeta(null); setSortBy('default'); setHasMore(false); setDebugDorks(null)
    await doFetch(0, false)
    setLoading(false)
  }, [doFetch, role, location, hasJD, addLog])

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true); setError(null)
    addLog('Loading next batch...')
    await doFetch(nextOffset, true)
    setLoadingMore(false)
  }, [doFetch, nextOffset, addLog])

  if (!mounted) return null

  const canSubmit = !loading && role.trim() && location.trim()
  const hasResults = !loading && (meta !== null || profiles.length > 0)

  return (
    <>
      <style>{STYLES}</style>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.workspace }}>

        {/* ── TOPBAR ── */}
        <header style={{
          height: 52, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px',
          background: C.sidebar, borderBottom: `1px solid ${C.border}`,
          position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: C.indigo, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2.5" />
                <path d="M16.5 16.5L21 21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 800, color: C.black, letterSpacing: '-0.02em' }}>
              Reagent
            </span>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, background: C.indigoLt, color: C.indigo, padding: '2px 7px', borderRadius: 10 }}>
              ALPHA
            </span>
          </div>

          <div style={{ width: 1, height: 18, background: C.border }} />
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight3 }} className="hidden sm:block">
            AI Talent Intelligence
          </span>

          <div style={{ flex: 1 }} />

          <div className="hidden md:flex items-center gap-5">
            {['Serper', 'Firecrawl', 'Gemini'].map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: C.onLight3, fontWeight: 500 }}>{n}</span>
              </div>
            ))}
          </div>
        </header>

        {/* ── BODY ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── LEFT SIDEBAR ── */}
          <aside className="hidden lg:flex sb"
            style={{
              width: 280, minWidth: 280, flexDirection: 'column',
              borderRight: `1px solid ${C.border}`, background: C.sidebar,
              height: 'calc(100vh - 52px)', position: 'sticky', top: 52, overflowY: 'auto',
            }}>

            <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700, color: C.onLight4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Search Parameters
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: 14 }}>

              <div>
                <FieldLabel>Role</FieldLabel>
                <input className="rg-input" type="text" value={role} onChange={e => setRole(e.target.value)}
                  placeholder="e.g. AI Engineer" required disabled={loading} />
              </div>

              <div>
                <FieldLabel>Location</FieldLabel>
                <input className="rg-input" type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Mumbai" required disabled={loading} />
              </div>

              <div>
                <FieldLabel>Min. Experience (years)</FieldLabel>
                <input className="rg-input" type="number" min="0" max="30" value={yearsExperience}
                  onChange={e => setYearsExperience(e.target.value)} placeholder="Optional" disabled={loading} />
              </div>

              <div>
                <FieldLabel>Target Count</FieldLabel>
                <div style={{ background: C.workspace, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
                  <LimitBar value={limit} onChange={setLimit} disabled={loading} />
                </div>
              </div>

              <Toggle active={deepDive} onToggle={() => setDeepDive(v => !v)} label="Deep Scan" hint="+30s · 2× credits" disabled={loading} />

              {/* spacer */}
              <div style={{ flex: 1 }} />

              {error && (
                <div style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 12,
                  background: C.redBg, border: `1px solid ${C.redBorder}`,
                  borderRadius: 6, padding: '10px 12px', color: C.redText, lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              {hasResults && !loading && (
                <button type="button" onClick={handleClear}
                  style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500,
                    background: 'transparent', color: C.onLight3,
                    border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = C.redBorder; (e.target as HTMLElement).style.color = C.red }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = C.border; (e.target as HTMLElement).style.color = C.onLight3 }}>
                  Clear Results
                </button>
              )}

              {/* BIG RUN BUTTON */}
              <button type="submit" disabled={!canSubmit}
                className="run-btn"
                style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 700,
                  background: canSubmit ? C.indigo : C.greyBg,
                  color: canSubmit ? '#FFFFFF' : '#9CA3AF',
                  border: 'none', borderRadius: 6, padding: '14px',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s, transform 0.1s',
                  letterSpacing: '0.01em', flexShrink: 0,
                }}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <svg style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
                      <path style={{ opacity: 0.9 }} fill="white" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Scanning {limit} candidates…
                  </span>
                ) : `Run Search · ${limit} candidate${limit > 1 ? 's' : ''}`}
              </button>

            </form>

            {/* sidebar footer */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 16px', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: C.onLight4 }}>
                v0.1 · Dork → Scrape → Parse
              </span>
            </div>
          </aside>

          {/* ── CENTER WORKSPACE ── */}
          <main className="flex-1 min-w-0 ws"
            style={{ background: C.workspace, overflowY: 'auto', height: 'calc(100vh - 52px)', padding: '20px' }}>

            {/* mobile form */}
            <div className="lg:hidden mb-5">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700, color: C.onLight4, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
                  Search Parameters
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  {[
                    { l: 'Role', v: role, s: setRole, ph: 'e.g. AI Engineer' },
                    { l: 'Location', v: location, s: setLocation, ph: 'e.g. Mumbai' },
                  ].map(({ l, v, s, ph }) => (
                    <div key={l}>
                      <FieldLabel>{l}</FieldLabel>
                      <input className="rg-input" type="text" value={v} onChange={e => s(e.target.value)}
                        placeholder={ph} disabled={loading} />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <FieldLabel>Min. Experience (years)</FieldLabel>
                  <input className="rg-input" type="number" min="0" max="30" value={yearsExperience}
                    onChange={e => setYearsExperience(e.target.value)} placeholder="Optional" disabled={loading} />
                </div>
                <div style={{ background: C.workspace, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
                  <LimitBar value={limit} onChange={setLimit} disabled={loading} />
                </div>
                <Toggle active={deepDive} onToggle={() => setDeepDive(v => !v)} label="Deep Scan" disabled={loading} />
                <button type="button"
                  onClick={e => handleSubmit(e as unknown as React.FormEvent)}
                  disabled={loading || !role.trim() || !location.trim()}
                  style={{
                    width: '100%', marginTop: 12, fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700,
                    background: (canSubmit) ? C.indigo : C.greyBg,
                    color: (canSubmit) ? '#fff' : '#9CA3AF',
                    border: 'none', borderRadius: 6, padding: '12px', cursor: canSubmit ? 'pointer' : 'not-allowed',
                  }}>
                  {loading ? 'Scanning…' : `Run Search · ${limit}`}
                </button>
              </div>
            </div>

            {/* ── JD CARD (always visible) ── */}
            <div style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,.04)', padding: 16, marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 800, color: C.black }}>
                  Job Description
                </div>
                <span style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600,
                  color: hasJD ? C.indigo : C.onLight4,
                  background: hasJD ? C.indigoLt : C.greyBg,
                  padding: '2px 8px', borderRadius: 10, transition: 'all 0.2s',
                }}>
                  {hasJD ? 'Match scoring enabled' : 'Optional — enables match scoring'}
                </span>
              </div>
              <textarea className="rg-textarea"
                value={jobDescription} onChange={e => setJobDescription(e.target.value)}
                placeholder="Paste the job description here. Gemini will score each candidate 0–100 and explain why they match or don't."
                rows={6} disabled={loading}
                style={{ minHeight: 100 }}
              />
            </div>

            {/* empty state */}
            {!loading && !hasResults && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 'calc(100vh - 340px)', animation: 'fadeIn 0.4s ease forwards',
              }}>
                <div style={{ textAlign: 'center', maxWidth: 380 }}>
                  <div style={{ width: 60, height: 60, background: C.indigoLt, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="7" stroke={C.indigo} strokeWidth="2" />
                      <path d="M16.5 16.5L21 21" stroke={C.indigo} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 800, color: C.black, marginBottom: 8 }}>
                    Find your next hire
                  </h2>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: C.onLight3, lineHeight: 1.6, marginBottom: 20 }}>
                    Enter a role and location in the sidebar. Optionally paste a job description above to get AI-scored match results.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {['Dork', '→', 'Scrape', '→', 'Parse', '→', 'Filter', '→', 'Profile'].map((s, i) => (
                      <span key={i} style={{
                        fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: s === '→' ? 400 : 600,
                        color: s === '→' ? C.onLight4 : C.indigo,
                        background: s === '→' ? 'transparent' : C.indigoLt,
                        padding: s === '→' ? '0' : '3px 10px', borderRadius: 5,
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* loading skeletons */}
            {loading && (
              <div style={{ animation: 'fadeIn 0.25s ease forwards' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {Array.from({ length: Math.min(limit, 6) }, (_, i) => <SkeletonCard key={i} index={i} />)}
                </div>
              </div>
            )}

            {/* results */}
            {hasResults && !loading && (
              <div>
                {meta && <MetaBar meta={meta} count={profiles.length} />}

                {profiles.length > 0 && (
                  <>
                    <ResultsToolbar
                      sortBy={sortBy} onSort={setSortBy} total={profiles.length}
                      onCopyJSON={doCopyJSON} onCopyCSV={doCopyCSV}
                      copiedJSON={copiedJSON} copiedCSV={copiedCSV}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                      {sorted.map((p, i) => <ProfileCard key={p.sourceUrl} profile={p} index={i} />)}
                    </div>
                  </>
                )}

                {hasMore && profiles.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                    <button type="button" onClick={handleLoadMore} disabled={loadingMore}
                      style={{
                        fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
                        background: '#fff', color: loadingMore ? C.onLight4 : C.indigo,
                        border: `1px solid ${loadingMore ? C.border : '#C4B5FD'}`,
                        borderRadius: 6, padding: '10px 28px', cursor: loadingMore ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,.05)',
                      }}>
                      {loadingMore ? 'Loading…' : 'Load More Results'}
                    </button>
                  </div>
                )}

                {profiles.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: C.onLight3 }}>
                      No profiles returned. Try a different role or location, or check the debug panel below.
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* ── DEBUG PANEL (shown when Serper returns 0 URLs) ── */}
          {debugDorks && meta?.urlsSearched === 0 && (
            <div style={{
              position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              zIndex: 100, width: 'min(720px, 94vw)',
              background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,.4)', padding: '16px 20px',
              animation: 'fadeSlideUp 0.3s ease forwards',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>
                    Debug — 0 URLs found
                  </span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#6B7280' }}>
                    These are the exact queries sent to Serper:
                  </span>
                </div>
                <button onClick={() => setDebugDorks(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {debugDorks.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: "'Inter',monospace", fontSize: 10, color: '#4B0082', background: '#EDE9FE', padding: '1px 5px', borderRadius: 3, flexShrink: 0, marginTop: 1 }}>
                      Q{i + 1}
                    </span>
                    <code style={{ fontFamily: "'Menlo','Courier New',monospace", fontSize: 11, color: '#D1D5DB', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {d}
                    </code>
                  </div>
                ))}
              </div>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#6B7280', marginTop: 12, lineHeight: 1.5 }}>
                Tip: if the queries look correct, the role or location may not be indexed. Try variations like &quot;ML Engineer&quot; instead of &quot;AI Engineer&quot;, or a broader city.
              </p>
            </div>
          )}

          {/* ── RIGHT ACTIVITY PANEL ── */}
          <ActivityPanel
            logs={activityLogs} meta={meta} count={profiles.length}
            loading={loading} stage={stage}
          />

        </div>
      </div>
    </>
  )
}
