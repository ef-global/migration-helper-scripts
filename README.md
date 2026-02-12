# migration-helper-scripts

CLI tooling for Storyblok migration audits and visual JSON diffing.

## Install

Recommended (install script):

```bash
curl -fsSL https://raw.githubusercontent.com/ef-global/migration-helper-scripts/master/scripts/install.sh | sh
```

Pin an exact version:

```bash
curl -fsSL https://raw.githubusercontent.com/ef-global/migration-helper-scripts/master/scripts/install.sh | \
  MIGRATION_HELPER_VERSION=1.1.0 sh
```

Manual install is also supported from GitHub Releases assets.

Install/distribution details are documented in:
`docs/install-and-distribution.md`

## CLI Commands

During development:

```bash
bun run src/cli.ts
bun run src/cli.ts audit
bun run src/cli.ts diff before.json after.json --serve --port 4717
```

Package bin commands:

```bash
migration-helper
migration-helper diff before.json after.json --serve --port 4717
```

Backwards-compatible script shortcut:

```bash
bun run migration-diff before.json after.json --serve --port 4717
```

## Build Single Executable

Build for current host platform:

```bash
bun run build
```

Build all supported targets:

```bash
bun run build:all
```

Produced binaries are written to `bin/`:

- `migration-helper-darwin-arm64`
- `migration-helper-darwin-x64`
- `migration-helper-linux-x64`
- `migration-helper-linux-arm64`
- `migration-helper-windows-x64.exe`

## Release Strategy

This repository now follows the same Changesets-driven flow as `chaperone`.

Target branch: `master`

### 1) Feature PRs

For user-facing/code changes, include a changeset:

```bash
bun run changeset
```

The PR check (`Changeset Check`) enforces this for changes under `src/`, `build.ts`, or `package.json`.

### 2) Version PRs

On pushes to `master`, `Changeset Version PR` runs and opens/updates a version PR using `changesets/action`.

### 3) Binary Releases

After version bumps land on `master`, `Release Binaries`:

- reads `package.json` version,
- creates `v<version>` tag if missing,
- builds executables for all supported targets,
- generates `SHA256SUMS.txt`,
- publishes assets to GitHub Releases.

Release assets include:

- `migration-helper-darwin-arm64`
- `migration-helper-darwin-x64`
- `migration-helper-linux-x64`
- `migration-helper-linux-arm64`
- `migration-helper-windows-x64.exe`
- `SHA256SUMS.txt`

Workflows:

- `.github/workflows/changeset-check.yml`
- `.github/workflows/changeset-version-pr.yml`
- `.github/workflows/release-binaries.yml`
