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
| `prod` | `/Users/jayspar/Documents/projects/claude-pocket-aabs/prod/` |
| `dev` | `/Users/jayspar/Documents/projects/claude-pocket-aabs/dev/` |

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

3. **Run the build from the matching folder**:

   The Vite build picks up `.env.production` from whichever folder you run in — that file contains `VITE_APP_ENV` and `VITE_RELAY_URL`, which differ between prod and dev. The `flavor` argument only changes Capacitor's `appId`/`appName`; it does NOT swap the env file. So you MUST `cd` into the folder that matches the flavor:

   | Flavor | Folder |
   |--------|--------|
   | `prod` | `/Users/jayspar/Documents/projects/claude-pocket/app` |
   | `dev`  | `/Users/jayspar/Documents/projects/claude-pocket-dev/app` |

   ```bash
   # For --flavor prod:
   cd /Users/jayspar/Documents/projects/claude-pocket/app && node scripts/build-aab.js prod <type>

   # For --flavor dev:
   cd /Users/jayspar/Documents/projects/claude-pocket-dev/app && node scripts/build-aab.js dev <type>
   ```

   Note: each folder maintains its own `android-version.json` counter. If you accidentally build prod from the dev folder (or vice versa) and then need to correct course, you may need to manually bump the prod folder's counter to stay above any uploaded build.

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
