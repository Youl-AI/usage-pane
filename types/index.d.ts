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
}

declare module 'claude-code' {
  interface PluginState {
    'usage-pane': { snapshot: Shaped<UsageSnapshot | null> }
  }
}
