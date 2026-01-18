---
description: Run ESLint on frontend and backend
allowed-tools: Bash, AskUserQuestion
argument-hint: [--fix]
---

# Lint Check - ESLint Validation

Run ESLint on both frontend and backend codebases to catch code quality issues.

## Arguments

- **--fix**: Automatically fix fixable issues (runs with `--fix` flag)

## Usage

```bash
# Check for linting issues
/lint-check

# Check and auto-fix
/lint-check --fix
```

## Steps

### 1. Determine Mode

```bash
FIX_MODE=false

for arg in "$@"; do
  if [[ "$arg" == "--fix" ]]; then
    FIX_MODE=true
  fi
done
```

### 2. Run Linters

```bash
if [[ "$FIX_MODE" == "true" ]]; then
  echo "Running ESLint with auto-fix..."
  echo ""
else
  echo "Running ESLint checks..."
  echo ""
fi
```

**Frontend:**
```bash
echo "📦 Frontend (React + Vite)"
echo "─────────────────────────────"

cd frontend

if [[ "$FIX_MODE" == "true" ]]; then
  npm run lint -- --fix
else
  npm run lint
fi

FRONTEND_EXIT=$?
cd ..

if [[ $FRONTEND_EXIT -eq 0 ]]; then
  echo ""
  echo "✅ Frontend: No issues"
else
  echo ""
  echo "❌ Frontend: Found issues"
fi
```

**Backend:**
```bash
echo ""
echo "📦 Backend (Node.js + Express)"
echo "─────────────────────────────"

cd backend

if [[ "$FIX_MODE" == "true" ]]; then
  npm run lint -- --fix
else
  npm run lint
fi

BACKEND_EXIT=$?
cd ..

if [[ $BACKEND_EXIT -eq 0 ]]; then
  echo ""
  echo "✅ Backend: No issues"
else
  echo ""
  echo "❌ Backend: Found issues"
fi
```

### 3. Summary Report

```bash
echo ""
echo "═══════════════════════════════════════"
echo "   Lint Summary"
echo "═══════════════════════════════════════"
echo ""

TOTAL_ISSUES=0

if [[ $FRONTEND_EXIT -ne 0 ]]; then
  echo "❌ Frontend: Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo "✅ Frontend: Clean"
fi

if [[ $BACKEND_EXIT -ne 0 ]]; then
  echo "❌ Backend: Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo "✅ Backend: Clean"
fi

echo ""

if [[ $TOTAL_ISSUES -eq 0 ]]; then
  echo "🎉 All linting checks passed!"
  echo ""
  echo "═══════════════════════════════════════"
  exit 0
else
  echo "⚠️  Found issues in $TOTAL_ISSUES location(s)"
  echo ""

  if [[ "$FIX_MODE" != "true" ]]; then
    echo "💡 Run with --fix to auto-fix:"
    echo "   /lint-check --fix"
  fi

  echo ""
  echo "═══════════════════════════════════════"
  exit 1
fi
```

## Implementation

```bash
#!/bin/bash

# Parse arguments
FIX_MODE=false

for arg in "$@"; do
  if [[ "$arg" == "--fix" ]]; then
    FIX_MODE=true
  fi
done

# Header
if [[ "$FIX_MODE" == "true" ]]; then
  echo "Running ESLint with auto-fix..."
else
  echo "Running ESLint checks..."
fi
echo ""

# Frontend
echo "📦 Frontend (React + Vite)"
echo "─────────────────────────────"

cd frontend || exit 1

if [[ "$FIX_MODE" == "true" ]]; then
  npm run lint -- --fix 2>&1
else
  npm run lint 2>&1
fi

FRONTEND_EXIT=$?
cd ..

if [[ $FRONTEND_EXIT -eq 0 ]]; then
  echo ""
  echo "✅ Frontend: No issues"
else
  echo ""
  echo "❌ Frontend: Found issues"
fi

# Backend
echo ""
echo "📦 Backend (Node.js + Express)"
echo "─────────────────────────────"

cd backend || exit 1

if [[ "$FIX_MODE" == "true" ]]; then
  npm run lint -- --fix 2>&1
else
  npm run lint 2>&1
fi

BACKEND_EXIT=$?
cd ..

if [[ $BACKEND_EXIT -eq 0 ]]; then
  echo ""
  echo "✅ Backend: No issues"
else
  echo ""
  echo "❌ Backend: Found issues"
fi

# Summary
echo ""
echo "═══════════════════════════════════════"
echo "   Lint Summary"
echo "═══════════════════════════════════════"
echo ""

TOTAL_ISSUES=0

if [[ $FRONTEND_EXIT -ne 0 ]]; then
  echo "❌ Frontend: Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo "✅ Frontend: Clean"
fi

if [[ $BACKEND_EXIT -ne 0 ]]; then
  echo "❌ Backend: Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo "✅ Backend: Clean"
fi

echo ""

if [[ $TOTAL_ISSUES -eq 0 ]]; then
  echo "🎉 All linting checks passed!"
  echo ""
  echo "═══════════════════════════════════════"
  exit 0
else
  echo "⚠️  Found issues in $TOTAL_ISSUES location(s)"
  echo ""

  if [[ "$FIX_MODE" != "true" ]]; then
    echo "💡 Run with --fix to auto-fix:"
    echo "   /lint-check --fix"
  fi

  echo ""
  echo "═══════════════════════════════════════"
  exit 1
fi
```

## What Gets Checked

### Frontend ESLint Rules
- React hooks rules (dependencies, exhaustive-deps)
- JSX formatting and best practices
- ES6+ syntax issues
- Unused variables and imports
- Console statements (warnings)

### Backend ESLint Rules
- Node.js best practices
- Async/await patterns
- Error handling
- Unused variables and imports
- Console statements (should use `req.log`)

## Common Issues

### Frontend
```
❌ React Hook useEffect has a missing dependency
   Fix: Add missing dependency to useEffect array

❌ 'useState' is defined but never used
   Fix: Remove unused import

❌ Unexpected console statement
   Fix: Remove console.log or disable with comment
```

### Backend
```
❌ 'console' should be 'req.log' (custom rule)
   Fix: Replace console.log with req.log

❌ Unhandled promise rejection
   Fix: Add try/catch or .catch()

❌ 'someVar' is assigned but never used
   Fix: Remove unused variable
```

## Auto-Fix vs Manual Fix

**Auto-fixable** (--fix works):
- Unused imports (removed)
- Spacing and formatting
- Missing semicolons
- Simple rule violations

**Manual fix required**:
- Missing dependencies in useEffect
- Logic errors
- Complex patterns
- Console statements (need manual review)

## Examples

### Example 1: Clean codebase
```bash
/lint-check

# Output:
# 📦 Frontend (React + Vite)
# ✅ Frontend: No issues
#
# 📦 Backend (Node.js + Express)
# ✅ Backend: No issues
#
# 🎉 All linting checks passed!
```

### Example 2: Issues found
```bash
/lint-check

# Output:
# 📦 Frontend (React + Vite)
# ❌ src/pages/Home.jsx
#   5:10  warning  'useState' is defined but never used
#
# ❌ Frontend: Found issues
#
# 📦 Backend (Node.js + Express)
# ✅ Backend: No issues
#
# ⚠️  Found issues in 1 location(s)
# 💡 Run with --fix to auto-fix:
#    /lint-check --fix
```

### Example 3: Auto-fix
```bash
/lint-check --fix

# Output:
# Running ESLint with auto-fix...
#
# 📦 Frontend (React + Vite)
# ✅ Fixed 3 issues automatically
# ✅ Frontend: No issues
#
# 📦 Backend (Node.js + Express)
# ✅ Backend: No issues
#
# 🎉 All linting checks passed!
```

## Integration with Workflows

### Before Committing
```bash
/lint-check
# Fix any issues
git add .
git commit -m "..."
```

### Before PR
```bash
/lint-check --fix
git add .
git commit -m "chore: Fix linting issues"
```

### In CI/CD
Linting runs automatically on PRs via GitHub Actions (`.github/workflows/pr-validation.yml`)

## Notes

- **Exit code**: Returns 0 if all clean, 1 if issues found
- **Parallel**: Runs frontend and backend sequentially (for clear output)
- **Fix mode**: Only fixes auto-fixable issues, others need manual review
- **Context**: Shows file paths and line numbers for all issues
- **Root command**: Can also run `npm run lint` from root (runs both)
