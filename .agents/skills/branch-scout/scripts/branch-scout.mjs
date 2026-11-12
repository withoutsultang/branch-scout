#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { posix, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const usage = `Usage: node <path-to-branch-scout.mjs> --repo <path> --query <literal> [--base <branch>] [--ref <branch>]... [--path <file-or-directory>]... [--ignore-case] [--json]

Search committed text at local and stored remote-tracking branch tips.
Repeat --ref to select exact branch names or full refs.
Repeat --path to select literal files or directories relative to the repository root.
Use --option=value for values that start with a dash.
Exit codes: 0 complete (including zero matches), 1 incomplete or failed, 2 invalid arguments.`;

const localPrefix = 'refs/heads/';
const remotePrefix = 'refs/remotes/';
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const docExtensions = new Set(['.md', '.mdx', '.markdown', '.rst', '.adoc', '.asciidoc', '.org', '.rdoc']);
const codeExtensions = new Set([
  '.asm', '.bash', '.c', '.cc', '.clj', '.cpp', '.cs', '.css', '.dart', '.ex', '.exs', '.fs',
  '.go', '.h', '.hpp', '.html', '.java', '.js', '.jsx', '.kt', '.kts', '.lua', '.m', '.mjs', '.cjs',
  '.mm', '.php', '.pl', '.ps1', '.psm1', '.py', '.r', '.rb', '.rs', '.scala', '.sh', '.sql',
  '.svelte', '.swift', '.ts', '.tsx', '.vb', '.vue', '.zig', '.zsh',
]);

function gitEnvironment() {
  const env = { ...process.env };
  // Repo and config overrides inherited from a Git hook must not redirect --repo.
  const overrides = /^(?:GIT_(?:ALLOW_PROTOCOL|ALTERNATE_OBJECT_DIRECTORIES|ATTR_SOURCE|COMMON_DIR|CONFIG|CONFIG_COUNT|CONFIG_PARAMETERS|DIR|GLOB_PATHSPECS|GRAFT_FILE|ICASE_PATHSPECS|IMPLICIT_WORK_TREE|INDEX_FILE|LITERAL_PATHSPECS|NAMESPACE|NOGLOB_PATHSPECS|OBJECT_DIRECTORY|PREFIX|SHALLOW_FILE|WORK_TREE)|GIT_TRACE.*)$/i;
  for (const key of Object.keys(env)) {
    if (overrides.test(key)) delete env[key];
  }
  return { ...env, GIT_ALLOW_PROTOCOL: '', GIT_TRACE2: '0', GIT_TRACE2_EVENT: '0', GIT_TRACE2_PERF: '0' };
}

function git(args, cwd, env) {
  return spawnSync('git', [
    '--no-pager', '--no-optional-locks', '--no-replace-objects', '--no-lazy-fetch', '-c', 'core.fsmonitor=false', ...args,
  ], { cwd, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

function cleanExit(result, ...codes) {
  return !result.error && codes.includes(result.status) && result.stderr.length === 0;
}

function gitLine(result) {
  return decoder.decode(result.stdout).replace(/\r?\n$/, '');
}

function branch(ref, commit) {
  const local = ref.startsWith(localPrefix);
  return { ref, branch: ref.slice((local ? localPrefix : remotePrefix).length), commit, source: local ? 'local' : 'remote-tracking' };
}

function readRefs(result, report) {
  const aliases = new Map();
  // Git can return readable refs alongside a warning about a broken ref.
  const rows = result.stdout ?? Buffer.alloc(0);
  for (const row of rows.toString('latin1').split('\n').filter(Boolean)) {
    try {
      const [ref, commit, target] = decoder.decode(Buffer.from(row, 'latin1')).split('\0');
      if (!(ref.startsWith(localPrefix) || ref.startsWith(remotePrefix)) || !objectId.test(commit) || target === undefined) {
        throw new Error('Invalid ref record');
      }
      if (target) aliases.set(ref, target);
      else report.branches.push(branch(ref, commit));
    } catch {
      report.issues.push({ code: 'invalid-ref', message: 'A Git ref record could not be read.' });
    }
  }
  return aliases;
}

function readCheckout(run, report, bare) {
  if (bare) return { state: 'bare', branch: null, ref: null, commit: null };
  const headRef = run(['symbolic-ref', '--quiet', 'HEAD']);
  const headOid = run(['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (cleanExit(headRef, 0, 1) && cleanExit(headOid, 0, 1)) {
    try {
      const ref = headRef.status === 0 ? gitLine(headRef) : null;
      const commit = headOid.status === 0 ? gitLine(headOid) : null;
      if ((!ref || ref.startsWith(localPrefix)) && (!commit || objectId.test(commit)) && (ref || commit)) {
        const state = ref ? (commit ? 'branch' : 'unborn') : 'detached';
        return { state, branch: ref?.slice(localPrefix.length) ?? null, ref, commit };
      }
    } catch {
      // An undecodable ref cannot be shown as an exact branch name.
    }
  }
  report.issues.push({ code: 'head-unavailable', message: 'Git could not identify the checkout.' });
  return null;
}

function resolveBase(branches, aliases, requested, refsComplete) {
  if (requested) {
    const exact = branches.find(({ ref }) => ref === requested);
    if (exact) return { state: 'resolved', via: 'explicit', ...exact };
    const candidates = branches.filter(({ branch: name }) => name === requested);
    if (candidates.length === 1 && refsComplete) return { state: 'resolved', via: 'explicit', ...candidates[0] };
    const reason = candidates.length > 1 ? 'ambiguous-branch' : 'branch-unavailable';
    return { state: 'unresolved', reason };
  }
  if (!refsComplete) return { state: 'unresolved', reason: 'incomplete-ref-list' };

  const originHead = branches.find(({ ref }) => ref === aliases.get('refs/remotes/origin/HEAD'));
  if (originHead?.source === 'remote-tracking') return { state: 'resolved', via: 'stored-origin-head', ...originHead };
  const conventional = branches.filter(({ ref }) => ref === 'refs/heads/main' || ref === 'refs/heads/master');
  if (conventional.length === 1) return { state: 'resolved', via: 'local-convention', ...conventional[0] };
  return { state: 'unresolved', reason: 'no-unambiguous-default' };
}

function selectRefs(report, requestedRefs, refsComplete) {
  if (!requestedRefs.length) return true;

  const branches = report.branches;
  report.branches = [];
  const selected = new Set();
  for (const requested of requestedRefs) {
    const exact = branches.find(({ ref }) => ref === requested);
    if (exact) {
      selected.add(exact.ref);
      continue;
    }
    const candidates = branches.filter(({ branch: name }) => name === requested);
    if (candidates.length === 1 && refsComplete) {
      selected.add(candidates[0].ref);
      continue;
    }
    const value = JSON.stringify(requested);
    report.issues.push(candidates.length > 1
      ? { code: 'ambiguous-ref', message: `More than one branch matches ${value}. Supply its full ref.` }
      : { code: 'ref-unavailable', message: `Could not resolve ${value} to a single available branch.` });
    return false;
  }

  report.branches = branches.filter(({ ref }) => selected.has(ref));
  report.scope.refs = report.branches.map(({ ref }) => ref);
  return true;
}

function kindFor(file) {
  const name = posix.basename(file).toLowerCase();
  const extension = posix.extname(name);
  if (docExtensions.has(extension) || /^(readme|changelog|contributing|license|notice|authors|copying)(\.|$)/.test(name)) {
    return 'documentation';
  }
  if (codeExtensions.has(extension) || name === 'makefile' || name === 'dockerfile') return 'code';
  return 'other';
}

function normalizePath(path) {
  const normalized = posix.normalize(path).replace(/\/$/, '');
  if (posix.isAbsolute(path) || /^[a-z]:/i.test(path) || /[\\\0]/.test(path) ||
      path.split('/').includes('..') || normalized === '.') {
    throw new Error('Use --path with a repository-relative file or directory and forward slashes.');
  }
  return normalized;
}

function readMatches(stdout, commit) {
  const prefix = Buffer.from(`${commit}:`);
  const matches = [];
  let start = 0;
  // With -z -n, grep writes <tree>:<path> NUL <line> NUL <content> LF.
  // Decode only the location. File names may contain tabs, colons, or newlines.
  while (start < stdout.length) {
    const fileEnd = stdout.indexOf(0, start);
    const lineEnd = stdout.indexOf(0, fileEnd + 1);
    const end = stdout.indexOf(10, lineEnd + 1);
    if (fileEnd <= start + prefix.length || lineEnd <= fileEnd || end < 0 ||
        !stdout.subarray(start, start + prefix.length).equals(prefix)) {
      throw new Error('Invalid grep record');
    }
    const file = decoder.decode(stdout.subarray(start + prefix.length, fileEnd));
    const line = Number(stdout.toString('ascii', fileEnd + 1, lineEnd));
    if (!Number.isSafeInteger(line) || line < 1) throw new Error('Invalid line number');
    matches.push({ file, line, kind: kindFor(file) });
    start = end + 1;
  }
  return matches;
}

function searchTips(run, query, report) {
  const tips = new Map();
  for (const entry of report.branches) {
    if (!tips.has(entry.commit)) tips.set(entry.commit, []);
    tips.get(entry.commit).push(entry);
  }

  report.scope.uniqueCommits = tips.size;
  for (const [commit, branches] of tips) {
    const fail = (code, message) => {
      report.issues.push({ code, message, commit, refs: branches.map(({ ref }) => ref) });
    };
    const type = run(['cat-file', '-t', commit]);
    if (!cleanExit(type, 0) || type.stdout.toString().trim() !== 'commit') {
      fail('tip-unavailable', 'The branch tip is missing, unreadable, or does not point directly to a commit.');
      continue;
    }

    const result = run([
      '--literal-pathspecs', `--attr-source=${commit}`, 'grep', '-F', '-n', '-z', '-H', '-I', '--full-name', '--no-column',
      '--no-color', '--no-heading', '--no-break', '--no-textconv', '--no-recurse-submodules',
      ...(report.scope.ignoreCase ? ['-i'] : []), '-C', '0', '-e', query, commit, '--',
      ...(report.scope.paths ?? []),
    ]);
    if (!cleanExit(result, 0, 1) || (result.status === 1 && result.stdout.length > 0)) {
      const message = result.error?.code === 'ENOBUFS'
        ? 'Git grep exceeded the output buffer for this commit.'
        : 'Git grep could not complete this commit. Required objects may be missing or unreadable locally.';
      fail('search-failed', message);
      continue;
    }

    try {
      for (const hit of readMatches(result.stdout, commit)) {
        for (const entry of branches) report.matches.push({ ...entry, ...hit });
      }
      report.scope.searchedCommits++;
    } catch {
      fail('invalid-search-output', 'A Git match location could not be read.');
    }
  }
}

function scan({ repo, query, base, paths, ref: requestedRefs, 'ignore-case': ignoreCase }) {
  const report = {
    status: 'error',
    scope: { targets: ['local', 'remote-tracking'], snapshot: 'committed-tips', uniqueCommits: 0, searchedCommits: 0 },
    checkout: null,
    baseline: { state: 'unresolved', reason: 'repository-unavailable' },
    branches: [], matches: [], issues: [],
  };
  if (paths.length) report.scope.paths = paths;
  if (requestedRefs.length) report.scope.refs = [];
  if (ignoreCase) report.scope.ignoreCase = true;
  const env = gitEnvironment();
  let directory = resolve(repo);
  const run = (args) => git(args, directory, env);
  const repository = run(['rev-parse', '--is-bare-repository']);
  if (!cleanExit(repository, 0)) {
    report.issues.push({ code: 'repository-unavailable', message: 'Cannot open the repository. Check --repo, access, and Git 2.45+ on PATH.' });
    return report;
  }

  const bare = repository.stdout.toString().trim() === 'true';
  if (!bare) {
    const root = run(['rev-parse', '--show-toplevel']);
    try {
      if (!cleanExit(root, 0)) throw new Error('Missing worktree root');
      directory = gitLine(root);
    } catch {
      report.issues.push({ code: 'repository-unavailable', message: 'Cannot identify the repository root.' });
      return report;
    }
  }

  report.checkout = readCheckout(run, report, bare);
  const refs = run(['for-each-ref', '--sort=refname', '--format=%(refname)%00%(objectname)%00%(symref)', localPrefix, remotePrefix]);
  const refsComplete = cleanExit(refs, 0);
  if (!refsComplete) report.issues.push({ code: 'refs-incomplete', message: 'Git could not list all branch refs.' });
  const aliases = readRefs(refs, report);
  const allRefsRead = refsComplete && !report.issues.some(({ code }) => code === 'invalid-ref');
  report.baseline = resolveBase(report.branches, aliases, base, allRefsRead);
  if (!selectRefs(report, requestedRefs, allRefsRead)) return report;
  searchTips(run, query, report);
  report.status = report.issues.length === 0 ? 'complete' : 'partial';
  return report;
}

function formatText(report) {
  const quoted = JSON.stringify;
  const { scope, checkout, baseline, matches, issues } = report;
  const code = matches.filter(({ kind }) => kind === 'code');
  const baselineHits = matches.filter(({ ref }) => ref === baseline.ref);
  const lines = [];
  if (baselineHits.length && baselineHits.every(({ kind }) => kind === 'documentation') && code.length) {
    const branchCount = new Set(code.map(({ ref }) => ref)).size;
    const prefix = report.status === 'complete' ? 'Comparison' : 'Comparison among searched tips';
    const filters = [scope.refs && 'branches', scope.paths && 'paths'].filter(Boolean);
    const scopeLabel = filters.length ? ` within selected ${filters.join(' and ')}` : '';
    lines.push(`${prefix}${scopeLabel} | ${quoted(baseline.ref)} has documentation matches only. Code matches on ${branchCount} other ${branchCount === 1 ? 'branch' : 'branches'}.`);
  }
  lines.push(
    `Search ${report.status} | local and stored remote-tracking branch tips | ${report.branches.length} branches | ${scope.searchedCommits}/${scope.uniqueCommits} commits searched`,
    `Checkout  ${checkout?.state ?? 'unknown'}${checkout?.ref ? ` ${quoted(checkout.ref)}` : ''}${checkout?.commit ? ` @ ${checkout.commit}` : ''}`,
    baseline.state === 'resolved'
      ? `Baseline  ${quoted(baseline.ref)} @ ${baseline.commit} (${baseline.via})`
      : `Baseline  unresolved (${baseline.reason})`,
  );
  if (scope.paths) lines.push(`Paths     ${scope.paths.map((path) => quoted(path)).join(', ')}`);
  if (scope.refs) lines.push(`Refs      ${scope.refs.length ? scope.refs.map((ref) => quoted(ref)).join(', ') : '(none resolved)'}`);
  if (scope.ignoreCase) lines.push('Match     Case-insensitive');

  const location = ({ file, line }) => `${quoted(file)}:${line}`;
  const evidence = ({ ref, commit }) => `${quoted(ref)} @ ${commit}`;
  const writeLocations = (title, hits) => {
    if (!hits.length) return;
    lines.push('', title);
    for (const hit of hits) lines.push(`  ${location(hit)}  ${evidence(hit)}`);
  };
  const documents = new Map();
  const other = [];
  for (const match of matches) {
    if (match.kind === 'documentation') {
      const key = location(match);
      if (!documents.has(key)) documents.set(key, []);
      documents.get(key).push(evidence(match));
    } else if (match.kind === 'other') {
      other.push(match);
    }
  }
  writeLocations('Code candidates', code);
  if (documents.size) {
    lines.push('', 'Documentation matches');
    for (const [place, refs] of documents) {
      lines.push(`  ${place}`);
      for (const ref of refs) lines.push(`    ${ref}`);
    }
  }
  writeLocations('Other matches', other);
  if (!matches.length) lines.push(report.status === 'complete' ? 'No matches.' : 'No matches available from the completed searches.');
  for (const { message, commit, refs } of issues) {
    lines.push(`Issue  ${message}${commit ? ` @ ${commit} ${refs.map((ref) => quoted(ref)).join(', ')}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  let values;
  let paths;
  try {
    ({ values } = parseArgs({ options: {
      repo: { type: 'string' }, query: { type: 'string' }, base: { type: 'string' },
      path: { type: 'string', multiple: true, default: [] }, ref: { type: 'string', multiple: true, default: [] },
      'ignore-case': { type: 'boolean' }, json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    } }));
    if (!values.help && (!values.repo?.trim() || !values.query?.trim() || /[\0\r\n]/.test(values.query) || values.base === '')) {
      throw new Error('Invalid arguments');
    }
  } catch {
    process.stderr.write(`Provide --repo and a nonblank, single-line --query.\n\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  if (values.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  try {
    paths = [...new Set(values.path.map(normalizePath))];
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  const report = scan({ ...values, paths });
  process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : formatText(report));
  process.exitCode = report.status === 'complete' ? 0 : 1;
}

main();
