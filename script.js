// =====================================================================
// script.js — Movie Watchlist
// Sections:
//   1.  Firebase Config & Initialization
//   2.  App State
//   3.  DOM References
//   4.  Helpers (toast, loading, avatar fallback)
//   5.  Auth — Sign Up, Sign In, Google, Sign Out
//   6.  Auth State Observer (session persistence)
//   7.  Profile — Load, Save, Avatar Upload
//   8.  Movies — Firestore real-time listener
//   9.  Movies — Add (with optional poster upload)
//  10.  Movies — Remove, Toggle Watched, Clear All
//  11.  Render — Movie list, genre pills
//  12.  Filter & Search logic
//  13.  Event Listeners
//  14.  Init
// =====================================================================


// ---- 1. Firebase Config & Initialization ----
// IMPORTANT: Replace the placeholder values below with your real Firebase
// project credentials from the Firebase Console → Project Settings → Your Apps.
// See README.md for the full setup guide.
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

firebase.initializeApp(firebaseConfig);

const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// Keep users signed in across page refreshes (Firebase default — explicit for clarity)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);


// ---- 2. App State ----
let movies        = [];           // in-memory cache, kept in sync by Firestore listener
let activeFilter  = 'all';        // 'all' | 'watched' | 'unwatched'
let activeGenre   = null;         // null = show all genres
let searchQuery   = '';           // current search string
let currentUser   = null;         // Firebase User object
let unsubMovies   = null;         // Firestore onSnapshot unsubscribe handle
let toastTimer    = null;         // debounce handle for toast auto-hide


// ---- 3. DOM References ----
// Auth
const authSection      = document.getElementById('auth-section');
const signinForm       = document.getElementById('signin-form');
const signupForm       = document.getElementById('signup-form');
const signinEmail      = document.getElementById('signin-email');
const signinPassword   = document.getElementById('signin-password');
const signupName       = document.getElementById('signup-name');
const signupEmail      = document.getElementById('signup-email');
const signupPassword   = document.getElementById('signup-password');
const googleBtn        = document.getElementById('google-btn');
const authError        = document.getElementById('auth-error');
const authTabs         = document.querySelectorAll('.auth-tab');

// App shell
const appSection       = document.getElementById('app');
const headerAvatar     = document.getElementById('header-avatar');
const headerName       = document.getElementById('header-name');
const logoutBtn        = document.getElementById('logout-btn');
const movieCountBadge  = document.getElementById('movie-count');
const loadingOverlay   = document.getElementById('loading-overlay');
const toast            = document.getElementById('toast');

// Profile modal
const profileModal         = document.getElementById('profile-modal');
const profileTrigger       = document.getElementById('profile-trigger');
const closeProfileBtn      = document.getElementById('close-profile');
const profileAvatar        = document.getElementById('profile-avatar');
const profileName          = document.getElementById('profile-name');
const profileEmail         = document.getElementById('profile-email');
const saveProfileBtn       = document.getElementById('save-profile-btn');
const profileMsg           = document.getElementById('profile-msg');
const avatarUploadInput    = document.getElementById('avatar-upload');
const avatarUploadProgress = document.getElementById('avatar-upload-progress');
const avatarProgressFill   = document.getElementById('avatar-progress-fill');
const avatarProgressText   = document.getElementById('avatar-progress-text');

// Movie form
const movieTitleInput  = document.getElementById('movie-title');
const movieGenreInput  = document.getElementById('movie-genre');
const movieTagsInput   = document.getElementById('movie-tags');
const movieNotesInput  = document.getElementById('movie-notes');
const moviePosterInput = document.getElementById('movie-poster');
const posterNameEl     = document.getElementById('poster-name');
const addBtn           = document.getElementById('add-btn');
const errorMsg         = document.getElementById('error-msg');

// List & filters
const movieList   = document.getElementById('movie-list');
const emptyMsg    = document.getElementById('empty-msg');
const clearBtn    = document.getElementById('clear-btn');
const filterTabs  = document.querySelectorAll('.tab');
const genrePills  = document.getElementById('genre-pills');
const searchInput = document.getElementById('search-input');


// ---- 4. Helpers ----

/** Show a brief toast notification that auto-dismisses after 3 s. */
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

/** Show/hide the full-screen loading spinner. */
function setLoading(visible) {
  loadingOverlay.style.display = visible ? 'flex' : 'none';
}

/**
 * Generate an SVG data URI showing the user's initial on a coloured circle.
 * Used as the avatar fallback when no photo has been uploaded.
 */
function avatarFallback(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const palette = ['#7c6af7', '#4caf82', '#e05555', '#f4a261', '#457b9d'];
  const fill    = palette[initial.charCodeAt(0) % palette.length];
  return (
    `data:image/svg+xml,` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>` +
    `<circle cx='20' cy='20' r='20' fill='${encodeURIComponent(fill)}'/>` +
    `<text x='20' y='26' text-anchor='middle' font-family='system-ui' ` +
    `font-size='18' font-weight='bold' fill='white'>${initial}</text></svg>`
  );
}

/** Set all avatar <img> elements to a URL (or fallback if empty). */
function setAvatarSrc(url, name) {
  const src = url || avatarFallback(name);
  headerAvatar.src  = src;
  profileAvatar.src = src;
}

/** Generate a short random ID (used as Firestore document IDs). */
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}


// ---- 5. Auth ----

/** Switch between Sign In and Sign Up tabs. */
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    signinForm.classList.toggle('hidden', target !== 'signin');
    signupForm.classList.toggle('hidden', target !== 'signup');
    authError.classList.add('hidden');
  });
});

/** Display an error message inside the auth card. */
function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove('hidden');
}

/** Email / password sign-in. */
signinForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.classList.add('hidden');
  setLoading(true);
  try {
    await auth.signInWithEmailAndPassword(signinEmail.value.trim(), signinPassword.value);
  } catch (err) {
    setLoading(false);
    showAuthError(friendlyAuthError(err.code));
  }
});

/** Email / password sign-up + create Firestore profile. */
signupForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.classList.add('hidden');
  setLoading(true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(
      signupEmail.value.trim(),
      signupPassword.value
    );
    await cred.user.updateProfile({ displayName: signupName.value.trim() });
    await createUserProfile(cred.user, signupName.value.trim());
  } catch (err) {
    setLoading(false);
    showAuthError(friendlyAuthError(err.code));
  }
});

/** Google pop-up sign-in. */
googleBtn.addEventListener('click', async () => {
  authError.classList.add('hidden');
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred     = await auth.signInWithPopup(provider);
    // Create profile only on first Google sign-in
    const snap = await db.collection('users').doc(cred.user.uid).get();
    if (!snap.exists) {
      await createUserProfile(cred.user, cred.user.displayName || '');
    }
  } catch (err) {
    setLoading(false);
    if (err.code !== 'auth/popup-closed-by-user') {
      showAuthError(friendlyAuthError(err.code));
    }
  }
});

/** Sign out: detach Firestore listener, reset state, show auth screen. */
logoutBtn.addEventListener('click', async () => {
  if (unsubMovies) { unsubMovies(); unsubMovies = null; }
  movies = [];
  currentUser = null;
  await auth.signOut();
  showToast('Signed out.');
});

/** Map Firebase error codes to human-readable messages. */
function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}


// ---- 6. Auth State Observer (session persistence) ----
// Firebase automatically restores the previous session on page reload.
// This observer is the single place that transitions between auth ↔ app.
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;

    // Load the user's Firestore profile (name, avatar)
    await loadUserProfile(user);

    // Attach real-time listener for this user's movies
    attachMoviesListener(user.uid);

    // Show the app, hide auth
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    setLoading(false);
    movieTitleInput.focus();
  } else {
    // Not signed in — show the auth section
    appSection.classList.add('hidden');
    authSection.classList.remove('hidden');
    setLoading(false);
  }
});


// ---- 7. Profile ----

/** Write a new user profile document on first sign-up. */
async function createUserProfile(user, displayName) {
  await db.collection('users').doc(user.uid).set({
    displayName: displayName || '',
    email:       user.email  || '',
    avatarUrl:   user.photoURL || '',
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
  });
}

/** Read the user's Firestore profile and update the UI. */
async function loadUserProfile(user) {
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    const data = snap.exists ? snap.data() : {};
    const name = data.displayName || user.displayName || user.email || 'You';
    const url  = data.avatarUrl   || user.photoURL    || '';

    headerName.textContent = name;
    setAvatarSrc(url, name);

    // Pre-fill the profile modal fields
    profileName.value  = name;
    profileEmail.value = user.email || '';
  } catch {
    // Fail silently — UI shows fallback avatar
  }
}

/** Open / close the profile modal. */
profileTrigger.addEventListener('click', () => {
  profileModal.classList.remove('hidden');
});
closeProfileBtn.addEventListener('click', () => {
  profileModal.classList.add('hidden');
  profileMsg.classList.add('hidden');
});
profileModal.addEventListener('click', e => {
  if (e.target === profileModal) profileModal.classList.add('hidden');
});

/** Save display name to Firestore and Firebase Auth profile. */
saveProfileBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const name = profileName.value.trim();
  if (!name) return;

  saveProfileBtn.disabled = true;
  try {
    await Promise.all([
      db.collection('users').doc(currentUser.uid).update({ displayName: name }),
      currentUser.updateProfile({ displayName: name }),
    ]);
    headerName.textContent = name;
    setAvatarSrc(headerAvatar.src, name);
    profileMsg.textContent = 'Profile saved!';
    profileMsg.classList.remove('hidden');
    setTimeout(() => profileMsg.classList.add('hidden'), 3000);
    showToast('Profile saved!');
  } catch {
    profileMsg.textContent = 'Failed to save. Please try again.';
    profileMsg.classList.remove('hidden');
  } finally {
    saveProfileBtn.disabled = false;
  }
});

/** Upload a new avatar image to Firebase Storage, then save the download URL. */
avatarUploadInput.addEventListener('change', async () => {
  const file = avatarUploadInput.files[0];
  if (!file || !currentUser) return;

  avatarUploadProgress.classList.remove('hidden');
  const ref  = storage.ref(`users/${currentUser.uid}/avatar`);
  const task = ref.put(file);

  task.on(
    'state_changed',
    snapshot => {
      const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      avatarProgressFill.style.width = pct + '%';
      avatarProgressText.textContent = pct + '%';
    },
    () => {
      avatarUploadProgress.classList.add('hidden');
      showToast('Avatar upload failed.');
    },
    async () => {
      const url = await task.snapshot.ref.getDownloadURL();
      await db.collection('users').doc(currentUser.uid).update({ avatarUrl: url });
      setAvatarSrc(url, profileName.value);
      avatarUploadProgress.classList.add('hidden');
      avatarUploadInput.value = '';
      showToast('Avatar updated!');
    }
  );
});


// ---- 8. Movies — Firestore real-time listener ----

/**
 * Attach an onSnapshot listener to the current user's movies sub-collection.
 * Any change in Firestore (add, update, delete) instantly re-renders the UI.
 * Security rules ensure users can only access their own sub-collection.
 */
function attachMoviesListener(uid) {
  if (unsubMovies) unsubMovies(); // detach any previous listener

  unsubMovies = db
    .collection('users')
    .doc(uid)
    .collection('movies')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snapshot => {
        movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        render();
      },
      err => {
        console.error('Firestore listener error:', err);
      }
    );
}


// ---- 9. Movies — Add (with optional poster upload) ----

/** Display the chosen poster filename next to the upload button. */
moviePosterInput.addEventListener('change', () => {
  const file = moviePosterInput.files[0];
  if (file) {
    posterNameEl.textContent = `📎 ${file.name}`;
    posterNameEl.classList.remove('hidden');
  } else {
    posterNameEl.classList.add('hidden');
  }
});

/**
 * Validate the form, optionally upload a poster, then write the movie
 * document to Firestore under the authenticated user's sub-collection.
 */
async function addMovie() {
  const title = movieTitleInput.value.trim();
  if (!title) {
    errorMsg.classList.remove('hidden');
    movieTitleInput.focus();
    return;
  }
  if (!currentUser) return;

  errorMsg.classList.add('hidden');
  addBtn.disabled = true;

  // Parse comma-separated tags into a trimmed array, dropping empty strings
  const tags = movieTagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const movieId = newId();
  let posterUrl = '';

  // Upload poster first if one was selected
  const posterFile = moviePosterInput.files[0];
  if (posterFile) {
    try {
      const ref  = storage.ref(`users/${currentUser.uid}/posters/${movieId}`);
      const snap = await ref.put(posterFile);
      posterUrl  = await snap.ref.getDownloadURL();
    } catch {
      showToast('Poster upload failed — movie saved without image.');
    }
  }

  try {
    await db
      .collection('users')
      .doc(currentUser.uid)
      .collection('movies')
      .doc(movieId)
      .set({
        title,
        genre:     movieGenreInput.value,
        tags,
        notes:     movieNotesInput.value.trim(),
        posterUrl,
        watched:   false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

    // Reset form
    movieTitleInput.value  = '';
    movieGenreInput.value  = '';
    movieTagsInput.value   = '';
    movieNotesInput.value  = '';
    moviePosterInput.value = '';
    posterNameEl.classList.add('hidden');
    movieTitleInput.focus();

    setFilter('all');
    showToast('Movie added!');
  } catch {
    showToast('Failed to add movie. Please try again.');
  } finally {
    addBtn.disabled = false;
  }
}

addBtn.addEventListener('click', addMovie);

movieTitleInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addMovie();
});

movieTitleInput.addEventListener('input', () => {
  if (movieTitleInput.value.trim()) errorMsg.classList.add('hidden');
});


// ---- 10. Movies — Remove, Toggle Watched, Clear All ----

/** Delete a movie document from Firestore. */
async function removeMovie(id) {
  if (!currentUser) return;
  try {
    await db
      .collection('users').doc(currentUser.uid)
      .collection('movies').doc(id)
      .delete();
    showToast('Movie removed.');
  } catch {
    showToast('Failed to remove movie.');
  }
}

/** Flip the watched field on a Firestore movie document. */
async function toggleWatched(id, current) {
  if (!currentUser) return;
  try {
    await db
      .collection('users').doc(currentUser.uid)
      .collection('movies').doc(id)
      .update({ watched: !current });
  } catch {
    showToast('Failed to update movie.');
  }
}

/** Delete every movie document for the current user after confirmation. */
clearBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  if (!confirm('Clear your entire watchlist? This cannot be undone.')) return;

  const batch = db.batch();
  movies.forEach(m => {
    const ref = db
      .collection('users').doc(currentUser.uid)
      .collection('movies').doc(m.id);
    batch.delete(ref);
  });

  try {
    await batch.commit();
    showToast('Watchlist cleared.');
  } catch {
    showToast('Failed to clear watchlist.');
  }
});


// ---- 11. Render ----

/**
 * Return the subset of movies matching the current status filter,
 * active genre pill, and search query.
 */
function getFiltered() {
  return movies.filter(m => {
    // Status filter
    if (activeFilter === 'watched'   && !m.watched) return false;
    if (activeFilter === 'unwatched' &&  m.watched) return false;

    // Genre pill filter
    if (activeGenre && m.genre !== activeGenre) return false;

    // Search query (title, genre, tags, notes)
    if (searchQuery) {
      const q      = searchQuery.toLowerCase();
      const inTitle = m.title.toLowerCase().includes(q);
      const inGenre = m.genre  && m.genre.toLowerCase().includes(q);
      const inTags  = m.tags   && m.tags.some(t => t.toLowerCase().includes(q));
      const inNotes = m.notes  && m.notes.toLowerCase().includes(q);
      if (!inTitle && !inGenre && !inTags && !inNotes) return false;
    }

    return true;
  });
}

/** Re-render the entire movie list and supporting UI elements. */
function render() {
  const filtered = getFiltered();

  movieList.innerHTML = '';

  if (filtered.length === 0) {
    emptyMsg.classList.remove('hidden');
  } else {
    emptyMsg.classList.add('hidden');
    filtered.forEach(m => movieList.appendChild(createMovieCard(m)));
  }

  // Count badge
  const total = movies.length;
  movieCountBadge.textContent = `${total} ${total === 1 ? 'movie' : 'movies'}`;

  // Clear All visibility
  clearBtn.classList.toggle('hidden', movies.length === 0);

  // Genre pills
  renderGenrePills();
}

/**
 * Build a <li> card element for a single movie.
 * @param {Object} movie - Firestore document data + id
 */
function createMovieCard(movie) {
  const li = document.createElement('li');
  li.className = `movie-card${movie.watched ? ' watched' : ''}`;
  li.dataset.id = movie.id;

  // Watched checkbox
  const checkbox   = document.createElement('input');
  checkbox.type    = 'checkbox';
  checkbox.className = 'watch-checkbox';
  checkbox.checked = !!movie.watched;
  checkbox.title   = movie.watched ? 'Mark as unwatched' : 'Mark as watched';
  checkbox.addEventListener('change', () => toggleWatched(movie.id, movie.watched));

  // Optional poster thumbnail
  if (movie.posterUrl) {
    const thumb   = document.createElement('img');
    thumb.src     = movie.posterUrl;
    thumb.alt     = movie.title + ' poster';
    thumb.className = 'movie-poster-thumb';
    thumb.loading   = 'lazy';
    li.appendChild(checkbox);
    li.appendChild(thumb);
  } else {
    li.appendChild(checkbox);
  }

  // Text info block
  const info = document.createElement('div');
  info.className = 'movie-info';

  const titleEl = document.createElement('p');
  titleEl.className   = 'movie-title';
  titleEl.textContent = movie.title;
  info.appendChild(titleEl);

  // Genre
  if (movie.genre) {
    const genreEl = document.createElement('p');
    genreEl.className   = 'movie-genre';
    genreEl.textContent = movie.genre;
    info.appendChild(genreEl);
  }

  // Tags row
  if (movie.tags && movie.tags.length > 0) {
    const tagRow = document.createElement('div');
    tagRow.className = 'movie-tags';
    movie.tags.forEach(tag => {
      const pill = document.createElement('span');
      pill.className   = 'movie-tag';
      pill.textContent = tag;
      // Clicking a tag filters the list by that tag via search
      pill.addEventListener('click', () => {
        searchInput.value = tag;
        searchQuery       = tag.toLowerCase();
        render();
      });
      tagRow.appendChild(pill);
    });
    info.appendChild(tagRow);
  }

  // Notes
  if (movie.notes) {
    const notesEl = document.createElement('p');
    notesEl.className   = 'movie-notes';
    notesEl.textContent = movie.notes;
    info.appendChild(notesEl);
  }

  // Remove button
  const removeBtn   = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.title   = 'Remove from watchlist';
  removeBtn.addEventListener('click', () => removeMovie(movie.id));

  li.appendChild(info);
  li.appendChild(removeBtn);

  return li;
}

/** Rebuild the genre filter pills from the unique genres in the movies array. */
function renderGenrePills() {
  genrePills.innerHTML = '';

  const genres = [...new Set(movies.map(m => m.genre).filter(Boolean))].sort();
  if (genres.length === 0) return;

  genres.forEach(genre => {
    const pill = document.createElement('button');
    pill.className   = `genre-pill${activeGenre === genre ? ' active' : ''}`;
    pill.textContent = genre;
    pill.addEventListener('click', () => {
      activeGenre = activeGenre === genre ? null : genre; // toggle off if same
      render();
    });
    genrePills.appendChild(pill);
  });
}


// ---- 12. Filter & Search ----

/** Set the status filter tab and re-render. */
function setFilter(filter) {
  activeFilter = filter;
  filterTabs.forEach(tab =>
    tab.classList.toggle('active', tab.dataset.filter === filter)
  );
}

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    setFilter(tab.dataset.filter);
    render();
  });
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
});


// ---- 13. Event Listeners (misc) ----

// Show selected poster filename in the form
moviePosterInput.addEventListener('change', () => {
  const file = moviePosterInput.files[0];
  posterNameEl.textContent = file ? `📎 ${file.name}` : '';
  posterNameEl.classList.toggle('hidden', !file);
});


// ---- 14. Init ----
// Firebase's onAuthStateChanged (section 6) drives all initialisation.
// The loading overlay is shown by default and hidden once auth state resolves.
setLoading(true);
