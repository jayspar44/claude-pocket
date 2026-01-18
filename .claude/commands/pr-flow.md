---
description: Autonomous PR workflow with auto-fix
allowed-tools: Bash, Read, Edit, Task, AskUserQuestion, Skill
argument-hint: [--no-fix] [--auto-merge]
---

# PR Flow - Autonomous PR Workflow

Complete end-to-end PR lifecycle with autonomous code review and issue fixing.

## Arguments

- **--no-fix**: Skip Review-Fix Loop (just create PR and review once)
- **--auto-merge**: Auto-merge if PR is clean (no confirmation prompt)

## Usage

```bash
# Standard flow (interactive)
/pr-flow

# Skip auto-fix loop
/pr-flow --no-fix

# Fully autonomous
/pr-flow --auto-merge
```

## What It Does

1. **Pre-Flight Checks**
   - Runs `/lint-check --fix` to fix code quality issues
   - Runs `/security-scan --staged` to detect secrets (BLOCKS if found)
   - Commits any uncommitted changes
   - Pushes to remote

2. **Create PR**
   - Auto-generates PR title and description
   - Creates PR targeting appropriate branch (feature→develop, develop→main)

3. **Review & Fix Loop** (unless --no-fix)
   - Runs 4-agent code review (Security, Standards, Logic, Performance)
   - Autonomously fixes blocking/high priority issues
   - Re-reviews after fixes
   - Repeats until clean (max 3 iterations)

4. **Merge** (if clean)
   - Offers to squash merge
   - Syncs branches after merge (if to main)

## Workflow

### Phase 1: Pre-Flight

Run these bash commands directly:

```bash
#!/bin/bash

# Parse arguments
NO_FIX=false
AUTO_MERGE=false

for arg in "$@"; do
  case $arg in
    --no-fix) NO_FIX=true ;;
    --auto-merge) AUTO_MERGE=true ;;
  esac
done

echo "════════════════════════════════════════"
echo "   PR Flow - Autonomous Workflow"
echo "════════════════════════════════════════"
echo ""

# 1. Check git status
echo "📋 Pre-Flight Checks"
echo "─────────────────────────────────────────"

CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "❌ Not on a branch"
  exit 1
fi

# Determine target branch
if [[ "$CURRENT_BRANCH" == "develop" ]]; then
  TARGET_BRANCH="main"
else
  TARGET_BRANCH="develop"
fi

echo "Target branch:  $TARGET_BRANCH"
echo ""

# 1b. Check for unreleased commits
echo "📦 Checking release status..."
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  UNRELEASED_COUNT=$(git log $LAST_TAG..HEAD --oneline | wc -l)
  if [ "$UNRELEASED_COUNT" -gt 0 ]; then
    echo "⚠️  Found $UNRELEASED_COUNT commits since $LAST_TAG"
    echo ""
    # Use AskUserQuestion to prompt:
    # {
    #   "question": "You have {UNRELEASED_COUNT} commits since {LAST_TAG}. Run /release before creating PR?",
    #   "header": "Version",
    #   "options": [
    #     { "label": "Yes, release first (Recommended)", "description": "Auto-bump version, then create PR" },
    #     { "label": "No, continue with current version", "description": "PR will use existing version" }
    #   ]
    # }
    # If user selects "Yes": Run /release skill, then continue with PR flow.
  else
    echo "✅ No unreleased commits"
  fi
else
  echo "ℹ️  No release tags found (use /release --first for initial release)"
fi
echo ""

# 2. Check for changes
HAS_CHANGES=false
if [[ -n $(git status --porcelain) ]]; then
  HAS_CHANGES=true
  echo "📝 Uncommitted changes detected"
fi

# 3. Run lint-check --fix
echo "🔍 Running lint-check --fix..."
/lint-check --fix

# Check if lint made changes
LINT_FIXED=false
if [[ -n $(git status --porcelain) ]]; then
  if [[ "$HAS_CHANGES" == "false" ]]; then
    LINT_FIXED=true
    echo "✅ Lint auto-fixed issues"
  fi
  HAS_CHANGES=true
fi

# 4. Stage changes and run security scan
echo ""
echo "🔒 Running security scan..."
git add .
/security-scan --staged

SECURITY_EXIT=$?
if [[ $SECURITY_EXIT -ne 0 ]]; then
  echo ""
  echo "❌ Security scan failed!"
  echo "   Secrets or sensitive files detected in staged changes."
  echo "   Fix issues before creating PR."
  echo ""
  echo "   To see details: /security-scan --staged"
  exit 1
fi
echo "✅ Security scan passed"

# 5. Commit changes if any
if [[ "$HAS_CHANGES" == "true" ]]; then
  echo ""
  echo "📦 Committing changes..."

  # Get version for commit message
  VERSION=$(node -p "require('./version.json').version" 2>/dev/null || echo "")

  # Analyze changes to determine type
  DIFF=$(git diff --cached --stat 2>/dev/null || git diff --stat)

  # Simple heuristic for commit type
  if echo "$DIFF" | grep -q "test"; then
    TYPE="test"
  elif echo "$DIFF" | grep -q "fix\|bug"; then
    TYPE="fix"
  elif echo "$DIFF" | grep -q "feat\|add"; then
    TYPE="feat"
  elif echo "$DIFF" | grep -q "refactor"; then
    TYPE="refactor"
  else
    TYPE="chore"
  fi

  # Generate commit message
  if [[ "$LINT_FIXED" == "true" ]]; then
    COMMIT_MSG="chore: Fix linting issues"
  else
    COMMIT_MSG="$TYPE: Update code"
  fi

  if [[ -n "$VERSION" ]]; then
    COMMIT_MSG="v$VERSION: $COMMIT_MSG"
  fi

  git add .
  git commit -m "$COMMIT_MSG"

  echo "✅ Committed: $COMMIT_MSG"
fi

# 6. Push to remote
echo ""
echo "⬆️  Pushing to origin/$CURRENT_BRANCH..."

# Check if remote branch exists
if git rev-parse --verify "origin/$CURRENT_BRANCH" >/dev/null 2>&1; then
  git push
else
  git push -u origin "$CURRENT_BRANCH"
fi

if [[ $? -ne 0 ]]; then
  echo "❌ Failed to push"
  exit 1
fi

echo "✅ Pushed to remote"
echo ""

# Get commit count
COMMIT_COUNT=$(git log "origin/$TARGET_BRANCH..HEAD" --oneline 2>/dev/null | wc -l)

if [[ $COMMIT_COUNT -eq 0 ]]; then
  echo "❌ No commits to create PR from"
  echo "   Current branch is up to date with $TARGET_BRANCH"
  exit 1
fi

echo "📊 Ready for PR:"
echo "   Branch: $CURRENT_BRANCH → $TARGET_BRANCH"
echo "   Commits: $COMMIT_COUNT"
echo ""

# Export variables for agent
export CURRENT_BRANCH
export TARGET_BRANCH
export COMMIT_COUNT
export NO_FIX
export AUTO_MERGE
```

### Phase 2: Launch Orchestrator Agent

After pre-flight, launch the Orchestrator Agent:

```
Launch Task agent with subagent_type="general-purpose" and model="sonnet"

Agent prompt:
```

You are the PR Workflow Orchestrator for the Sammy project.

**CONTEXT:**
- Current branch: $CURRENT_BRANCH
- Target branch: $TARGET_BRANCH
- Commits ready: $COMMIT_COUNT
- No-fix mode: $NO_FIX
- Auto-merge mode: $AUTO_MERGE

**YOUR TASKS:**

### 1. CREATE PR

Get commits and generate PR content:

```bash
# Get commit log
git log origin/$TARGET_BRANCH..HEAD --oneline

# Analyze commits to generate PR content
```

Generate:
- **Title**: Concise summary (e.g., "Add dark mode feature", "Fix authentication bug")
- **Body**:
```markdown
## Summary
- Bullet point of main changes
- Another change
- Third change

## Test Plan
- How to verify the changes work
- Steps to test

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Create PR:
```bash
gh pr create --base $TARGET_BRANCH --title "YOUR_TITLE" --body "YOUR_BODY"
```

**Extract PR number from output.** The output will be like:
```
https://github.com/user/repo/pull/42
```

Parse the number (42 in this example).

### 2. SPAWN REVIEW-FIX LOOP (unless NO_FIX=true)

If $NO_FIX is false, launch Review-Fix Loop Agent:

```
Launch Task agent with subagent_type="general-purpose" and model="sonnet"
Pass PR number to agent
```

Agent prompt for Review-Fix Loop:

---

**You are the Review-Fix Loop Agent for PR #{pr_number}.**

**MISSION:** Autonomously fix blocking and high priority code issues through iterative review.

**ITERATION LIMIT:** 3 (prevents infinite loops)

**ALGORITHM:**

```
iteration = 1
stuck_count = 0
previous_issues = []

WHILE iteration <= 3:

  1. RUN CODE REVIEW
     Use Skill tool to call: /code-review {pr_number}

     Wait for review to complete
     Parse output for issues by severity:
       - 🔴 BLOCKING
       - 🟡 HIGH
       - 🟢 MEDIUM
       - ℹ️ INFO

  2. ANALYZE FINDINGS
     blocking_issues = [issues with 🔴]
     high_issues = [issues with 🟡]

     IF len(blocking_issues) == 0 AND len(high_issues) == 0:
       BREAK  # Clean! We're done

     issues_to_fix = blocking_issues + high_issues

  3. CHECK IF STUCK
     current_issues = serialize(issues_to_fix)

     IF current_issues == previous_issues:
       stuck_count += 1
       IF stuck_count >= 2:
         BREAK  # Can't fix automatically
     ELSE:
       stuck_count = 0

     previous_issues = current_issues

  4. FIX ISSUES
     FOR each issue in issues_to_fix:

       a. Read the file: Read tool on issue.file

       b. Locate problematic code at issue.line

       c. Apply fix using Edit tool:

          SECURITY 🔒:
          - Missing auth check → Add verifyToken middleware
          - Hardcoded secret → Remove, add to .env
          - No input validation → Add validation logic

          STANDARDS 📋:
          - console.log → req.log.info({...}, '...')
          - Raw fetch → Import from api/, use wrapper
          - Wrong naming → Rename following kebab-case/PascalCase

          LOGIC 🔍:
          - Missing catch → Wrap in try/catch
          - Missing await → Add await keyword
          - No null check → Add if (!value) return/throw

          PERFORMANCE ⚡:
          - No rate limit → Add rate limit middleware
          - Unbounded query → Add .limit(100)
          - Memory leak → Add cleanup in useEffect return

       d. Log what was fixed

  5. COMMIT FIXES
     git add .
     git commit -m "fix: Address code review issues (iteration {iteration})"
     git push

  6. INCREMENT
     iteration += 1

END WHILE

RETURN results:
{
  "iterations": iteration - 1,
  "issues_fixed": total_fixed_count,
  "final_status": "clean" | "has_blocking" | "has_high" | "max_iterations",
  "remaining_issues": [list of unfixed issues]
}
```

**ERROR HANDLING:**
- If /code-review fails: Retry once, then exit with error
- If Edit fails: Skip that specific fix, continue with others
- If commit/push fails: Report error and exit
- If can't parse issue location: Skip that fix

**IMPORTANT:**
- Only fix blocking (🔴) and high (🟡) priority issues
- Skip medium (🟢) and info (ℹ️) issues
- Be surgical - only change what's necessary
- Test your edits by re-reading the file

---

Wait for Review-Fix Loop Agent to complete.

It will return:
```json
{
  "iterations": N,
  "issues_fixed": N,
  "final_status": "clean" | "has_blocking" | "has_high" | "max_iterations",
  "remaining_issues": [...]
}
```

### 3. REPORT RESULTS

Show user a summary:

```
════════════════════════════════════════
   PR Flow Results
════════════════════════════════════════

PR Created:  #{pr_number} "Title"
URL:         https://github.com/user/repo/pull/{pr_number}

Review Status:
  Iterations:    {iterations}
  Issues Fixed:  {issues_fixed}
  Final Status:  {final_status_emoji} {final_status}

{IF remaining_issues:}
Remaining Issues: {count}
  {list issues by severity}
{END IF}

════════════════════════════════════════
```

### 4. OFFER TO CREATE ISSUES FOR REMAINING HIGH ITEMS

If there are remaining 🟡 HIGH issues that weren't fixed, offer to create GitHub issues:

```
IF remaining_issues contains HIGH severity items:

  Use AskUserQuestion:
  {
    "questions": [{
      "question": "Found {count} unfixed HIGH priority issues. Create GitHub issues to track them?",
      "header": "Track Issues",
      "multiSelect": false,
      "options": [
        {
          "label": "Yes, create issues",
          "description": "Create GitHub issues for each HIGH item to track for follow-up"
        },
        {
          "label": "No, skip",
          "description": "Proceed without creating tracking issues"
        }
      ]
    }]
  }

  IF user selects "Yes, create issues":
    FOR each HIGH issue in remaining_issues:
      Create GitHub issue using:

      gh issue create \
        --title "[Code Review] {issue.title}" \
        --body "$(cat <<'EOF'
      ## Issue from Code Review

      **Found in**: PR #{pr_number}
      **Agent**: {issue.agent}
      **Severity**: 🟡 HIGH

      ### Location
      `{issue.file}:{issue.line}`

      ### Problem
      {issue.description}

      ### Current Code
      ```{language}
      {issue.code}
      ```

      ### Suggested Fix
      ```{language}
      {issue.fix}
      ```

      ---
      *Auto-generated by /pr-flow code review*
      EOF
      )" \
        --label "code-review,high-priority"

      Report: "Created issue #{issue_number}: {issue.title}"

    Show summary:
    "Created {count} GitHub issues for follow-up"
```

### 5. OFFER MERGE

Offer merge if no BLOCKING issues remain (HIGH issues may exist as tracked issues):

Use AskUserQuestion:
```
{
  "questions": [{
    "question": "PR #{pr_number} ready to merge. {status_note}",
    "header": "Merge PR",
    "multiSelect": false,
    "options": [
      {
        "label": "Yes, merge now",
        "description": "Squash merge to {target_branch} and sync branches"
      },
      {
        "label": "No, I'll merge later",
        "description": "Exit without merging"
      }
    ]
  }]
}
```

Where `status_note` is:
- If clean: "No blocking issues."
- If has HIGH (now tracked): "{count} HIGH issues tracked as GitHub issues."

**If YES (or AUTO_MERGE=true):**
```bash
# Use Skill tool to call pr-merge
/pr-merge {pr_number}
```

**If NO:**
Exit with message:
```
PR #{pr_number} is ready for review.
Merge when ready: /pr-merge {pr_number}
```

### 6. ERROR HANDLING

- **PR creation fails**: Report error, exit
- **Review-Fix Loop fails**: Report what was fixed, show PR URL
- **Merge fails**: Report error, show PR URL for manual merge

**OUTPUT:**
Return a structured summary of the entire workflow.

```

### Phase 3: Summary

After Orchestrator Agent completes, show final summary.

## Safety Features

### Iteration Limit
- Max 3 review-fix iterations
- Prevents infinite loops
- Reports remaining issues after max

### Stuck Detection
- Tracks if same issues appear after fix
- Exits after 2 identical results
- Prevents wasted effort on unfixable issues

### Graceful Failures
- Skips individual fixes that fail
- Continues with other fixes
- Reports errors clearly

### Issue Prioritization
- Only fixes 🔴 BLOCKING and 🟡 HIGH
- Skips 🟢 MEDIUM and ℹ️ INFO
- Focuses on critical issues

## Example Outputs

### Success: Clean PR
```
════════════════════════════════════════
   PR Flow Results
════════════════════════════════════════

PR Created:  #42 "Add dark mode feature"
URL:         https://github.com/user/repo/pull/42

Review Status:
  Iterations:    2
  Issues Fixed:  5 (3 blocking, 2 high)
  Final Status:  ✅ Clean

════════════════════════════════════════

Merge now? → Yes, merge now
✅ PR merged successfully
✅ Synced develop with main
════════════════════════════════════════
```

### Partial Success: Issues Remain → Create Tracking Issues
```
════════════════════════════════════════
   PR Flow Results
════════════════════════════════════════

PR Created:  #43 "Refactor API layer"
URL:         https://github.com/user/repo/pull/43

Review Status:
  Iterations:    3 (max reached)
  Issues Fixed:  8 (5 blocking, 3 high)
  Final Status:  ⚠️  Has high priority issues

Remaining Issues: 2
  🟡 HIGH: Missing error handling in api/users.js:45
  🟡 HIGH: No input validation in controllers/auth.js:89

════════════════════════════════════════

Create GitHub issues to track them? → Yes, create issues
✅ Created issue #51: [Code Review] Missing error handling
✅ Created issue #52: [Code Review] No input validation

PR #43 ready to merge. 2 HIGH issues tracked as GitHub issues.
Merge now? → Yes, merge now
✅ PR merged successfully
```

### With --no-fix
```
════════════════════════════════════════
   PR Flow Results
════════════════════════════════════════

PR Created:  #44 "Update README"
URL:         https://github.com/user/repo/pull/44

Review Status:
  Iterations:    0 (--no-fix mode)
  Issues Fixed:  0
  Final Status:  ✅ Clean

════════════════════════════════════════

Merge now? → Yes, merge now
✅ PR merged successfully
```

## Integration with Other Skills

**Calls these skills automatically:**
- `/lint-check --fix` - Before creating PR (fixes code quality issues)
- `/security-scan --staged` - Before committing (BLOCKS if secrets found)
- `/code-review {pr-number}` - For reviewing (4 parallel agents)
- `/pr-merge {pr-number}` - When user confirms merge

**Skills that work well with pr-flow:**
- `/feature-start` - Create branch before starting work
- `/release` - Create a release before PR (auto-bumps version based on commits)
- `/commit-push` - For intermediate commits during development

**Full workflow:**
```bash
/feature-start my-feature    # Create branch
# ... make changes ...
/commit-push -m "wip: Progress"  # Safe intermediate commit
# ... more changes ...
/release                     # Auto-bump version based on commits
/pr-flow                     # Do everything else!
```

## Notes

- **Pre-flight**: Always runs lint-check --fix and security-scan before creating PR
- **Security first**: BLOCKS PR creation if secrets or sensitive files detected
- **Smart targeting**: Auto-detects develop→main or feature→develop
- **Autonomous**: Fixes issues without human intervention (within limits)
- **Safe**: Max iterations, stuck detection, graceful failures
- **Transparent**: Reports exactly what happened
- **Integrated**: Uses existing skills for each step
- **Efficient**: Parallel agents for code review (4 simultaneous)

## Troubleshooting

### "Security scan failed"
Secrets or sensitive files detected. Run `/security-scan --staged` to see details.
Common fixes:
- `git reset HEAD <file>` to unstage sensitive files
- Move secrets to `.env` files (which are gitignored)
- Use environment variables instead of hardcoded values

### "No commits to create PR from"
Your branch is up to date with target. Make some changes first.

### "Failed to push"
Check remote permissions and branch protection rules.

### "Review-Fix Loop failed"
Check the error message. May need manual fixes. PR was still created.

### "Can't fix issues automatically"
Some issues are too complex. The PR exists, fix them manually.

### Stuck in iteration loop
This shouldn't happen (max 3 iterations enforced). If it does, report a bug.
