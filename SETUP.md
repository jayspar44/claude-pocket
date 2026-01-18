# Detailed Setup Guide

This guide walks through setting up your project from scratch, including Firebase, GCP, and mobile builds.

## Prerequisites

- Node.js 22+
- npm
- Google Cloud SDK (`gcloud`)
- Firebase CLI (`firebase-tools`)
- Android Studio (for mobile builds)

## Step 1: Initialize the Project

After cloning the template:

```bash
npm install
npm run init
```

The init script will prompt for:
- **Project name**: lowercase with hyphens (e.g., `my-app`)
- **Display name**: Human-readable name (e.g., `My App`)
- **Firebase project ID**: Your Firebase project ID
- **GCP region**: Usually `us-central1`
- **App ID base**: Android package name (e.g., `io.company.myapp`)
- **GitHub repo**: Your repo path (e.g., `username/my-app`)

## Step 2: Create Firebase Project

### 2.1 Create Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Enter your project name
4. Disable Google Analytics (or enable if needed)
5. Click "Create project"

### 2.2 Enable Authentication

1. Go to **Authentication** > **Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** (optional)

### 2.3 Create Firestore Database

1. Go to **Firestore Database**
2. Click "Create database"
3. Choose **Production mode**
4. Select your region (e.g., `nam5` for US)

### 2.4 Get Client Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll to "Your apps"
3. Click **Web** (</>)
4. Register your app
5. Copy the `firebaseConfig` object

Add to `frontend/.env.local`:
```
VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
```

### 2.5 Get Service Account

1. Go to **Project Settings** > **Service accounts**
2. Click "Generate new private key"
3. Save the JSON file securely

Add the JSON content (single line) to `backend/.env`:
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

### 2.6 Deploy Firestore Rules

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules
```

## Step 3: Set Up GCP for Cloud Run

### 3.1 Enable APIs

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com
```

### 3.2 Create Secrets

Store your secrets in Secret Manager:

```bash
# Firebase client config (for frontend builds)
echo '{"apiKey":"..."}' | gcloud secrets create FIREBASE_CLIENT_CONFIG --data-file=-

# Firebase service account (for backend)
cat path/to/service-account.json | gcloud secrets create FIREBASE_SERVICE_ACCOUNT --data-file=-

# Gemini API key (optional)
echo "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

### 3.3 Grant Cloud Build Permissions

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant Secret Manager access
gcloud secrets add-iam-policy-binding FIREBASE_CLIENT_CONFIG \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding FIREBASE_SERVICE_ACCOUNT \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Grant Cloud Run deploy permission
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# Grant service account user permission
gcloud iam service-accounts add-iam-policy-binding \
  ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 3.4 Create Firebase Hosting Sites

```bash
# Create dev site
firebase hosting:sites:create YOUR_PROJECT_ID-dev

# Create prod site (if different from default)
firebase hosting:sites:create YOUR_PROJECT_ID
```

### 3.5 Set Up Cloud Build Triggers

In GCP Console > Cloud Build > Triggers:

**Dev Trigger:**
- Name: `deploy-dev`
- Event: Push to branch `develop`
- Config: `cloudbuild.yaml`
- Substitutions: `_ENV=dev`

**Prod Trigger:**
- Name: `deploy-prod`
- Event: Push to branch `main`
- Config: `cloudbuild.yaml`
- Substitutions: `_ENV=prod`

**PR Preview Trigger:**
- Name: `pr-preview`
- Event: Pull request to `develop`
- Config: `cloudbuild-preview.yaml`
- Substitutions: `_PR_NUMBER=$_PR_NUMBER`

## Step 4: First Deployment

### 4.1 Deploy Backend

```bash
cd backend
gcloud run deploy YOUR_APP-backend-dev \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="FIREBASE_SERVICE_ACCOUNT=FIREBASE_SERVICE_ACCOUNT:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

Note the Cloud Run URL hash (e.g., `u7dzitmnha-uc`) and update `cloud-run.config.json`.

### 4.2 Deploy Frontend

```bash
cd frontend
# Create .env.production with your Cloud Run URL
echo "VITE_API_URL=https://YOUR_APP-backend-dev-HASH.a.run.app/api" > .env.production
echo 'VITE_FIREBASE_CONFIG={"apiKey":"..."}' >> .env.production

npm run build
firebase deploy --only hosting:dev
```

### 4.3 Update CORS

After deployment, update backend CORS:

```bash
gcloud run services update YOUR_APP-backend-dev \
  --region us-central1 \
  --update-env-vars="^@^ALLOWED_ORIGINS=https://YOUR_PROJECT_ID-dev.web.app,capacitor://localhost"
```

## Step 5: Android Setup (Optional)

### 5.1 Add Android Platform

```bash
cd frontend
npx cap add android
```

### 5.2 Configure Flavors

Edit `frontend/android/app/build.gradle` to add flavors:

```gradle
android {
    flavorDimensions = ["environment"]
    productFlavors {
        local {
            dimension "environment"
            applicationIdSuffix ".local"
            resValue "string", "app_name", "My App Local"
        }
        dev {
            dimension "environment"
            applicationIdSuffix ".dev"
            resValue "string", "app_name", "My App Dev"
        }
        prod {
            dimension "environment"
            resValue "string", "app_name", "My App"
        }
    }
}
```

### 5.3 Build APK

```bash
npm run apk:dev      # Build dev APK
npm run apk:prod     # Build production APK
```

## Step 6: GitHub Setup

### 6.1 Branch Protection

Go to Settings > Branches and add rules:

**main:**
- Require PR before merge
- Require status checks (lint, build)
- Disable force push

**develop:**
- Allow direct push
- Disable force push

### 6.2 Secrets (for GitHub Actions)

Add these secrets in Settings > Secrets:
- `KEYSTORE_BASE64` - Base64 encoded release keystore
- `PLAY_SERVICE_ACCOUNT_JSON` - Play Store service account

## Verification Checklist

After setup, verify:

- [ ] `npm run dev:local` starts both servers
- [ ] Can create account and login
- [ ] Notes CRUD works
- [ ] `npm run lint` passes
- [ ] Push to develop triggers Cloud Build
- [ ] Dev deployment accessible
- [ ] PR preview environments work

## Troubleshooting

### CORS Errors

Update `ALLOWED_ORIGINS` in Cloud Run:
```bash
gcloud run services update SERVICE_NAME \
  --update-env-vars="^@^ALLOWED_ORIGINS=https://site1.web.app,https://site2.web.app"
```

### Firebase Auth Errors

1. Check `VITE_FIREBASE_CONFIG` is valid JSON
2. Verify auth domain in Firebase Console
3. Check browser console for specific errors

### Cloud Build Failures

1. Check Cloud Build logs in GCP Console
2. Verify secrets exist and have correct permissions
3. Ensure APIs are enabled

### Android Build Failures

1. Sync Gradle in Android Studio
2. Check `capacitor.config.json` has correct app ID
3. Verify JDK and Android SDK are installed
