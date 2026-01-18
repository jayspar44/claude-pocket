---
description: Create and switch to new feature branch
allowed-tools: Bash, AskUserQuestion
argument-hint: <feature-name> [base-branch]
---

# Feature Start - Create Feature Branch

Create a new feature branch from `develop` (or specified base) with proper naming convention.

## Arguments

- **$1** (required): Feature name (e.g., `dark-mode`, `user-settings`)
- **$2** (optional): Base branch (default: `develop`)

## Usage

```bash
# Create feature from develop (default)
/feature-start dark-mode

# Create feature from specific branch
/feature-start hotfix-auth main

# Create feature with multi-word name
/feature-start user-profile-page
```

## Branch Naming Convention

Branches are created as: `feature/<name>`

Examples:
- `dark-mode` → `feature/dark-mode`
- `user-settings` → `feature/user-settings`
- `api-refactor` → `feature/api-refactor`

## Steps

### 1. Parse Arguments

```bash
FEATURE_NAME=$1
BASE_BRANCH=${2:-develop}

if [[ -z "$FEATURE_NAME" ]]; then
  echo "❌ Usage: /feature-start <feature-name> [base-branch]"
  exit 1
fi

# Validate feature name (lowercase, hyphens only)
if [[ ! "$FEATURE_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "❌ Feature name must be lowercase with hyphens (e.g., 'dark-mode')"
  exit 1
fi

BRANCH_NAME="feature/$FEATURE_NAME"
```

### 2. Check Current Branch Status

```bash
# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "⚠️  You have uncommitted changes:"
  git status --short
  echo ""
  read -p "Stash changes before creating branch? (Y/n) " STASH_CONFIRM

  if [[ ! "$STASH_CONFIRM" =~ ^[Nn]$ ]]; then
    git stash push -m "Auto-stash before creating $BRANCH_NAME"
    echo "✅ Changes stashed"
  else
    echo "❌ Please commit or stash changes first"
    exit 1
  fi
fi
```

### 3. Fetch Latest from Remote

```bash
echo "Fetching latest from origin..."
git fetch origin

# Check if base branch exists
if ! git rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1; then
  echo "❌ Base branch 'origin/$BASE_BRANCH' not found"
  echo "   Available branches:"
  git branch -r | grep origin | head -5
  exit 1
fi
```

### 4. Check if Branch Already Exists

```bash
# Check local
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "❌ Branch '$BRANCH_NAME' already exists locally"
  read -p "Switch to existing branch? (y/N) " SWITCH_CONFIRM

  if [[ "$SWITCH_CONFIRM" =~ ^[Yy]$ ]]; then
    git checkout "$BRANCH_NAME"
    echo "✅ Switched to $BRANCH_NAME"
    exit 0
  else
    exit 1
  fi
fi

# Check remote
if git rev-parse --verify "origin/$BRANCH_NAME" >/dev/null 2>&1; then
  echo "⚠️  Branch '$BRANCH_NAME' exists on remote"
  read -p "Checkout remote branch? (y/N) " CHECKOUT_CONFIRM

  if [[ "$CHECKOUT_CONFIRM" =~ ^[Yy]$ ]]; then
    git checkout -b "$BRANCH_NAME" "origin/$BRANCH_NAME"
    echo "✅ Checked out remote branch $BRANCH_NAME"
    exit 0
  else
    exit 1
  fi
fi
```

### 5. Create Feature Branch

```bash
echo ""
echo "Creating feature branch:"
echo "  Name: $BRANCH_NAME"
echo "  Base: origin/$BASE_BRANCH"
echo ""

# Create and checkout branch
git checkout -b "$BRANCH_NAME" "origin/$BASE_BRANCH"

if [[ $? -eq 0 ]]; then
  echo "✅ Created and switched to $BRANCH_NAME"
else
  echo "❌ Failed to create branch"
  exit 1
fi
```

### 6. Summary and Next Steps

```bash
echo ""
echo "═══════════════════════════════════════"
echo "   Feature Branch Created"
echo "═══════════════════════════════════════"
echo ""
echo "Branch:     $BRANCH_NAME"
echo "Base:       origin/$BASE_BRANCH"
echo "Current:    $(git rev-parse --short HEAD)"
echo ""
echo "Next steps:"
echo "  1. Make your changes"
echo "  2. Commit: git add . && git commit -m 'feat: ...'"
echo "  3. Push: git push -u origin $BRANCH_NAME"
echo "  4. Create PR: gh pr create --base $BASE_BRANCH"
echo ""
echo "═══════════════════════════════════════"
```

## Implementation

```bash
#!/bin/bash

FEATURE_NAME=$1
BASE_BRANCH=${2:-develop}

# Validate feature name
if [[ -z "$FEATURE_NAME" ]]; then
  echo "❌ Usage: /feature-start <feature-name> [base-branch]"
  echo ""
  echo "Examples:"
  echo "  /feature-start dark-mode"
  echo "  /feature-start user-settings"
  echo "  /feature-start api-refactor main"
  exit 1
fi

if [[ ! "$FEATURE_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "❌ Feature name must be lowercase with hyphens"
  echo "   Good: 'dark-mode', 'user-settings'"
  echo "   Bad:  'Dark_Mode', 'UserSettings'"
  exit 1
fi

BRANCH_NAME="feature/$FEATURE_NAME"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "⚠️  Uncommitted changes detected:"
  echo ""
  git status --short
  echo ""
  read -p "Stash changes? (Y/n) " STASH_CONFIRM

  if [[ ! "$STASH_CONFIRM" =~ ^[Nn]$ ]]; then
    git stash push -m "Auto-stash before $BRANCH_NAME" >/dev/null 2>&1
    echo "✅ Changes stashed (use 'git stash pop' to restore)"
  else
    echo "❌ Please commit or stash changes first"
    exit 1
  fi
fi

# Fetch latest
echo ""
echo "Fetching latest from origin..."
git fetch origin --quiet

# Verify base branch exists
if ! git rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1; then
  echo "❌ Base branch 'origin/$BASE_BRANCH' not found"
  exit 1
fi

# Check if branch exists locally
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "⚠️  Branch '$BRANCH_NAME' already exists locally"
  read -p "Switch to it? (y/N) " SWITCH_CONFIRM

  if [[ "$SWITCH_CONFIRM" =~ ^[Yy]$ ]]; then
    git checkout "$BRANCH_NAME" >/dev/null 2>&1
    echo "✅ Switched to $BRANCH_NAME"
    exit 0
  else
    exit 1
  fi
fi

# Check if branch exists on remote
if git rev-parse --verify "origin/$BRANCH_NAME" >/dev/null 2>&1; then
  echo "⚠️  Branch '$BRANCH_NAME' exists on remote"
  read -p "Check it out? (y/N) " CHECKOUT_CONFIRM

  if [[ "$CHECKOUT_CONFIRM" =~ ^[Yy]$ ]]; then
    git checkout -b "$BRANCH_NAME" "origin/$BRANCH_NAME" >/dev/null 2>&1
    echo "✅ Checked out remote $BRANCH_NAME"
    exit 0
  else
    exit 1
  fi
fi

# Create branch
echo ""
echo "Creating feature branch:"
echo "  Name: $BRANCH_NAME"
echo "  Base: origin/$BASE_BRANCH"
echo ""

git checkout -b "$BRANCH_NAME" "origin/$BASE_BRANCH" >/dev/null 2>&1

if [[ $? -eq 0 ]]; then
  echo "✅ Created and switched to $BRANCH_NAME"
else
  echo "❌ Failed to create branch"
  exit 1
fi

# Summary
echo ""
echo "═══════════════════════════════════════"
echo "   Feature Branch Ready"
echo "═══════════════════════════════════════"
echo ""
echo "Branch:     $BRANCH_NAME"
echo "Base:       origin/$BASE_BRANCH"
echo "Commit:     $(git rev-parse --short HEAD)"
echo ""
echo "Next steps:"
echo "  1. Make your changes"
echo "  2. Commit: git add . && git commit -m 'feat: ...'"
echo "  3. Push: git push -u origin $BRANCH_NAME"
echo "  4. Create PR: gh pr create --base $BASE_BRANCH"
echo ""
echo "═══════════════════════════════════════"
```

## Examples

### Example 1: Simple feature from develop
```bash
/feature-start dark-mode

# Output:
# Fetching latest from origin...
# Creating feature branch:
#   Name: feature/dark-mode
#   Base: origin/develop
#
# ✅ Created and switched to feature/dark-mode
#
# Next steps:
#   1. Make your changes
#   2. Commit: git add . && git commit -m 'feat: ...'
#   3. Push: git push -u origin feature/dark-mode
```

### Example 2: Feature from main
```bash
/feature-start hotfix-auth main

# Output:
# Creating feature branch:
#   Name: feature/hotfix-auth
#   Base: origin/main
#
# ✅ Created and switched to feature/hotfix-auth
```

### Example 3: Branch already exists
```bash
/feature-start dark-mode

# Output:
# ⚠️  Branch 'feature/dark-mode' already exists locally
# Switch to it? (y/N) y
# ✅ Switched to feature/dark-mode
```

### Example 4: With uncommitted changes
```bash
/feature-start new-feature

# Output:
# ⚠️  Uncommitted changes detected:
#  M src/App.jsx
#  M src/index.css
#
# Stash changes? (Y/n) y
# ✅ Changes stashed (use 'git stash pop' to restore)
#
# ✅ Created and switched to feature/new-feature
```

## Branch Naming Rules

### ✅ Valid Names
- `dark-mode`
- `user-settings`
- `api-v2`
- `bug-fix-123`
- `refactor-auth`

### ❌ Invalid Names
- `Dark-Mode` (uppercase)
- `user_settings` (underscores)
- `user settings` (spaces)
- `user/settings` (slashes - conflicts with git)

## Safety Features

- **Uncommitted changes**: Auto-stash with descriptive message
- **Branch exists**: Prompts to switch instead of error
- **Remote sync**: Always fetches latest before creating
- **Base validation**: Checks base branch exists before creating
- **Clean output**: Clear status and next steps

## Integration with Other Skills

```bash
# Full workflow
/feature-start my-feature     # Create branch
# ... make changes ...
/lint-check --fix             # Check code quality
/code-review                  # Pre-PR review
git add . && git commit -m "feat: Add feature"
git push -u origin feature/my-feature
gh pr create --base develop
```

## Notes

- **Convention**: Uses `feature/` prefix for consistency
- **Base branch**: Defaults to `develop` (git-flow pattern)
- **Fetch first**: Always gets latest from remote
- **Stash safety**: Auto-stashes uncommitted work
- **No push**: Doesn't push to remote (do that after first commit)
