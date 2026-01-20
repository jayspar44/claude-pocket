# React + Express + Firebase Boilerplate

A production-ready boilerplate for building full-stack web and mobile applications with React, Express, Firebase, and Capacitor.

## Features

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, React Router
- **Backend**: Express 5, Node.js 22, Pino logging
- **Database**: Firebase Firestore with security rules
- **Auth**: Firebase Authentication (Email + Google)
- **Mobile**: Capacitor 8 for Android/iOS builds
- **CI/CD**: Cloud Build for GCP deployment
- **PR Previews**: Automatic preview environments
- **Versioning**: Conventional commits + standard-version
- **Claude Code**: Pre-configured slash commands for development workflow

## Quick Start

### 1. Create from Template

```bash
# Using GitHub CLI
gh repo create my-app --template jayspar44/boilerplate-react-express-firebase
cd my-app

# Or clone manually
git clone https://github.com/jayspar44/boilerplate-react-express-firebase.git my-app
cd my-app
rm -rf .git && git init
```

### 2. Initialize Project

```bash
npm install
npm run init
```

Follow the prompts to configure your project name, Firebase project ID, etc.

### 3. Set Up Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.template frontend/.env.local
# Edit both files with your Firebase credentials
```

### 4. Start Development

```bash
npm run dev:local
```

Open http://localhost:4500

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Complete project documentation
- [SETUP.md](./SETUP.md) - Detailed first-time setup guide

## What's Included

### Frontend (`/frontend`)

- React 19 with Vite 7
- Tailwind CSS 4 with dark mode
- React Router for navigation
- Axios API client with auth interceptors
- Context providers (Auth, Theme, Connection, UserPreferences)
- Reusable UI components (Button, Card, Layout)
- Mobile-ready with Capacitor

### Backend (`/backend`)

- Express 5 with modern middleware
- Firebase Admin SDK integration
- Structured as controller-service pattern
- Pino logging with pretty print for dev
- Rate limiting and CORS configuration
- Health endpoint with version info

### CI/CD

- Cloud Build configuration for dev/prod
- PR preview environments
- GitHub Actions for PR validation
- Automated version bumping

### Claude Code Integration

- Pre-configured slash commands
- Multi-agent code review
- Security scanning
- Conventional commit enforcement

## Slash Commands

| Command | Description |
|---------|-------------|
| `/feature-start` | Create a new feature branch |
| `/commit-push` | Safe commit with lint and security checks |
| `/lint-check` | Run ESLint with optional auto-fix |
| `/security-scan` | Scan for secrets and sensitive data |
| `/code-review` | Multi-agent code review |
| `/pr-flow` | Autonomous PR workflow |
| `/release` | Auto-bump version based on commits |

## Project Structure

```
├── frontend/           # React + Vite app
│   ├── src/
│   │   ├── api/       # API client and services
│   │   ├── components/# UI components
│   │   ├── contexts/  # React contexts
│   │   ├── pages/     # Route pages
│   │   └── utils/     # Utilities
│   └── scripts/       # Build scripts
├── backend/           # Express API
│   └── src/
│       ├── controllers/
│       ├── routes/
│       └── services/
├── .claude/commands/  # Claude Code slash commands
├── .github/workflows/ # GitHub Actions
└── scripts/          # Dev tooling
```

## License

MIT

---

Created with ❤️ using this boilerplate template.
