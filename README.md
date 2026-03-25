# 🎬 Movie Watchlist

A personal movie tracker web app with cloud sync, user authentication, and per-user data isolation — built with HTML, CSS, vanilla JavaScript, and Firebase.

> **Midterm Project — Front-End Web Development**
> **Author: Jasmine Butterfield**

---

## Description

Movie Watchlist lets users save, manage, and track movies they want to watch. Every user has their own private watchlist stored in Firebase Firestore. Security rules enforce that users can never read or modify each other's data. Changes sync in real time across all tabs and devices.

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Add Movies** | Title, genre, comma-separated tags, notes, optional poster image |
| 2 | **Display List** | Movies render as cards with poster thumbnail, tags, and notes |
| 3 | **Remove Movies** | × button deletes a single movie; Clear All bulk-deletes |
| 4 | **Mark as Watched** | Checkbox toggles watched status with strikethrough styling |
| 5 | **Cloud Database** | Each user's data stored in Firestore; real-time sync via `onSnapshot` |
| 6 | **User Authentication** | Email/password sign-up & sign-in, Google One-Tap, session persistence |
| 7 | **User Profile** | Edit display name; upload a profile photo with live progress bar |
| 8 | **Media Uploads** | Poster images and avatars stored in Firebase Storage |
| 9 | **Search** | Full-text search across title, genre, tags, and notes |
| 10 | **Categories & Filtering** | Status tabs (All/Unwatched/Watched) + genre pills filter |
| 11 | **Security Rules** | Firestore & Storage rules ensure strict per-user data isolation |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | CSS3 (custom properties, flexbox, animations) |
| Logic | Vanilla JavaScript (ES6+) |
| Auth | Firebase Authentication (email/password + Google) |
| Database | Firebase Firestore (real-time, per-user sub-collections) |
| Storage | Firebase Storage (avatars, poster images) |

---

## Project Structure

```
movie-watchlist/
├── index.html   — App markup: auth section, main app shell, profile modal
├── style.css    — All styles including auth, profile, genre pills, toasts
├── script.js    — Firebase init, auth, Firestore CRUD, render logic
├── .gitignore   — Files excluded from version control
└── README.md    — This file
```

---

## Setup Guide

### 1. Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com) and click **Add project**.
2. Give it a name (e.g. `movie-watchlist`) and follow the setup wizard.

### 2. Enable Authentication

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Also enable **Google** (click the Google row, toggle it on, save).

### 3. Enable Firestore

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (security rules are set in step 5).
3. Pick a Cloud Firestore location and click **Done**.

### 4. Enable Storage

1. **Build → Storage → Get started**.
2. Accept the default rules for now (you'll replace them in step 5).
3. Click **Done**.

### 5. Apply Security Rules

#### Firestore Rules
In the Firebase Console → **Firestore Database → Rules**, replace the content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Each user can only read and write their own profile document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // Each user can only access their own movies sub-collection
      match /movies/{movieId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

Click **Publish**.

#### Storage Rules
In the Firebase Console → **Storage → Rules**, replace the content with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can only read/write files under their own uid folder
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Click **Publish**.

### 6. Register a Web App and Copy Your Config

1. **Project Settings (⚙️) → Your apps → Add app → Web**.
2. Register the app (Firebase Hosting not required).
3. Copy the `firebaseConfig` object shown.

### 7. Paste Your Config into script.js

Open `script.js` and replace the placeholder block near the top of the file:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

### 8. Open the App

Open `index.html` in a browser, or serve with a local static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. Sign up and start adding movies!

---

## How Data is Organised in Firestore

```
users/
  {userId}/
    displayName  : "Alice"
    email        : "alice@example.com"
    avatarUrl    : "https://..."
    createdAt    : Timestamp

    movies/
      {movieId}/
        title     : "Inception"
        genre     : "Sci-Fi"
        tags      : ["must-watch", "2010"]
        notes     : "Nolan at his best"
        posterUrl : "https://..."
        watched   : false
        createdAt : Timestamp
```

Security rules prevent any user from reading or writing another user's `users/{userId}` document or their `movies` sub-collection.

---

## How to Use

1. **Sign up** with email & password or Google on the auth screen.
2. **Add a movie** — fill in the title, pick a genre, add tags/notes, and optionally attach a poster image.
3. **Check the checkbox** on a card to mark it as watched (strikethrough).
4. **Click ×** to remove a movie, or **Clear All** to wipe the list.
5. **Search** using the search bar — matches title, genre, tags, and notes.
6. **Filter** with the All / Unwatched / Watched tabs and the genre pills.
7. **Edit your profile** — click your name/avatar in the header.
8. **Sign out** with the logout button (top-right).
