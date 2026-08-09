---
name: android-builds
description: Build Android APK and AAB artifacts for Claude Pocket, including JDK/SDK prerequisites, output locations per flavor, and release signing. Use when building, signing, or locating an APK/AAB.
---

# Android Builds

**Prerequisites:** Java JDK 21+ (Capacitor 8 generates `sourceCompatibility`/`targetCompatibility` 21 into `app/android/app/capacitor.build.gradle`), Android SDK 36 (`sdk.dir` in `app/android/local.properties`, or `ANDROID_HOME`)

**Build commands:**
| Command | Output | Description |
|---------|--------|-------------|
| `npm run apk:dev` | APK | Dev debug build |
| `npm run apk:prod` | APK | Prod release build |
| `npm run aab:dev` | AAB | Dev release for Play Store |
| `npm run aab:prod` | AAB | Prod release for Play Store |

**Output location:** `../claude-pocket-aabs/` (sibling of the repo), split by flavor — `prod` builds land in `prod/`, `dev` **and** `local` builds in `dev/`. Override with `AAB_OUTPUT_PATH` / `APK_OUTPUT_PATH`.

**Download builds:** each relay serves only its own folder — DEV `:4503/api/builds/` lists `dev/`, PROD `:4501/api/builds/` lists `prod/`. A dev build looked for on 4501 will appear to be missing.

**Android Studio (for debugging):**
```bash
npm run android:local    # Local relay → Android Studio
npm run android:dev      # Dev relay → Android Studio
```

**Release signing:** Set environment variables before AAB builds:
```bash
export KEYSTORE_PATH=~/keys/claude-pocket.keystore
export KEYSTORE_PASSWORD="..."
export KEY_ALIAS="..."
export KEY_PASSWORD="..."
npm run aab:prod
```
