# SecretEye — Client Setup Manual

> Everything you need to get SecretEye running after cloning from GitHub.

---

## What You Get From GitHub vs What You Need to Add

| Item | From GitHub | You Add |
|---|---|---|
| `app/` — all screens | ✅ | — |
| `components/` — UI components | ✅ | — |
| `lib/firebase.js` — Firebase client | ✅ | — |
| `backend/app.py` — AI Flask server | ✅ | — |
| `backend/download.py` — model setup script | ✅ | — |
| `assets/` — images and videos | ✅ | — |
| `README.md` + this manual | ✅ | — |
| All config files (`package.json`, `app.json`, etc.) | ✅ | — |
| `node_modules/` — JS dependencies | ❌ | Run `npm install` |
| `venv/` — Python environment | ❌ | Create manually |
| `backend/model/weapon.pt` | ❌ | Get from project owner |
| `backend/model/fight.pt` | ❌ | Get from project owner |
| `backend/model/facenet512_weights.h5` | ❌ | Run `python download.py` |
| `backend/serviceAccountKey.json` | ❌ | Get from Firebase Console |
| `.env.local` — Firebase web config | ❌ | Create manually |

---

## Prerequisites — Install These First

| Tool | Version | Download |
|---|---|---|
| Node.js | 18 or higher | https://nodejs.org |
| Python | 3.11 | https://python.org |
| Git | Any | https://git-scm.com |
| Expo Go (phone) | Latest | App Store / Play Store |

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/datixai/SecretEye.git
cd SecretEye
```

---

## Step 2 — Mobile App Setup

### Install JS dependencies
```bash
npm install
```

### Create Firebase config file
Create a file called `.env.local` in the root of `SecretEye/` and paste your Firebase project credentials:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> Get these values from: **Firebase Console → Project Settings → Your Apps → Web App → SDK setup and configuration**

> ⚠️ **Note:** The current `lib/firebase.js` has hardcoded credentials. Either update that file with your own Firebase project credentials, or move them to `.env.local` and update the references.

### Start the app
```bash
npx expo start
```

Scan the QR code with **Expo Go** on your phone. Make sure your phone and PC are on the **same WiFi network**.

---

## Step 3 — Python AI Backend Setup

### Navigate to backend
```bash
cd backend
```

### Create virtual environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python -m venv venv
source venv/bin/activate
```

### Install Python packages
```bash
pip install flask flask-cors firebase-admin ultralytics deepface opencv-python
```

### Add Firebase Admin key
1. Go to **Firebase Console → Project Settings → Service Accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. Rename it to `serviceAccountKey.json`
5. Place it at `backend/serviceAccountKey.json`

> ⚠️ Never share or commit this file. It gives full access to your Firebase project.

### Add AI model files
The `backend/model/` folder exists but is empty. You need to add 3 files:

**`facenet512_weights.h5`** — download automatically by running:
```bash
python download.py
```

**`weapon.pt`** and **`fight.pt`** — get these from the project owner (too large for GitHub). Place both inside `backend/model/`.

Your `backend/model/` folder should look like this when ready:
```
backend/model/
├── facenet512_weights.h5
├── fight.pt
└── weapon.pt
```

### Update your PC's IP address in the app
Open `app/homeowner/devices.jsx` and update line 14 with your PC's local IP address:

```js
const SERVER = "http://192.168.x.x:5000";   // ← replace with your actual IP
```

To find your IP on Windows, run `ipconfig` in Command Prompt and look for **IPv4 Address**.

### Start the AI server
```bash
python app.py
```

You should see:
```
✅ Firebase connected.
✅ All models ready.
🚀 AI Security Hub v3.0 — 0.0.0.0:5000
```

---

## Step 4 — Firebase Project Setup

If you're setting up your own Firebase project (not using the existing one), make sure these services are enabled:

| Service | Purpose |
|---|---|
| **Authentication** | Email/Password sign-in |
| **Firestore Database** | Users, devices, detections, alerts |
| **Storage** | Profile images |

### Firestore collections used by the app

| Collection | What's stored |
|---|---|
| `users` | User profiles, roles, face reference |
| `devices` | Camera nodes (name, IP, status) |
| `detections` | AI alerts (type, image, timestamp) |
| `trusted_visitors` | Whitelisted visitor profiles |
| `emergency_alerts` | Panic button triggers |
| `settings` | Per-user notification preferences |

---

## Step 5 — Verify Everything Works

Run through this checklist:

```
□ npm install completed with no errors
□ npx expo start shows QR code
□ App loads on phone via Expo Go
□ Login screen appears
□ backend/serviceAccountKey.json is in place
□ backend/model/ has all 3 files (.pt x2, .h5 x1)
□ python app.py starts without errors
□ SERVER IP in devices.jsx matches your PC's IP
□ Phone and PC are on the same WiFi
```

---

## Project Structure Reference

```
SecretEye/
├── app/                    # All screens (Expo Router)
│   ├── _layout.jsx         # Auth guard
│   ├── login.jsx / signup.jsx / index.jsx
│   ├── admin/              # Admin screens
│   └── homeowner/          # Homeowner screens
├── assets/                 # Images, videos, icons
├── backend/
│   ├── app.py              # ← Run this to start AI server
│   ├── download.py         # ← Run this once to get model weights
│   ├── serviceAccountKey.json  # ← YOU ADD THIS
│   └── model/              # ← YOU ADD .pt and .h5 files here
├── components/             # Reusable UI components
├── lib/
│   └── firebase.js         # Firebase client config
├── .env.local              # ← YOU CREATE THIS
├── .gitignore
├── app.json
├── package.json
└── README.md
```

---

## Common Errors & Fixes

| Error | Fix |
|---|---|
| `Cannot connect to server` | Check PC IP in `devices.jsx`, ensure both on same WiFi |
| `Firebase: Error (auth/invalid-api-key)` | Check `.env.local` or `lib/firebase.js` credentials |
| `FATAL: serviceAccountKey.json not found` | Add the file to `backend/` folder |
| `Model not found: model/weapon.pt` | Add model files to `backend/model/` |
| `npm install` fails | Make sure Node.js 18+ is installed |
| Expo QR not scanning | Make sure phone and PC are on same WiFi network |
| `ModuleNotFoundError` in Python | Run `pip install` inside the activated venv |

---

## Quick Start Commands Summary

```bash
# Terminal 1 — Mobile App
cd SecretEye
npm install
npx expo start

# Terminal 2 — AI Backend
cd SecretEye/backend
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux
python app.py
```

---

## Contact

For model files (`weapon.pt`, `fight.pt`) or Firebase credentials, contact the project owner.

GitHub: **https://github.com/datixai/SecretEye**
