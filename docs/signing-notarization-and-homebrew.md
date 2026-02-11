# Signing, Notarization, and Distribution

This guide documents:

1. How to prepare GitHub secrets for macOS signing/notarization.
2. How users can install `migration-helper` (Homebrew, curl installer, manual).
3. How to distribute `migration-helper` via Homebrew.

## 1) Apple Signing + Notarization Secrets

The release workflow expects these GitHub repository secrets:

- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

### `APPLE_ID`

Your Apple Developer account email.

### `APPLE_TEAM_ID`

Your Apple Developer Team ID (10 characters), visible in Apple Developer account membership/team settings.

### `APPLE_CERTIFICATE_BASE64` and `APPLE_CERTIFICATE_PASSWORD`

1. On a Mac, open `Keychain Access`.
2. Locate a `Developer ID Application` certificate.
3. Export it as `.p12` and set an export password.
4. Use that export password as `APPLE_CERTIFICATE_PASSWORD`.
5. Base64 encode the `.p12`:

```bash
# macOS
base64 -i developer-id-application.p12 | pbcopy
```

```bash
# Linux alternative (no line wraps)
base64 -w 0 developer-id-application.p12
```

6. Store the base64 output as `APPLE_CERTIFICATE_BASE64`.

### `APPLE_APP_SPECIFIC_PASSWORD`

1. Go to `https://appleid.apple.com`.
2. Sign in with your Apple ID.
3. Security -> App-Specific Passwords -> Generate Password.
4. Use that generated value for `APPLE_APP_SPECIFIC_PASSWORD`.

### Add secrets in GitHub

Repository -> `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`.

## 2) Homebrew Distribution

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
- downloads matching release asset (supports both legacy raw macOS binaries and newer notarized `.zip` macOS assets),
- verifies checksum against `SHA256SUMS.txt`,
- installs binary to `/usr/local/bin` or falls back to `~/.local/bin`.

Script path: `scripts/install.sh`

### C) Manual install (fully explicit)

1. Download asset + `SHA256SUMS.txt` from Releases.
2. Verify checksum.
3. Move binary to a directory on `PATH`.

Example (macOS arm64):

```bash
curl -fsSLO https://github.com/ef-global/migration-helper-scripts/releases/download/v1.1.0/migration-helper-darwin-arm64.zip
curl -fsSLO https://github.com/ef-global/migration-helper-scripts/releases/download/v1.1.0/SHA256SUMS.txt
grep " migration-helper-darwin-arm64.zip$" SHA256SUMS.txt | shasum -a 256 -c -
unzip migration-helper-darwin-arm64.zip
install -m 0755 migration-helper-darwin-arm64 /usr/local/bin/migration-helper
```

## 3) Homebrew Distribution (Publisher Setup)

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
      url "https://github.com/ef-global/migration-helper-scripts/releases/download/v#{version}/migration-helper-darwin-arm64.zip"
      sha256 "<SHA256_DARWIN_ARM64_ZIP>"
    end
    on_intel do
      url "https://github.com/ef-global/migration-helper-scripts/releases/download/v#{version}/migration-helper-darwin-x64.zip"
      sha256 "<SHA256_DARWIN_X64_ZIP>"
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
