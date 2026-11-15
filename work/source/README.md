# 게임 소스 구조

`../base.html`은 화면의 HTML 템플릿입니다. 게임 코드와 CSS를 직접 붙여 넣지 않습니다.
`manifest.json`은 기능별 소스의 결합 순서와 배포 파일 이름을 관리합니다.

| 수정할 내용 | 원본 파일 |
| --- | --- |
| 화면·입력 방식 판별, 모바일 참여 탭, 경기 정보 펼치기 | `../adaptive-ui.mjs` |
| PC·모바일 로비, 폰트, 터치 안내, 모바일 최종 점수표 배치 | `../device-shell.css` |
| 넓은 PC의 큰 경기장·오른쪽 규칙 및 점수 영역 | `../desktop-ui.css` |
| 모바일 세로·가로 경기장, 엄지 조작부, 접을 수 있는 정보 영역 | `../mobile-ui.css` |
| 방 생성·초대·실시간 연결 | `scripts/room-transport.js` |
| 기본 메뉴 화면·키보드 전투 | `scripts/app-core-and-combat.js` |
| 레이스·온라인 참가 상태·아이템 | `scripts/race-and-network.js` |
| 별도 커피·난투 게임 | `scripts/coffee-and-brawl.js` |
| 연습·식판·방 채팅 | `scripts/practice-and-party-games.js` |
| 미니게임 30종 판정 | `../game-rules.mjs` |
| 5판 점수 계산·경기 시간·게임 진행 | `../arcade-controller.mjs` |
| 오락실·현재 및 최종 순위 표시 | `../arcade-ui.mjs`, `scripts/arcade-renderers.js` |
| 점심 점수전 시작·최종 결과 데이터 | `scripts/menu-session.js` |
| 최종 점수표·커피 주문 화면 | `scripts/scoreboard-and-coffee.js` |
| 메뉴 승낙·1회 이의 제기 | `../lunch-decision.mjs` |
| 시상식·수상 소감·점수전 종료 흐름 | `scripts/presentation-and-score-flow.js` |
| 커피 주문 엔딩·공동 퇴장 | `../lunch-finale.mjs`, `../lunch-finale.css` |
| 학과 목록·캐릭터·선택 창 | `../departments.mjs`, `../department-avatars.mjs`, `../department-picker.mjs` |
| 모바일 방향키·1대1 본인 키패드 | `../mobile-controls.css`, `../duel-controls.mjs`, `../duel-controls.css` |
| 공통 화면·게임별·시상식 스타일 | `styles/`의 기능별 CSS 5개 |
| 로비 캐릭터·메뉴 장식 | `scripts/theme-decoration.js` |

## 빌드

저장소 루트에서 `node work/build.mjs`를 실행합니다. 다음 배포 파일을 생성합니다.

- `index.html`: 화면 HTML
- `assets/styles-device6.css`: 순서를 보존한 CSS
- `assets/app-device6.js`: 게임 JavaScript와 기기별 UI

같은 파일을 `dist/`에도 생성합니다. 배포 파일을 직접 수정하면 다음 빌드에서 덮어씁니다.
외부 CSS·JS를 먼저 배포하고, 마지막에 `index.html`을 반영하면 기존 방문자의 파일 경로가 끊기지 않습니다.

## 실행 순서

브라우저에는 의존성 설치 없이 세 파일만 배포합니다. 방 통신, 메인 앱, 화면 장식의 기존 세 IIFE 실행 범위를 그대로 유지합니다.
메인 앱은 함수 호이스팅과 기존 기능 래퍼를 보존하기 위해 하나의 범위로 결합합니다. 소스 조각을 각각 `<script>`로 직접 불러오거나 ES 모듈로 취급하지 않습니다.
CSS의 `@source`/`@end-source` 주석은 원래 스타일 묶음을 찾는 경계이며, 파일 안에서 같은 경계 이름을 유지합니다.

`node work/check-source-structure.mjs`는 코드·CSS 순서, 배포 경로, 문법, `dist` 일치, QA 제외 여부를 검사합니다.
`node work/build-qa.mjs`는 개발용 테스트 화면만 별도로 만들며, 배포 파일에 테스트 코드를 넣지 않습니다.

## 기기별 UI 수정 시 확인할 것

`adaptive-ui.mjs`의 표시 설정은 이 기기에만 적용하며 방 상태·점수 계산과 분리합니다. 원래 방 입력과 게임 조작 버튼을 재사용하므로 이벤트 연결을 복제하지 않습니다. 초대 링크의 방 코드, 닉네임, 주문 참여 동의는 모바일 탭 전환 뒤에도 보존해야 합니다. 연결 중의 원래 입력 비활성 상태도 유지합니다.

모바일의 규칙·점수 영역을 접더라도 정보 버튼의 `aria-expanded`와 `aria-controls`를 맞추고, 종료 화면에서는 전원 순위를 표시합니다. 키보드 입력을 캡처하는 세 경로는 일반 UI 버튼의 기본 Space 동작을 허용해야 합니다. 화면·입력 방식 변경은 눌린 입력을 해제하며 게임 진행 상태를 새로 만들지 않습니다.

`node work/check-device-ui.mjs`는 화면 분류, 초대와 참여 탭, 키보드·포커스, 정보 표시, 상태 보존과 입력 해제를 검사합니다. 브라우저에서는 30종의 경기장·설명·조작부가 겹치지 않는지, 선택형 게임 버튼이 잘리는지, 최종 순위에 모든 참가자가 남는지 확인합니다. 뷰포트 크기 검사와 실제 터치 기기 검사는 구분하며, 단순 iframe 크기 변경은 입력 방식(coarse/fine) 자체를 바꾸지 않습니다.
