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

Deployment is intentionally manual. After the repository owner authorizes publication, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, and ensure Actions and Pages deployments are allowed in repository settings. Then run the **Deploy documentation** workflow from the Actions tab on the desired branch. It builds and deploys to `https://tomaspietravallo.github.io/react-offscreen-webgl/`; the `github-pages` environment may require approval if configured. Neither merging this change nor pushing to main deploys the site. Update `site` and `base` in `astro.config.mjs` if the repository or hosting URL changes.
