# Firebase Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name (e.g., "database-cleanup-tool")
4. Disable Google Analytics (not needed for this project)
5. Click "Create project"

## Step 2: Enable Firestore Database

1. In your Firebase project, click "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in test mode" (we'll secure it later)
4. Select a location close to you
5. Click "Done"

## Step 3: Get Firebase Configuration

1. Click the gear icon (⚙️) next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click the web icon (`</>`) to add a web app
5. Enter app nickname (e.g., "cleanup-tool")
6. Don't check "Firebase Hosting"
7. Click "Register app"
8. Copy the `firebaseConfig` object

## Step 4: Update Your HTML File

1. Open `database_cleanup_report_clean.html`
2. Find this section around line 155:

```javascript
// Firebase configuration - YOU NEED TO REPLACE THIS WITH YOUR CONFIG
const firebaseConfig = {
  apiKey: "your-api-key-here",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id",
};
```

3. Replace it with your actual config from Step 3

## Step 5: Set Firestore Security Rules (Optional but Recommended)

1. In Firebase Console, go to "Firestore Database"
2. Click "Rules" tab
3. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write to cleanup-data collection
    match /cleanup-data/{document} {
      allow read, write: if true;
    }
  }
}
```

4. Click "Publish"

## Step 6: Test the Integration

1. Open your HTML file in a browser
2. Look for the Firebase status indicator next to the export buttons
3. It should show "Firebase connected - data will sync"
4. Make some changes (check boxes, edit terms, change categories)
5. Refresh the page - your changes should persist!

## What Gets Synced

- ✅ Checkbox completion status
- ✅ Edited proposed terms
- ✅ Modified category assignments
- ✅ Real-time sync across multiple browser tabs/devices

## Troubleshooting

**"Firebase not configured"**: Make sure you replaced the firebaseConfig with your actual values

**"Permission denied"**: Check your Firestore security rules

**Changes not syncing**: Check browser console for error messages

**Multiple datasets**: The system automatically creates separate storage for different JSON files based on content hash

## Data Structure

Your data is stored in Firestore under:

- Collection: `cleanup-data`
- Document ID: `dataset_[hash]` (automatically generated)
- Fields: `completedTerms`, `editedTerms`, `editedCategories`, `lastUpdated`

## Cost

Firebase Firestore has a generous free tier:

- 50,000 reads per day
- 20,000 writes per day
- 1GB storage

This should be more than enough for typical usage of this tool.
