# Claude Usage Monitor

Windows 시스템 트레이 + 태스크바에서 Claude Code 사용량을 실시간으로 모니터링하는 앱입니다.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white)

## 주요 기능

- **태스크바 위젯**: 5시간/7일 사용량을 원형 프로그레스 링으로 실시간 표시
- **팝업 대시보드**: 위젯 클릭 시 세부 사용량, 리셋 시각, 카운트다운 타이머 확인
- **API 기반 정확한 데이터**: Anthropic API에서 실제 rate limit 사용률(%) 직접 조회
- **사용량 색상 표시**: 초록(~50%) → 노랑(50~80%) → 빨강(80%~)
- **시스템 트레이**: Claude 아이콘 + 우클릭 메뉴 (시작 시 실행, 종료)
- **새로고침**: 팝업에서 수동 새로고침 가능 (자동 30초 주기)
- **Windows 알림**: 임계값 초과 시 토스트 알림

## 요구사항

- Windows 10/11
- [Node.js](https://nodejs.org/) v18 이상
- **Claude Code가 설치되어 있고 로그인된 상태** (`~/.claude/.credentials.json` 필요)

## 설치 및 실행

```bash
# 클론
git clone https://github.com/whddnjs/claude-usage-monitor.git
cd claude-usage-monitor

# 의존성 설치
npm install

# 실행
npm start
```

## 빌드 (Portable EXE)

```bash
npm run build
```

`dist/` 폴더에 `Claude Usage Monitor-1.0.0-portable.exe`가 생성됩니다.

## 작동 방식

1. `~/.claude/.credentials.json`의 OAuth 토큰을 사용하여 Anthropic API에 경량 요청을 보냅니다
2. 응답 헤더에서 `anthropic-ratelimit-unified-5h-utilization`, `anthropic-ratelimit-unified-7d-utilization` 값을 읽어옵니다
3. 30초마다 자동 갱신되며, 팝업에서 수동 새로고침도 가능합니다

## 프로젝트 구조

```
claude-usage-monitor/
├── src/
│   ├── main/
│   │   ├── index.js            # Electron 앱 진입점
│   │   ├── tray.js             # 시스템 트레이
│   │   ├── taskbar-widget.js   # 태스크바 위젯 + 팝업
│   │   ├── rate-limit.js       # Anthropic API rate limit 조회
│   │   ├── parser.js           # .claude.json 파싱
│   │   ├── watcher.js          # 파일 변경 감시
│   │   ├── store.js            # 사용량 데이터 저장
│   │   └── notifier.js         # Windows 알림
│   ├── preload.js
│   ├── preload-widget.js
│   ├── preload-popup.js
│   └── renderer/
│       ├── widget.html/js      # 태스크바 위젯 UI
│       ├── popup.html/js       # 팝업 대시보드 UI
│       └── index.html/css/js   # 메인 대시보드 UI
├── assets/
│   └── claude-favicon.ico      # 트레이 아이콘
├── package.json
└── electron-builder.yml
```

## 라이선스

MIT
