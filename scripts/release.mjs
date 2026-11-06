import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import semver from 'semver';

export function planRelease(messages, versions) {
	const changes = [];
	let level = 0;
	for (const message of messages) {
		const subject = message.split(/\r?\n/, 1)[0].trim();
		if (/wip/i.test(message) || /^(?:ci|docs|chore)(?:\([^\n)]*\))?!?:/i.test(subject)) continue;
		const match = /^(fix|hotfix|feat)(?:\([^\n)]*\))?!?:\s*(.*)/i.exec(subject);
		const severity = message.includes('!') ? 3 : match?.[1].toLowerCase() === 'feat' ? 2 : match ? 1 : 0;
		if (!severity) continue;
		level = Math.max(level, severity);
		changes.push(match?.[2] || subject);
	}
	if (!level) return null;
	const validVersions = versions.filter((version) => semver.valid(version));
	if (!validVersions.length) throw new Error('No valid published package versions found');
	const latest = semver.parse(semver.rsort(validVersions)[0]);
	const base = `${latest.major}.${latest.minor}.${latest.patch}`;
	return { version: semver.inc(base, ['', 'patch', 'minor', 'major'][level]), description: changes.join('; ') };
}

function git(...args) {
	return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function isAncestor(base, head) {
	try {
		execFileSync('git', ['merge-base', '--is-ancestor', base, head], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

async function main() {
	const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
	const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`);
	if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
	const metadata = await response.json();
	const versions = Object.keys(metadata.versions || {}).filter((version) => semver.valid(version));
	if (!versions.length) throw new Error('No published package versions found');
	const latest = semver.rsort(versions)[0];
	const publishedCommit = metadata.versions[latest].releaseCommit;
	const head = git('rev-parse', 'HEAD');
	const base = publishedCommit || process.env.BEFORE_SHA;
	if (!base || !/^[a-f0-9]{40}$/i.test(base) || /^0+$/.test(base)) throw new Error('A valid previous commit is required');
	if (!isAncestor(base, head)) {
		if (publishedCommit && isAncestor(head, base)) {
			if (process.argv.includes('--apply')) throw new Error('Commit has already been published');
			if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'publish=false\n');
			return;
		}
		throw new Error(`Release base ${base} is not an ancestor of ${head}`);
	}
	const messages = git('log', '--reverse', '--format=%B%x00', `${base}..${head}`)
		.split('\0')
		.map((message) => message.trim())
		.filter(Boolean);
	const plan = planRelease(messages, versions);
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${!!plan}\n`);
	if (!plan) {
		if (process.argv.includes('--apply')) throw new Error('No release is eligible');
		return;
	}
	console.log(`Publish ${plan.version}: ${plan.description}`);
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## npm ${plan.version}\n\n${plan.description}\n`);
	if (process.argv.includes('--apply')) {
		pkg.version = plan.version;
		pkg.description = plan.description;
		pkg.releaseCommit = head;
		writeFileSync('package.json', `${JSON.stringify(pkg, null, '\t')}\n`);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
