# Install and Distribution

This project currently distributes prebuilt binaries through GitHub Releases.

## Install options

### 1) Install script (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ef-global/migration-helper-scripts/master/scripts/install.sh | sh
```

Pin a specific release version:

```bash
curl -fsSL https://raw.githubusercontent.com/ef-global/migration-helper-scripts/master/scripts/install.sh | \
  MIGRATION_HELPER_VERSION=1.1.0 sh
```

The script:

- detects OS/architecture,
- downloads the matching release asset,
- verifies checksum from `SHA256SUMS.txt`,
- installs `migration-helper` into `/usr/local/bin` or falls back to `~/.local/bin`.

Script path: `scripts/install.sh`

### 2) Manual install

1. Download the platform binary and `SHA256SUMS.txt` from Releases.
2. Verify checksum.
3. Move the binary to a directory in your `PATH`.

Example (macOS arm64):

```bash
curl -fsSLO https://github.com/ef-global/migration-helper-scripts/releases/download/v1.1.0/migration-helper-darwin-arm64
curl -fsSLO https://github.com/ef-global/migration-helper-scripts/releases/download/v1.1.0/SHA256SUMS.txt
grep " migration-helper-darwin-arm64$" SHA256SUMS.txt | shasum -a 256 -c -
install -m 0755 migration-helper-darwin-arm64 /usr/local/bin/migration-helper
```

## Release artifacts

Releases publish:

- `migration-helper-darwin-arm64`
- `migration-helper-darwin-x64`
- `migration-helper-linux-x64`
- `migration-helper-linux-arm64`
- `migration-helper-windows-x64.exe`
- `SHA256SUMS.txt`
