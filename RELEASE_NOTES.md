# Branch Scout v0.1.0 pre-release

Branch Scout searches committed Git branch tips for a literal keyword and reports the full ref, commit hash, file, and line for each match. It searches local branches and stored remote-tracking refs with lazy fetching disabled.

- The terminal summary highlights a documentation-only baseline when another branch contains a code match. Repeated documentation locations are grouped with their branch and commit evidence.
- JSON provides individual matches and search coverage for scripts and agents. Code matches identify implementation candidates. Deployment requires separate evidence.
- A shared skill and project installer provide layouts for Codex, Claude Code, and Gemini CLI. The scanner needs Node.js 22+ and Git 2.45+ and uses no third-party packages.

## Try the demo

From the source directory, create a disposable repository with `node ./scripts/create-demo.mjs`, then pass the printed path to the scanner.

```text
node ./bin/branch-scout.mjs --repo "<demo-path>" --query telegramAlert --base main
```

The `main` tip mentions `telegramAlert` at `README.md:3`. The `feature/telegram-alerts` tip also has a code match at `src/alerts.mjs:1`.

## Verification for this candidate

- Windows integration tests passed 11 of 11. The demo ran in PowerShell and Windows Git Bash.
- The installed scanner ran from all three agent layouts. A Codex desktop session and a separate Claude Code session used the skill to find the demo results.
- Hosted macOS and Linux runs are pending. A fresh `codex exec` session on Windows could not launch its shell, and Gemini CLI listed the skill but could not authenticate a model session in the tested account configuration.

See `README.md` for shell and agent setup and `VALIDATION.md` for reproducible checks and the exact demo evidence.
