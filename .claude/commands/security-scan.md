---
description: Pre-commit security scan for secrets and sensitive files
allowed-tools: Bash, Glob, Grep, Read, AskUserQuestion
argument-hint: [--staged | --all]
---

# Security Scan - Pre-Commit Secret Detection

Scans for secrets, sensitive files, and security issues BEFORE committing to prevent accidental exposure on GitHub.

## Arguments

- **--staged** (default): Only scan files staged for commit
- **--all**: Scan all modified files (staged + unstaged)

## Usage

```bash
# Scan staged files only (default)
/security-scan

# Scan all modified files
/security-scan --all
```

## What Gets Scanned

### 1. Sensitive File Patterns (BLOCKING)

Files that should NEVER be committed:

| Pattern | Description |
|---------|-------------|
| `.env` | Environment variables (except .env.example, .env.template) |
| `.env.*` | All env variants (.env.local, .env.production, etc.) |
| `*.jks` | Java KeyStore files |
| `*.keystore` | Android keystore files |
| `*.p12` | PKCS#12 certificate files |
| `*.pem` | PEM certificate/key files |
| `*.key` | Private key files |
| `credentials.json` | Google/Firebase credentials |
| `service-account*.json` | Service account keys |
| `*-credentials.json` | Any credentials JSON |
| `firebase-adminsdk*.json` | Firebase Admin SDK keys |
| `google-services.json` | Firebase Android config |
| `GoogleService-Info.plist` | Firebase iOS config |
| `*.secret` | Generic secret files |
| `secrets/` | Secrets directory |
| `private/` | Private directory |
| `id_rsa`, `id_ed25519` | SSH private keys |

### 2. Secret Patterns in Content (BLOCKING)

Scans file content for:

| Pattern | Example |
|---------|---------|
| Google API Keys | `AIza...` (39 chars) |
| OpenAI API Keys | `sk-...` (51 chars) |
| Stripe Keys | `sk_live_...`, `pk_live_...` |
| AWS Keys | `AKIA...` (20 chars) |
| GitHub Tokens | `ghp_...`, `gho_...`, `ghs_...` |
| Private Keys | `-----BEGIN RSA PRIVATE KEY-----` |
| Passwords in Config | `password = "..."`, `passwd:` |
| Firebase Config | JSON with `apiKey` field |
| Connection Strings | `mongodb://user:pass@`, `postgres://` |
| Slack Tokens | `xox[baprs]-...` |

### 3. Secrets in Logs (WARNING)

Scans for sensitive data being logged. This is a **WARNING** (not blocking) because:
- **Local dev logging is OK** - Detailed logging helps debug issues (e.g., AI prompts)
- **Cloud logs (GCP) are OK** - Access is restricted to project owners
- **Backend logging is generally OK** - Server logs aren't publicly exposed

**When logging secrets IS a problem:**
- **Frontend code** - `console.log` in browser is visible to users via DevTools
- **CI/CD output** - GitHub Actions logs may be visible to collaborators
- **Committed debug code** - Temporary debug logging shouldn't go to production

**Sensitive variable patterns detected:**
| Variable Pattern | Risk if exposed |
|-----------------|-----------------|
| `token`, `authToken`, `accessToken` | Auth bypass |
| `password`, `passwd`, `pwd` | Account compromise |
| `apiKey`, `api_key`, `secretKey` | API abuse |
| `credential`, `privateKey` | Full access |

**Action on warnings:**
- Review flagged lines and confirm they're intentional
- For frontend: Remove or guard with `if (import.meta.env.DEV)`
- For backend: Generally OK, but review before merging

### 4. Filename Exceptions (Bypass Sensitive File Check)

These files bypass the sensitive **filename** check but are **still content-scanned** for secrets:
- `.env.example` - template files are meant to be committed
- `.env.template`
- `.env.*.example`
- `.env.*.template`

### 5. Content Scan Exceptions (Skip Content Scanning)

These files are skipped entirely (no content scanning):
- `.husky/pre-commit` - contains regex patterns that look like secrets
- Binary files (images, fonts, etc.)

## Steps

### 1. Get Files to Scan

```bash
# Determine scan mode
SCAN_MODE="${1:---staged}"

if [[ "$SCAN_MODE" == "--staged" ]]; then
  # Get staged files only
  FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
else
  # Get all modified files (staged + unstaged)
  FILES=$(git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null)
  STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
  FILES=$(echo -e "$FILES\n$STAGED" | sort -u | grep -v '^$')
fi

FILE_COUNT=$(echo "$FILES" | grep -c . || echo "0")

if [[ "$FILE_COUNT" -eq 0 ]]; then
  echo "No files to scan."
  exit 0
fi

echo "Scanning $FILE_COUNT file(s)..."
echo ""
```

### 2. Check Sensitive File Patterns

For each file, check against blocking patterns:

```
BLOCKING_FILES = []

For each file in FILES:
  # Skip filename exceptions (templates) - these will still be content-scanned later
  if file matches any of:
    - \.env\.example$
    - \.env\.template$
    - \.env\..*\.example$
    - \.env\..*\.template$
  then SKIP (filename check only, content scan still runs)

  # Check blocking patterns
  if file matches any of:
    - ^\.env$
    - ^\.env\.
    - \.jks$
    - \.keystore$
    - \.p12$
    - \.pem$
    - \.key$
    - credentials\.json$
    - service-account.*\.json$
    - firebase-adminsdk.*\.json$
    - google-services\.json$
    - GoogleService-Info\.plist$
    - \.secret$
    - ^secrets/
    - ^private/
    - id_rsa
    - id_ed25519
    - \.pfx$
  then ADD to BLOCKING_FILES
```

### 3. Scan File Content for Secrets

For each non-binary file not already blocked:

```
CONTENT_ISSUES = []

SECRET_PATTERNS = [
  # Google/Firebase
  'AIza[0-9A-Za-z_-]{35}',

  # OpenAI
  'sk-[0-9a-zA-Z]{48}',

  # Stripe
  'sk_live_[0-9a-zA-Z]{24,}',
  'pk_live_[0-9a-zA-Z]{24,}',
  'sk_test_[0-9a-zA-Z]{24,}',

  # AWS
  'AKIA[0-9A-Z]{16}',

  # GitHub
  'ghp_[0-9a-zA-Z]{36}',
  'gho_[0-9a-zA-Z]{36}',
  'ghs_[0-9a-zA-Z]{36}',
  'github_pat_[0-9a-zA-Z_]{22,}',

  # Slack
  'xox[baprs]-[0-9a-zA-Z-]{10,}',

  # Private Keys
  '-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----',

  # Generic patterns (check carefully for false positives)
  'password\s*[=:]\s*["\'][^"\']{8,}',
  'api[_-]?key\s*[=:]\s*["\'][^"\']{20,}',

  # Connection strings with credentials
  'mongodb(\+srv)?://[^/\s]+:[^@\s]+@',
  'postgres://[^/\s]+:[^@\s]+@',
  'mysql://[^/\s]+:[^@\s]+@',
]

For each file in FILES (excluding BLOCKING_FILES):
  # Skip binary files
  if file is binary: SKIP

  # Skip image files only (NOT .md - docs can contain pasted secrets!)
  if file ends with .png, .jpg, .jpeg, .gif, .svg, .ico, .webp: SKIP

  # Skip husky pre-commit hook (contains regex patterns that look like secrets)
  if file is .husky/pre-commit: SKIP

  For each pattern in SECRET_PATTERNS:
    matches = grep -nE pattern file
    if matches found:
      ADD {file, line, match} to CONTENT_ISSUES
```

### 4. Scan for Secrets in Logs (Warnings)

Check for potentially sensitive data being logged:

```
LOG_WARNINGS = []

# Sensitive variable names that shouldn't be logged
SENSITIVE_VARS = [
  'token', 'authToken', 'accessToken', 'refreshToken', 'idToken',
  'password', 'passwd', 'pwd', 'pass',
  'apiKey', 'api_key', 'apiSecret', 'secretKey',
  'credential', 'creds', 'privateKey', 'private_key',
  'authorization', 'bearer',
  'connectionString', 'connStr'
]

# Log function patterns (generalized for any logger)
LOG_PATTERNS = [
  'console\.(log|info|debug|warn|error)',
  'req\.log\.(info|debug|warn|error|trace)',
  'logger\.(log|info|debug|warn|error|trace)',
  '\blog\s*\(',
  '\bdebug\s*\(',
  '\binfo\s*\(',
  '\bwarn\s*\(',
  '\berror\s*\('
]

For each file in FILES:
  # Only check code files for logging issues (not .md, .json, etc.)
  if file does not end with .js, .jsx, .ts, .tsx: SKIP

  For each line containing a LOG_PATTERN:
    For each var in SENSITIVE_VARS:
      if var appears in the log statement:
        ADD {file, line, var, severity: "warning"} to LOG_WARNINGS

  # Also flag full object logging that might contain secrets
  Check for patterns like:
    - log(req.body)
    - log(req.headers)
    - log(process.env)
    - log(user) where user might contain password hash
```

### 5. Generate Report

Always show detailed findings summary, even when passing.

```markdown
════════════════════════════════════════
   Security Scan Results
════════════════════════════════════════

Scanned: X file(s)

[ALWAYS show what was checked:]
✓ Checked for sensitive files (.env, keystores, credentials)
✓ Checked for hardcoded secrets (API keys, tokens, passwords)
✓ Checked for secrets in log statements

─────────────────────────────────────────

[If BLOCKING_FILES not empty:]
🔴 BLOCKING: Sensitive Files Staged (X)
─────────────────────────────────────────
   ❌ backend/.env
   ❌ frontend/.env.local
   ❌ release.keystore

   These files contain secrets and must NOT be committed!
   To unstage: git reset HEAD <file>

[If CONTENT_ISSUES not empty:]
🔴 BLOCKING: Secrets Found in Code (X)
─────────────────────────────────────────
   ❌ src/config.js:15
      Found: Google API key (AIza...)

   ❌ backend/services/firebase.js:8
      Found: Private key header

   Remove secrets and use environment variables instead.

[If LOG_WARNINGS not empty:]
🟡 WARNING: Potential Secrets in Logs (X)
─────────────────────────────────────────
   ⚠️  frontend/src/api/auth.js:42
      Logging 'token' - may expose auth token in browser console

   ⚠️  backend/src/controllers/chat.js:89
      Logging 'apiKey' - review if intentional

   Note: Backend logging to GCP is generally OK (restricted access).
         Frontend console.log is visible to users - review carefully.

[If NO issues found:]
✅ No Issues Found
─────────────────────────────────────────
   No sensitive files, hardcoded secrets, or risky logging detected.

════════════════════════════════════════
Summary:
   🔴 Blocking:  X
   🟡 Warnings:  Y

[If blocking > 0:]
   ❌ SCAN FAILED - Fix blocking issues before committing
[Else if warnings > 0:]
   ✅ SCAN PASSED (review Y warnings above)
[Else:]
   ✅ SCAN PASSED - All clear
════════════════════════════════════════
```

### 6. Exit Code

- **Exit 0**: No blocking issues (warnings OK), safe to commit
- **Exit 1**: Blocking issues found, do NOT commit

## Auto-Fix Suggestions

When issues are found, provide actionable fixes:

### For Sensitive Files
```bash
# Remove from staging
git reset HEAD backend/.env

# Add to .gitignore (if not already)
echo "backend/.env" >> .gitignore
```

### For Secrets in Code
```javascript
// BEFORE (blocked)
const API_KEY = "AIzaSy0123456789ABCDEFGHIJKLMNOPQRSTUV";

// AFTER (safe)
const API_KEY = process.env.GOOGLE_API_KEY;
```

## Integration

### Called by /commit-push
```
/commit-push flow:
1. /lint-check --fix
2. /security-scan --staged  <-- This skill
3. git add . (if lint fixed things)
4. git commit
5. git push
```

### Called by /pr-flow
```
/pr-flow pre-flight:
1. /lint-check --fix
2. /security-scan --staged  <-- This skill
3. Commit any changes
4. Push to remote
5. Create PR
```

## Examples

### Example 1: Clean Scan (No Issues)
```
/security-scan

════════════════════════════════════════
   Security Scan Results
════════════════════════════════════════

Scanned: 5 file(s)

✓ Checked for sensitive files (.env, keystores, credentials)
✓ Checked for hardcoded secrets (API keys, tokens, passwords)
✓ Checked for secrets in log statements

─────────────────────────────────────────

✅ No Issues Found
─────────────────────────────────────────
   No sensitive files, hardcoded secrets, or risky logging detected.

════════════════════════════════════════
Summary:
   🔴 Blocking:  0
   🟡 Warnings:  0

   ✅ SCAN PASSED - All clear
════════════════════════════════════════
```

### Example 2: Env File Staged (Blocking)
```
/security-scan

════════════════════════════════════════
   Security Scan Results
════════════════════════════════════════

Scanned: 3 file(s)

✓ Checked for sensitive files (.env, keystores, credentials)
✓ Checked for hardcoded secrets (API keys, tokens, passwords)
✓ Checked for secrets in log statements

─────────────────────────────────────────

🔴 BLOCKING: Sensitive Files Staged (2)
─────────────────────────────────────────
   ❌ backend/.env
   ❌ frontend/.env.local

   These files contain secrets and must NOT be committed!
   To unstage: git reset HEAD <file>

════════════════════════════════════════
Summary:
   🔴 Blocking:  2
   🟡 Warnings:  0

   ❌ SCAN FAILED - Fix blocking issues before committing
════════════════════════════════════════
```

### Example 3: Warnings Only (Passes with Review)
```
/security-scan

════════════════════════════════════════
   Security Scan Results
════════════════════════════════════════

Scanned: 4 file(s)

✓ Checked for sensitive files (.env, keystores, credentials)
✓ Checked for hardcoded secrets (API keys, tokens, passwords)
✓ Checked for secrets in log statements

─────────────────────────────────────────

🟡 WARNING: Potential Secrets in Logs (2)
─────────────────────────────────────────
   ⚠️  frontend/src/api/auth.js:42
      Logging 'token' - may expose auth token in browser console

   ⚠️  backend/src/services/ai.js:156
      Logging 'apiKey' - review if intentional

   Note: Backend logging to GCP is generally OK (restricted access).
         Frontend console.log is visible to users - review carefully.

════════════════════════════════════════
Summary:
   🔴 Blocking:  0
   🟡 Warnings:  2

   ✅ SCAN PASSED (review 2 warnings above)
════════════════════════════════════════
```

### Example 4: API Key in Code (Blocking)
```
/security-scan

════════════════════════════════════════
   Security Scan Results
════════════════════════════════════════

Scanned: 2 file(s)

✓ Checked for sensitive files (.env, keystores, credentials)
✓ Checked for hardcoded secrets (API keys, tokens, passwords)
✓ Checked for secrets in log statements

─────────────────────────────────────────

🔴 BLOCKING: Secrets Found in Code (1)
─────────────────────────────────────────
   ❌ frontend/src/firebase.js:12
      Found: Google API key (AIza...)

   Remove secrets and use environment variables instead.

════════════════════════════════════════
Summary:
   🔴 Blocking:  1
   🟡 Warnings:  0

   ❌ SCAN FAILED - Fix blocking issues before committing
════════════════════════════════════════
```

## Notes

- **Exit codes**: 0 = pass (warnings OK), 1 = fail (blocking issues)
- **Always shows details**: Reports what was scanned and all findings
- **Warnings don't block**: Log warnings are informational, review but can proceed
- **Non-destructive**: Only scans, never modifies files
- **Fast**: Pattern matching completes in seconds
- **Project-aware**: Includes patterns specific to Firebase, GCP, Android
- **Gitignore bypass detection**: Catches files force-added with `git add -f`
