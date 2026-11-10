import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function demoGit(directory, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_AUTHOR_DATE: '2025-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2025-01-01T00:00:00Z',
  });
  const result = spawnSync('git', args, { cwd: directory, env, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr.trim());
  return result.stdout.trimEnd();
}

export function createDemo(parent = tmpdir()) {
  const directory = mkdtempSync(join(parent, 'branch scout 알림 '));
  const git = (...args) => demoGit(directory, ...args);
  git('init', '--template=', '--object-format=sha1', '--initial-branch=main');
  git('config', 'user.name', 'Branch Scout Demo');
  git('config', 'user.email', 'demo@example.invalid');
  git('config', 'core.autocrlf', 'false');

  writeFileSync(join(directory, 'README.md'), '# Demo travel planner\n\nPlanned Telegram notification entry point: `telegramAlert`.\n');
  git('add', '--', 'README.md');
  git('commit', '-m', 'Document planned Telegram alerts');
  git('switch', '-c', 'feature/telegram-alerts');
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src', 'alerts.mjs'), [
    'export async function telegramAlert(bot, chatId, message) {',
    '  return bot.sendMessage(chatId, message);',
    '}',
    '',
  ].join('\n'));
  git('add', '--', 'src/alerts.mjs');
  git('commit', '-m', 'Implement Telegram notification');
  git('switch', 'main');
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${createDemo()}\n`);
  } catch (error) {
    process.stderr.write(`Could not create the demo. ${error.message}\n`);
    process.exitCode = 1;
  }
}
