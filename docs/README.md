# Documentation site

The site uses Astro, MDX, and a client-only React example that imports the library source from this checkout.

```sh
cd docs
npm ci
npm run dev
npm run build
npm run preview
```

The configured base path is `/react-offscreen-webgl/`, including in local preview. The static output is in `docs/dist`.

## GitHub Pages

After the repository owner authorizes publication, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, and ensure Actions and Pages deployments are allowed in repository settings. The **Deploy documentation** workflow runs automatically when a push to `main` changes `docs/**`; it can also be run manually from the Actions tab. It builds and deploys to `https://tomaspietravallo.github.io/react-offscreen-webgl/`; the `github-pages` environment may require approval if configured. Once Pages is configured, merging this change triggers a deployment because it changes `docs/**`. Update `site` and `base` in `astro.config.mjs` if the repository or hosting URL changes.
