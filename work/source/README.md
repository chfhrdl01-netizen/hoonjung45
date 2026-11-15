# 게임 소스 구조

`../base.html`은 화면 HTML 템플릿입니다. `manifest.json`은 기능별 소스의 결합 순서와 배포 버전을 관리합니다. 배포 파일을 직접 수정하지 않고 아래 원본을 수정한 뒤 빌드합니다.

| 수정할 내용 | 원본 파일 |
| --- | --- |
| 화면·입력 방식 판별, 모바일 참여 탭, 경기 정보 펼치기 | `../adaptive-ui.mjs` |
| PC·모바일 로비, 터치 안내, 최종 점수표 배치 | `../device-shell.css`, `../desktop-ui.css`, `../mobile-ui.css` |
| 방 생성·초대·실시간 연결 | `scripts/room-transport.js` |
| 기본 메뉴 화면·키보드 전투 | `scripts/app-core-and-combat.js` |
| 레이스·온라인 참가 상태·아이템 | `scripts/race-and-network.js` |
| 별도 커피·난투 게임 | `scripts/coffee-and-brawl.js` |
| 연습·식판·방 채팅 | `scripts/practice-and-party-games.js` |
| 30종 목표·득점·조작 안내, 생존·관전 상태 표시 | `../game-experience.mjs`, `../game-experience.css` |
| 현재 방향·체력·재사용 상태, 예측 보조 표시 제한 | `../game-visuals.mjs`, `../game-visuals.css` |
| 실제 이벤트의 파동·조각·판정·효과음 | `../game-impact.mjs`, `../game-impact.css` |
| 30종 판정·공유 트랙 좌표·생존 순위·팀 탁구·볼링·주차 | `../game-rules.mjs` |
| 랜덤 4판 + 대난투·누적 점수·경기 시간·수신 검증 | `../arcade-controller.mjs` |
| 오락실·순위·게임별 장면과 조작부 | `../arcade-ui.mjs`, `scripts/arcade-renderers.js` |
| 탑쌓기 시작 받침대, 실제 레일 코스, 볼링 화면 | `../stacker-clarity.css`, `../kart-track.css`, `../bowling-clarity.css` |
| 왕관 보유자·팀 탁구·세 갈래 반응·주차 대수전 화면 | `../crown-clarity.css`, `../pong-team.css`, `../reaction-challenge.css`, `../parking-rush.css` |
| 점심 점수전 시작·최종 결과 데이터 | `scripts/menu-session.js` |
| 최종 점수표·커피 주문 화면 | `scripts/scoreboard-and-coffee.js` |
| 메뉴 승낙·1회 이의 제기 | `../lunch-decision.mjs` |
| 시상식·수상 소감·점수전 종료 흐름 | `scripts/presentation-and-score-flow.js` |
| 커피 주문 엔딩·작은 별 이스터에그·공동 퇴장 | `../lunch-finale.mjs`, `../lunch-finale.css` |
| 학과 목록·캐릭터·선택 창 | `../departments.mjs`, `../department-avatars.mjs`, `../department-picker.mjs` |
| 모바일 방향키·1대1 본인 키패드 | `../mobile-controls.css`, `../duel-controls.mjs`, `../duel-controls.css` |
| 공통 화면·게임별·시상식 스타일 | `styles/`의 기능별 CSS 5개 |
| 로비 캐릭터·메뉴 장식 | `scripts/theme-decoration.js` |

## 빌드와 실행 순서

저장소 루트에서 실행합니다.

```sh
node work/build.mjs
```

`index.html`, `assets/styles-secret8.css`, `assets/app-secret8a.js`를 루트와 `dist/`에 동일하게 생성합니다. CSS·JS를 먼저 배포하고 HTML을 마지막에 반영합니다. 이전 자산은 캐시 방문자를 위해 보존합니다.

방 통신·메인 앱·화면 장식의 세 IIFE 범위를 유지합니다. 메인 앱의 소스 조각은 함수 호이스팅과 래퍼 순서에 의존하므로 각각 `<script>`나 ES 모듈로 직접 불러오지 않습니다. CSS의 `@source`/`@end-source` 경계 이름과 manifest의 순서도 보존합니다.

`check-source-structure.mjs`는 코드·스타일 순서, 경로, 문법, 루트와 `dist` 일치, QA 분리를 검사합니다. `node work/build-qa.mjs`로 생성한 상태 주입·장면 고정 화면은 개발용이며 공개 번들에 포함하지 않습니다.

## 상태를 수정할 때

- 캐릭터는 미선택으로 시작합니다. 유효한 직접 선택과 메뉴가 있어야 준비할 수 있고, 호스트에서도 검사합니다. 연습 선택은 방의 학과 상태와 분리합니다.
- 점수전은 중복 없는 랜덤 4판 뒤 전원 참여 대난투로 마칩니다. 피날레는 최대 30초이며 같은 배점입니다. 추가 결승·누적 점수 초기화가 없습니다.
- 생존 7종은 판 안에서 부활하지 않습니다. 탈락한 플레이어의 입력은 무시하지만 시리즈 참가 자격은 유지해 다음 게임에 모두 돌아옵니다. 내부 생존 정렬용 점수는 화면에 그대로 출력하지 않습니다.
- 탁구는 한 공을 사용하는 팀전입니다. 팀 득점·순위를 공유하고 인원 불균형 보정을 적용합니다. 기권과 재서브 때도 팀 상태를 함께 확인합니다.
- 예상 궤적·착지점·자동 타깃 강조를 다시 넣지 않습니다. 현재 방향과 실제 목표·위험 신호, 결과 피드백을 구분합니다.
- 엔딩의 `details`/`summary` 작은 별은 로컬 표시 상태입니다. 링크를 펼쳐도 공유 일정이 바뀌지 않고, 엔딩 생성·닫기·연결 종료 때 접힙니다. 건너뛰기와 자동 퇴장 규칙을 건드리지 않습니다.
- 효과는 실제 이벤트를 기준으로 발생시키고 반복 프레임·세계 전환·생존 시간 누적만으로 발동하지 않습니다. DOM 재사용, 효과음 OFF, 움직임 줄이기를 보존합니다.

## 화면을 수정할 때

기기별 표시 상태는 방·점수와 분리합니다. 기존 조작 버튼과 이벤트를 재사용하며, 초대 코드·닉네임·참여 동의는 탭을 바꿔도 보존합니다. 연결 중 입력 비활성 상태도 유지합니다.

정보 버튼의 `aria-expanded`·`aria-controls`를 맞추고 종료 화면에서는 전원 순위를 표시합니다. 일반 UI 버튼의 Space 동작을 게임 공격으로 가로채지 않으며, 화면·입력 방식 변경 시 눌린 입력을 해제합니다.

브라우저에서는 처음의 탑 받침대, 코스와 장애물의 좌표 일치, 볼링의 현재 핀 배치, 왕관 보유자 전환, 팀·주차 대수·반응 선택, 생존 탈락 후 관전과 다음 경기 복귀를 확인합니다. 가로·세로에서 버튼과 안내가 경기장을 가리지 않는지도 봅니다. 뷰포트 크기 변경은 실제 입력 방식이나 실기기 검사를 대신하지 않습니다.

## 관련 검사

| 영역 | 검사 파일 |
| --- | --- |
| 선택·준비 | `../check-character-ready.mjs`, `../check-practice-character.mjs`, `../check-department-avatars.mjs` |
| 생존·누적 순위·피날레 | `../check-survival-rounds.mjs`, `../check-points-series.mjs`, `../check-brawl-finale.mjs`, `../check-score-finish.mjs` |
| 탑·레일·볼링·왕관 | `../check-stacker-clarity.mjs`, `../check-kart-track.mjs`, `../check-bowling-skill.mjs`, `../check-crown-clarity.mjs` |
| 팀 탁구·반응·주차 | `../check-pong-teams.mjs`, `../check-reaction-challenge.mjs`, `../check-parking-rush.mjs` |
| 화면·임팩트·기기 | `../check-game-visuals.mjs`, `../check-game-experience.mjs`, `../check-game-impact.mjs`, `../check-device-ui.mjs` |
| 엔딩·시간·전체 규칙 | `../check-ending-locked.mjs`, `../check-arcade-clock.mjs`, `../check-game-rules.mjs` |

검사 명령과 이전 버전의 확인 기록은 루트 README를 참고합니다. quality7의 통과 개수·시뮬레이션 수·레이아웃 수치나 공개 멀티 기록을 secret8의 검증 결과로 해석하지 않습니다.
