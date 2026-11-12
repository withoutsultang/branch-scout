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

export function createDemo(parent = tmpdir(), { fictional = false } = {}) {
  const example = fictional
    ? {
        title: 'Fictional trail planner', label: 'waypoint', entryPoint: 'waypointAlert',
        parameters: 'notifier, waypointId, message', delivery: 'notifier.send(waypointId, message)',
      }
    : {
        title: 'Demo travel planner', label: 'Telegram', entryPoint: 'telegramAlert',
        parameters: 'bot, chatId, message', delivery: 'bot.sendMessage(chatId, message)',
      };
  const directory = mkdtempSync(join(parent, 'branch scout 알림 '));
  const git = (...args) => demoGit(directory, ...args);
  git('init', '--template=', '--object-format=sha1', '--initial-branch=main');
  git('config', 'user.name', 'Branch Scout Demo');
  git('config', 'user.email', 'demo@example.invalid');
  git('config', 'core.autocrlf', 'false');

  writeFileSync(join(directory, 'README.md'), `# ${example.title}\n\nPlanned ${example.label} notification entry point: \`${example.entryPoint}\`.\n`);
  git('add', '--', 'README.md');
  git('commit', '-m', `Document planned ${example.label} alerts`);
  git('switch', '-c', `feature/${example.label.toLowerCase()}-alerts`);
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src', 'alerts.mjs'), [
    `export async function ${example.entryPoint}(${example.parameters}) {`,
    `  return ${example.delivery};`,
    '}',
    '',
  ].join('\n'));
  git('add', '--', 'src/alerts.mjs');
  git('commit', '-m', `Implement ${example.label} notification`);
  git('switch', 'main');
  return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--fictional')) {
      throw new Error('Usage: node ./scripts/create-demo.mjs [--fictional]');
    }
    process.stdout.write(`${createDemo(undefined, { fictional: args[0] === '--fictional' })}\n`);
  } catch (error) {
    process.stderr.write(`Could not create the demo. ${error.message}\n`);
    process.exitCode = 1;
  }
}
