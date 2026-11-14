import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { UsageSnapshot, UsageWindow } from '../types'

const PANE = 'usage'
const TITLE = '사용량'
const snapshot = atom({ plugin: 'usage-pane', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})

type Measured = {
  rateLimits: SessionRateLimit[]
  context: { tokens?: number; window: number; percent?: number }
  cost?: { usd: number }
}

/** 패널과 한 줄에 보여 줄 한도, 이 순서로. Fable은 엔진이 seven_day_overage_included로 보낸다 */
export const SLOTS = [
  { kind: 'five_hour', label: '5시간', hours: 5 },
  { kind: 'seven_day', label: '7일', hours: 168 },
  // 엔진 2.1.321의 $.session.usage()는 이 값을 넘기지 않는다. 넘기기 시작하면 그대로 표시된다.
  { kind: 'seven_day_overage_included', label: 'Fable', hours: 168, missing: '앱이 아직 이 값을 넘겨주지 않음' },
] as const

function toSnapshot(m: Measured): UsageSnapshot {
  return {
    windows: m.rateLimits.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt })),
    contextPercent: m.context.percent,
    contextTokens: m.context.tokens,
    contextWindow: m.context.window,
    costUsd: m.cost?.usd,
    readAt: Date.now(),
  }
}

/**
 * 새로 읽은 한도에 빠진 종류는 이전 값을 이어 쓴다(응답마다 오는 한도가 다를 수 있어서).
 * 단, 초기화 시각이 지난 이전 값은 버린다.
 */
export function mergeWindows(prev: UsageWindow[], fresh: UsageWindow[], now: number): UsageWindow[] {
  const kinds = new Set(fresh.map(w => w.kind))
  const kept = prev.filter(w => !kinds.has(w.kind) && (!w.resetsAt || Date.parse(w.resetsAt) > now))
  return [...fresh, ...kept]
}

export function bar(percent: number, width = 16): string {
  const p = Math.max(0, Math.min(100, percent))
  const full = Math.round((p / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export function color(percent: number): 'success' | 'warning' | 'error' {
  return percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'
}

/** "1시간 12분 뒤" 처럼 초기화까지 남은 시간 */
export function leftText(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return ''
  const mins = Math.max(0, Math.round((at - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return mins === 0 ? '곧 초기화' : d > 0 ? `${d}일 ${h}시간 뒤` : h > 0 ? `${h}시간 ${m}분 뒤` : `${m}분 뒤`
}

/** 창 안에서 지금까지 흐른 시간의 비율(0~100). 초기화 시각을 모르면 undefined */
export function elapsedPercent(resetsAt: string | undefined, hours: number, now: number): number | undefined {
  if (!resetsAt) return undefined
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return undefined
  const len = hours * 3600000
  return Math.max(0, Math.min(100, ((len - (at - now)) / len) * 100))
}

/** 사용률과 흐른 시간을 견준 한 줄: 5%p 넘게 차이 날 때만 빠름/여유라고 말한다 */
export function paceText(used: number, elapsed: number | undefined): { text: string; tone: 'success' | 'warning' | 'error' | 'muted' } {
  if (elapsed === undefined) return { text: '', tone: 'muted' }
  const diff = Math.round(used - elapsed)
  if (diff > 5) return { text: `시간보다 ${diff}%p 빠름`, tone: used >= 90 || diff >= 20 ? 'error' : 'warning' }
  if (diff < -5) return { text: `시간보다 ${-diff}%p 여유`, tone: 'success' }
  return { text: '시간과 비슷한 속도', tone: 'muted' }
}

export type Row = {
  label: string
  used?: number
  left: string
  elapsed?: number
  pace: { text: string; tone: 'success' | 'warning' | 'error' | 'muted' }
}

/** 한도 값을 받은 적이 있는데 이 한도만 빠졌으면 초기화된 것: 0%로 본다 (Fable은 엔진이 원래 안 넘겨서 제외) */
function resetToZero(s: UsageSnapshot | null, slot: (typeof SLOTS)[number]): boolean {
  return !!s?.sawLimits && !('missing' in slot)
}

export function rows(s: UsageSnapshot | null, now: number): Row[] {
  return SLOTS.map(slot => {
    const w = s?.windows.find(x => x.kind === slot.kind)
    if (!w && resetToZero(s, slot)) return { label: slot.label, used: 0, left: '', pace: { text: '초기화됨, 아직 사용 없음', tone: 'muted' as const } }
    if (!w) return { label: slot.label, left: '', pace: { text: 'missing' in slot ? slot.missing : '아직 값 없음', tone: 'muted' as const } }
    const elapsed = elapsedPercent(w.resetsAt, slot.hours, now)
    return { label: slot.label, used: w.percentUsed, left: leftText(w.resetsAt, now), elapsed, pace: paceText(w.percentUsed, elapsed) }
  })
}

/** 입력창 위 한 줄: 5시간, 7일, Fable, 컨텍스트. 값이 하나도 없으면 빈 배열(그러면 줄을 그리지 않는다) */
export function bandParts(s: UsageSnapshot | null): { label: string; value: string; color: 'success' | 'warning' | 'error' | undefined }[] {
  if (!s || (s.windows.length === 0 && s.contextPercent === undefined)) return []
  const out: { label: string; value: string; color: 'success' | 'warning' | 'error' | undefined }[] = SLOTS.map(slot => {
    const w = s.windows.find(x => x.kind === slot.kind)
    if (w) return { label: slot.label, value: `${Math.round(w.percentUsed)}%`, color: color(w.percentUsed) }
    return resetToZero(s, slot) ? { label: slot.label, value: '0%', color: 'success' as const } : { label: slot.label, value: '-', color: undefined }
  })
  out.push(
    s.contextPercent === undefined
      ? { label: '컨텍스트', value: '-', color: undefined }
      : { label: '컨텍스트', value: `${s.contextPercent}%`, color: color(s.contextPercent) },
  )
  return out
}

/* ---------- 데스크톱용 SVG 패널 (사용률 막대 + 흐른 시간 눈금) ---------- */
export type Palette = {
  text: string; muted: string; faint: string; track: string; line: string; tick: string
  success: string; warning: string; error: string
}
/**
 * 채도를 낮춘 눈이 편한 색. 다크·라이트 두 벌을 SVG 안의 prefers-color-scheme로 고른다.
 * 경고 단계는 밝기보다 색상 차이로 구분한다.
 */
export const DARK: Palette = {
  text: '#E4E1D8', muted: '#A19E95', faint: '#7C7A72', track: '#34332F', line: '#3A3936', tick: '#CFCBC0',
  success: '#8FB5A0', warning: '#CDAE74', error: '#C98A82',
}
export const LIGHT: Palette = {
  text: '#2F2E2A', muted: '#6B6860', faint: '#8E8B83', track: '#E6E3DB', line: '#E2DFD6', tick: '#4A4842',
  success: '#4F7F66', warning: '#94702F', error: '#A3584E',
}
/** 입력창 위 한 줄·터미널용: 라이트·다크 어느 바탕에서도 읽히는 중간 밝기 */
export const MID = { success: '#6F9A84', warning: '#AE8A48', error: '#B76B61' }
const C = MID
const NUM = "Bahnschrift, 'Segoe UI', sans-serif"
const KR = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function pct(v: number): string {
  return `${v % 1 ? v.toFixed(1) : v}%`
}
/** 글자 크기(px): 이름 14, 숫자 17, 보조 12 */
const FS = { label: 14, value: 17, small: 12 }
const ROW = 78

type Role = keyof Palette
function rules(p: Palette): string {
  const fill = (['text', 'muted', 'faint', 'track', 'success', 'warning', 'error'] as Role[]).map(k => `.${k}{fill:${p[k]}}`)
  return fill.join('') + `.line{stroke:${p.line}}.tick{stroke:${p.tick}}`
}
/** SVG 안의 스타일: 기본은 다크, 라이트 화면이면 라이트 색 */
export function svgStyle(dark: Palette = DARK, light: Palette = LIGHT): string {
  return `<style>${rules(dark)}@media (prefers-color-scheme: light){${rules(light)}}</style>`
}

export function paneSvg(s: UsageSnapshot | null, now: number, width = 280): string {
  const W = width
  const x0 = 4
  const tw = W - 8
  const out: string[] = []
  const text = (x: number, y: number, body: string, size: number, role: Role, opts = '') =>
    out.push(`<text x="${x}" y="${y}" font-size="${size}" class="${role}" ${opts}>${esc(body)}</text>`)
  const track = (y: number, used: number | undefined, role: Role) => {
    out.push(`<rect x="${x0}" y="${y}" width="${tw}" height="8" rx="4" class="track"/>`)
    if (used !== undefined && used > 0) {
      const w = Math.max(8, (Math.min(100, used) / 100) * tw)
      out.push(`<rect x="${x0}" y="${y}" width="${w.toFixed(1)}" height="8" rx="4" class="${role}"/>`)
    }
  }

  let y = 0
  for (const r of rows(s, now)) {
    const level: Role = r.used === undefined ? 'muted' : color(r.used)
    text(x0, y + 23, r.label, FS.label, 'text', `font-family="${KR}"`)
    text(W - 4, y + 23, r.used === undefined ? '-' : pct(r.used), FS.value, r.used !== undefined && r.used >= 70 ? level : 'text', `font-family="${NUM}" text-anchor="end"`)
    track(y + 32, r.used, level)
    if (r.elapsed !== undefined) {
      const tx = (x0 + (r.elapsed / 100) * tw).toFixed(1)
      out.push(`<line x1="${tx}" y1="${y + 28}" x2="${tx}" y2="${y + 44}" class="tick" stroke-width="2" stroke-linecap="round"/>`)
    }
    text(x0, y + 60, r.pace.text, FS.small, r.pace.tone, `font-family="${KR}"`)
    if (r.left) text(W - 4, y + 60, r.left, FS.small, 'muted', `font-family="${KR}" text-anchor="end"`)
    out.push(`<line x1="${x0}" y1="${y + ROW}" x2="${W - 4}" y2="${y + ROW}" class="line" stroke-width="1"/>`)
    y += ROW
  }

  const cp = s?.contextPercent
  const cl: Role = cp === undefined ? 'muted' : color(cp)
  text(x0, y + 23, '컨텍스트', FS.label, 'text', `font-family="${KR}"`)
  text(W - 4, y + 23, cp === undefined ? '-' : `${cp}%`, FS.value, cp !== undefined && cp >= 70 ? cl : 'text', `font-family="${NUM}" text-anchor="end"`)
  track(y + 32, cp, cl)
  const tokens =
    s?.contextTokens !== undefined
      ? `${Math.round(s.contextTokens / 1000).toLocaleString('en-US')}k / ${Math.round(s.contextWindow / 1000).toLocaleString('en-US')}k 토큰`
      : '첫 답 이후에 표시'
  text(x0, y + 60, tokens, FS.small, 'muted', `font-family="${KR}"`)
  const at = s ? new Date(s.readAt) : null
  if (at) text(W - 4, y + 60, `갱신 ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`, FS.small, 'faint', `font-family="${KR}" text-anchor="end"`)
  y += 70

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}">${svgStyle()}${out.join('')}</svg>`
}

export function paneAlt(s: UsageSnapshot | null, now: number): string {
  const parts = rows(s, now).map(r => (r.used === undefined ? `${r.label} 값 없음` : `${r.label} ${pct(r.used)}${r.pace.text ? `, ${r.pace.text}` : ''}${r.left ? `, ${r.left} 초기화` : ''}`))
  parts.push(s?.contextPercent === undefined ? '컨텍스트 값 없음' : `컨텍스트 ${s.contextPercent}%`)
  return '사용량: ' + parts.join('. ')
}

async function refresh($: EngineInterface, m?: Measured) {
  const measured = m ?? (await $.session.usage())
  const fresh = toSnapshot(measured)
  await update($, snapshot, prev => {
    const sawLimits = !!prev?.sawLimits || fresh.windows.length > 0
    return prev ? { ...fresh, sawLimits, windows: mergeWindows(prev.windows, fresh.windows, fresh.readAt) } : { ...fresh, sawLimits }
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-pane', description: '사용량 패널을 다시 엽니다' })
    // 예전 버전이 하단 상태 줄에 남긴 표시를 지운다(입력창 위 한 줄과 겹쳐서 뺐다).
    $.ui.status(undefined)
    // 사람이 보지 않는 실행(-p, SDK)에서는 패널과 타이머를 만들지 않는다.
    if (!e.isInteractive) return next(e)
    await refresh($)
    void $.ui.open({ id: PANE, title: TITLE, columns: 34 })
    // 남은 시간과 흐른 시간 눈금이 움직이도록 1분마다 다시 읽는다.
    $.clock.every(60_000, () => void refresh($).catch(() => {}))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($, e)
    return next(e)
  })

  on('command.run', { command: 'usage-pane' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE, columns: 34 })
    return { text: '사용량 패널을 열었습니다.' }
  })

  // 입력창 바로 위 한 줄: "5시간 86% · 7일 54% · Fable - · 컨텍스트 42%"
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    const parts = bandParts(s)
    if (e.props.hasSurvey || parts.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        {parts.map((p, i) => (
          <Text dimColor={p.color === undefined || p.color === 'success'} tabular>
            {i > 0 ? ' · ' : ''}
            {p.label} {p.color ? <Text color={C[p.color]}>{p.value}</Text> : p.value}
          </Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = await read($, snapshot)
    const now = Date.now()

    // SVG를 그릴 수 있는 화면(데스크톱 등)
    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={paneSvg(s, now)} alt={paneAlt(s, now)} />
    }

    // 터미널: 같은 순서의 글자 모양
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(8, Math.min(24, (e.props.bodyColumns ?? 34) - 14))
    return (
      <Box flexDirection="column">
        {rows(s, now).map(r => (
          <Box flexDirection="column" marginBottom={1}>
            <Text weight="semibold">{r.label}</Text>
            {r.used === undefined ? (
              <Text dimColor>{r.pace.text}</Text>
            ) : (
              <Text>
                <Text color={C[color(r.used)]}>{bar(r.used, width)}</Text> {pct(r.used)}
              </Text>
            )}
            {r.used !== undefined && (r.pace.text || r.left) ? (
              <Text dimColor>{[r.pace.text, r.left].filter(Boolean).join(', ')}</Text>
            ) : null}
          </Box>
        ))}
        <Text weight="semibold">컨텍스트</Text>
        {s?.contextPercent === undefined ? (
          <Text dimColor>첫 답 이후에 표시됩니다.</Text>
        ) : (
          <Text>
            <Text color={C[color(s.contextPercent)]}>{bar(s.contextPercent, width)}</Text> {s.contextPercent}%
          </Text>
        )}
      </Box>
    )
  })
}
