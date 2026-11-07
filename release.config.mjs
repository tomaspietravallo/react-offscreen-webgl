export default {
	branches: ['main'],
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				preset: 'conventionalcommits',
				releaseRules: [
					{ type: 'ci', release: false },
					{ type: 'docs', release: false },
					{ type: 'chore', release: false },
					{ type: 'hotfix', breaking: true, release: 'major' },
					{ type: 'hotfix', release: 'patch' },
					{ type: 'perf', breaking: true, release: 'major' },
					{ type: 'perf', release: false },
					{ revert: true, release: false },
				],
			},
		],
		[
			'@semantic-release/release-notes-generator',
			{
				preset: 'conventionalcommits',
				presetConfig: {
					types: [
						{ type: 'feat', section: 'Features' },
						{ type: 'fix', section: 'Bug fixes' },
						{ type: 'hotfix', section: 'Bug fixes' },
					],
				},
			},
		],
		['@semantic-release/github', { successComment: false, failComment: false, releasedLabels: false, failTitle: false }],
		'@semantic-release/npm',
	],
};
