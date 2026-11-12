# Branch Scout v0.1 검증 기록

2026-11-10 KST 기준의 v0.1.0 공개 후보 검증이다.

## OS별 검증

| 환경 | 동일 테스트 명령 | 실제 결과 |
| --- | --- | --- |
| Windows 빌드 26300, PowerShell 7.6.9, Node.js 26.13.0, Git 2.56.0.windows.3 | `node --test` | 11개 통과. 세 에이전트의 프로젝트 스킬 복사와 설치 경로의 스캐너 실행도 포함한다. README 터미널 예시를 실제 출력과 대조했다. |
| Windows Git Bash (MINGW64) | README의 Bash 데모 | 데모 통과. Windows의 Node.js와 Git을 사용했다. |
| GitHub Actions Windows | `node --test` | 11개 통과. Node.js 22.23.4, Git 2.56.0.windows.4. |
| GitHub Actions macOS | `node --test` | 11개 통과. Node.js 22.23.4, Git 2.56.0. |
| GitHub Actions Ubuntu | `node --test` | 11개 통과. Node.js 22.23.4, Git 2.56.0. |

첫 Actions 실행에서는 Windows의 Node.js 22.23.4에서 스킬 설치 테스트가 실패했다. 같은 버전으로 로컬에서 실패를 재현했고, 설치 파일을 각각 복사하도록 수정한 `99d9f20`에서 세 러너가 모두 통과했다. [첫 실행](https://github.com/withoutsultang/branch-scout/actions/runs/42754561047) · [수정 후 실행](https://github.com/withoutsultang/branch-scout/actions/runs/42754953135)

macOS와 Linux에서 직접 재현하려면 이 폴더 전체와 스킬 원본이 있는 숨김 폴더 `.agents`를 복사한 뒤 Bash 또는 Zsh에서 아래 명령을 실행한다. [GitHub Actions 설정](.github/workflows/test.yml)

```bash
node --version
git --version
node --test
demo="$(node ./scripts/create-demo.mjs)"
git --no-lazy-fetch -C "$demo" grep -n -F -e telegramAlert main --
node ./bin/branch-scout.mjs --repo "$demo" --query telegramAlert --base main
```

## 에이전트별 검증

| Windows 환경 | 설치 확인 | 검색 도구 실행 | 에이전트에서 스킬 호출 |
| --- | --- | --- | --- |
| Codex 데스크톱 / CLI 0.167.0-alpha.3.2 | 통과. `.agents/skills/branch-scout`에 복사했다. | 통과. 설치본 JSON에서 Git과 일치하는 위치 세 곳을 확인했다. | 작업 중인 데스크톱 세션의 스킬 목록에서 발견하고 지침에 따라 설치본 스캐너를 실행했다. 새 `codex exec` 세션은 스킬을 인식했으나 셸 정책 및 Windows Core 패키지 식별자 오류로 스캐너 실행 단계가 미검증이다. |
| Claude Code 2.1.312 | 통과. `.claude/skills/branch-scout`에 복사했다. | 통과. 설치본 JSON이 원본 스캐너의 결과와 일치했다. | 통과. 별도 Windows 호스트 세션의 시작 이벤트에 스킬이 표시됐고, `/branch-scout`로 설치본 스캐너를 실행해 세 위치의 ref·커밋·파일·줄을 문서와 코드 후보로 나눠 보고했다. |
| Gemini CLI 0.40.0 | 통과. `.agents/skills/branch-scout`에 복사했고 `gemini skills list`에 `branch-scout [Enabled]`가 표시됐다. | 통과. 설치본 JSON이 원본 스캐너의 결과와 일치했다. | 미검증. 실제 모델 세션이 인증 단계에서 `IneligibleTierError`와 `UNSUPPORTED_CLIENT`를 반환해 스킬 활성화와 검색까지 진행하지 못했다. |

## 같은 질문으로 비교

서로 다른 임시 저장소를 같은 데모 생성기로 만들고, 두 Claude Code 세션에 아래 질문을 사용했다. 설치한 쪽에는 `/branch-scout`를 앞에 붙였다.

> Find where telegramAlert is mentioned or implemented in this sample Git repository, with main as the baseline. Use read-only commands. Report each exact full branch ref, commit hash, file and line. Separate documentation mentions from code implementation candidates.

| 실행 | 실제 결과 |
| --- | --- |
| Git에서 `main`만 검색 | `main:README.md:3` 한 곳이 나왔다. |
| Claude Code, 스킬 미설치 | 초기 세션 목록에 `branch-scout`가 없었다. 직접 Git 명령을 사용해 아래 세 위치와 각 커밋을 모두 찾았다. |
| Claude Code, 스킬 설치 | 설치된 스캐너에서 `status: complete`, 검색한 커밋 2/2 및 아래 세 위치를 받았다. 최종 응답이 코드 일치를 구현 후보로 표현했다. |

| 종류 | 전체 브랜치 ref | 커밋 | 위치 |
| --- | --- | --- | --- |
| 문서 | `refs/heads/main` | `8d336cdebfc1a9947852f4fa46dd1b0706be9c01` | `README.md:3` |
| 문서 | `refs/heads/feature/telegram-alerts` | `d42dac7b1e1d8283afa8e6397dca11f8759d4d06` | `README.md:3` |
| 코드 | `refs/heads/feature/telegram-alerts` | `d42dac7b1e1d8283afa8e6397dca11f8759d4d06` | `src/alerts.mjs:1` |

세 위치는 `git grep -n`으로, 커밋은 `git rev-parse`로 대조했다.

## 에이전트 재현 절차

Branch Scout 폴더에서 PowerShell로 새 데모를 만든다. 각 에이전트를 독립적으로 확인할 때는 새 데모를 만든 뒤 해당 설치 명령을 한 줄만 실행한다.

```powershell
$demo = node ./scripts/create-demo.mjs
node ./scripts/install-skill.mjs codex "$demo"
node ./scripts/install-skill.mjs claude "$demo"
node ./scripts/install-skill.mjs gemini "$demo"

$scanner = Join-Path $demo '.agents/skills/branch-scout/scripts/branch-scout.mjs'
node $scanner --repo "$demo" --query=telegramAlert --base main --json
git --no-lazy-fetch -C "$demo" grep -n -F -e telegramAlert refs/heads/main refs/heads/feature/telegram-alerts --
git -C "$demo" rev-parse refs/heads/main refs/heads/feature/telegram-alerts
Set-Location -LiteralPath $demo
```

Claude Code만 설치했다면 `$scanner` 경로의 `.agents`를 `.claude`로 바꾼다. 기존 검증을 Bash 또는 Zsh에서 재현하려면 `--fictional` 없이 `demo="$(node ./scripts/create-demo.mjs)"`를 실행하고 `cd "$demo"`로 이동한다. 스캐너는 `node "$demo/.agents/skills/branch-scout/scripts/branch-scout.mjs" --repo "$demo" --query=telegramAlert --base main --json`으로 실행한다.

- Codex에서 데모 폴더를 열고 `$branch-scout`를 선택한 뒤 같은 질문을 보낸다. 별도 CLI 검증은 해당 폴더에서 `codex exec --sandbox read-only --ephemeral --json 'Use the $branch-scout skill. Where is telegramAlert mentioned or implemented? Use main as the baseline and cite the exact ref, commit, file and line.'`으로 재현할 수 있다. [Codex 스킬 문서](https://learn.chatgpt.com/docs/build-skills)
- Claude Code를 `claude`로 시작하고 `/branch-scout` 뒤에 같은 질문을 보낸다. 스킬 미설치 대조군은 별도의 새 데모에서 설치 단계를 건너뛰고 같은 질문을 보낸다. [Claude Code 스킬 문서](https://code.claude.com/docs/en/skills)
- Gemini CLI는 `gemini skills list`로 설치를 확인한다. 계정에 맞는 인증으로 `gemini`를 시작하고 `branch-scout` 사용을 명시한 뒤 같은 질문을 보낸다. 활성화와 읽기 전용 스캐너 실행 요청이 뜨면 내용을 확인한다. [Gemini CLI 인증 문서](https://geminicli.com/docs/get-started/authentication/)

## 공개 전 확인

- MIT 라이선스와 `Copyright (c) 2026 withoutsultang`을 확정했다. [LICENSE](LICENSE)
- Windows·macOS·Ubuntu의 Actions 통과 결과와 에이전트별 미검증 범위를 릴리스 노트에 반영했다. [v0.1.0 릴리스 노트](RELEASE_NOTES.md)
