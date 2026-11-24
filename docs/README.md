# Documentation site

The site uses Astro, MDX, and a client-only React example that imports the library source from this checkout.

```sh
cd docs
npm install --no-package-lock
npm run dev
npm run build
npm run preview
```

The configured base path is `/react-offscreen-webgl/`, including in local preview. The static output is in `docs/dist`.

## Browser compatibility guidance

The table is generated during the Astro build from the Browserslist query in `.browserslistrc` and the installed Can I Use dataset. Update the query and the feature links together when renderer requirements change. It represents only the selected broad features, not every required API or a supported-browser policy.

Run `npm run compat:check` from `docs` to report API compatibility warnings for the library source against that same query. This uses `eslint-plugin-compat` and is advisory: warnings do not block the docs build, and the scanner cannot detect every API or combination of APIs. The docs workflow prints the warnings when source or docs changes.

## GitHub Pages

After the repository owner authorizes publication, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, and ensure Actions and Pages deployments are allowed in repository settings. The **Deploy documentation** workflow runs automatically when a push to `main` changes documentation or library source; it can also be run manually from the Actions tab. It builds and deploys to `https://tomaspietravallo.github.io/react-offscreen-webgl/`; the `github-pages` environment may require approval if configured. Once Pages is configured, merging this change triggers a deployment because it changes documentation or library source. Update `site` and `base` in `astro.config.mjs` if the repository or hosting URL changes.
