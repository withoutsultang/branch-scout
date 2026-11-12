import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDemo, demoGit } from '../scripts/create-demo.mjs';

const cli = fileURLToPath(new URL('../bin/branch-scout.mjs', import.meta.url));
const installer = fileURLToPath(new URL('../scripts/install-skill.mjs', import.meta.url));
const temp = realpathSync(tmpdir());
const fixtures = realpathSync(mkdtempSync(join(temp, 'branch scout tests 검증 ')));
after(() => {
  // Only delete the temporary directory created by this test process.
  assert.equal(dirname(realpathSync(fixtures)), temp);
  assert.ok(fixtures.slice(temp.length + 1).startsWith('branch scout tests 검증 '));
  rmSync(fixtures, { recursive: true, force: true });
});

const query = 'telegramAlert';
const feature = 'feature/telegram-alerts';

function runCli(repo, ...args) {
  const result = spawnSync(process.execPath, [cli, '--repo', repo, ...args], { encoding: 'utf8', windowsHide: true });
  assert.ifError(result.error);
  return result;
}

function scan(repo, literal, ...args) {
  const result = runCli(repo, `--query=${literal}`, '--json', ...args);
  assert.equal(result.stderr, '');
  return { exitCode: result.status, report: JSON.parse(result.stdout), stdout: result.stdout };
}

function snapshot(repo) {
  return [
    demoGit(repo, 'symbolic-ref', 'HEAD'),
    demoGit(repo, 'rev-parse', 'HEAD'),
    demoGit(repo, 'for-each-ref', '--format=%(refname) %(objectname)'),
    demoGit(repo, '--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all'),
    demoGit(repo, 'diff', '--no-ext-diff', '--binary'),
    demoGit(repo, 'diff', '--cached', '--no-ext-diff', '--binary'),
  ];
}

test('finds feature code beyond the main README and verifies each location with Git', () => {
  const repo = createDemo(fixtures);
  const before = snapshot(repo);
  const { exitCode, report, stdout } = scan(repo, query, '--base', 'main');
  assert.equal(exitCode, 0);
  assert.equal(report.status, 'complete');
  assert.equal(report.checkout.branch, 'main');
  assert.equal(report.baseline.branch, 'main');
  assert.deepEqual(report.matches.map(({ branch, kind, file, line }) => [branch, kind, file, line]), [
    [feature, 'documentation', 'README.md', 3],
    [feature, 'code', 'src/alerts.mjs', 1],
    ['main', 'documentation', 'README.md', 3],
  ]);
  for (const { ref, commit, file, line } of report.matches) {
    assert.equal(commit, demoGit(repo, 'rev-parse', '--verify', ref));
    assert.ok(demoGit(repo, 'show', `${commit}:${file}`).split('\n')[line - 1].includes(query));
  }
  const text = runCli(repo, '--query', query, '--base', 'main');
  assert.equal(text.status, 0);
  const lines = text.stdout.trimEnd().split('\n');
  assert.equal(lines[0], 'Comparison | "refs/heads/main" has documentation matches only. Code matches on 1 other branch.');
  const [featureDoc, featureCode, mainDoc] = report.matches;
  assert.deepEqual(lines.slice(lines.indexOf('Code candidates')), [
    'Code candidates',
    `  "${featureCode.file}":${featureCode.line}  "${featureCode.ref}" @ ${featureCode.commit}`,
    '',
    'Documentation matches',
    `  "${mainDoc.file}":${mainDoc.line}`,
    `    "${featureDoc.ref}" @ ${featureDoc.commit}`,
    `    "${mainDoc.ref}" @ ${mainDoc.commit}`,
  ]);
  assert.doesNotMatch(text.stdout + stdout, /Planned Telegram notification|export async function|bot\.sendMessage/);
  assert.deepEqual(snapshot(repo), before);
});

test('searches literal paths from the repository root across branch tips', () => {
  const repo = createDemo(fixtures);
  const literal = 'notes[1].md';
  for (const file of [literal, 'notes1.md']) writeFileSync(join(repo, file), `${query}\n`);
  demoGit(repo, '--literal-pathspecs', 'add', '--', literal, 'notes1.md');
  demoGit(repo, 'commit', '-m', 'Add notes with literal path characters');
  const subdirectory = join(repo, 'subdir');
  mkdirSync(subdirectory);

  const { exitCode, report } = scan(subdirectory, query, '--path', './src/', '--path', literal, '--path', 'src');
  assert.equal(exitCode, 0);
  assert.deepEqual(report.scope.paths, ['src', literal]);
  assert.deepEqual(report.matches.map(({ branch, file }) => [branch, file]), [
    [feature, 'src/alerts.mjs'],
    ['main', literal],
  ]);
  const text = runCli(repo, '--query', query, '--path', 'src', '--path', literal);
  assert.match(text.stdout, /^Comparison within selected paths /);
  assert.match(text.stdout, /^Paths     "src", "notes\[1\]\.md"$/m);
  for (const invalidPath of ['../src', '/src', 'C:/src', 'src\\alerts.mjs', '']) {
    const invalid = runCli(repo, '--query', query, `--path=${invalidPath}`);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /repository-relative/);
  }
});

test('the sample sends the notification through an injected bot without network access', async () => {
  const repo = createDemo(fixtures);
  demoGit(repo, 'switch', feature);
  const { telegramAlert } = await import(pathToFileURL(join(repo, 'src', 'alerts.mjs')).href);
  const calls = [];
  const receipt = await telegramAlert({ sendMessage: async (...args) => { calls.push(args); return { ok: true }; } }, 'demo-chat', 'ready');
  assert.deepEqual(calls, [['demo-chat', 'ready']]);
  assert.deepEqual(receipt, { ok: true });
});

test('keeps checkout and baseline separate and scans stored remote refs by unique commit', () => {
  const repo = createDemo(fixtures);
  demoGit(repo, 'switch', feature);
  demoGit(repo, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
  demoGit(repo, 'update-ref', 'refs/remotes/origin/alias', 'HEAD');
  demoGit(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const remoteCommit = demoGit(repo, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'Remote-only demo tip');
  demoGit(repo, 'update-ref', 'refs/remotes/origin/remote-only', remoteCommit);

  const before = snapshot(repo);
  const { exitCode, report } = scan(repo, query, '--base', 'refs/heads/main');
  assert.equal(exitCode, 0);
  assert.equal(report.checkout.branch, feature);
  assert.equal(report.baseline.branch, 'main');
  assert.notEqual(report.checkout.commit, report.baseline.commit);
  assert.equal(report.branches.length, 5);
  assert.equal(report.scope.uniqueCommits, 3);
  assert.equal(report.scope.searchedCommits, 3);
  assert.ok(!report.branches.some(({ ref }) => ref === 'refs/remotes/origin/HEAD'));
  assert.ok(report.matches.some((hit) => hit.branch === 'origin/alias' && hit.kind === 'code' && hit.commit === report.checkout.commit));
  assert.ok(report.matches.some((hit) => hit.branch === 'origin/remote-only' && hit.source === 'remote-tracking' && hit.commit === remoteCommit));
  assert.equal(scan(repo, query).report.baseline.ref, 'refs/remotes/origin/main');
  const text = runCli(repo, '--query', query, '--base', 'main');
  assert.match(text.stdout, /^Comparison .*Code matches on 3 other branches\./);
  assert.equal(text.stdout.split('"README.md":3').length, 2);
  assert.deepEqual(snapshot(repo), before);
});

test('reports unresolved and ambiguous baselines without suppressing matches', () => {
  const repo = createDemo(fixtures);
  demoGit(repo, 'branch', 'master');
  assert.deepEqual(scan(repo, query).report.baseline, { state: 'unresolved', reason: 'no-unambiguous-default' });
  const missing = scan(repo, query, '--base', 'does-not-exist');
  assert.equal(missing.exitCode, 0);
  assert.equal(missing.report.baseline.reason, 'branch-unavailable');
  assert.ok(missing.report.matches.length > 0);
  assert.match(runCli(repo, '--query', query, '--base', 'does-not-exist').stdout, /^Search complete/);
  demoGit(repo, 'branch', 'origin/main');
  demoGit(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.equal(scan(repo, query, '--base', 'origin/main').report.baseline.reason, 'ambiguous-branch');
  assert.equal(scan(repo, query, '--base', 'refs/remotes/origin/main').report.baseline.source, 'remote-tracking');
});

test('keeps different documentation lines separate and skips the summary for a mixed baseline', () => {
  const repo = createDemo(fixtures);
  assert.match(runCli(repo, '--query', query, '--base', feature).stdout, /^Search complete/);

  writeFileSync(join(repo, 'README.md'), `# Main\n\n${query}\n${query}\n`);
  writeFileSync(join(repo, 'settings.env'), `ENTRY_POINT=${query}\n`);
  demoGit(repo, 'add', '--', 'README.md', 'settings.env');
  demoGit(repo, 'commit', '-m', 'Add documentation and configuration matches');

  const text = runCli(repo, '--query', query, '--base', 'main');
  assert.equal(text.status, 0);
  assert.match(text.stdout, /^Search complete/);
  const main = demoGit(repo, 'rev-parse', 'refs/heads/main');
  const featureCommit = demoGit(repo, 'rev-parse', `refs/heads/${feature}`);
  assert.deepEqual(text.stdout.trimEnd().split('\n').slice(-8), [
    '  "README.md":3',
    `    "refs/heads/${feature}" @ ${featureCommit}`,
    `    "refs/heads/main" @ ${main}`,
    '  "README.md":4',
    `    "refs/heads/main" @ ${main}`,
    '',
    'Other matches',
    `  "settings.env":1  "refs/heads/main" @ ${main}`,
  ]);
});

test('distinguishes invalid input, a non-repository, and a successful search with zero hits', () => {
  const repo = createDemo(fixtures);
  for (const args of [[], ['--query', ' '], ['--query', 'two\nlines'], ['--query']]) {
    const result = runCli(repo, ...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.stdout, '');
  }
  const empty = scan(repo, 'telegramalert');
  assert.equal(empty.exitCode, 0);
  assert.equal(empty.report.status, 'complete');
  assert.deepEqual(empty.report.matches, []);
  const failed = scan(fixtures, query);
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.report.status, 'error');
  assert.equal(failed.report.issues[0].code, 'repository-unavailable');
});

test('searches literal Unicode text from a nested directory without printing matched values', () => {
  const repo = createDemo(fixtures);
  const file = '설정 폴더/알림 파일.env';
  const literal = '-알림[.*]';
  mkdirSync(join(repo, '설정 폴더'));
  writeFileSync(join(repo, file), `other\nKEY=${literal} private-demo-value ${literal}\n`);
  demoGit(repo, 'add', '--', file);
  demoGit(repo, 'commit', '-m', 'Add literal fixture');
  demoGit(repo, 'config', 'grep.lineNumber', 'false');
  demoGit(repo, 'config', 'grep.column', 'true');
  demoGit(repo, 'config', 'grep.patternType', 'perl');
  const nested = join(repo, '설정 폴더');
  const { exitCode, report, stdout } = scan(nested, literal);
  assert.equal(exitCode, 0);
  assert.deepEqual(report.matches.map((hit) => [hit.file, hit.line, hit.kind]), [[file, 2, 'other']]);
  assert.doesNotMatch(stdout, /private-demo-value/);
  assert.ok(scan(nested, query).report.matches.some((hit) => hit.file === 'README.md'));
});

test('ignores staged and unstaged text, untracked files, and worktree attributes', () => {
  const repo = createDemo(fixtures);
  writeFileSync(join(repo, 'README.md'), 'stagedOnly\n');
  demoGit(repo, 'add', '--', 'README.md');
  writeFileSync(join(repo, 'README.md'), 'worktreeOnly\n');
  writeFileSync(join(repo, 'untracked.js'), 'worktreeOnly\n');
  writeFileSync(join(repo, '.gitattributes'), '*.mjs -diff\n');

  const before = snapshot(repo);
  assert.deepEqual(scan(repo, 'stagedOnly').report.matches, []);
  assert.deepEqual(scan(repo, 'worktreeOnly').report.matches, []);
  assert.equal(scan(repo, query).report.matches.length, 3);
  assert.deepEqual(snapshot(repo), before);
});

test('reports a missing promisor blob as partial and keeps the successful tip results', () => {
  const repo = createDemo(fixtures);
  const localOrigin = createDemo(fixtures);
  const blob = demoGit(repo, 'rev-parse', `${feature}:src/alerts.mjs`);
  assert.match(blob, /^[0-9a-f]{40}$/);
  const missing = join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
  demoGit(repo, 'config', 'remote.origin.url', localOrigin);
  demoGit(repo, 'config', 'remote.origin.promisor', 'true');
  unlinkSync(missing);
  const before = snapshot(repo);

  const { exitCode, report, stdout } = scan(repo, query);
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'partial');
  assert.equal(report.scope.uniqueCommits, 2);
  assert.equal(report.scope.searchedCommits, 1);
  assert.deepEqual(report.matches.map((hit) => hit.branch), ['main']);
  assert.equal(report.issues[0].code, 'search-failed');
  assert.equal(report.issues[0].commit, demoGit(repo, 'rev-parse', feature));
  assert.deepEqual(report.issues[0].refs, [`refs/heads/${feature}`]);
  assert.ok(!stdout.includes(JSON.stringify(localOrigin).slice(1, -1)));
  assert.equal(existsSync(missing), false);
  const text = runCli(repo, '--query', query, '--base', 'main');
  assert.equal(text.status, 1);
  assert.match(text.stdout, /^Search partial/);
  assert.match(text.stdout, /Issue  Git grep could not complete this commit/);
  assert.deepEqual(snapshot(repo), before);
});

test('separates detached HEAD and an unborn branch from the searched tips', () => {
  const repo = createDemo(fixtures);
  demoGit(repo, 'switch', '--detach', feature);
  const detached = scan(repo, query);
  assert.equal(detached.exitCode, 0);
  assert.deepEqual(detached.report.checkout, { state: 'detached', branch: null, ref: null, commit: demoGit(repo, 'rev-parse', 'HEAD') });
  assert.equal(detached.report.baseline.branch, 'main');

  const unbornRepo = mkdtempSync(join(fixtures, 'empty '));
  demoGit(unbornRepo, 'init', '--template=', '--initial-branch=main');
  const unborn = scan(unbornRepo, query);
  assert.equal(unborn.exitCode, 0);
  assert.equal(unborn.report.checkout.state, 'unborn');
  assert.equal(unborn.report.checkout.commit, null);
  assert.equal(unborn.report.baseline.state, 'unresolved');
  assert.deepEqual(unborn.report.branches, []);
});

test('installs one portable skill for Codex, Gemini CLI and Claude Code', () => {
  const repo = createDemo(fixtures);
  const project = mkdtempSync(join(fixtures, 'skill install 설치 '));
  const expected = scan(repo, query).report;
  const install = (agent) => spawnSync(process.execPath, [installer, agent, project], { encoding: 'utf8' });

  for (const [agent, directory, message] of [
    ['codex', '.agents', 'Installed'],
    ['gemini', '.agents', 'Already installed'],
    ['claude', '.claude', 'Installed'],
  ]) {
    const result = install(agent);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.startsWith(message));
    const skill = join(project, directory, 'skills', 'branch-scout');
    assert.match(readFileSync(join(skill, 'SKILL.md'), 'utf8'), /^---\r?\nname: branch-scout\r?\n/);
    const scanResult = spawnSync(process.execPath, [
      join(skill, 'scripts', 'branch-scout.mjs'), '--repo', repo, '--query', query, '--json',
    ], { cwd: project, encoding: 'utf8' });
    assert.equal(scanResult.status, 0, scanResult.stderr);
    assert.deepEqual(JSON.parse(scanResult.stdout), expected);
  }

  const changed = join(project, '.claude', 'skills', 'branch-scout', 'SKILL.md');
  writeFileSync(changed, 'Local edits\n');
  const rejected = install('claude');
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /existing Branch Scout installation differs/);
  assert.equal(readFileSync(changed, 'utf8'), 'Local edits\n');
});
