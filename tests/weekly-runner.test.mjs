import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const runner = readFileSync(new URL('../scripts/weekly-research.sh', import.meta.url), 'utf8');

function fixture(t, mode = 'allowed') {
  const directory = mkdtempSync(join(tmpdir(), 'bando-weekly-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const project = join(directory, 'project');
  const remote = join(directory, 'remote.git');
  const state = join(directory, 'state');
  const calls = join(directory, 'fake-codex-calls');
  const fakeCodex = join(directory, 'fake-codex');
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    XDG_STATE_HOME: state,
    BANDO_CODEX_BIN: fakeCodex,
    BANDO_FAKE_MODE: mode,
    BANDO_FAKE_CALLS: calls,
  };
  mkdirSync(project);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: project,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--bare', '--initial-branch=main', remote);
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Runner Test');
  git('config', 'user.email', 'runner@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  for (const path of [
    'scripts',
    'src/atlas',
    'src/data',
    'automation',
    'public/research',
    'node_modules',
  ])
    mkdirSync(join(project, path), { recursive: true });
  writeFileSync(join(project, 'scripts/weekly-research.sh'), runner);
  writeFileSync(join(project, '.gitignore'), 'node_modules\n');
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      scripts: {
        build: "node -e 'process.exit(0)'",
        'format:check':
          mode === 'format-failure' ? "node -e 'process.exit(1)'" : "node -e 'process.exit(0)'",
      },
    }),
  );
  writeFileSync(join(project, 'src/atlas/data.json'), '{}\n');
  writeFileSync(join(project, 'automation/weekly-prompt.md'), 'Fixture research prompt\n');
  writeFileSync(join(project, 'src/data/atlas-links.json'), '[]\n');
  for (const file of ['youtube-netz.md', 'weekly-log.md']) {
    writeFileSync(join(project, 'public/research', file), 'Fixture research\n');
  }
  writeFileSync(
    fakeCodex,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'called\\n' >> "$BANDO_FAKE_CALLS"
target=''
while (($#)); do
  if [[ "$1" == '--cd' ]]; then target="$2"; shift 2; else shift; fi
done
test -n "$target"
if [[ "$BANDO_FAKE_MODE" == 'allowed' || "$BANDO_FAKE_MODE" == 'format-failure' ]]; then
  printf '{"fixtureUpdated":true}\\n' > "$target/src/atlas/data.json"
else
  printf 'unrelated change\\n' > "$target/unrelated.txt"
fi
`,
    { mode: 0o755 },
  );
  git('add', '.');
  git('commit', '-m', 'Fixture baseline');
  git('remote', 'add', 'origin', remote);
  git('push', '--set-upstream', 'origin', 'main');
  const baseline = git('rev-parse', 'HEAD');
  return {
    project,
    remote,
    state,
    calls,
    git,
    baseline,
    remoteHead: () => git('--git-dir', remote, 'rev-parse', 'refs/heads/main'),
    run: (...args) =>
      spawnSync('bash', [join(project, 'scripts/weekly-research.sh'), ...args], {
        cwd: project,
        env,
        encoding: 'utf8',
        timeout: 20_000,
      }),
  };
}

test('allowed research commits, pushes to the local remote and advances clean main', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const head = f.git('rev-parse', 'HEAD');
  assert.notEqual(head, f.baseline);
  assert.equal(f.remoteHead(), head);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.deepEqual(JSON.parse(readFileSync(join(f.project, 'src/atlas/data.json'), 'utf8')), {
    fixtureUpdated: true,
  });
  assert.match(f.git('log', '-1', '--format=%s'), /^Update weekly FPV research/);
  assert.equal(readFileSync(f.calls, 'utf8'), 'called\n');
  assert.deepEqual(readdirSync(join(f.state, 'fpv-bando-map/worktrees')), []);
});

test('an unrelated file is rejected without pushing and its worktree is retained', (t) => {
  const f = fixture(t, 'unrelated');
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Unexpected changed file.*unrelated\.txt/);
  assert.equal(f.remoteHead(), f.baseline);
  assert.equal(f.git('rev-parse', 'HEAD'), f.baseline);
  assert.equal(f.git('status', '--porcelain'), '');
  const retained = readdirSync(join(f.state, 'fpv-bando-map/worktrees'));
  assert.equal(retained.length, 1);
  assert.equal(
    readFileSync(join(f.state, 'fpv-bando-map/worktrees', retained[0], 'unrelated.txt'), 'utf8'),
    'unrelated change\n',
  );
});

test('a dirty main checkout skips research before invoking Codex', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.project, 'src/atlas/data.json'), '{"unfinished":true}\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Research skipped/);
  assert.equal(existsSync(f.calls), false);
  assert.equal(existsSync(join(f.state, 'fpv-bando-map/worktrees')), false);
  assert.equal(f.remoteHead(), f.baseline);
  assert.equal(f.git('rev-parse', 'HEAD'), f.baseline);
  assert.equal(
    readFileSync(join(f.project, 'src/atlas/data.json'), 'utf8'),
    '{"unfinished":true}\n',
  );
});

test('prerequisite check never invokes Codex', (t) => {
  const f = fixture(t);
  const result = f.run('--check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no model request was made/);
  assert.equal(existsSync(f.calls), false);
  assert.equal(f.remoteHead(), f.baseline);
});

test('format failure retains research without committing or pushing', (t) => {
  const f = fixture(t, 'format-failure');
  const result = f.run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(f.remoteHead(), f.baseline);
  assert.equal(f.git('rev-parse', 'HEAD'), f.baseline);
  const retained = readdirSync(join(f.state, 'fpv-bando-map/worktrees'));
  assert.equal(retained.length, 1);
  assert.equal(
    f.git('-C', join(f.state, 'fpv-bando-map/worktrees', retained[0]), 'rev-parse', 'HEAD'),
    f.baseline,
  );
});
