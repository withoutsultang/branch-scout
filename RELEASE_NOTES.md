# Branch Scout v0.5.0

Branch Scout searches committed Git branch tips and reports the exact branch ref, commit hash, file, and line for each documentation mention or code match. It runs with Node.js 22+ and Git 2.45+ and has zero package dependencies.

- Search specific local or stored remote-tracking branches with repeatable `--ref` options. Use full refs to disambiguate shared short names. The report still identifies the checkout and comparison baseline independently.
- Limit the scan to literal files or directories with repeatable `--path` options. Select `--ignore-case` to match a keyword across capitalization variants.
- Use `--json` to pass matching locations and the selected search scope to scripts or the shared Codex, Claude Code, and Gemini CLI skill.
- Follow the README's 25-second fictional demo to reproduce a documentation mention on `main` and a code match on a feature branch.

## Try it

```text
git clone https://github.com/withoutsultang/branch-scout.git
cd branch-scout
node ./scripts/create-demo.mjs --fictional
```

Use the printed repository path in the search command.

```text
node ./bin/branch-scout.mjs --repo "<demo-path>" --query waypointalert --ignore-case --ref feature/waypoint-alerts --path src
```

The demo returns the code location `src/alerts.mjs:1` with its commit hash. Code matches identify candidates for inspection. Confirm behavior and deployment with separate evidence.

---

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

- Windows, macOS, and Ubuntu each passed 11 of 11 integration tests on GitHub Actions with Node.js 22.23.4. [GitHub Actions run](https://github.com/withoutsultang/branch-scout/actions/runs/42754953135)
- The demo also ran locally in Windows PowerShell and Git Bash.
- The installed scanner ran from all three agent layouts. A Codex desktop session and a separate Claude Code session used the skill to find the demo results.
- A fresh `codex exec` session on Windows could not launch its shell. Gemini CLI listed the skill, but the tested account configuration could not authenticate a model session.

See `README.md` for shell and agent setup and `VALIDATION.md` for reproducible checks and the exact demo evidence.
