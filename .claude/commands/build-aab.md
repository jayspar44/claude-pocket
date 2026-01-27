---
description: Build Android App Bundle (AAB) for Play Store
allowed-tools: Bash(cd * && node scripts/build-aab.js*), Read, AskUserQuestion
argument-hint: [--flavor <dev|prod>] [--type <debug|release>]
---

# Build AAB

Build an Android App Bundle (AAB) for Play Store uploads.

## Arguments (Optional)

| Flag | Description | Default |
|------|-------------|---------|
| `--flavor <dev\|prod>` | Build flavor | dev |
| `--type <debug\|release>` | Build type | release |

## Output Locations

| Flavor | Directory |
|--------|-----------|
| `prod` | `/Users/jayspar/Documents/projects/claude-pocket-outputs/prod/` |
| `dev` | `/Users/jayspar/Documents/projects/claude-pocket-outputs/dev/` |

## Steps

1. **Parse arguments**:
   - Default flavor: `dev`
   - Default type: `release`
   - Parse `--flavor` and `--type` from arguments if provided

2. **Confirm build parameters**:
   Ask user to confirm before building:
   - Flavor: dev or prod
   - Build type: debug or release
   - Output directory

3. **Run the build**:
   ```bash
   cd /Users/jayspar/Documents/projects/claude-pocket-dev/app && node scripts/build-aab.js <flavor> <type>
   ```

4. **Report results**:
   - Show the output file path
   - Show builds page URL:
     - PROD builds: `http://minibox.rattlesnake-mimosa.ts.net:4501/builds`
     - DEV builds: `http://minibox.rattlesnake-mimosa.ts.net:4503/builds`

## Example Usage

### Build dev release (default):
```
/build-aab
```

### Build prod release:
```
/build-aab --flavor prod
```

### Build dev debug:
```
/build-aab --flavor dev --type debug
```

## Notes

- Release builds require signing credentials (KEYSTORE_PATH, etc.)
- AABs are for Play Store uploads; use APKs for direct installation
- The `local` flavor is not supported for AAB (no Play Store use case)
