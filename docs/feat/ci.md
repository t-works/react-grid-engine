# CI/CD design

> **Status:** design, not implemented. No `.github/` exists in this repo yet.
> This file is the plan to review; the workflows below are sketches to be turned into
> `.github/workflows/*.yml` once the questions at the bottom are answered.

**Goal:** one place per concern —

1. **CI** — every push/PR proves the v1 gate (`lint`, `typecheck`, `test`, `build`, browser flows).
2. **Release** — publish `@t-works/react-grid-engine` to a registry.
3. **Deploy (optional)** — serve the two example apps somewhere.

**Refs (the VPS patterns we are reusing):**

- `j:/apps/cats_monorepo/.github/workflows/deploy-api.yml` — path-filtered push trigger, `shimataro/ssh-key-action`, `ssh-keyscan`, guarded secret → file, `rsync`, remote SSH heredoc, `systemctl restart`, `curl --retry` health poll.
- `j:/apps/cats_monorepo/.github/workflows/deploy-maps.yml` — build first, then `rsync dist/`, `chmod -R 755`. The simplest static-deploy shape.
- `j:/ai/apps/simple-mobile-notepad/.github/workflows/bff-publish.yml` — `check → build-and-push → deploy` job chain, least-privilege `permissions`, `DEPLOY_KNOWN_HOSTS` fallback to `ssh-keyscan`, atomic `releases/<sha>` + symlink switch, healthcheck with rollback, prune old releases, `shred -u` key cleanup, `workflow_dispatch`.

**Project constraints already decided (do not re-litigate here):** npm workspaces, Node `>=20`,
`packageManager: npm@11.13.0`; **no remote Turbo cache** (`docs/tech-spec.md` D8); **no changesets**
(D7) — a manual version bump then `npm publish` is the release process; Chromium-only Playwright.

---

## 1. What must be green (v1 gate)

From `docs/v1/tasks.md` → *v1 done when*:

```sh
npm ci
npm run lint
npx turbo run build typecheck test
npx playwright install --with-deps chromium
npm run test:browser
```

Notes that shape the workflow:

- `turbo run typecheck` depends on `^build`, and the examples typecheck against the built `dist`
  and its `exports` map (D4). So `build` must run — order inside one Turbo invocation is enough.
- `playwright.config.ts` already builds the library and starts both Vite dev servers as its
  `webServer`; on CI `reuseExistingServer` is `false`, so each run starts clean. Nothing extra to
  orchestrate.
- The perf smoke (`e2e/perf.spec.ts`, task 13) rides along in `test:browser` with deliberately loose
  2000 ms ceilings — it is reported, not a frame-budget gate. Keep it; it costs ~1 s.

---

## 2. Workflow A — `ci.yml` (required)

**Trigger:** PRs and pushes to `main`, plus `workflow_dispatch`.
**Shape:** one job. The repo is small and the whole gate is one install; splitting buys little and
costs a second `npm ci`. (Split it later if browser time hurts — see Q10.)

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: '24'          # ships npm 11.x to match packageManager
          cache: npm

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build, typecheck, unit test
        run: npx turbo run build typecheck test

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Browser flows
        run: npm run test:browser

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

**Why these choices**

- `npm ci` (not `install`) — `package-lock.json` is committed and npm workspaces make the lockfile
  load-bearing.
- `cache: npm` on `setup-node` only. Turbo local cache is fine per-run; no `TURBO_TOKEN` (D8).
- `ubuntu-latest` instead of the references' pinned `ubuntu-22.04` — the refs pin for their own VPS
  parity, this repo has no such constraint (Q9).
- `webServer.timeout` is 120 s in `playwright.config.ts`; the job timeout is 20 min for headroom.
- No matrix. Chromium only — Safari/WebKit stays a manual smoke (PRD §8).

---

## 3. Workflow B — `release.yml` (publish the library)

**Trigger:** `v*` tag push (preferred) or `workflow_dispatch` with an optional ref (Q2).
**Registry:** public npm (Q1). **Provenance:** on (public repo, free), Q3.

```yaml
name: Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: read
  id-token: write        # npm provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: npm
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: npm
          registry-url: https://registry.npmjs.org

      - run: npm ci

      # Never publish from a red tree (D4: examples must typecheck against real dist).
      - run: npx turbo run build typecheck test
      - run: npm run lint

      - name: Tag matches package version
        run: |
          pkg=$(node -p "require('./packages/react-grid-engine/package.json').version")
          [ "${GITHUB_REF_NAME#v}" = "$pkg" ] || {
            echo "::error::tag ${GITHUB_REF_NAME} does not match v$pkg"; exit 1; }

      - name: Publish
        run: npm publish -w packages/react-grid-engine --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- Per D7 there is one publishable package, so no changesets, no version-bump job. The tag *is* the
  version; the guard above stops drift.
- `-w packages/react-grid-engine` is the path form from the tech spec. `--access public` is required
  for a scoped package on the public registry.
- `environment: npm` is where `NPM_TOKEN` lives; approve/deploy-protection is optional (Q3).
- The browser suite is *not* repeated here — gate the tag on `ci.yml` being green for that commit
  (Q14).

---

## 4. Workflow C — `deploy-examples.yml` (VPS)

A domain is available, so the examples do get a public URL and this workflow is live (Q4/Q16). Two
static Vite apps: `examples/standalone-basic` and `examples/standalone-dashboard`, both output
`dist/`.

**Pattern:** `deploy-maps.yml` (build → `rsync dist/` → `chmod 755`) as the baseline, upgraded with
the `bff-publish.yml` atomic-release/rollback idea only if we want zero-downtime swaps (Q6).

**Domain/server config is the other half** — see §4.1 before writing the workflow; a subpath layout
changes the *build*, not just the deploy.

```yaml
name: Deploy examples

on:
  push:
    branches: [main]
    paths:
      - 'examples/**'
      - 'packages/react-grid-engine/**'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/deploy-examples.yml'
  workflow_dispatch:

concurrency:
  group: deploy-examples
  cancel-in-progress: false

permissions:
  contents: read

env:
  REMOTE_RELEASES: /opt/react-grid-engine/examples

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: vps
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - name: Build examples
        run: npx turbo run build --filter=standalone-basic --filter=standalone-dashboard

      - name: Configure SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          PORT="${{ secrets.DEPLOY_PORT || '22' }}"
          if [ -n "${{ secrets.DEPLOY_KNOWN_HOSTS }}" ]; then
            echo "${{ secrets.DEPLOY_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          else
            ssh-keyscan -p "$PORT" "${{ secrets.DEPLOY_HOST }}" >> ~/.ssh/known_hosts 2>/dev/null || true
          fi

      # Simple form (maps pattern): straight into the served directory.
      - name: Rsync basic
        run: |
          rsync -az --delete \
            -e "ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=yes -p ${{ secrets.DEPLOY_PORT || '22' }}" \
            examples/standalone-basic/dist/ \
            "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}:${{ secrets.EXAMPLES_PATH }}/basic/"

      - name: Rsync dashboard
        run: |
          rsync -az --delete \
            -e "ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=yes -p ${{ secrets.DEPLOY_PORT || '22' }}" \
            examples/standalone-dashboard/dist/ \
            "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}:${{ secrets.EXAMPLES_PATH }}/dashboard/"

      - name: Permissions + smoke
        run: |
          PORT="${{ secrets.DEPLOY_PORT || '22' }}"
          ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=yes -p "$PORT" \
            "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}" \
            "chmod -R 755 ${{ secrets.EXAMPLES_PATH }}"
          # curl each URL once so a broken rsync fails the job (deploy-api pattern).
          curl -fsS --retry 5 --retry-delay 2 "${{ secrets.EXAMPLES_BASE_URL }}/basic/"
          curl -fsS --retry 5 --retry-delay 2 "${{ secrets.EXAMPLES_BASE_URL }}/dashboard/"

      - name: Cleanup SSH
        if: always()
        run: shred -u ~/.ssh/deploy_key 2>/dev/null || rm -f ~/.ssh/deploy_key || true
```

**If we want atomic swaps + rollback** (only if the examples get real traffic; they are demos): copy
the `bff-publish.yml` release-dir + `ln -sfn` + previous-release rollback + prune-keep-5 steps, with
`REMOTE_RELEASES` as above instead of `docker compose`. That is ~60 lines of shell for zero-downtime
on files that are never on fire — deliberately not the default (Q6).

### 4.1 Domain + server config (the part the workflow cannot guess)

Two hostnames with two vhosts is the simple layout; subpaths under one host avoid a second cert but
force a build-time `base`. Either way the nginx root must match the rsync destination
(`$EXAMPLES_PATH/basic`, `$EXAMPLES_PATH/dashboard`):

```nginx
# grid.<domain>  ->  the dashboard example
server {
  listen 443 ssl http2;
  server_name grid.example.com;
  root /var/www/react-grid-engine/dashboard;

  location /        { try_files $uri $uri/ /index.html; }          # SPA fallback
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location = /index.html { add_header Cache-Control "no-cache"; }  # pick up deploys immediately
}
```

- **TLS / DNS:** who terminates (certbot on the VPS, Cloudflare proxy, Caddy auto-TLS) and where the
  A/CNAME records live — Q17, Q18.
- **Subpath layout** (`https://<domain>/basic/`, `/dashboard/`) needs
  `vite build --base=/basic/` (and `/dashboard/`) or the `base` option in each `vite.config.ts`, plus
  matching `location /basic/ { try_files ... }`. Today both configs build with the default `/`, so
  subpaths are a code change, not just a deploy change — Q16.
- **Who owns this file?** Committed under `deploy/nginx/` and rsynced (the bff pattern) or hand-managed
  on the server and never in git — Q19.

**Alternative worth considering:** the examples are 100 % static with **no env and no API** (both use
`localStorage` only). GitHub Pages also serves a custom domain (with a `CNAME` file and DNS) and needs
**zero VPS work** — the trade is Pages' own build/HTTPS handling and no control over headers like the
`immutable` cache above. If the domain is the only requirement, Pages is still the lazier answer (Q4).

---

## 5. Secrets / variables

| Name | Workflow | Notes |
|---|---|---|
| `NPM_TOKEN` | release | Automation token, scope `@t-works`, or a granular token. `--provenance` still needs `id-token: write`. |
| `DEPLOY_SSH_PRIVATE_KEY` | deploy-examples | Key-auth, no passphrase. Mirrors bff naming; cats uses `SSH_PRIVATE_KEY` (Q5). |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PORT` | deploy-examples | `DEPLOY_PORT` optional, defaults 22. |
| `DEPLOY_KNOWN_HOSTS` | deploy-examples | Optional; falls back to `ssh-keyscan`. |
| `EXAMPLES_PATH` | deploy-examples | Served directory on the VPS, e.g. `/var/www/react-grid-engine`. |
| `EXAMPLES_BASE_URL` | deploy-examples | Public base URL for the post-deploy `curl` smoke. |
| `EXAMPLES_DOMAIN` (or `BASIC_HOST` / `DASHBOARD_HOST`) | deploy-examples | The domain that resolves to the VPS. One host with subpaths or two vhosts — Q16. Non-secret; can be a repo variable. |

No `GHCR_PAT`, no `TURBO_TOKEN`/`TURBO_TEAM`, no `.env` files: this repo has no Docker image, no
remote Turbo cache (D8), and no server secrets.

---

## 6. What we borrow, and what we deliberately drop

**Borrow**

- `deploy-maps.yml`: build in CI, `rsync dist/`, `chmod 755`, path-filtered triggers.
- `deploy-api.yml`: post-deploy `curl --retry` health poll so a broken deploy is red, not green;
  `ssh-keyscan` known-hosts setup; guarding a secret before it can clobber server state.
- `bff-publish.yml`: job chain and `needs`, least-privilege `permissions` block, `DEPLOY_KNOWN_HOSTS`
  fallback, release directories + symlink + rollback + prune (only if Q6 says yes), `shred -u` key
  cleanup in `if: always()`, `workflow_dispatch` on every workflow, notify steps.

**Drop**

- Docker / GHCR / `docker compose pull|up` — the library ships as an npm tarball and the examples are
  static files. No image to build.
- `pnpm`/`yarn` setup and `TURBO_TOKEN` build args (D8, npm workspaces).
- VPS `.env` generation — the examples read nothing from the environment.
- `--delete` on a source checkout (we only `--delete` the served static directory).
- Any cross-browser matrix.

---

## 7. Recommended defaults (so this is actionable without a meeting)

1. Implement **Workflow A only** now; it is the actual v1 gate.
2. Add **Workflow B** with a tag trigger + public npm + provenance, once `@t-works` scope is confirmed
   and `NPM_TOKEN` exists.
3. Implement **Workflow C** (a domain exists), but decide the domain/server config first (§4.1):
   two vhosts (no code change) vs subpaths (needs Vite `base` + nginx `location`). Default to two
   hostnames — it keeps the current default-`/` builds untouched.
4. Mark `verify` as a required status check on `main`, require PRs, and stop direct pushes (Q7).

---

## 8. Questions

1. **Is the library published at all in v1**, and to where — public npm (`@t-works/react-grid-engine`),
   GitHub Packages, or private? Is the `@t-works` scope already claimed on npm? (tech-spec D7 implies a
   manual `npm publish` eventually, but not necessarily at `v1.0.0`.)
2. **Release trigger:** annotated tag `v*`, GitHub Release, or `workflow_dispatch` only? (D7 says the
   release is manual today; automating it changes the process.)
3. **Provenance + environment protection:** do you want `--provenance` (requires `id-token: write`) and
   a protected `npm` environment requiring approval before publish?
4. **Domain layout (a domain exists per this request).** One host with subpaths
   (`https://<domain>/basic/`, `/dashboard/`) or **two hostnames** (`grid.example.com`,
   `grid-basic.example.com`)? Subpaths change the Vite build (`--base`), so confirm before writing
   Workflow C. Also: is the domain for these examples, or is it reserved for something else
   (a docs/landing page)? And VPS vs **GitHub Pages** (Pages serves a custom domain too, with zero
   server work — it just gives up control of response headers)?
5. **If VPS:** reuse the cats secret names (`SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`,
   `MAPS_PROJECT_PATH`-style) or the notepad names (`DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_HOST`,
   `DEPLOY_USER`, `DEPLOY_PORT`)? Same host as cats/notepad or a separate one?
6. **Deploy style for the examples:** plain `rsync --delete` + `chmod` (maps, simple, brief 404 window)
   or atomic `releases/<sha>` + symlink + healthcheck rollback + prune (bff, ~60 extra lines)?
7. **Branch protection:** should `verify` be a required check, PRs required on `main`, and is
   push-to-`main` also validated (not just PRs)? Any teams currently pushing directly to `main`?
8. **Node version:** pin 24 (matches the references and the npm 11 lockfile) or 22 LTS? `engines`
   says `>=20`; the lockfile was generated with npm 11.13.0.
9. **Runner image:** `ubuntu-latest` (rolling, current 24.04) or pin `ubuntu-22.04` like the
   references? Pin only if you want reproducibility over freshness.
10. **One job or two?** Keep `lint/typecheck/test/build` + Playwright in a single `verify` job
    (simplest), or split into parallel `static` and `browser` jobs? Sharding across N Chromium workers
    is not needed at 25 tests / ~11 s.
11. **Turbo remote cache:** confirm D8 still holds and CI uses only `setup-node`'s npm cache (no
    `TURBO_TOKEN`/`TURBO_TEAM` secrets). If you later add Vercel remote cache, the `ci.yml` step
    becomes `npx turbo run …` with those two env vars.
12. **Are the examples expected to call an API or need build-time config** in the near future? Today
    they are pure client-side, which is why the deploy workflow has no `.env` step. If that changes,
    the `deploy-api.yml` empty-secret guard becomes mandatory before any `rsync` of env files.
13. **Anything else to gate?** e.g. `npm run clean` does not touch `node_modules`, or a
    `docs/api.md` drift check against the shipped types. Neither exists today; both are one step if
    wanted.
14. **Should `release.yml` re-run the browser suite** before publishing, or is "the tag's commit
    already passed `ci.yml` on `main`" sufficient (recommended)? If releases can be cut from
    non-`main` commits, we need the full gate inside `release.yml`.
15. **Notifications:** the references only `echo` success/failure. Do you want Slack/Discord/HTTP
    notifications on deploy failure, or is a red run in the Actions tab enough?
16. **Which hostnames, exactly?** e.g. one apex/subdomain split between the two examples, or one host
    with `/basic/` + `/dashboard/` paths. This decides both the DNS records and whether the Vite
    `base` changes are needed.
17. **TLS:** Let's Encrypt/certbot on the VPS, a Cloudflare proxy in front, or Caddy auto-TLS? Does
    443 already terminate somewhere shared with cats/notepad?
18. **DNS:** which provider/zone, and A vs CNAME? Who can add/change the records (the deploy job
    cannot do this; it is a one-time manual step)?
19. **nginx config ownership:** commit vhosts under `deploy/nginx/` and rsync them (bff pattern), or
    hand-maintained on the server? If from git, the deploy job needs write access to `sites-enabled`
    and a `nginx -t && systemctl reload nginx` step — and a shared server means editing a config we
    do not own.
20. **Cache/compat config:** is the immutable-assets + no-cache-`index.html` pair in §4.1 acceptable,
    do you want gzip/brotli (usually already on nginx), and `http2`/`http3`?
21. **Shared or dedicated VPS?** Same box as cats/notepad (then avoid port/vhost/`/opt` collisions) or
    a fresh throwaway host? This also picks the secret naming in Q5.
22. **Do the examples need any build-time config** (a `VITE_*` base path, an API URL) that CI must
    inject, or do they stay env-free? If they stay env-free, Workflow C needs no `.env` step.
