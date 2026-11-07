# Contributing to React Offscreen WebGL

If you want to contribute to this project, be sure to check the issues and the [project used to track them](https://github.com/users/tomaspietravallo/projects/4)

> [!NOTE]
> This project is porting / taking heavy inspiration from the shader setup used on tomaspietravallo.com

## Issues

If you are using React Offscreen WebGL in your app and find an issue, [let me know!](https://github.com/tomaspietravallo/react-offscreen-webgl/issues). Please be sure to check your use case is not covered by an existing issue

## Code contributions

### Commit style

This repository follows the [conventional commits style guide](https://www.conventionalcommits.org/en/v1.0.0/) (mostly, most of the time). Each commit shall be named as follows:

```
<type>(optional scope): <description>

<type> : feat | fix | chore | docs | test | refactor | perf | build | ci
scope : publishing, types, webgpu, or other general labels coherent within this project
```

### Code style

Be sure to format the code before submitting changes in order to preserve the codebase style

> [!TIP]
> You can use `npm run lint` and `npm run format` to check and fix formatting issues automatically.

### Tests

At this point in time, there are no automated tests for this package. The `/tests/vite` folder contains a barebones vite react app with an OffscreenWebGL component instance that can be used to verify things behave as expected. In the future, it'd be nice to have more use cases covered and automated tests

## Publishing

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and does not require an npm token in GitHub Actions. In the npm package settings, configure a GitHub Actions trusted publisher with:

- Owner: `tomaspietravallo`
- Repository: `react-offscreen-webgl`
- Workflow filename: `publish.yml`
- Environment: leave empty
- Allow `npm publish` for this trusted publisher

Pushes to `main` run the tests and semantic-release. `fix` and `hotfix` bump the patch version, `feat` bumps the minor version, and conventional breaking changes (such as `feat!:` or a `BREAKING CHANGE` footer) bump the major version. `ci`, `docs`, and `chore` commits are excluded. Include `[skip release]` in a work-in-progress commit message to prevent it from triggering a release. The highest eligible bump wins, and eligible commit summaries become the GitHub release notes.

After semantic-release creates a GitHub release, the same workflow publishes that release to npm with provenance. The repository's package version and description are not changed by the workflow.
