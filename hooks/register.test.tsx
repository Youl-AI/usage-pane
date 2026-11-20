import { expect, test } from 'claude-code/testing'

import { bandParts, bar, color, elapsedPercent, leftText, mergeWindows, paceText, paneSvg, rows } from './register'
import { addTodos, clean, clearDone, folderLabel, group, MAX_TODOS, promptSection, sanitize, toggleTodo } from './todo'

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

function engine(on: any, rateLimits: unknown[], context: unknown = { tokens: 84000, window: 200000, percent: 42 }, store: Record<string, unknown> = {}) {
  on('store.get', (_: unknown, e: { key: string }) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'usage-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
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
  expect((await ui.find({ type: 'Text', text: /^초기화됨, 아직 사용 없음$/ }))?.text).toBe('초기화됨, 아직 사용 없음')
  expect(await ui.find({ type: 'Text', text: /^아직 값 없음$/ })).toBe(undefined)
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

test('한도 값을 받은 적이 있는데 5시간이 빠지면(초기화) 0%로 표시한다', async ($, on) => {
  engine(on, [{ kind: 'seven_day', percentUsed: 54, resetsAt: inMin(4560) }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const src = String((await pane.find({ type: 'Svg' }))?.props.source)
  expect(src).toContain('>0%<')
  expect(src).toContain('초기화됨, 아직 사용 없음')
  expect(src).toContain('앱이 아직 이 값을 넘겨주지 않음')
  await pane.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const line = (await band.findAll({ type: 'Text' })).map(t => t.text).filter(t => /(5시간|7일|Fable|컨텍스트)/.test(t)).join('')
  expect(line).toBe('5시간 0% · 7일 54% · Fable - · 컨텍스트 42%')
  await band.unmount()
})

test('한도 값을 한 번도 못 받았으면(API 키 등) 0%가 아니라 -', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const line = (await band.findAll({ type: 'Text' })).map(t => t.text).filter(t => /(5시간|7일|Fable|컨텍스트)/.test(t)).join('')
  expect(line).toBe('5시간 - · 7일 - · Fable - · 컨텍스트 42%')
  await band.unmount()
})

/* ---------- 할 일 ---------- */
const CWD = 'C:\\Users\\me\\Desktop\\excel'
const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)

test('할 일: 입력칸으로 적은 것만 들어가고, 묶음 제목 없이 한 목록으로 나온다', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, [{ kind: 'five_hour', percentUsed: 20 }], undefined, store)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'add-0', text: '- README 맞춤법 검사' })
  await ui.input({ key: 'add-1', text: '다른 PC에서 설치 확인' })
  const all = await texts(ui)
  const order = ['할 일', 'README 맞춤법 검사', '다른 PC에서 설치 확인'].map(t => all.indexOf(t))
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect(all).not.toContain('Claude가 적은 것')
  expect(all).not.toContain('내가 적은 것')
  expect(all).toContain('excel')
  expect(all.some((t: string) => t.includes('Users'))).toBe(false)
  expect(await ui.find({ type: 'Svg' })).toBeTruthy()
  const saved = store[`todos:${CWD}`] as any[]
  expect(saved.map(t => [t.text, t.by])).toEqual([
    ['README 맞춤법 검사', 'me'],
    ['다른 PC에서 설치 확인', 'me'],
  ])
  await ui.unmount()
})

test('할 일: 예전 버전에서 Claude가 넣은 항목은 지우지 않고 따로 보여 준다', async ($, on) => {
  engine(on, [], undefined, {
    [`todos:${CWD}`]: [
      { id: 'c1', text: '배포', by: 'claude', at: '2026-11-14T01:00:00Z', done: false },
      { id: 'm1', text: '인쇄 테스트', by: 'me', at: '2026-11-14T02:00:00Z', done: false },
    ],
  })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const all = await texts(ui)
  const order = ['Claude가 적었던 것', '배포', '내가 적은 것', '인쇄 테스트'].map(t => all.indexOf(t))
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect(await ui.find({ type: 'Button', key: 'x-c1' })).toBeTruthy()
  await ui.unmount()
})

test('할 일: 누르면 완료되어 줄이 그어지고, 완료 항목 지우기로 사라진다', async ($, on) => {
  const store: Record<string, unknown> = {
    [`todos:${CWD}`]: [{ id: 'a1', text: '인쇄 테스트', by: 'me', at: '2026-11-12T01:00:00Z', done: false }],
  }
  engine(on, [], undefined, store)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'clear-done' })).toBe(undefined)
  await ui.press({ key: 't-a1' })
  const struck = (await ui.findAll({ type: 'Text' })).find((t: any) => t.text === '인쇄 테스트')
  expect(struck?.props.strikethrough).toBe(true)
  expect(struck?.props.wrap).toBe('wrap')
  expect((await ui.find({ type: 'Button', key: 't-a1' }))?.props.label).toBe('☑')
  expect((store[`todos:${CWD}`] as any[])[0].done).toBe(true)
  await ui.press({ key: 'clear-done' })
  expect(store[`todos:${CWD}`]).toEqual([])
  expect(await texts(ui)).toContain('아직 할 일이 없습니다. 아래 입력칸에 적어 주세요.')
  await ui.unmount()
})

test('할 일: 입력칸에 같은 내용을 다시 적으면 넣지 않는다', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, [], undefined, store)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'add-0', text: '테스트 붙이기' })
  await ui.input({ key: 'add-1', text: '  테스트   붙이기 ' })
  expect((store[`todos:${CWD}`] as any[]).map(t => t.text)).toEqual(['테스트 붙이기'])
  await ui.unmount()
})

test('데스크톱 앱처럼 isInteractive=false로 와도 패널을 열고, Claude가 부를 도구는 등록하지 않는다', async ($, on) => {
  const opened: string[] = []
  const tools: string[] = []
  const store: Record<string, unknown> = {}
  on('store.get', (_: unknown, e: { key: string }) => ({ value: store[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => ((store[e.key] = e.value), { value: undefined }))
  on('command.register', () => ({ value: { command: 'usage-pane' } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: Date.now(), context: { window: 200000 }, rateLimits: [] } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('ui.open', (_: unknown, e: { id: string }) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('tool.register', (_: unknown, e: { name: string }) => {
    tools.push(e.name)
    return { value: { tool: 'mcp__usage-pane__todo_add' } }
  })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: false })
  expect(opened).toEqual(['usage'])
  expect(tools).toEqual([])
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await texts(ui)).includes('할 일')).toBe(true)
  await ui.unmount()
})

test('할 일: 터미널에서도 같은 순서로 그린다', async ($, on) => {
  engine(on, [], undefined, { [`todos:${CWD}`]: [{ id: 'b', text: '배포', by: 'claude', at: '2026-11-14T01:00:00Z', done: false }] })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const all = await texts(ui)
  expect(all.indexOf('컨텍스트')).toBeLessThan(all.indexOf('할 일'))
  expect(all).toContain('배포')
  await ui.unmount()
})

test('할 일 계산: 기호 걷기, 중복, 정렬, 저장값 정리, 첫머리 문구', () => {
  expect(clean('- [x] 하나')).toBe('[x] 하나')
  expect(clean('3) 셋\n넷')).toBe('셋 넷')
  expect(clean('☐ 체크')).toBe('체크')
  let r = addTodos([], ['가', '나'], 'me', 0)
  r = addTodos(r.list, ['가'], 'claude', 1)
  expect(r.added).toEqual([])
  const done = toggleTodo(r.list, r.list[0]!.id)
  expect(addTodos(done, ['가'], 'me', 2).added).toEqual(['가']) // 끝난 항목과 같은 내용은 다시 넣을 수 있다
  expect(group(done, 'me').map(t => t.text)).toEqual(['나', '가'])
  expect(clearDone(done).map(t => t.text)).toEqual(['나'])
  const many = addTodos([], Array.from({ length: MAX_TODOS + 5 }, (_, i) => `일 ${i}`), 'me', 3)
  expect(many.list.length).toBe(MAX_TODOS)
  expect(sanitize('깨짐')).toEqual([])
  expect(sanitize([{ id: 'x', text: ' 하나 ', by: '누구', done: 1 }, { nope: 1 }])).toEqual([{ id: 'x', text: '하나', by: 'me', at: new Date(0).toISOString(), done: true }])
  expect(folderLabel('C:\\Users\\me\\Desktop\\excel')).toBe('excel')
  expect(folderLabel('/home/me/proj')).toBe('proj')
  const p = promptSection(r.list, 'Desktop\\excel')
  expect(p).not.toContain('todo_add')
  expect(p).toContain('사용자가 직접 적는')
  expect(p).toContain('남아 있던 할 일 2개')
  expect(promptSection([], 'x')).toContain('지금 남은 할 일은 없다')
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
  expect(svg).toContain('@media (prefers-color-scheme: light)')
  expect(svg).toContain('.text{fill:#E4E1D8}')
  expect(svg).toContain('.text{fill:#2F2E2A}')
  expect(svg).not.toMatch(/fill="#/)
  expect(svg).toContain('font-size="14"')
  expect(svg).toContain('font-size="17"')
})
