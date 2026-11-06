import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRelease } from './release.mjs';

const versions = ['0.0.3-alpha', '0.0.7-alpha'];
test('bumps from the highest published version and summarizes eligible changes', () => {
	assert.deepEqual(planRelease(['fix: repair rendering', 'hotfix(worker): avoid race'], versions), {
		version: '0.0.8',
		description: 'repair rendering; avoid race',
	});
	assert.equal(planRelease(['fix: one', 'feat(ui): two'], versions).version, '0.1.0');
	assert.equal(planRelease(['feat!: breaking', 'fix: something'], versions).version, '1.0.0');
	assert.equal(planRelease(['refactor: breaking!'], versions).version, '1.0.0');
});
test('excludes maintenance and WIP commits even when breaking', () => {
	for (const message of [
		'ci!: change',
		'docs: update!',
		'chore(scope): tidy!',
		'feat(wip): change',
		'[wip] feat: change',
		'feat[wip]: change',
		'feat: wip change',
		'feat: change [WIP]',
		'fix: okay\n\nwip',
	]) {
		assert.equal(planRelease([message], versions), null, message);
	}
});
test('ignores ordinary commits and uses the highest valid version', () => {
	assert.equal(planRelease(['refactor: cleanup'], versions), null);
	assert.equal(planRelease(['fix: x'], ['3.2.4', 'bad', '1.0.0']).version, '3.2.5');
	assert.throws(() => planRelease(['fix: x'], []));
});

test('plans from the initial push and records the published commit', async () => {
	const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { execFileSync } = await import('node:child_process');
	const directory = mkdtempSync(join(tmpdir(), 'release-plan-'));
	const run = (command, args, options = {}) => execFileSync(command, args, { cwd: directory, encoding: 'utf8', ...options }).trim();
	try {
		run('git', ['init', '-q']);
		run('git', ['config', 'user.name', 'Test']);
		run('git', ['config', 'user.email', 'test@example.com']);
		writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'example', version: '0.0.1' }));
		run('git', ['add', 'package.json']);
		run('git', ['commit', '-qm', 'initial']);
		const before = run('git', ['rev-parse', 'HEAD']);
		run('git', ['commit', '--allow-empty', '-qm', 'feat: add colors']);
		const head = run('git', ['rev-parse', 'HEAD']);
		const registry = join(directory, 'registry.json');
		writeFileSync(registry, JSON.stringify({ versions: { '0.0.7-alpha': {} } }));
		const preload = join(directory, 'registry.mjs');
		writeFileSync(
			preload,
			`import { readFileSync } from 'node:fs'; globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(process.env.REGISTRY_FIXTURE)) });`
		);
		const script = new URL('./release.mjs', import.meta.url).pathname;
		const env = { ...process.env, BEFORE_SHA: before, REGISTRY_FIXTURE: registry };
		run(process.execPath, ['--import', preload, script, '--apply'], { env });
		const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
		assert.equal(manifest.version, '0.1.0');
		assert.equal(manifest.description, 'add colors');
		assert.equal(manifest.releaseCommit, head);
		writeFileSync(registry, JSON.stringify({ versions: { '0.1.0': { releaseCommit: head } } }));
		const output = join(directory, 'output');
		run(process.execPath, ['--import', preload, script], { env: { ...env, GITHUB_OUTPUT: output } });
		assert.equal(readFileSync(output, 'utf8'), 'publish=false\n');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
