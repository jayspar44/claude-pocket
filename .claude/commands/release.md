---
description: Create a new release with auto version bump
allowed-tools: Bash(npm run release*, git *), Read, Grep, AskUserQuestion
argument-hint: [--patch|--minor|--major] [--first]
---

# Release

Auto-bump version based on conventional commits since last release.

## How It Works

The `standard-version` tool analyzes commits since the last tag:
- `fix:` commits → PATCH bump (0.11.5 → 0.11.6)
- `feat:` commits → MINOR bump (0.11.5 → 0.12.0)
- `feat!:` or `BREAKING CHANGE:` → MAJOR bump (0.11.5 → 1.0.0)
- `chore:`, `docs:`, `refactor:` → No bump (but included in changelog)

## Arguments (Optional)

| Flag | Description |
|------|-------------|
| `--patch` | Force a patch bump (ignore commit analysis) |
| `--minor` | Force a minor bump (ignore commit analysis) |
| `--major` | Force a major bump (ignore commit analysis) |
| `--first` | First release (use when no tags exist yet) |

## Steps

1. **Check for existing tags**:
   ```bash
   git describe --tags --abbrev=0 2>/dev/null || echo "NO_TAGS"
   ```
   If no tags exist and `--first` not specified, prompt user.

2. **Show commits since last release**:
   ```bash
   LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)
   if [ -n "$LAST_TAG" ]; then
     echo "Commits since $LAST_TAG:"
     git log $LAST_TAG..HEAD --oneline
   fi
   ```

3. **Run the appropriate release command**:
   - Normal release: `npm run release`
   - Force patch: `npm run release:patch`
   - Force minor: `npm run release:minor`
   - Force major: `npm run release:major`
   - First release: `npm run release:first`

4. **Push changes and tags**:
   ```bash
   git push && git push --tags
   ```

5. **Report new version to user**:
   Show the old version, new version, and link to CHANGELOG.md

## Example Usage

### Auto-detect bump type:
```
/release
```
Analyzes commits and determines bump automatically.

### Force specific bump:
```
/release --minor
```
Forces a minor version bump regardless of commit types.

### First release (no existing tags):
```
/release --first
```
Creates the first version tag.

## What Gets Updated

The release process updates these files automatically:
- `version.json` - Version number
- `package.json` - Root package version
- `app/package.json` - App version
- `relay/package.json` - Relay version
- `CHANGELOG.md` - New changelog entry

## Commit and Tag Created

The release creates:
- **Commit**: `chore(release): X.Y.Z`
- **Tag**: `vX.Y.Z`

## Important Notes

- **Release commits should be separate from code changes**
- Run `/release` only when you're ready to ship
- The release commit will be the last commit before pushing
- All version files are updated atomically

## Typical Workflow

```bash
# Day-to-day development
feat: add new feature
fix: bug fix
feat: another feature

# When ready to ship
/release              # Auto-bumps based on commits above
                      # Creates: chore(release): 0.12.0
                      # Creates tag: v0.12.0
```
