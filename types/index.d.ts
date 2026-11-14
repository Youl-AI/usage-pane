export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type UsageSnapshot = {
  /** 5시간·7일 등 사용량 한도. 구독이 아니거나 첫 응답 전이면 빈 배열 */
  windows: UsageWindow[]
  /** 컨텍스트 창 사용률(0~100), 첫 응답 전이면 없음 */
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  /** 이 세션의 누적 비용(달러), 엔진이 기록하지 않으면 없음 */
  costUsd?: number
  /** 마지막으로 값을 읽은 시각(ms) — 남은 시간 표시를 다시 그리는 데 쓴다 */
  readAt: number
  /** 이 세션에서 한도 값을 한 번이라도 받았는지. 받았는데 5시간·7일이 빠지면 초기화된 것으로 보고 0%로 표시한다 */
  sawLimits?: boolean
}

export type TodoItem = { id: string; text: string; by: 'me' | 'claude'; at: string; done: boolean }
/** 이 세션 작업 폴더의 할 일 목록(저장은 $.store의 `todos:<cwd>`, 여기는 화면용 사본) */
export type TodoState = { cwd: string; items: TodoItem[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-pane': { snapshot: Shaped<UsageSnapshot | null>; todos: Shaped<TodoState | null> }
  }
}
