---
description: Multi-agent code review (PR or pre-PR)
allowed-tools: Bash, Task, Read, Glob, Grep, Write
argument-hint: [pr-number | target-branch]
---

# Code Review - Multi-Agent Analysis

Comprehensive code review using specialized agents. Works on open PRs or local branches.

## Arguments (Optional)

- **$1**: PR number (e.g. `10`) OR target branch (e.g. `main`, `develop`)
- If omitted: Auto-detects target branch (feature→develop, develop→main)

## Usage

```bash
# Review open PR
/code-review 10

# Review current branch against develop
/code-review develop

# Auto-detect target branch
/code-review
```

## Multi-Agent Architecture

The skill launches **4 specialized parallel agents**:

### Agent #1: Security Scanner 🔒
**Focus**: Critical security vulnerabilities
- Auth verification on API endpoints (Firebase Auth required except /api/health)
- Hardcoded secrets, API keys, credentials
- Input validation (SQL injection, XSS, command injection)
- Sensitive data in logs or error messages
- Firestore security rules alignment

### Agent #2: Standards Enforcer 📋
**Focus**: Project conventions (CLAUDE.md)
- Backend logging: `req.log` (Pino) NOT `console.log`
- Frontend API calls: Must use `api/` directory wrappers, NOT raw fetch
- Naming conventions: Files kebab-case, Components PascalCase, variables camelCase
- Backend structure: Controller-Service pattern (routes→controllers→services)
- Frontend state: React Context for global, local state for components
- Mobile: Browser-only APIs must have Capacitor checks

### Agent #3: Logic & Correctness Analyzer 🔍
**Focus**: Bugs and error handling
- Error handling: Proper catch blocks, error propagation
- Async/await: Correct error handling in async functions
- Edge cases: null checks, empty arrays, missing fields, boundary conditions
- Race conditions and async bugs
- Off-by-one errors, logic flaws

### Agent #4: Performance & Cost Guardian ⚡
**Focus**: Cost control and performance
- AI endpoints (Gemini): Rate limiting required
- Firestore queries: Must be bounded (limits, pagination)
- No unbounded loops or recursive API calls
- Memory leaks (event listeners, subscriptions)
- Performance anti-patterns

## Severity Levels

Each agent classifies issues:

- 🔴 **BLOCKING** - Cannot merge until fixed:
  - Security vulnerabilities
  - Broken functionality
  - Data loss risk
  - Missing auth checks

- 🟡 **HIGH** - Should fix before merge:
  - CLAUDE.md standard violations
  - Missing error handling
  - Performance issues
  - Missing input validation

- 🟢 **MEDIUM** - Fix in follow-up acceptable:
  - Code clarity improvements
  - Minor refactoring opportunities
  - Missing edge case handling

- ℹ️ **INFO** - Optional improvements:
  - Style suggestions
  - Alternative approaches
  - Future enhancements

## Steps

### 1. Determine Review Scope

```
If $1 is numeric:
  → Review PR #$1 using `gh pr diff $1`
Else if $1 provided:
  → Review current branch vs $1 using `git diff $1...HEAD`
Else:
  → Auto-detect target:
    - Get current branch: `git branch --show-current`
    - If current is "develop": target = "main"
    - Else: target = "develop"
```

### 2. Get Review Context

```
- Get diff content
- Read CLAUDE.md
- Get commit messages
- Identify modified files
```

### 3. Launch Parallel Agents

Launch 4 Sonnet agents in parallel. Each agent receives:
- The diff content
- CLAUDE.md content
- Their specialized focus area
- Severity classification guidelines

**Agent Prompts:**

#### Security Scanner Agent
```
You are a security-focused code reviewer. Analyze this diff for security issues ONLY.

DIFF:
[diff content]

CLAUDE.MD SECURITY SECTION:
[relevant section]

CHECK FOR:
1. API endpoints missing Firebase Auth verification (except /api/health)
2. Hardcoded secrets, API keys, credentials, tokens
3. Input validation missing (SQL injection, XSS, command injection)
4. Sensitive data (passwords, tokens, PII) in logs or error messages
5. Firestore security rules mismatches

CLASSIFY each issue:
- 🔴 BLOCKING: Security vulnerability, missing auth, data exposure
- 🟡 HIGH: Missing input validation, weak security practice
- 🟢 MEDIUM: Security improvement opportunity
- ℹ️ INFO: Security best practice suggestion

OUTPUT FORMAT (JSON):
{
  "issues": [
    {
      "file": "path/to/file.js",
      "line": 123,
      "severity": "🔴 BLOCKING",
      "title": "Brief issue title",
      "description": "What's wrong and why",
      "code": "problematic code snippet",
      "fix": "suggested fix or approach"
    }
  ]
}

RULES:
- Only report real security issues, not false positives
- Include file paths and line numbers
- Be specific about the vulnerability
- Suggest concrete fixes
```

#### Standards Enforcer Agent
```
You are a code standards reviewer. Check CLAUDE.md compliance ONLY.

DIFF:
[diff content]

CLAUDE.MD CONVENTIONS:
[full coding conventions section]

CHECK FOR:
1. Backend logging: Must use `req.log` (Pino), NOT `console.log`
2. Frontend API calls: Must use `api/` wrappers, NOT raw fetch in components
3. Naming: Files kebab-case, Components PascalCase, variables camelCase
4. Backend structure: Controller-Service pattern (routes→controllers→services)
5. Frontend state: React Context global, local state for components
6. Mobile: Browser-only APIs need Capacitor checks

CLASSIFY:
- 🔴 BLOCKING: Critical standard violation that breaks architecture
- 🟡 HIGH: CLAUDE.md standard explicitly violated
- 🟢 MEDIUM: Minor standard deviation
- ℹ️ INFO: Style suggestion

OUTPUT FORMAT (JSON):
{
  "issues": [
    {
      "file": "path/to/file.js",
      "line": 123,
      "severity": "🟡 HIGH",
      "title": "Brief issue title",
      "description": "What standard is violated",
      "claudemd_section": "Quote relevant CLAUDE.md rule",
      "code": "current code",
      "fix": "code following standard"
    }
  ]
}

RULES:
- Only cite actual CLAUDE.md violations
- Quote the specific CLAUDE.md rule
- Show current vs correct code
```

#### Logic Analyzer Agent
```
You are a logic and correctness reviewer. Find bugs and logic errors ONLY.

DIFF:
[diff content]

CHECK FOR:
1. Error handling: Missing catch blocks, unhandled promise rejections
2. Async/await: Incorrect error propagation, missing await
3. Edge cases: Null checks, empty arrays, undefined fields, boundary conditions
4. Logic errors: Off-by-one, incorrect conditions, race conditions
5. Type errors: Incorrect type assumptions

CLASSIFY:
- 🔴 BLOCKING: Will cause crashes, data corruption, broken functionality
- 🟡 HIGH: Will cause errors in common scenarios
- 🟢 MEDIUM: Edge case that might cause issues
- ℹ️ INFO: Potential improvement

OUTPUT FORMAT (JSON):
{
  "issues": [
    {
      "file": "path/to/file.js",
      "line": 123,
      "severity": "🔴 BLOCKING",
      "title": "Brief issue title",
      "description": "What will go wrong and when",
      "code": "problematic code",
      "fix": "corrected code",
      "test_case": "Example scenario that breaks"
    }
  ]
}

RULES:
- Focus on real bugs, not style
- Explain what will break and when
- Provide example scenarios
```

#### Performance Agent
```
You are a performance and cost reviewer. Check for cost and performance issues ONLY.

DIFF:
[diff content]

CLAUDE.MD COST/RATE CONTROL:
[relevant section]

CHECK FOR:
1. AI endpoints (Gemini): Must have rate limiting
2. Firestore queries: Must be bounded (use limits, no unbounded reads)
3. No unbounded loops calling external APIs
4. Memory leaks: Unremoved event listeners, unclosed subscriptions
5. Performance anti-patterns: N+1 queries, unnecessary re-renders

CLASSIFY:
- 🔴 BLOCKING: Will cause runaway costs or crashes
- 🟡 HIGH: Significant cost or performance impact
- 🟢 MEDIUM: Minor inefficiency
- ℹ️ INFO: Optimization opportunity

OUTPUT FORMAT (JSON):
{
  "issues": [
    {
      "file": "path/to/file.js",
      "line": 123,
      "severity": "🟡 HIGH",
      "title": "Brief issue title",
      "description": "Cost or performance impact",
      "code": "problematic code",
      "fix": "optimized code",
      "impact": "Estimated cost/performance impact"
    }
  ]
}
```

### 4. Collect and Score Results

Wait for all 4 agents to complete. For each issue found:
1. Combine issues from all agents
2. Deduplicate (same file + line = same issue)
3. Keep highest severity if duplicates
4. Sort by severity (🔴 → 🟡 → 🟢 → ℹ️)

### 5. Generate Report

```markdown
## Code Review Results

**Scope**: [PR #10 | develop...feature-branch]
**Agents**: 4 parallel specialized reviewers
**Issues Found**: X blocking, Y high, Z medium, W info

---

### Summary Table

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 1 | `backend/src/foo.js` | 45 | Missing auth check | 🔴 BLOCKING |
| 2 | `frontend/src/bar.jsx` | 89 | Using raw fetch | 🟡 HIGH |

---

### 🔴 Blocking Issues (X)

**1. [Issue Title]**
- **Location**: `file/path.js:123`
- **Agent**: Security Scanner
- **Problem**: What's wrong and why it's critical
- **Fix**:
```js
// Current (wrong)
app.post('/api/data', async (req, res) => {
  // Missing auth check!
  const data = await getData();
});

// Required
app.post('/api/data', verifyToken, async (req, res) => {
  const data = await getData();
});
```

---

### 🟡 High Priority (Y)

**1. [Issue Title]** - `file:line` (Standards Enforcer)
Problem and fix.

---

### 🟢 Medium Priority (Z)

1. `file:line` - Brief suggestion (Logic Analyzer)

---

### ℹ️ Info (W)

1. Consider [improvement] for [reason] (Performance Agent)

---

### ✅ What's Good

- [Positive aspects noted by agents]

---

**Verdict**:
- ✅ **APPROVED** (0 blocking, 0 high)
- ⚠️ **APPROVED WITH NOTES** (0 blocking, some high/medium)
- ❌ **CHANGES REQUESTED** (has blocking issues)
```

### 6. Fix Blocking Issues (if any)

If blocking issues are found:
1. Fix each blocking issue
2. Commit and push the fix
3. **MANDATORY**: Document each fix in the report

### 7. Fixed Issues Summary (MANDATORY when issues are fixed)

When blocking issues are fixed during review, you MUST include this section:

```markdown
---

## Fixed Issues Details

### 🔴 BLOCKING (FIXED): [Issue Title]

**File**: `path/to/file.ext`
**Line**: XXX
**Agent**: [Which agent found it]

**Problem**: [Clear explanation of what was wrong and why it was critical]

**Original Code**:
```[language]
// The problematic code that was found
```

**Fixed Code**:
```[language]
// The corrected code after the fix
```

**Commit**: `[hash]` - "[commit message]"

---
```

This detailed documentation is required so users can:
- Understand what security/logic issues were caught
- Verify the fix is correct
- Learn from the issue to avoid similar problems
- Audit changes made during the review process

### 8. Next Steps

Based on verdict:
- **APPROVED**: "Ready to merge! No blocking issues."
- **APPROVED WITH NOTES**: "Consider addressing X high priority issues before merge."
- **CHANGES REQUESTED**: "Found X blocking issues that must be fixed."
- **FIXED AND READY**: "Fixed X blocking issues. See Fixed Issues Details section for full documentation."

## Error Handling

- If agent times out: Report which agent, continue with others
- If diff is empty: "No changes to review"
- If PR not found: "PR #X not found. Use: gh pr list"
- If target branch doesn't exist: "Branch 'X' not found"

## Example Usage

### Example 1: Review PR before merge
```
/code-review 10
```

### Example 2: Pre-PR review
```
# On feature branch
/code-review

# Reviews feature-branch vs develop
# Shows all issues before creating PR
```

### Example 3: Check against main
```
# On develop branch
/code-review main

# Reviews develop vs main
# Useful before creating release PR
```

## Notes

- **Agent model**: Uses Sonnet for quality reviews (Haiku too fast, misses issues)
- **Parallel execution**: All 4 agents run simultaneously (~30-60 seconds total)
- **Confidence threshold**: Only reports high-confidence issues (avoids false positives)
- **Context-aware**: Agents see full CLAUDE.md and understand project patterns
