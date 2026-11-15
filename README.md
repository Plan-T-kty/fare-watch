# 항공·페리 최저가 알리미, 자동 확인판

하루 한 번 GitHub Actions가 Claude API로 항공권 가격 페이지를 읽고, 목표가 이하로 내려온 표가 있으면 알려 줘요.
같은 저장소가 GitHub Pages로 앱 화면도 보여 줘요. 휴대폰 홈 화면에 추가해서 쓰면 돼요.

Claude API 사용료는 `ANTHROPIC_API_KEY`로 넣은 키의 Console 조직에서 나가요. Claude 요금제에 딸린 월 API 크레딧을 그 조직에 연결해 두었다면 크레딧에서 빠져요.

## 돌아가는 순서

1. `.github/workflows/check.yml`이 매일 오전 10시 49분쯤(한국 시간) `checker/check.js`를 실행해요.
2. `check.js`가 `data/config.json`의 노선마다 가격 페이지 주소를 Claude API에 넘겨요. Claude가 web fetch 도구로 페이지를 읽고 거기 찍힌 운임을 목록으로 돌려줘요.
   - 읽는 곳: 카약 노선 페이지, 스카이스캐너 노선 페이지. 일본 국내선(후쿠오카→오키나와 같은 구간)은 트래블리스트 날짜별 최저 운임도 읽어요.
3. 코드가 목록을 걸러요. 페이지 글에 그 가격이 실제로 찍혀 있는지 대조하고, 지난 날짜, 경유편, 오는 날이 없는 왕복은 버려요.
4. 일본 공휴일이 낀 일정과 아닌 일정으로 나눠요. 이어 가는 여정(인천→후쿠오카→오키나와→인천)은 구간별 편도를 날짜가 이어지게 묶어 합계를 내요.
5. 결과를 `data/prices.json`, `data/status.json`에 저장하고 앱 화면을 다시 올려요. 앱 화면이 이 파일을 읽어요.
6. 알림이 켜진 노선이 목표가 이하면 알림을 보내요. 같은 표는 한 번만 알리고, 더 싼 표가 나오면 다시 알려요.

## 처음 한 번 할 일

1. **저장소에 올리기.** 이 폴더의 내용을 저장소 맨 위에 그대로 올려요. `.github` 폴더는 숨김 폴더라 끌어다 놓을 때 빠지기 쉬워요. 빠졌다면 GitHub에서 Add file → Create new file을 누르고 이름 칸에 `.github/workflows/check.yml`을 넣은 뒤 내용을 붙여 넣으면 돼요. GitHub 무료 요금제에서 Pages를 쓰려면 공개 저장소여야 해요.
2. **API 키 넣기.** Claude Console에서 API 키를 만들고, 저장소 Settings → Secrets and variables → Actions → New repository secret에 이름 `ANTHROPIC_API_KEY`로 넣어요.
   - 월 크레딧을 쓰려면 claude.ai의 Settings > Billing > API credits에서 연결한 Console 조직의 키여야 해요.
   - 실행 기록에 workspace가 필요하다는 오류가 나오면 워크스페이스 ID를 `ANTHROPIC_WORKSPACE_ID` 시크릿으로 하나 더 넣어요.
3. **앱 화면 켜기.** Settings → Pages → Build and deployment의 Source를 **GitHub Actions**로 바꿔요. 주소는 `https://<내 아이디>.github.io/<저장소 이름>/`이에요. Deploy from a branch로 두면 날마다 자동 저장되는 값이 화면에 반영되지 않아요.
4. **첫 실행.** Actions 탭 → 가격 확인 → Run workflow. 몇 분 뒤 실행 기록에 노선별로 읽은 결과가 나와요.
5. **홈 화면에 추가.** 휴대폰 브라우저로 3번 주소를 열고 홈 화면에 추가해요.

## 알림 받는 방법

| 방법 | 설정 | 비고 |
|---|---|---|
| ntfy (권장) | 시크릿 `NTFY_TOPIC` | 휴대폰에 ntfy 앱을 깔고 남이 짐작하기 어려운 주제 이름을 구독한 뒤 같은 이름을 시크릿에 넣어요. 알림을 누르면 예약 링크가 열려요. |
| GitHub | 따로 없음 | 저장소의 "최저가 알림" 이슈에 글이 달리고 저장소 주인이 멘션돼요. GitHub 모바일 앱을 깔고 알림을 켜 두면 휴대폰으로 와요. |
| 텔레그램 | 시크릿 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | 봇을 만들어 둔 경우에만. |

GitHub 알림을 끄려면 `data/config.json`의 `notify.githubIssue`를 `false`로 바꿔요.

## 노선과 목표가 바꾸기

- **앱에서.** 내 노선 화면 아래 "이 기기에서 노선 바꾸기"에 토큰을 넣으면 앱에서 바로 고칠 수 있어요. 토큰은 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens에서 이 저장소 하나만 고르고 Contents를 Read and write로 주면 돼요. Actions도 Read and write로 주면 "지금 가격 확인" 버튼이 눌려요. 토큰은 그 기기 브라우저에만 저장돼요.
- **파일로.** `data/config.json`을 GitHub에서 직접 고쳐도 돼요.

`data/config.json`의 노선 항목:

| 항목 | 뜻 |
|---|---|
| `from`, `to` | 공항이나 도시 코드. `SEL`은 인천·김포 모두 |
| `trip` | `rt` 왕복, `ow` 편도, `chain` 이어 가기 |
| `via`, `back` | 이어 가기에서 거쳐 가는 곳, 출발지로 돌아오는 편을 넣을지 |
| `target`, `targetHol` | 목표가(원). 공휴일 아닌 일정, 일본 공휴일 낀 일정. 0이면 그 종류는 알리지 않음 |
| `winFrom`, `winTo` | 이 기간에 출발하는 표만 봄. 비우면 전부 |
| `nights`, `viaNights` | 도착지와 거쳐 가는 곳에서 머물 밤 수 |
| `on` | 알림 켜기 |

그 밖의 설정: `model`(기본 `claude-haiku-5-5`), `maxContentTokens`(페이지 하나에서 읽는 양), `fx.jpy100`(환율을 받아 오지 못할 때 쓰는 100엔 값).

## 비용

- web fetch 도구 자체는 추가 요금이 없고, 읽어 온 페이지 글이 입력 토큰으로 계산돼요.
- 지금 노선 3개면 한 번에 페이지 11개를 읽어요. 페이지마다 최대 4만 토큰으로 잘라 읽으니 하루 입력이 많아야 50만 토큰쯤이에요. Haiku 5.5 요금(입력 100만 토큰당 0.10달러, 출력 0.50달러)으로 하루 5~6센트, 한 달 2달러 안팎으로 **추정**해요. 실제로 쓴 토큰 수는 매번 실행 기록 맨 아래와 `data/status.json`의 `usage`에 남아요.
- 월 크레딧을 다 쓰면 다음 달 크레딧이 들어올 때까지 요청이 멈춰요. Console에서 크레딧을 사거나 자동 충전을 켜 두지 않았다면 따로 결제되지 않아요.

## 알아 둘 점

- **읽지 못하는 사이트가 있을 수 있어요.** Claude API의 web fetch는 사이트가 막아 둔 주소나 자바스크립트로 그려지는 화면은 읽지 못해요. 그런 곳은 건너뛰고 `data/status.json`의 `errors`와 실행 기록에 이유를 남겨요. 한 곳도 읽지 못하면 그날 실행은 실패로 표시돼요.
- 가격은 검색 사이트에 최근 잡힌 값이에요. 좌석이 팔리면 달라지니 알림을 받으면 링크로 들어가 확인하세요.
- 엔화 운임은 환율 서비스(open.er-api.com)에서 받은 값으로 바꿔요. 받지 못하면 `fx.jpy100` 값을 써요.
- GitHub 예약 실행은 붐빌 때 몇 분에서 몇십 분 늦게 시작될 수 있어요.
- 노선이나 파일을 고치면(푸시) 가격 확인 없이 화면만 다시 올라가요. API 사용료는 예약 실행과 직접 실행 때만 나가요.
- 시각을 바꾸려면 `check.yml`의 `cron` 줄을 고쳐요. UTC 기준이라 한국 시간에서 9시간을 빼요.

## 파일

| 파일 | 하는 일 |
|---|---|
| `checker/check.js` | 가격 확인과 알림. 설치할 패키지 없이 Node만으로 돌아가요 |
| `core.js` | 공휴일 판정, 일정 분류, 구간 조합, 링크 만들기. 앱과 확인 코드가 같이 써요 |
| `index.html`, `app.js`, `mode.js` | 앱 화면 |
| `data/config.json` | 노선과 목표가 |
| `data/prices.json`, `data/status.json` | 확인 결과. 실행할 때마다 덮어써요 |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | 홈 화면에 추가했을 때 쓰는 파일 |
