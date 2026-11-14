# usage-pane

Claude Code에서 사용량 한도와 대화 컨텍스트 사용률을 늘 보이게 하는 mod입니다.
(A Claude Code mod that keeps your 5-hour, 7-day and Fable usage limits and context usage on screen.)

## 보이는 것

- **옆 패널 "사용량"**: 5시간 한도, 7일 한도, Fable 한도, 대화 컨텍스트를 막대로 보여 줍니다.
  - 막대 위의 눈금은 그 한도 기간 중 지금까지 흐른 시간입니다. 그래서 "시간보다 10%p 빠름", "24%p 여유"처럼 지금 속도로 한도 안에 버틸 수 있는지 함께 알려 줍니다.
  - 초기화까지 남은 시간도 나옵니다.
  - 70% 이상이면 노랑, 90% 이상이면 붉은 계열로 바뀝니다.
- **입력창 위 한 줄**: `5시간 86% · 7일 54% · Fable - · 컨텍스트 42%`
- 패널을 닫았으면 `/usage-pane`으로 다시 엽니다.

데스크톱 앱에서는 패널을 그림(SVG)으로 그리고, 터미널에서는 같은 내용을 글자로 보여 줍니다.

## 설치

Claude Code 터미널 세션의 입력창에서:

```
/plugin install usage-pane --marketplace Youl-AI/usage-pane
```

`Add marketplace?`가 나오면 `y`, 이어서 설치 범위(기본값 user)를 Enter로 고릅니다.

셸에서:

```
claude plugin install usage-pane --marketplace Youl-AI/usage-pane
```

데스크톱 앱(`/plugin` 명령이 안 되는 곳): 입력창 옆 **+** → **Plugins** → **Add marketplace**에 `Youl-AI/usage-pane` 입력 → **Add plugin**.

설치 후 새로 여는 세션부터 패널이 뜹니다. 데스크톱 앱은 한 번 다시 시작해 주세요.

## 알아둘 점

- **Claude Code 최신 버전이 필요합니다.** 이 mod는 hooks 모듈 방식이라 옛 버전에서는 읽지 못합니다. 2.1.321에서 확인했고, 2.1.220은 읽지 못했습니다.
- **구독(Pro/Max) 로그인일 때만** 한도 값이 나옵니다. API 키로 쓰면 "아직 값 없음"으로 표시됩니다.
- 한도 %는 Claude가 답할 때마다 갱신됩니다. 답이 없는 동안에는 남은 시간과 흐른 시간 눈금만 1분마다 움직입니다.
- **Fable 칸**: Claude Code(2.1.321 기준)가 Fable 한도 값을 mod에 넘겨주지 않아서 "앱이 아직 이 값을 넘겨주지 않음"으로 나옵니다. 앱이 이 값을 넘겨주기 시작하면 코드 수정 없이 표시됩니다.
- 패널 색은 화면이 다크면 밝은 색, 라이트면 어두운 색으로 저절로 바뀝니다(SVG의 `prefers-color-scheme`). 입력창 위 한 줄은 양쪽 바탕에서 다 읽히는 중간 밝기 색을 씁니다. 글꼴은 Windows의 Bahnschrift와 맑은 고딕을 쓰고, 없으면 시스템 글꼴로 대신합니다.
- 패널 위치(오른쪽 등)는 앱이 정합니다.

## 지우기

```
claude plugin uninstall usage-pane@usage-pane
```

## 라이선스

MIT
