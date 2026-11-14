import { expect, test } from 'claude-code/testing'

import { bandParts, bar, color, elapsedPercent, leftText, mergeWindows, paceText, paneSvg, rows } from './register'

const PANE = {
  plugin: 'usage-pane',
  component: 'Pane',
  requestId: 'usage',
  props: { title: '사용량', isFocused: false, bodyColumns: 34, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const BAND = {
  plugin: 'usage-pane',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const inMin = (m: number) => new Date(Date.now() + m * 60000 + 20000).toISOString()

function engine(on: any, rateLimits: unknown[], context: unknown = { tokens: 84000, window: 200000, percent: 42 }) {
  on('command.register', () => ({ value: { command: 'usage-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: () => {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: Date.now(), context, rateLimits } }))
}

test('데스크톱·VS Code·모바일 패널은 사용량 패널을 SVG로 그린다 (5시간, 7일, Fable, 컨텍스트 순서)', async ($, on) => {
  engine(on, [
    { kind: 'seven_day_overage_included', percentUsed: 31, resetsAt: inMin(4560) },
    { kind: 'five_hour', percentUsed: 86, resetsAt: inMin(72) },
    { kind: 'seven_day', percentUsed: 54, resetsAt: inMin(4560) },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const svg = await ui.find({ type: 'Svg' })
    const src = String(svg?.props.source)
    expect(src.startsWith('<svg')).toBe(true)
    const order = ['5시간', '7일', 'Fable', '컨텍스트'].map(t => src.indexOf(`>${t}<`))
    expect(order.every(i => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(src).toContain('86%')
    expect(src).toContain('시간보다 10%p 빠름')
    expect(src).toContain('1시간 12분 뒤')
    expect(src).toContain('84k / 200k 토큰')
    expect(String(svg?.props.alt)).toContain('Fable 31%')
    await ui.unmount()
  }
})

test('터미널 패널은 같은 순서의 글자로 그린다', async ($, on) => {
  engine(on, [{ kind: 'five_hour', percentUsed: 86, resetsAt: inMin(72) }])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Fable$/ }))?.text).toBe('Fable')
  expect((await ui.find({ type: 'Text', text: /86%/ }))?.text).toContain('86%')
  expect((await ui.find({ type: 'Text', text: /넘겨주지 않음/ }))?.text).toBe('앱이 아직 이 값을 넘겨주지 않음')
  expect((await ui.find({ type: 'Text', text: /^아직 값 없음$/ }))?.text).toBe('아직 값 없음')
  await ui.unmount()
})

test('Fable 값이 없으면 칸은 남기고 "앱이 아직 이 값을 넘겨주지 않음"', async ($, on) => {
  engine(on, [{ kind: 'five_hour', percentUsed: 20, resetsAt: inMin(240) }, { kind: 'seven_day', percentUsed: 10, resetsAt: inMin(9000) }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(src).toContain('>Fable<')
  expect(src).toContain('앱이 아직 이 값을 넘겨주지 않음')
  expect(src).not.toContain('아직 값 없음')
  await ui.unmount()
})

test('입력창 위 한 줄: 5시간 · 7일 · Fable · 컨텍스트', async ($, on) => {
  engine(on, [{ kind: 'five_hour', percentUsed: 86 }, { kind: 'seven_day', percentUsed: 54 }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const line = texts.filter(t => /(5시간|7일|Fable|컨텍스트)/.test(t)).join('')
    expect(line).toBe('5시간 86% · 7일 54% · Fable - · 컨텍스트 42%')
    await ui.unmount()
  }
})

test('값이 하나도 없으면 한 줄은 엔진에 맡긴다', async ($, on) => {
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('이전 버전이 저장한 값은 버리고 빈 상태로 그린다', async ($, on) => {
  on('state.get', () => ({ value: { value: { windows: 'broken' }, version: 1 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const src = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(src).toContain('아직 값 없음')
  expect(src).toContain('첫 답 이후에 표시')
  await ui.unmount()
})

test('계산: 흐른 시간, 페이스, 남은 시간, 합치기, 막대, 색', () => {
  const now = Date.parse('2026-11-14T03:00:00Z')
  expect(Math.round(elapsedPercent('2026-11-14T04:12:00Z', 5, now) ?? -1)).toBe(76)
  expect(elapsedPercent(undefined, 5, now)).toBe(undefined)
  expect(elapsedPercent('엉터리', 5, now)).toBe(undefined)
  expect(elapsedPercent('2026-11-14T09:00:00Z', 5, now)).toBe(0)
  expect(paceText(86, 76)).toEqual({ text: '시간보다 10%p 빠름', tone: 'warning' })
  expect(paceText(95, 50)).toEqual({ text: '시간보다 45%p 빠름', tone: 'error' })
  expect(paceText(31, 55)).toEqual({ text: '시간보다 24%p 여유', tone: 'success' })
  expect(paceText(54, 55)).toEqual({ text: '시간과 비슷한 속도', tone: 'muted' })
  expect(leftText('2026-11-14T04:12:00Z', now)).toBe('1시간 12분 뒤')
  expect(leftText('2026-11-17T07:00:00Z', now)).toBe('3일 4시간 뒤')
  expect(leftText('2026-11-14T03:00:10Z', now)).toBe('곧 초기화')
  const prev = [
    { kind: 'seven_day_overage_included', percentUsed: 31, resetsAt: '2026-11-17T00:00:00Z' },
    { kind: 'five_hour', percentUsed: 50, resetsAt: '2026-11-14T02:00:00Z' },
  ]
  const merged = mergeWindows(prev, [{ kind: 'seven_day', percentUsed: 54 }], now)
  expect(merged.map(w => w.kind)).toEqual(['seven_day', 'seven_day_overage_included'])
  expect(rows({ windows: merged, contextWindow: 1, readAt: now }, now).map(r => r.label)).toEqual(['5시간', '7일', 'Fable'])
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(color(70)).toBe('warning')
  expect(color(90)).toBe('error')
  expect(bandParts(null)).toEqual([])
  const svg = paneSvg({ windows: [{ kind: 'five_hour', percentUsed: 12.5, resetsAt: 'x' }], contextWindow: 200000, readAt: now }, now)
  expect(svg).toContain('12.5%')
  expect(svg).not.toContain('NaN')
  expect(svg).not.toContain('흐른 시간')
  for (const loud of ['#5FB89A', '#E0A33A', '#E5484D']) expect(svg).not.toContain(loud)
  expect(svg).toContain('font-size="14"')
  expect(svg).toContain('font-size="17"')
})
