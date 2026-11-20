/* 할 일 목록 계산. 화면·저장소와 무관한 순수 함수만 둔다. */

export type Todo = {
  id: string
  text: string
  /** 누가 적었나 */
  by: 'me' | 'claude'
  /** 적은 시각(ISO) */
  at: string
  done: boolean
}

export const MAX_TODOS = 200
const MAX_TEXT = 200

function norm(t: string): string {
  return t.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** 앞의 기호·번호("- ", "1. ", "☐ ")를 걷어 내고 한 줄로 */
export function clean(t: string): string {
  return t
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*(?:[-*•·☐☑✓✔]|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
}

/** 새 항목을 더한다. 빈 줄과, 아직 안 끝난 같은 내용은 건너뛴다. 결과와 실제로 더한 문장을 돌려준다 */
export function addTodos(list: Todo[], texts: string[], by: Todo['by'], now: number): { list: Todo[]; added: string[]; skipped: string[] } {
  const open = new Set(list.filter(t => !t.done).map(t => norm(t.text)))
  const added: string[] = []
  const skipped: string[] = []
  const next = [...list]
  texts.forEach((raw, i) => {
    const text = clean(raw)
    if (!text) return
    if (open.has(norm(text))) {
      skipped.push(text)
      return
    }
    open.add(norm(text))
    next.push({ id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`, text, by, at: new Date(now).toISOString(), done: false })
    added.push(text)
  })
  // 너무 많으면 오래된 완료 항목부터 버린다
  while (next.length > MAX_TODOS) {
    const k = next.findIndex(t => t.done)
    next.splice(k >= 0 ? k : 0, 1)
  }
  return { list: next, added, skipped }
}

export function toggleTodo(list: Todo[], id: string): Todo[] {
  return list.map(t => (t.id === id ? { ...t, done: !t.done } : t))
}

export function removeTodo(list: Todo[], id: string): Todo[] {
  return list.filter(t => t.id !== id)
}

export function clearDone(list: Todo[]): Todo[] {
  return list.filter(t => !t.done)
}

/** 묶음 안 순서: 안 끝난 것(적은 순) 먼저, 끝난 것은 아래로 */
export function group(list: Todo[], by: Todo['by']): Todo[] {
  return list.filter(t => t.by === by).sort((a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at))
}

/** "11/14" */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : ''
}

/** 패널 제목 옆에 보일 폴더 이름: 마지막 폴더 하나(사용자 이름 같은 앞부분은 보이지 않게) */
export function folderLabel(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}

/** 저장된 값이 깨졌거나 옛 모양이면 쓸 수 있는 항목만 남긴다 */
export function sanitize(v: unknown): Todo[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((t): t is Todo => !!t && typeof t === 'object' && typeof (t as Todo).id === 'string' && typeof (t as Todo).text === 'string')
    .map((t): Todo => ({ id: t.id, text: clean(t.text), by: t.by === 'claude' ? 'claude' : 'me', at: typeof t.at === 'string' ? t.at : new Date(0).toISOString(), done: !!t.done }))
    .filter(t => t.text)
    .slice(-MAX_TODOS)
}

/** 새 세션 첫머리에 넘길 한 단락: 읽기만 한다. Claude가 목록을 바꿀 길은 없다 */
export function promptSection(list: Todo[], folder: string): string {
  const open = list.filter(t => !t.done)
  const lines = [
    `# 할 일 목록 (usage-pane, ${folder})`,
    '사용자의 사용량 패널 아래에 이 작업 폴더의 할 일 목록이 있다. 사용자가 직접 적는 메모이고, Claude는 여기에 항목을 넣거나 고칠 수 없다. 참고로만 본다.',
  ]
  if (open.length) {
    lines.push(`이 세션을 시작할 때 남아 있던 할 일 ${open.length}개:`)
    for (const t of open.slice(0, 30)) lines.push(`- ${t.text} (${t.by === 'claude' ? 'Claude가 적음' : '사용자가 적음'}, ${shortDate(t.at)})`)
    if (open.length > 30) lines.push(`- 외 ${open.length - 30}개`)
  } else {
    lines.push('지금 남은 할 일은 없다.')
  }
  return lines.join('\n')
}
