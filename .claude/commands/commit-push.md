---
description: Commit changes and push to current branch with pre-commit checks
allowed-tools: Bash, Read, Glob, Grep, Skill, AskUserQuestion
argument-hint: [-m "message"] [--no-push] [--skip-lint] [--skip-security]
---

# Commit Push - Safe Commit with Pre-Commit Checks

Commits and pushes changes with automatic lint checking and security scanning to prevent bad code and secrets from reaching GitHub.

## CRITICAL: Checkpoint-Based Execution

**This skill uses checkpoints to track progress. When resuming, check completion status first.**

### Execution Checkpoints

Update the todo list with these checkpoints. Before ANY action, verify previous checkpoints are complete:

```
[ ] CHECKPOINT 1: git status - verified changes exist
[ ] CHECKPOINT 2: /lint-check --fix - completed (or --skip-lint flag)
[ ] CHECKPOINT 3: git add . - staged changes
[ ] CHECKPOINT 4: /security-scan --staged - completed (or --skip-security flag) <<< CRITICAL
[ ] CHECKPOINT 5: Commit message confirmed
[ ] CHECKPOINT 6: git commit executed
[ ] CHECKPOINT 7: git push executed (or --no-push flag)
```

### Resume Logic

When returning to this skill after any interruption:
1. Check which checkpoints are marked complete in the todo list
2. Resume from the first incomplete checkpoint
3. **NEVER skip ahead** - if checkpoint 4 is incomplete, do NOT proceed to checkpoint 6

**STOP CONDITION**: If checkpoint 6 (git commit) is about to run but checkpoint 4 (security-scan) is incomplete, STOP and complete checkpoint 4 first.

### Husky Backup

The Husky pre-commit hook (`.husky/pre-commit`) provides a safety net by blocking commits with secrets at the git level.

---

## Commit Message Format (Conventional Commits)

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning.

**Format**: `<type>: <description>`

| Type | When to Use | Version Bump |
|------|-------------|--------------|
| `feat:` | New feature or capability | MINOR |
| `fix:` | Bug fix | PATCH |
| `feat!:` | Breaking change | MAJOR |
| `chore:` | Maintenance, deps, configs | None |
| `docs:` | Documentation only | None |
| `refactor:` | Code restructuring | None |
| `perf:` | Performance improvement | None |
| `test:` | Adding/updating tests | None |

**Examples:**
- `feat: add dark mode toggle`
- `fix: resolve login redirect bug`
- `feat!: change API response format` (breaking)
- `chore: update eslint config`

**Commit hooks enforce this format.** Invalid messages will be rejected. Subject must be lowercase.

## Arguments

- **-m "message"**: Commit message (prompted if not provided)
- **--no-push**: Commit only, don't push to remote
- **--skip-lint**: Skip lint check (not recommended)
- **--skip-security**: Skip security scan (DANGEROUS - use only if you know what you're doing)

## Usage

```bash
# Standard commit and push (prompts for message)
/commit-push

# With commit message
/commit-push -m "feat: add user profile page"

# Commit only, no push
/commit-push -m "wip: work in progress" --no-push

# Skip lint (if already ran manually)
/commit-push -m "fix: bug fix" --skip-lint
```

## Pre-Commit Checks

Before committing, this skill runs:

1. **Lint Check** (`/lint-check --fix`)
   - Runs ESLint on frontend and backend
   - Auto-fixes fixable issues
   - Fails if unfixable errors remain

2. **Security Scan** (`/security-scan --staged`)
   - Checks for sensitive files (.env, keystores, credentials)
   - Scans code for hardcoded secrets (API keys, tokens, passwords)
   - **BLOCKS commit if secrets detected**

## Workflow

```
┌─────────────────────────────────────────┐
│           /commit-push                  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  1. Check for changes to commit         │
│     git status --porcelain              │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  2. Run /lint-check --fix               │
│     - Auto-fix lint issues              │
│     - Fail if errors remain             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  3. Stage all changes                   │
│     git add .                           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  4. Run /security-scan --staged         │
│     - Check for sensitive files         │
│     - Scan for hardcoded secrets        │
│     - BLOCK if issues found             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  5. Get/confirm commit message          │
│     - Use -m if provided                │
│     - Prompt if not provided            │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  6. Commit with message                 │
│     git commit -m "..."                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  7. Push to remote (unless --no-push)   │
│     git push (or git push -u origin)    │
└─────────────────────────────────────────┘
```

## Steps

### 1. Parse Arguments

```bash
COMMIT_MSG=""
DO_PUSH=true
SKIP_LINT=false
SKIP_SECURITY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -m)
      COMMIT_MSG="$2"
      shift 2
      ;;
    --no-push)
      DO_PUSH=false
      shift
      ;;
    --skip-lint)
      SKIP_LINT=true
      shift
      ;;
    --skip-security)
      SKIP_SECURITY=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done
```

### 2. Check for Changes

```bash
echo "════════════════════════════════════════"
echo "   Commit Push - Safe Commit Workflow"
echo "════════════════════════════════════════"
echo ""

# Check if there are any changes
if [[ -z $(git status --porcelain) ]]; then
  echo "No changes to commit."
  exit 0
fi

# Show what will be committed
echo "📋 Changes to commit:"
git status --short
echo ""
```

### 3. Run Lint Check

```bash
if [[ "$SKIP_LINT" == "false" ]]; then
  echo "🔍 Running lint check..."
  echo "─────────────────────────────────────────"

  # Use Skill tool to call /lint-check --fix
  # This will:
  # - Run ESLint on frontend and backend
  # - Auto-fix what it can
  # - Return exit code 1 if errors remain

  LINT_RESULT=$(/lint-check --fix)
  LINT_EXIT=$?

  if [[ $LINT_EXIT -ne 0 ]]; then
    echo ""
    echo "❌ Lint check failed. Fix errors before committing."
    exit 1
  fi

  echo "✅ Lint check passed"
  echo ""
fi
```

### 4. Stage Changes

```bash
echo "📦 Staging changes..."
git add .

# Show final staging status
STAGED_COUNT=$(git diff --cached --name-only | wc -l)
echo "   Staged $STAGED_COUNT file(s)"
echo ""
```

### 5. Run Security Scan

```bash
if [[ "$SKIP_SECURITY" == "false" ]]; then
  echo "🔒 Running security scan..."
  echo "─────────────────────────────────────────"

  # Use Skill tool to call /security-scan --staged
  # This will:
  # - Check for sensitive files
  # - Scan content for secrets
  # - Return exit code 1 if issues found

  SECURITY_RESULT=$(/security-scan --staged)
  SECURITY_EXIT=$?

  if [[ $SECURITY_EXIT -ne 0 ]]; then
    echo ""
    echo "❌ Security scan failed. Remove secrets before committing."
    echo ""
    echo "⚠️  DO NOT use --skip-security to bypass this!"
    echo "   Secrets in git history are nearly impossible to fully remove."
    exit 1
  fi

  echo "✅ Security scan passed"
  echo ""
else
  echo "⚠️  Security scan SKIPPED (--skip-security)"
  echo "   Make sure you know what you're committing!"
  echo ""
fi
```

### 6. Get Commit Message

```bash
if [[ -z "$COMMIT_MSG" ]]; then
  # Prompt for commit message using AskUserQuestion
  # Options should include conventional commit types:
  # - feat: New feature
  # - fix: Bug fix
  # - chore: Maintenance
  # - refactor: Code refactoring
  # - docs: Documentation
  # - perf: Performance improvement
  # - test: Tests
  # - Custom message

  # Use AskUserQuestion to get commit type and message
  # The message MUST follow conventional commits format: "type: description"
fi

# Validate conventional commit format
# The commitlint hook will reject invalid formats, but we should ensure
# the message follows the pattern: type: description
# Valid types: feat, fix, chore, docs, refactor, perf, test, build, ci, style

FULL_MSG="$COMMIT_MSG"
```

### 7. Commit

```bash
echo "💾 Committing..."
echo "─────────────────────────────────────────"

git commit -m "$(cat <<'EOF'
$FULL_MSG

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

if [[ $? -ne 0 ]]; then
  echo "❌ Commit failed"
  exit 1
fi

echo "✅ Committed: $FULL_MSG"
echo ""
```

### 8. Push (Optional)

```bash
if [[ "$DO_PUSH" == "true" ]]; then
  echo "⬆️  Pushing to remote..."
  echo "─────────────────────────────────────────"

  CURRENT_BRANCH=$(git branch --show-current)

  # Check if remote branch exists
  if git rev-parse --verify "origin/$CURRENT_BRANCH" >/dev/null 2>&1; then
    git push
  else
    echo "   Creating remote branch..."
    git push -u origin "$CURRENT_BRANCH"
  fi

  if [[ $? -ne 0 ]]; then
    echo "❌ Push failed"
    exit 1
  fi

  echo "✅ Pushed to origin/$CURRENT_BRANCH"
else
  echo "ℹ️  Skipping push (--no-push)"
  echo "   Run 'git push' when ready"
fi
```

### 9. Summary

```bash
echo ""
echo "════════════════════════════════════════"
echo "   ✅ Commit Complete"
echo "════════════════════════════════════════"
echo ""
echo "   Message: $FULL_MSG"
echo "   Branch:  $CURRENT_BRANCH"
if [[ "$DO_PUSH" == "true" ]]; then
  echo "   Pushed:  Yes"
else
  echo "   Pushed:  No (run 'git push' when ready)"
fi
echo ""
echo "════════════════════════════════════════"
```

## Error Handling

### Lint Errors
```
❌ Lint check failed. Fix errors before committing.

The following files have errors:
  frontend/src/pages/Home.jsx:45 - 'unused' is defined but never used
  backend/src/controllers/auth.js:12 - Unexpected console statement

Run manually to see details:
  npm run lint --prefix frontend
  npm run lint --prefix backend
```

### Security Issues
```
❌ Security scan failed. Remove secrets before committing.

🔴 BLOCKING: Sensitive Files Staged
   ❌ backend/.env

To fix: git reset HEAD backend/.env

⚠️  DO NOT use --skip-security to bypass this!
```

### No Changes
```
No changes to commit.

If you expected changes, check:
  git status
  git diff
```

## Examples

### Example 1: Standard Commit
```bash
/commit-push -m "feat: add dark mode toggle"

# Output:
# ════════════════════════════════════════
#    Commit Push - Safe Commit Workflow
# ════════════════════════════════════════
#
# 📋 Changes to commit:
#  M frontend/src/components/Settings.jsx
#  M frontend/src/contexts/ThemeContext.jsx
#
# 🔍 Running lint check...
# ✅ Lint check passed
#
# 📦 Staging changes...
#    Staged 2 file(s)
#
# 🔒 Running security scan...
# ✅ Security scan passed
#
# 💾 Committing...
# ✅ Committed: feat: Add dark mode toggle
#
# ⬆️  Pushing to remote...
# ✅ Pushed to origin/feature/dark-mode
#
# ════════════════════════════════════════
#    ✅ Commit Complete
# ════════════════════════════════════════
```

### Example 2: Blocked by Security
```bash
/commit-push -m "feat: add firebase config"

# Output:
# ════════════════════════════════════════
#    Commit Push - Safe Commit Workflow
# ════════════════════════════════════════
#
# 📋 Changes to commit:
#  A frontend/.env.local
#  M frontend/src/firebase.js
#
# 🔍 Running lint check...
# ✅ Lint check passed
#
# 📦 Staging changes...
#    Staged 2 file(s)
#
# 🔒 Running security scan...
#
# 🔴 BLOCKING: Sensitive Files Staged
#    ❌ frontend/.env.local
#
# ❌ Security scan failed. Remove secrets before committing.
#
# ⚠️  DO NOT use --skip-security to bypass this!
#    Secrets in git history are nearly impossible to fully remove.
```

### Example 3: Work in Progress
```bash
/commit-push -m "wip: Partial feature" --no-push

# Output:
# ...
# ✅ Committed: chore: Partial feature (wip)
#
# ℹ️  Skipping push (--no-push)
#    Run 'git push' when ready
```

## Integration

### Works with other skills

```bash
# Full feature workflow
/feature-start my-feature     # Create branch
# ... make changes ...
/commit-push -m "feat: add feature"  # Safe commit + push
/pr-flow                      # Create PR with review

# Quick fix workflow
# ... fix bug ...
/commit-push -m "fix: bug fix"  # Safe commit + push
```

### Called by /pr-flow

The `/pr-flow` skill uses the same checks but handles commits differently for the PR workflow.

## Safety Philosophy

This skill prioritizes **preventing secrets from ever reaching GitHub**:

1. **Security scan is NOT optional by default** - You must explicitly bypass it
2. **Bypassing shows warnings** - Makes it clear you're taking a risk
3. **Secrets in git are forever** - Even after removal, they exist in history
4. **Better safe than sorry** - A few seconds of scanning prevents hours of credential rotation

## Notes

- **Conventional commits**: Messages must follow `type: description` format
- **Commit hooks**: The commitlint hook validates message format
- **Co-author**: Adds Claude co-author for attribution
- **Branch detection**: Handles new branches automatically
- **Non-destructive**: Lint --fix only fixes safe auto-fixable issues
- **Release workflow**: Use `/release` to bump version based on commits
