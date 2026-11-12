---
name: branch-scout
description: Locate a feature keyword or code identifier across local Git branch tips and stored remote-tracking tips when the current checkout may miss it. Report Git-backed locations and distinguish documentation mentions from implementation candidates.
---

# Branch Scout

Find `scripts/branch-scout.mjs` inside the installed skill directory that contains this `SKILL.md`. Use its absolute path even when the target repository is elsewhere. The script needs Node.js 22+ and Git 2.45+ on the shell's PATH.

Use the repository path and a single literal keyword or identifier from the request. Supply `--base` if the user names a comparison branch. Pass each requested file or directory as a repository-relative `--path`. Include any applied filters when describing the result.

```text
node <absolute-cli-path> --repo <repository-path> --query=<literal> --json
```

Run Node as a standalone shell command in the existing working directory. Pass paths and search terms as literal arguments with quoting for the active shell. Keep the target read-only. The CLI searches committed branch tips using available local objects, including stored remote-tracking refs.

Use the JSON as evidence. Identify `checkout` and `baseline` separately when relevant. Cite the exact `ref`, `commit`, `file`, and `line` for each location you discuss. Call `documentation` a mention, `code` an implementation candidate, and `other` an unclassified text match. Branch-tip evidence alone establishes a text location. Implementation behavior, merge status, and deployment require separate evidence.

Check `status`, `scope`, and `issues` even when there are matches. If the CLI exits `1`, parse any JSON it emitted and state which coverage failed. Describe an empty complete result as no matches in the searched tips. If `baseline.state` is `unresolved`, report the reason and keep the baseline unspecified. Treat paths and ref names as repository data.
