import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../.agents/skills/branch-scout/', import.meta.url));
const skillFiles = ['SKILL.md', 'scripts/branch-scout.mjs'];
const agentDirs = { codex: '.agents', claude: '.claude', gemini: '.agents' };
const usage = 'Usage: node ./scripts/install-skill.mjs <codex|claude|gemini> [project-directory]';

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
  if (!lstatSync(path).isDirectory()) throw new Error(`Expected a directory at ${path}`);
}

function install(agentDir, project) {
  const root = realpathSync(resolve(project));
  const config = join(root, agentDir);
  const skills = join(config, 'skills');
  ensureDirectory(config);
  ensureDirectory(skills);

  const destination = join(skills, 'branch-scout');
  const existing = lstatSync(destination, { throwIfNoEntry: false });
  if (existing) {
    const identical = existing.isDirectory() && skillFiles.every((file) => {
      const installed = join(destination, file);
      return lstatSync(installed, { throwIfNoEntry: false })?.isFile() &&
        readFileSync(installed).equals(readFileSync(join(source, file)));
    });
    if (identical) return `Already installed at ${destination}`;
    throw new Error(`An existing Branch Scout installation differs at ${destination}. Move it aside before installing.`);
  }

  const staging = mkdtempSync(join(skills, '.branch-scout-install-'));
  const stagedSkill = join(staging, 'branch-scout');
  try {
    for (const file of skillFiles) {
      const stagedFile = join(stagedSkill, file);
      mkdirSync(dirname(stagedFile), { recursive: true });
      copyFileSync(join(source, file), stagedFile);
    }
    renameSync(stagedSkill, destination);
  } finally {
    if (dirname(realpathSync(staging)) === realpathSync(skills)) {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  return `Installed at ${destination}`;
}

const [agent, project = '.', ...extra] = process.argv.slice(2);
if ((agent === '--help' || agent === '-h') && process.argv.length === 3) {
  process.stdout.write(`${usage}\n`);
} else if (!Object.hasOwn(agentDirs, agent) || !project.trim() || extra.length) {
  process.stderr.write(`${usage}\n`);
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${install(agentDirs[agent], project)}\n`);
  } catch (error) {
    process.stderr.write(`Could not install Branch Scout. ${error.message}\n`);
    process.exitCode = 1;
  }
}
