# reed — release pipeline

## Overview

Releases are automated via **release-please** + **GitHub Actions**:

1. Merge PRs to `main` using conventional commit messages
2. release-please keeps an open PR titled `chore(main): release X.Y.Z` with the version bump and changelog
3. Merging that release PR creates a GitHub release and triggers the macOS build matrix
4. The build job compiles, ad-hoc signs, zips, and uploads `reed-macos-arm64.zip` and `reed-macos-x86_64.zip` to the release

No manual steps after merging the release PR.

## Conventional commits

| Prefix | Effect |
|---|---|
| `feat:` | Minor bump |
| `fix:` | Patch bump |
| `feat!:` or `BREAKING CHANGE:` footer | Major bump |
| `chore:`, `docs:`, `refactor:`, `ci:`, `test:` | No bump |

Add a `Release-As: x.y.z` footer to any commit body to override the next release version.

## Why ad-hoc signing only

reed binaries are signed with `codesign --sign -` (ad-hoc). No Apple Developer ID, no notarization. This works because:

- **Apple Silicon kernel requires at least an ad-hoc signature** to load any binary; ad-hoc satisfies that requirement.
- **`curl` (and Homebrew, which uses curl)** does not set the `com.apple.quarantine` xattr, so Gatekeeper doesn't gate these install paths.
- Users who download the zip via a browser **will** hit Gatekeeper. Workaround: `xattr -dr com.apple.quarantine /path/to/reed` or right-click → Open. If browser-download UX becomes important, layer in Developer ID + notarization later.

## Platforms

macOS only. `Sources/reed/Server.swift` imports AppKit (`NSWorkspace.shared.open`) and `main.swift` imports Darwin (kqueue/dispatch sources). Linux is not supported.

The build matrix produces:

- `reed-macos-arm64.zip` — Apple Silicon
- `reed-macos-x86_64.zip` — Intel (cross-compiled on the arm64 runner)

## Files

| File | Purpose |
|---|---|
| `.github/workflows/release.yml` | release-please job + macOS matrix build, gated on `release_created` |
| `release-please-config.json` | release-please config (simple type, root package) |
| `.release-please-manifest.json` | Tracks the current released version per package |
| `version.txt` | Current version, edited by release-please's release PR |

## Cutting a release

1. Merge feature/fix PRs to `main` using conventional commits
2. release-please's release PR auto-updates with each merge
3. When ready, merge the release PR
4. Watch the `build-macos` matrix on the resulting workflow run; binaries appear on the GitHub release page when both jobs finish

## Installation (end user)

Direct download (until a Homebrew tap is added):

```bash
# Apple Silicon
curl -L -o reed.zip https://github.com/adamtootle/reed/releases/latest/download/reed-macos-arm64.zip
unzip reed.zip
chmod +x reed
./reed ~/notes
```

(Browser-downloaded zips need `xattr -dr com.apple.quarantine reed` first — see above.)
