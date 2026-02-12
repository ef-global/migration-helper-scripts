# Distribution and Homebrew

This guide documents:

1. How users can install `migration-helper` (Homebrew, curl installer, manual).
2. How to distribute `migration-helper` via Homebrew.

## 1) Install Methods

For public CLI distribution in 2026, the usual order is:

1. Homebrew tap (best UX for macOS and Linux users).
2. Verified curl installer script (good fallback).
3. Manual asset download + checksum verification.

### A) Homebrew install (recommended)

```bash
brew tap ef-global/tap
brew install migration-helper
```

### B) Curl installer (fallback)

```bash
curl -fsSL https://raw.githubusercontent.com/ef-global/migration-helper-scripts/master/scripts/install.sh | sh
```

Pinning an exact release is better for reproducibility:

```bash
curl -fsSL https://raw.githubusercontent.com/ef-global/migration-helper-scripts/master/scripts/install.sh | \
  MIGRATION_HELPER_VERSION=1.1.0 sh
```

The installer script:

- detects OS/architecture,
- downloads matching release asset (supports both raw macOS binaries and `.zip` macOS assets),
- verifies checksum against `SHA256SUMS.txt`,
- installs binary to `/usr/local/bin` or falls back to `~/.local/bin`.

Script path: `scripts/install.sh`

### C) Manual install (fully explicit)

1. Download asset + `SHA256SUMS.txt` from Releases.
2. Verify checksum.
3. Move binary to a directory on `PATH`.

Example (macOS arm64, raw binary):

```bash
curl -fsSLO https://github.com/ef-global/migration-helper-scripts/releases/download/v1.1.0/migration-helper-darwin-arm64
curl -fsSLO https://github.com/ef-global/migration-helper-scripts/releases/download/v1.1.0/SHA256SUMS.txt
grep " migration-helper-darwin-arm64$" SHA256SUMS.txt | shasum -a 256 -c -
install -m 0755 migration-helper-darwin-arm64 /usr/local/bin/migration-helper
```

## 2) Homebrew Distribution (Publisher Setup)

Yes, users can install this CLI through Homebrew using a tap repository.

### Recommended structure

1. Create a tap repo, e.g. `ef-global/homebrew-tap`.
2. Add formula file:
   `Formula/migration-helper.rb`
3. Point formula URLs to GitHub Release assets from this repo.
4. On each release, update formula `version` and `sha256` values.

### Formula template

Replace `<VERSION>` and `<SHA256_...>` values with your release values.

```ruby
class MigrationHelper < Formula
  desc "Storyblok migration audit and visual diff CLI"
  homepage "https://github.com/ef-global/migration-helper-scripts"
  version "<VERSION>"
  license "UNLICENSED"

  on_macos do
    on_arm do
      url "https://github.com/ef-global/migration-helper-scripts/releases/download/v#{version}/migration-helper-darwin-arm64"
      sha256 "<SHA256_DARWIN_ARM64>"
    end
    on_intel do
      url "https://github.com/ef-global/migration-helper-scripts/releases/download/v#{version}/migration-helper-darwin-x64"
      sha256 "<SHA256_DARWIN_X64>"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/ef-global/migration-helper-scripts/releases/download/v#{version}/migration-helper-linux-arm64"
      sha256 "<SHA256_LINUX_ARM64>"
    end
    on_intel do
      url "https://github.com/ef-global/migration-helper-scripts/releases/download/v#{version}/migration-helper-linux-x64"
      sha256 "<SHA256_LINUX_X64>"
    end
  end

  def install
    if OS.mac?
      bin.install Dir["migration-helper-darwin-*"].first => "migration-helper"
    elsif OS.linux?
      if Hardware::CPU.arm?
        bin.install "migration-helper-linux-arm64" => "migration-helper"
      else
        bin.install "migration-helper-linux-x64" => "migration-helper"
      end
    end
  end

  test do
    assert_match "migration-helper", shell_output("#{bin}/migration-helper help")
  end
end
```

### Where to get SHA256 values

Use checksums from `SHA256SUMS.txt` in each GitHub release.

Example:

```bash
curl -fsSL https://github.com/ef-global/migration-helper-scripts/releases/download/v<VERSION>/SHA256SUMS.txt
```

### Suggested release-to-homebrew flow

1. Release workflow publishes binaries + `SHA256SUMS.txt`.
2. Update formula in tap repo with new `version` + `sha256` values.
3. Commit and push in tap repo.
4. Validate:

```bash
brew update
brew install migration-helper
migration-helper help
```

## Optional next step

Automate tap updates by adding a workflow that runs on release publish, edits formula in tap repo, and opens a PR there.
