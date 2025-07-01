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
