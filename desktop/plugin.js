import * as sdk from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

// herm-t3s: T3 Code-style triage for the sidebar session list.
//  • Leading slot: a small coloured profile badge. Hovering it opens a detail
//    card (project, branch, model, messages/tools, tokens, cost, last active,
//    preview).
//  • Trailing slot: a faint clock; hovering it opens Snooze and Settle.
//  • Snooze archives now and unarchives at the chosen time (kept in this
//    plugin's storage; wakes while the app is open, or at next launch).
//    Settle archives.
// Uses only the plugin SDK: row slots, Tip, DropdownMenu,
// host.listPersistedSessions, and the session.archive / profiles.list RPCs.

const ID = 'herm-t3s'

const css = `
.st-badge { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%;
  font-size: 11px; color: var(--ui-text-tertiary, var(--muted-foreground)); cursor: default; }
.st-badge b { flex: none; display: inline-grid; place-items: center; width: 15px; height: 15px;
  border-radius: 4px; font-size: 8.5px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--st-c); background: color-mix(in srgb, var(--st-c) 22%, transparent); }
.st-badge span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-status { display: inline-flex; align-items: center; flex: none; margin-left: 4px; min-height: 20px; }
.st-hint { display: inline-flex; padding: 0 4px; opacity: 0.3; color: var(--ui-text-tertiary, var(--muted-foreground)); }
.st-actions { display: none; align-items: center; gap: 2px; }
.st-status:hover .st-actions, .st-status:has([data-state="open"]) .st-actions { display: inline-flex; }
.st-status:hover .st-hint, .st-status:has([data-state="open"]) .st-hint { display: none; }
.st-btn { display: inline-flex; align-items: center; gap: 3px; height: 20px; padding: 0 5px;
  border-radius: 5px; font-size: 11px; color: var(--ui-text-tertiary, var(--muted-foreground));
  background: transparent; border: 0; cursor: pointer; }
.st-btn:hover { color: var(--foreground); background: var(--ui-row-hover-background, rgb(127 127 127 / 0.15)); }
.st-card { min-width: 200px; max-width: 300px; font-size: 12px; line-height: 1.35; text-align: left; }
.st-card-title { font-weight: 500; margin-bottom: 6px; }
.st-line { display: flex; gap: 7px; align-items: center; margin-top: 3px; opacity: 0.8;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-line .codicon { width: 12px; flex: none; opacity: 0.75; }
.st-preview { margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--ui-stroke-secondary, var(--border));
  opacity: 0.65; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
`

// ── Shared data: persisted session rows + profile display names ───────────
let rows = new Map()
let names = {}
let loadedAt = 0
let loading = null
const listeners = new Set()
const notify = () => listeners.forEach(f => f())

function useData() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    listeners.add(f)
    load()
    return () => listeners.delete(f)
  }, [])
}

function load(force = false) {
  if (loading) return loading
  if (!force && Date.now() - loadedAt < 30_000) return Promise.resolve()
  const list = sdk.host?.listPersistedSessions
  loading = Promise.all([
    list ? list(null, { profile: 'all', limit: 500 }).catch(() => null) : null,
    sdk.host.request('profiles.list', { include_sessions: false }).catch(() => null)
  ]).then(([page, profiles]) => {
    if (page) {
      const next = new Map()
      for (const s of page.sessions || []) {
        for (const id of [s.id, s._lineage_root_id, ...(s._lineage_ids || [])]) if (id) next.set(id, s)
      }
      rows = next
    }
    if (profiles) {
      const n = {}
      for (const p of profiles.profiles || []) if (p?.name) n[p.name] = (p.display_name || '').trim()
      names = n
    }
    notify()
  }).finally(() => { loading = null; loadedAt = Date.now() })
  return loading
}

const profileName = key => names[key || 'default'] || (!key || key === 'default' ? 'Default' : key)
const initials = name => {
  const parts = name.split(/[^a-z0-9]+/i).filter(Boolean)
  return ((parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)) || '?').toUpperCase()
}
const compact = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)
const leaf = p => (p || '').replace(/\/+$/, '').split('/').pop()
function ago(sec) {
  if (!sec) return ''
  const d = Date.now() / 1000 - sec
  if (d < 60) return 'now'
  if (d < 3600) return `${Math.round(d / 60)}m`
  if (d < 86400) return `${Math.round(d / 3600)}h`
  return `${Math.round(d / 86400)}d`
}

// ── Leading slot: profile badge + hover card ───────────────────────────────
function DetailCard({ s }) {
  const lines = []
  const project = leaf(s.git_repo_root) || leaf(s.cwd)
  if (project) lines.push(['folder', project])
  if (s.git_branch) lines.push(['git-branch', s.git_branch])
  if (s.model) lines.push(['sparkle', s.model.split('/').pop()])
  const counts = [s.message_count ? `${s.message_count} messages` : '', s.tool_call_count ? `${s.tool_call_count} tools` : ''].filter(Boolean).join(' · ')
  if (counts) lines.push(['comment', counts])
  const tokens = (s.input_tokens || 0) + (s.output_tokens || 0)
  const cost = s.actual_cost_usd || s.estimated_cost_usd || 0
  const usage = [tokens ? `${compact(tokens)} tokens` : '', cost >= 0.01 ? `$${cost.toFixed(2)}` : ''].filter(Boolean).join(' · ')
  if (usage) lines.push(['pulse', usage])
  const when = ago(s.last_active || s.started_at)
  if (when) lines.push(['history', when === 'now' ? 'just now' : `${when} ago`])
  const preview = (s.preview || '').replace(/\s+/g, ' ').trim()
  return jsxs('div', { className: 'st-card', children: [
    jsx('div', { className: 'st-card-title', children: s.title || 'Untitled session' }),
    ...lines.map(([icon, text]) => jsxs('div', { className: 'st-line', children: [jsx(sdk.Codicon, { name: icon, size: 12 }), text] }, icon)),
    preview ? jsx('div', { className: 'st-preview', children: preview }) : null
  ] })
}

function Badge({ sessionId, showName }) {
  useData()
  const s = rows.get(sessionId)
  if (!s) return null
  const name = profileName(s.profile)
  const color = (sdk.profileColor && sdk.profileColor(s.profile)) || 'var(--ui-accent, #8b5cf6)'
  const badge = jsxs('span', { className: 'st-badge', style: { '--st-c': color }, children: [
    jsx('b', { children: initials(name) }), showName ? jsx('span', { children: name }) : null
  ] })
  return jsx(sdk.Tip, { label: jsx(DetailCard, { s }), side: 'right', align: 'start', children: badge })
}

// ── Trailing slot: a faint clock that opens into Snooze / Settle on hover ──
// (A worded status label waits for a public SDK status read: hermes-agent#152528.)
let storage = null
const readSnoozes = () => storage?.get('snoozes', {}) || {}
const writeSnoozes = v => storage?.set('snoozes', v)

function at9(daysAhead, weekday) {
  const d = new Date()
  if (weekday != null) daysAhead = ((weekday - d.getDay() + 7) % 7) || 7
  d.setDate(d.getDate() + daysAhead)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}
const SNOOZE_OPTIONS = [
  ['1 hour', () => Date.now() + 3600e3],
  ['3 hours', () => Date.now() + 3 * 3600e3],
  ['Tomorrow, 9 AM', () => at9(1)],
  ['Next Monday, 9 AM', () => at9(0, 1)]
]

// Snooze HIDES the session (host.setPersistedSessionHidden: fenced through the
// REST snapshot, so it works for any session). Settle ARCHIVES it; core's
// session.archive RPC needs the session's revision, which a window only has
// for sessions it has opened, so an unopened one gets a clear message instead.
const ROW_PROFILE = id => rows.get(id)?.profile || 'default'
const setHidden = (id, hidden) => sdk.host.setPersistedSessionHidden(null, { sessionId: id, profile: ROW_PROFILE(id), hidden })
const archive = (id, archived) => sdk.host.request('session.archive', { session_id: id, archived })
const needsOpen = e => /revision unavailable/i.test(String(e?.message || e))

async function snooze(id, title, until) {
  try {
    await setHidden(id, true)
    writeSnoozes({ ...readSnoozes(), [id]: { until, title, mode: 'hidden', profile: ROW_PROFILE(id) } })
    load(true)
    const when = new Date(until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    sdk.host.notify({ kind: 'success', message: `Snoozed until ${when}` })
  } catch (e) {
    sdk.host.notify({ kind: 'error', message: `Snooze failed: ${e?.message || e}` })
  }
}

// The archive mutation can commit on the backend yet never send its receipt
// back (the promise just hangs), so give it a few seconds, then check the
// persisted list (which excludes archived rows) for the real answer.
const settled = new Set()
const settledListeners = new Set()
async function settle(id) {
  let err = null
  try {
    await Promise.race([archive(id, true), new Promise(r => setTimeout(r, 5000))])
  } catch (e) { err = e }
  await load(true); await load(true) // second pass: an in-flight read may predate the write
  const gone = !rows.get(id)
  if (gone) {
    const s = readSnoozes(); delete s[id]; writeSnoozes(s)
    settled.add(id); settledListeners.forEach(f => f())
    sdk.host.notify({ kind: 'success', message: 'Settled (archived)' })
  } else {
    sdk.host.notify({ kind: 'error', message: err && needsOpen(err)
      ? 'Hermes can only archive sessions opened in this window. Open it once, or use \u22ef \u203a Archive.'
      : `Settle didn't take: ${err?.message || 'no change after 5s'}. Try \u22ef \u203a Archive.` })
  }
}

async function wakeDue() {
  const s = readSnoozes()
  let changed = false
  for (const [id, { until, title, mode, profile }] of Object.entries(s)) {
    if (until > Date.now()) continue
    try {
      if (mode === 'hidden') await sdk.host.setPersistedSessionHidden(null, { sessionId: id, profile: profile || 'default', hidden: false })
      else await archive(id, false)
      delete s[id]; changed = true
      sdk.host.notify({ kind: 'info', message: `Back from snooze: ${title}` })
    } catch (e) {
      if (needsOpen(e)) { delete s[id]; changed = true; sdk.host.notify({ kind: 'info', message: `Snooze ended: ${title} (in Archived)` }) }
    }
  }
  if (changed) writeSnoozes(s)
}

const stop = e => e.stopPropagation()

function Status({ sessionId }) {
  useData()
  const s = rows.get(sessionId)
  const title = s?.title || 'Session'
  const btn = (children, props = {}) => jsx('button', { type: 'button', className: 'st-btn', ...props, children })
  return jsxs('span', {
    className: 'st-status', onClick: stop, onPointerDown: stop, onDoubleClick: stop,
    children: [
      jsx('span', { className: 'st-hint', 'aria-hidden': true, children: jsx(sdk.Codicon, { name: 'clock', size: 12 }) }),
      jsxs('span', { className: 'st-actions', children: [
        jsxs(sdk.DropdownMenu, { children: [
          jsx(sdk.DropdownMenuTrigger, { asChild: true, children:
            btn(jsx(sdk.Codicon, { name: 'clock', size: 12 }), { 'aria-label': 'Snooze', title: 'Snooze' }) }),
          jsx(sdk.DropdownMenuContent, { align: 'end', onClick: stop, children:
            SNOOZE_OPTIONS.map(([text, until]) => jsx(sdk.DropdownMenuItem, {
              onSelect: () => snooze(sessionId, title, until()), children: text
            }, text)) })
        ] }),
        btn([jsx(sdk.Codicon, { name: 'check', size: 12 }, 'i'), 'Settle'], {
          'aria-label': 'Settle', title: 'Settle (archive)', onClick: e => { stop(e); settle(sessionId) }
        })
      ] })
    ]
  })
}

// ── Settings ───────────────────────────────────────────────────────────────
function SettingsPage({ $prefs, setPref }) {
  const prefs = sdk.useValue($prefs)
  return jsxs('div', { children: [
    jsx(sdk.ListRow, {
      title: 'Show profile name next to the badge',
      description: 'Off by default: in narrow sidebars the name truncates to a letter or two, so the coloured initials carry it.',
      action: jsx(sdk.Switch, { checked: prefs.showName, onCheckedChange: v => setPref('showName', v) })
    }),
    jsx(sdk.ListRow, {
      title: 'Snoozed sessions',
      description: `${Object.keys(readSnoozes()).length} waiting. Snoozes wake while Hermes is open, or at next launch.`
    })
  ] })
}

export default {
  id: ID,
  name: 'herm-t3s',
  register(ctx) {
    storage = ctx.storage
    const $prefs = sdk.atom({ showName: false, ...(ctx.storage.get('prefs', {}) || {}) })
    const setPref = (k, v) => { $prefs.set({ ...$prefs.get(), [k]: v }); ctx.storage.set('prefs', $prefs.get()) }

    // React 19 hoists a <style href precedence> to <head> once, however many rows render it.
    function Style() { return jsx('style', { href: 'herm-t3s', precedence: 'default', children: css }) }
    function LeadSlot({ sessionId }) {
      const prefs = sdk.useValue($prefs)
      return jsx(Badge, { sessionId, showName: prefs.showName })
    }

    ctx.register({ id: 'badge', area: sdk.SESSION_ROW_AREAS.leading,
      data: { render: ({ sessionId }) => jsxs('span', { style: { display: 'contents' }, children: [jsx(Style, {}), jsx(LeadSlot, { sessionId })] }) } })
    ctx.register({ id: 'status', area: sdk.SESSION_ROW_AREAS.trailing,
      data: { render: ({ sessionId }) => jsx(Status, { sessionId }) } })
    ctx.registerSettingsPage?.({ id: 'settings', title: 'herm-t3s', icon: 'inbox',
      render: () => jsx(SettingsPage, { $prefs, setPref }) })
    ctx.onEvent?.('sessions.changed', () => load(true))

    const wake = setInterval(wakeDue, 60e3)
    const first = setTimeout(wakeDue, 5e3)
    ctx.onDispose(() => { clearInterval(wake); clearTimeout(first); storage = null })
  }
}
