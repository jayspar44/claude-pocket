# {{PROJECT_TITLE}}

{{PROJECT_DESCRIPTION}}

**Doc style:** Tables over prose, inline formats (`|`-separated), no duplicate info, bullets not paragraphs.

## Architecture

**Full-stack monorepo:**
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 + Capacitor 8
- **Backend**: Node.js 22 + Express 5
- **Database**: Firebase Firestore | **Auth**: Firebase Auth | **AI**: Gemini (optional)
- **Hosting**: Cloud Run (backend) + Firebase Hosting (frontend) | **CI/CD**: Cloud Build

## Project Structure

```
{{PROJECT_NAME}}/
├── frontend/                 # React + Vite web app
│   ├── src/
│   │   ├── pages/           # Route pages
│   │   ├── components/      # UI components (layout/, common/, ui/)
│   │   ├── contexts/        # AuthContext, UserPreferencesContext, ConnectionContext, ThemeContext
│   │   ├── api/             # Axios client and API services
│   │   └── utils/           # Helper functions
│   └── capacitor.config.json # Mobile app config
├── backend/                  # Express API server
│   ├── src/
│   │   ├── index.js         # Server entry point
│   │   ├── routes/api.js    # Route definitions
│   │   ├── controllers/     # auth, user, notes controllers
│   │   └── services/        # firebase service
│   └── Dockerfile           # Cloud Run container config
├── .claude/commands/         # Claude Code slash commands
├── .github/workflows/        # GitHub Actions
├── scripts/                  # Dev tooling
├── cloudbuild.yaml          # CI/CD pipeline (dev/prod)
├── cloudbuild-preview.yaml  # PR preview environments
├── cloud-run.config.json    # Cloud Run service URLs
└── firebase.json            # Firebase project config
```

## Environments

| Environment | Branch/Trigger | Backend URL | Frontend |
|-------------|----------------|-------------|----------|
| Local       | any            | http://localhost:4001 | http://localhost:4000 |
| Dev (GCP)   | develop        | Cloud Run dev service | Firebase Hosting dev |
| Prod (GCP)  | main           | Cloud Run prod service | Firebase Hosting prod |
| PR Preview  | PR to develop  | Cloud Run tagged revision | Firebase preview channel |

## Local Development

**Prerequisites:** Node.js 22+, npm

```bash
# Setup
npm run install-all
cp backend/.env.example backend/.env
cp frontend/.env.local.template frontend/.env.local
# Edit both files with your credentials

# Run (http://localhost:4000 frontend, :4001 backend)
npm run dev:local          # Both servers
npm run dev:frontend       # Frontend only
npm run dev:backend        # Backend only
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 4001) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK service account JSON |
| `GEMINI_API_KEY` | Google Gemini API key (optional) |
| `NODE_ENV` | Environment (development/production) |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL (default: /api) |
| `VITE_FIREBASE_CONFIG` | Firebase client config JSON |

## API Endpoints

All endpoints (except health) require Firebase Auth token in `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with version info (public) |
| POST | `/api/user/profile` | Create/update user profile |
| GET | `/api/user/profile` | Get user profile |
| GET | `/api/notes` | Get all notes |
| GET | `/api/notes/:id` | Get a note by ID |
| POST | `/api/notes` | Create a new note |
| PUT | `/api/notes/:id` | Update a note |
| DELETE | `/api/notes/:id` | Delete a note |

## Mobile (Android/iOS)

Capacitor for native builds. Three Android flavors with separate app IDs.

### Android Flavors

| Script | App ID | Backend |
|--------|--------|---------|
| `android:local` | `{{APP_ID_BASE}}.local` | Local |
| `android:dev` | `{{APP_ID_BASE}}.dev` | GCP dev |
| `android` | `{{APP_ID_BASE}}` | GCP prod |

### Android Commands

```bash
# First time setup
cd frontend && npx cap add android && npx cap open android

# Build for Android Studio
npm run android:local              # Local backend
npm run android:dev                # GCP dev backend
npm run android                    # GCP prod backend

# Build APK directly
npm run apk:local                  # localDebug
npm run apk:dev                    # devDebug
npm run apk:prod                   # prodRelease
```

## GCP Deployment

### CI/CD Triggers

| Trigger | Action | Config |
|---------|--------|--------|
| Push to `develop` | Deploy to dev | `cloudbuild.yaml` |
| Push to `main` | Deploy to prod | `cloudbuild.yaml` |
| PR to `develop` | Deploy preview | `cloudbuild-preview.yaml` |

### Branch Protection

| Branch | Requires PR | Direct Push | Force Push |
|--------|-------------|-------------|------------|
| `main` | Yes | Blocked | Blocked |
| `develop` | No | Allowed | Blocked |

## Security

### CRITICAL: Never Commit Secrets

**NEVER commit files containing secrets, credentials, or API keys.**

**Protected Files:** All `.env*` files EXCEPT `.env.example` / `.env.template`

**Before Committing:**
```bash
git status && git diff --cached   # Review staged changes
/security-scan                    # Run security scan
```

**Use `/commit-push` instead of `git commit`** - runs lint and security checks automatically.

## Claude Code Slash Commands

Custom commands in `.claude/commands/`:

| Command | Usage |
|---------|-------|
| `/feature-start` | `/feature-start <name> [base-branch]` - Create feature branch |
| `/commit-push` | `/commit-push [-m "msg"] [--no-push]` - Safe commit (lint + security) |
| `/security-scan` | `/security-scan [--staged \| --all]` - Scan for secrets |
| `/lint-check` | `/lint-check [--fix]` - ESLint with optional auto-fix |
| `/code-review` | `/code-review [pr-number\|branch]` - Multi-agent review |
| `/pr-flow` | `/pr-flow [--no-fix] [--auto-merge]` - Autonomous PR workflow |
| `/pr-merge` | `/pr-merge <pr-number> [--no-sync] [--delete-branch]` - Squash merge |
| `/release` | `/release [--patch\|--minor\|--major]` - Auto-bump version |
| `/build-app` | `/build-app [local\|dev\|prod]` - Build APK |

### Typical Workflow

```bash
/feature-start my-feature              # Create branch
/commit-push -m "feat: Add feature"    # Safe commit (conventional format)
/pr-flow                               # Create PR, auto-fix, merge
/release                               # Auto-bump version based on commits
```

## Coding Conventions

### Naming
- **Files**: kebab-case (e.g., `user-profile.js`, `api-routes.js`)
- **React Components**: PascalCase (e.g., `UserProfile.jsx`)
- **Variables/Functions**: camelCase
- **Directories**: kebab-case

### Frontend Patterns
- **State**: React Context for global state (Auth, Theme). Local state for components.
- **API**: Use the `api/` directory for Axios wrappers. Do not make raw fetch calls in components.
- **Styling**: Tailwind CSS utility classes. Use CSS variables for theming in `index.css`.
- **Mobile**: Capacitor is used. Avoid browser-only APIs without checks.

### Backend Patterns
- **Structure**: Controller-Service pattern
  - `routes/`: Express routers
  - `controllers/`: Request handling logic
  - `services/`: Business logic, Firebase calls
- **Logging**: Use `req.log` (Pino) instead of `console.log`

### Git Commits (Conventional Commits)

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning.

**Format**: `<type>: <description>`

| Type | When to Use | Version Bump |
|------|-------------|--------------|
| `feat:` | New feature | MINOR |
| `fix:` | Bug fix | PATCH |
| `feat!:` | Breaking change | MAJOR |
| `chore:` | Maintenance, deps | None |
| `docs:` | Documentation | None |
| `refactor:` | Code restructuring | None |
| `perf:` | Performance | None |
| `test:` | Tests | None |

**Examples:** `feat: add dark mode toggle`, `fix: resolve login redirect bug`, `chore: update deps`

**Commit hooks enforce this format.** Invalid messages are rejected by commitlint. Subject must be lowercase.
