# Branch Scout v0.1

A feature can be mentioned in the README on `main` while its code lives on another branch. Branch Scout searches committed branch tips from your current checkout and shows where each match came from.

```text
Comparison | "refs/heads/main" has documentation matches only. Code matches on 1 other branch.
Search complete | local and stored remote-tracking branch tips | 2 branches | 2/2 commits searched
Checkout  branch "refs/heads/main" @ 8d336cdebfc1a9947852f4fa46dd1b0706be9c01
Baseline  "refs/heads/main" @ 8d336cdebfc1a9947852f4fa46dd1b0706be9c01 (explicit)

Code candidates
  "src/alerts.mjs":1  "refs/heads/feature/telegram-alerts" @ d42dac7b1e1d8283afa8e6397dca11f8759d4d06

Documentation matches
  "README.md":3
    "refs/heads/feature/telegram-alerts" @ d42dac7b1e1d8283afa8e6397dca11f8759d4d06
    "refs/heads/main" @ 8d336cdebfc1a9947852f4fa46dd1b0706be9c01
```

## Try it in 30 seconds

From this folder, use **Node.js 22+** and **Git 2.45+** on `PATH`. The scanner uses Node.js and Git with zero package dependencies. The demo creates a fresh temporary repository with spaces and Korean characters in its path and leaves it on `main`.

**Windows PowerShell**

```powershell
$demo = node ./scripts/create-demo.mjs
git --no-lazy-fetch -C "$demo" grep -n -F -e telegramAlert main --
node ./bin/branch-scout.mjs --repo "$demo" --query telegramAlert --base main
```

**macOS or Linux (Bash or Zsh)**

```bash
demo="$(node ./scripts/create-demo.mjs)"
git --no-lazy-fetch -C "$demo" grep -n -F -e telegramAlert main --
node ./bin/branch-scout.mjs --repo "$demo" --query telegramAlert --base main
```

The first command that searches shows `main:README.md:3` only. Branch Scout also finds the code at `feature/telegram-alerts:src/alerts.mjs:1`. The documentation section groups hits at the same path and line and lists each branch and commit underneath. The demo's test calls the notification function with a fake bot. In other repositories, code hits identify implementation candidates and deployment requires separate evidence.

Verify the sample's code location directly with Git.

```text
git --no-lazy-fetch -C "$demo" grep -n -F -e telegramAlert d42dac7b1e1d8283afa8e6397dca11f8759d4d06 -- src/alerts.mjs
```

## Use the skill in an agent

With your agent installed and signed in, run one installer command from the Branch Scout folder. Both shells above set `$demo`. For another project, substitute its path for `"$demo"`.

| Agent | Install the project skill | Start in the target directory | Invoke |
| --- | --- | --- | --- |
| [Codex](https://learn.chatgpt.com/docs/build-skills) | `node ./scripts/install-skill.mjs codex "$demo"` | `codex` or open the folder in Codex | Select `$branch-scout` and submit the question below. |
| [Claude Code](https://code.claude.com/docs/en/skills#choose-where-skills-load) | `node ./scripts/install-skill.mjs claude "$demo"` | `claude` | Prefix the question with `/branch-scout`. |
| [Gemini CLI](https://geminicli.com/docs/cli/skills/#discovery-tiers) | `node ./scripts/install-skill.mjs gemini "$demo"` | `gemini` | Ask it to use the `branch-scout` skill, then submit the question. Use `/skills list` to check discovery and approve activation if prompted. |

Open the demo directory with `Set-Location -LiteralPath $demo` in PowerShell or `cd "$demo"` in Bash or Zsh. Use this question and the invocation for your agent.

> Where is telegramAlert mentioned or implemented in this repository? Use main as the baseline. Cite each exact branch ref, commit hash, file and line. Separate documentation mentions from code candidates. Keep the repository read-only.

Codex and Gemini CLI share `.agents/skills/branch-scout`. Claude Code uses `.claude/skills/branch-scout`. The installer copies the [complete skill](.agents/skills/branch-scout), including the scanner. It preserves existing copies with local edits. To update a different copy, move it aside and rerun the installer. The agent session needs permission to read the target and run Node.js and Git.

## Search your own repository

```text
node ./bin/branch-scout.mjs --repo "../my project" --query telegramAlert --base main --json
```

- `--query` accepts one case-sensitive literal substring on a single line. Use `--query=<value>` when it begins with a dash.
- `--base` labels a comparison branch. Search still covers all enumerated tips. Use a full ref such as `refs/heads/main` when a short name is ambiguous. The default uses the stored `origin/HEAD` target or the only local branch named `main` or `master`. Otherwise the baseline is unresolved.
- Plain text highlights a documentation-only baseline when code matches on another branch. JSON keeps individual match records and includes `status`, `scope`, `checkout`, `baseline`, `branches`, `matches`, and `issues`. Each match contains `ref`, `branch`, `commit`, `source`, `file`, `line`, and `kind`. Both formats report locations and omit matched lines, config values, and remote URLs.

| Exit code | Meaning |
| --- | --- |
| `0` | Completed within scope, including zero matches. An unresolved baseline is reported separately. |
| `1` | The scan was partial or could not start. Check `issues` and the searched commit count. |
| `2` | Invalid arguments. Usage is printed to stderr. |

## Scope and verification

Branch Scout searches committed snapshots from local branches and stored remote-tracking branches. Stored refs may be stale. The scanner reads each unique commit once and attributes hits to every direct ref that points to it. It disables lazy fetching and reports missing objects as incomplete coverage. Worktree edits, the index, history, tags, submodules, and binary files are outside the scan. Classification uses filenames and extensions. A commit exceeding the 16 MiB Git output buffer is reported as incomplete. See the [Git command documentation](https://git-scm.com/docs/git/2.45.0) and the [git grep manual](https://git-scm.com/docs/git-grep).

```text
node --test
```

The tests create disposable repositories, verify locations with Git, check read-only behavior, and run the scanner from all three installed skill paths. The [GitHub Actions matrix](.github/workflows/test.yml) defines the same suite for Windows, macOS, and Linux. See the [validation notes (Korean)](VALIDATION.md) for observed results and the procedure for reproducing an agent session.

## License

Branch Scout is available under the [MIT License](LICENSE).
