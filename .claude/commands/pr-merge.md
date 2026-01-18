---
description: Squash merge PR with auto-sync and cleanup
allowed-tools: Bash, AskUserQuestion
argument-hint: <pr-number> [--no-sync] [--delete-branch]
---

# PR Merge - Smart Squash & Sync

Squash merge a PR with intelligent branch management:
- Merging to `main` → Auto-sync `develop` with `main`
- Merging from feature branch → Offer to delete feature branch
- **Protected**: NEVER deletes `main` or `develop` branches

## Arguments

- **$1** (required): PR number to merge
- **--no-sync**: Skip automatic develop sync (even if merging to main)
- **--delete-branch**: Auto-delete source branch without asking (safe: won't delete main/develop)

## Usage

```bash
# Standard merge (auto-sync if to main)
/pr-merge 10

# Merge without syncing develop
/pr-merge 10 --no-sync

# Merge and auto-delete source branch
/pr-merge 10 --delete-branch
```

## Steps

### 1. Get PR Information

```bash
gh pr view $1 --json number,title,baseRefName,headRefName,state,mergeable
```

Extract:
- `baseRefName`: Target branch (e.g., "main", "develop")
- `headRefName`: Source branch (e.g., "feature/foo", "develop")
- `state`: Must be "OPEN"
- `mergeable`: Must be "MERGEABLE"

**Validation:**
- PR must exist
- PR must be OPEN
- PR must be MERGEABLE (no conflicts)

### 2. Confirm Merge

```
About to squash merge:
  PR #10: "Add new feature"
  From: feature/new-feature
  To:   main

Continue? (Y/n)
```

### 3. Squash Merge

```bash
gh pr merge $1 --squash --auto
```

### 4. Post-Merge Actions

**Decision logic:**

```
IF base branch is "main" AND --no-sync NOT provided:
  → Sync develop with main

IF source branch is NOT "main" AND NOT "develop":
  → It's a feature branch
  → Offer to delete (or auto-delete if --delete-branch)

SAFETY CHECK: NEVER delete "main" or "develop"
```

### 5. Sync Develop (if merged to main)

```bash
if [[ "$BASE_BRANCH" == "main" ]] && [[ "$NO_SYNC" != "true" ]]; then
  echo "📦 Syncing develop with main..."

  git fetch origin
  git checkout develop
  git pull origin main
  git push origin develop

  echo "✅ develop synced with main"
fi
```

### 6. Delete Feature Branch (with safety checks)

```bash
# SAFETY CHECK: Never delete main or develop
if [[ "$HEAD_BRANCH" == "main" ]] || [[ "$HEAD_BRANCH" == "develop" ]]; then
  # Skip deletion - protected branch
  IS_FEATURE_BRANCH=false
else
  IS_FEATURE_BRANCH=true
fi

if [[ "$IS_FEATURE_BRANCH" == "true" ]]; then
  # Determine if we should delete
  if [[ "$AUTO_DELETE" == "true" ]]; then
    DELETE_BRANCH=true
  else
    echo "Delete source branch '$HEAD_BRANCH'? (y/N)"
    read -r DELETE_CONFIRM

    if [[ "$DELETE_CONFIRM" =~ ^[Yy]$ ]]; then
      DELETE_BRANCH=true
    fi
  fi

  if [[ "$DELETE_BRANCH" == "true" ]]; then
    echo "🗑️  Deleting branch $HEAD_BRANCH..."

    # Delete remote
    git push origin --delete "$HEAD_BRANCH"

    # Delete local (if exists and not current)
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "$HEAD_BRANCH" ]]; then
      git branch -D "$HEAD_BRANCH" 2>/dev/null || true
    fi

    echo "✅ Branch $HEAD_BRANCH deleted"
  fi
fi
```

### 7. Summary Report

```
═══════════════════════════════════════
   PR Merge Summary
═══════════════════════════════════════

✅ Merged PR #10: "Add new feature"
   From: feature/new-feature → main

✅ Synced develop with main

✅ Deleted branch feature/new-feature

═══════════════════════════════════════
```

## Safety Features

### Protected Branches

**NEVER deleted under any circumstances:**
- `main`
- `develop`

**Triple safety checks:**
1. Explicit check: `if branch == "main" || branch == "develop"` → skip
2. Feature branch detection: Only delete if NOT main AND NOT develop
3. No user prompt: Protected branches never even prompt for deletion

### Current Branch Safety

Won't delete local branch if you're currently on it (prevents breaking current work).

### Confirmation Required

By default, asks before deleting any branch. Use `--delete-branch` to auto-delete (still protected branches are safe).

## Examples

### Example 1: Merge develop → main
```bash
/pr-merge 10

# Result:
# ✅ Merged PR #10: "Release v1.2.0"
#    From: develop → main
# ✅ Synced develop with main
#
# (No delete prompt - develop is protected)
```

### Example 2: Merge feature → develop
```bash
/pr-merge 15

# Prompt: Delete source branch 'feature/new-ui'? (y/N)
# User: y
#
# Result:
# ✅ Merged PR #15: "Add new UI"
#    From: feature/new-ui → develop
# ✅ Deleted branch feature/new-ui
#
# (No sync - didn't merge to main)
```

### Example 3: Merge feature → main
```bash
/pr-merge 20

# Prompt: Delete source branch 'feature/hotfix'? (y/N)
# User: y
#
# Result:
# ✅ Merged PR #20: "Hotfix"
#    From: feature/hotfix → main
# ✅ Synced develop with main
# ✅ Deleted branch feature/hotfix
```

### Example 4: Auto-delete feature branch
```bash
/pr-merge 25 --delete-branch

# No prompt, auto-deletes (but still safe for main/develop)
# Result:
# ✅ Merged PR #25
# ✅ Deleted branch feature/quick-fix
```

### Example 5: Merge without syncing
```bash
/pr-merge 30 --no-sync

# Merges but skips develop sync
```

## Implementation

```bash
#!/bin/bash

# Parse arguments
PR_NUMBER=$1
NO_SYNC=false
AUTO_DELETE=false

shift
for arg in "$@"; do
  case $arg in
    --no-sync) NO_SYNC=true ;;
    --delete-branch) AUTO_DELETE=true ;;
  esac
done

if [[ -z "$PR_NUMBER" ]]; then
  echo "❌ Usage: /pr-merge <pr-number> [--no-sync] [--delete-branch]"
  exit 1
fi

# Get PR info
echo "Fetching PR #$PR_NUMBER..."
PR_JSON=$(gh pr view "$PR_NUMBER" --json number,title,baseRefName,headRefName,state,mergeable 2>&1)

if [[ $? -ne 0 ]]; then
  echo "❌ PR #$PR_NUMBER not found"
  exit 1
fi

TITLE=$(echo "$PR_JSON" | jq -r '.title')
BASE_BRANCH=$(echo "$PR_JSON" | jq -r '.baseRefName')
HEAD_BRANCH=$(echo "$PR_JSON" | jq -r '.headRefName')
STATE=$(echo "$PR_JSON" | jq -r '.state')
MERGEABLE=$(echo "$PR_JSON" | jq -r '.mergeable')

# Validate
if [[ "$STATE" != "OPEN" ]]; then
  echo "❌ PR #$PR_NUMBER is not open (state: $STATE)"
  exit 1
fi

if [[ "$MERGEABLE" != "MERGEABLE" ]]; then
  echo "❌ PR #$PR_NUMBER has merge conflicts - resolve them first"
  exit 1
fi

# Confirm
echo ""
echo "About to squash merge:"
echo "  PR #$PR_NUMBER: \"$TITLE\""
echo "  From: $HEAD_BRANCH → $BASE_BRANCH"
echo ""
read -p "Continue? (Y/n) " CONFIRM

if [[ "$CONFIRM" =~ ^[Nn]$ ]]; then
  echo "Cancelled"
  exit 0
fi

# Merge
echo ""
echo "🔀 Merging..."
gh pr merge "$PR_NUMBER" --squash --auto

if [[ $? -ne 0 ]]; then
  echo "❌ Merge failed"
  exit 1
fi

echo "✅ Merged PR #$PR_NUMBER"

ACTIONS=()

# Sync develop if merged to main
if [[ "$BASE_BRANCH" == "main" ]] && [[ "$NO_SYNC" != "true" ]]; then
  echo ""
  echo "📦 Syncing develop with main..."

  git fetch origin
  git checkout develop
  git pull origin main
  git push origin develop

  if [[ $? -eq 0 ]]; then
    echo "✅ develop synced"
    ACTIONS+=("Synced develop with main")
  else
    echo "⚠️  Sync failed - run manually: git checkout develop && git pull origin main"
  fi
fi

# Delete feature branch (NEVER main or develop)
SHOULD_DELETE=false

# SAFETY: Protected branch check
if [[ "$HEAD_BRANCH" == "main" ]] || [[ "$HEAD_BRANCH" == "develop" ]]; then
  # Protected branch - never delete
  SHOULD_DELETE=false
else
  # Feature branch - offer to delete
  if [[ "$AUTO_DELETE" == "true" ]]; then
    SHOULD_DELETE=true
  else
    echo ""
    read -p "Delete branch '$HEAD_BRANCH'? (y/N) " DELETE_CONFIRM
    if [[ "$DELETE_CONFIRM" =~ ^[Yy]$ ]]; then
      SHOULD_DELETE=true
    fi
  fi
fi

if [[ "$SHOULD_DELETE" == "true" ]]; then
  echo ""
  echo "🗑️  Deleting $HEAD_BRANCH..."

  git push origin --delete "$HEAD_BRANCH" 2>/dev/null

  CURRENT=$(git branch --show-current)
  if [[ "$CURRENT" != "$HEAD_BRANCH" ]]; then
    git branch -D "$HEAD_BRANCH" 2>/dev/null || true
  fi

  echo "✅ Deleted branch $HEAD_BRANCH"
  ACTIONS+=("Deleted branch $HEAD_BRANCH")
fi

# Summary
echo ""
echo "═══════════════════════════════════════"
echo "   PR Merge Summary"
echo "═══════════════════════════════════════"
echo ""
echo "✅ Merged PR #$PR_NUMBER: \"$TITLE\""
echo "   From: $HEAD_BRANCH → $BASE_BRANCH"
echo ""

for action in "${ACTIONS[@]}"; do
  echo "✅ $action"
done

echo ""
echo "═══════════════════════════════════════"
```

## Error Handling

| Error | Behavior |
|-------|----------|
| PR not found | Exit with error |
| PR closed/merged | Exit with error |
| Merge conflicts | Exit with resolution instructions |
| Merge fails | Exit, no cleanup |
| Sync fails | Warn, show manual command |
| Delete fails | Warn, continue |

## Notes

- **Always squash**: Uses `--squash` for clean history
- **Protected branches**: `main` and `develop` NEVER deleted
- **Safe defaults**: Asks before deleting (unless `--delete-branch`)
- **Auto mode**: Uses `--auto` to merge when checks pass
- **Idempotent**: Safe to re-run if something fails
