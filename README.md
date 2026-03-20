# SecretEye 👁️ — AI-Powered Home Surveillance System

> *The Eye That Never Sleeps*

SecretEye is a full-stack AI security platform built as a Final Year Project. It combines a cross-platform **React Native (Expo)** mobile app with a **Python Flask** AI backend to deliver real-time weapon detection, violence recognition, and facial identity verification — all powered by YOLO and DeepFace, with Firebase as the cloud backbone.

---

## 📸 Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native · Expo Router · NativeWind (Tailwind) |
| AI Backend | Python · Flask · YOLOv8 · DeepFace (Facenet512) · OpenCV |
| Database | Firebase Firestore (real-time) |
| Auth | Firebase Authentication |
| Storage | Firebase Storage · AsyncStorage |

---

## 🏗️ Project Structure

```
SecretEye/
│
├── app/                                  # Expo file-based routing
│   ├── _layout.jsx                       # Auth guard + role-based routing
│   ├── index.jsx                         # Landing screen
│   ├── login.jsx                         # Login screen
│   ├── signup.jsx                        # Signup + biometric face enrollment
│   │
│   ├── admin/                            # Admin role screens
│   │   ├── activity.jsx                  # User management overview
│   │   ├── dashboard.jsx                 # Admin home
│   │   ├── devices.jsx                   # All devices across all homeowners
│   │   ├── manageUsers.jsx               # CRUD for homeowner accounts
│   │   ├── panic.jsx                     # Emergency response feed
│   │   ├── reports-and-alerts.jsx        # Alert command center
│   │   ├── settings.jsx                  # Admin profile + logout
│   │   └── system-control.jsx            # Arm/Disarm + zone toggles
│   │
│   └── homeowner/                        # Homeowner role screens
│       ├── activity.jsx                  # Live Firestore detection feed + push notifications
│       ├── dashboard.jsx                 # Homeowner home
│       ├── devices.jsx                   # Add nodes, view AI MJPEG streams
│       ├── evidence.jsx                  # Detection image gallery (download/share)
│       ├── manage-zones.jsx              # Security zone configuration
│       ├── panic.jsx                     # One-touch emergency broadcast
│       ├── reportAlerts.jsx              # Reports & alerts screen
│       ├── reports.jsx                   # Security reports screen
│       ├── settings.jsx                  # AI engine toggles + notification prefs
│       ├── surveillance.jsx              # Camera zone overview
│       └── trusted-visitors.jsx          # Whitelist management with face photos
│
├── assets/
│   ├── aiSecurity.mp4                    # Landing screen background video
│   ├── ai-security.mp4                   # Video asset
│   ├── logo.png                          # App logo (root level)
│   └── images/
│       ├── android-icon-background.png   # Adaptive icon (app.json)
│       ├── android-icon-foreground.png   # Adaptive icon (app.json)
│       ├── android-icon-monochrome.png   # Adaptive icon (app.json)
│       ├── favicon.png                   # Web build favicon
│       ├── logo.png                      # App logo (images folder)
│       ├── partial-react-logo.png        # Expo default asset
│       ├── react-logo.png                # Expo default asset
│       ├── react-logo@2x.png             # Expo default asset
│       ├── react-logo@3x.png             # Expo default asset
│       ├── sddefault.jpg                 # Image asset
│       └── splash-icon.png               # Splash screen (app.json)
│
├── backend/                              # Python AI Hub (runs on local PC/server)
│   ├── app.py                            # Main Flask server — YOLO + DeepFace + Firebase
│   ├── download.py                       # One-time model setup script
│   ├── serviceAccountKey.json            # ⚠️ NOT committed — see Environment Setup
│   └── model/
│       ├── facenet512_weights.h5         # DeepFace Facenet512 weights
│       ├── fight.pt                      # YOLOv8 violence detection model
│       └── weapon.pt                     # YOLOv8 weapon detection model
│
├── components/                           # Shared UI components
│   ├── AlertCard.jsx
│   ├── CustomButton.jsx
│   ├── CustomInput.jsx
│   ├── DashboardCard.jsx
│   ├── HomeFooter.jsx                    # Role-aware bottom nav bar
│   ├── HomeownerDBCard.jsx
│   └── RoleSelector.jsx
│
├── lib/
│   └── firebase.js                       # Firebase client SDK init (hybrid web/native auth)
│
├── app.json                              # Expo config (icons, splash, permissions)
├── babel.config.js
├── eslint.config.js
├── expo-env.d.ts
├── global.css
├── metro.config.js
├── nativewind-env.d.ts
├── package.json
├── package-lock.json
├── README.md
├── tailwind.config.js
└── tsconfig.json
```

---

## ⚙️ How It Works

```
Mobile App  ──(Firestore)──►  Firebase Cloud
    │                              │
    │  /video_feed?userId=&device= │  writes detections/{}
    ▼                              ▼
Python AI Hub (app.py)  ──────── Firebase Admin SDK
    │
    ├── YOLOv8 (weapon.pt)      → Weapon detection @ 0.70 conf
    ├── YOLOv8 (fight.pt)       → Violence detection @ 0.65 conf
    └── DeepFace (Facenet512)   → Face identity vs. homeowner reference
```

1. The homeowner adds a camera node (IP address) via the app.
2. The AI Hub (`app.py`) opens an MJPEG stream from that IP.
3. Every 4 frames: YOLO runs weapon + violence inference with a **3-frame confirmation gate** to suppress false positives.
4. Every 40 frames: DeepFace verifies faces against the homeowner's registered face photo stored in Firestore.
5. On confirmed detection: an alert document is written to `detections/` in Firestore with a base64 snapshot.
6. The mobile app listens in real-time via `onSnapshot` and fires a local push notification.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11
- Expo Go app (for mobile testing) or Android/iOS emulator
- A Firebase project with Firestore, Auth, and Storage enabled

---

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/secreteye.git
cd secreteye
```

---

### 2. Mobile App Setup

```bash
npm install
```

Create a `.env.local` file in the root and add your Firebase web config:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Start the app:

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `a` for Android emulator / `i` for iOS simulator.

---

### 3. Python AI Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install flask flask-cors firebase-admin ultralytics deepface opencv-python
```

Place your Firebase Admin SDK key:

```
backend/serviceAccountKey.json   ← download from Firebase Console > Project Settings > Service Accounts
```

Download the AI model weights (first time only):

```bash
python download.py
```

> This downloads `facenet512_weights.h5` into `model/`. `weapon.pt` and `fight.pt` must be placed in `model/` manually.

Start the AI Hub:

```bash
python app.py
```

The server starts on `http://0.0.0.0:5000`. Update the `SERVER` constant in `app/homeowner/devices.jsx` to match your PC's local IP:

```js
const SERVER = "http://192.168.x.x:5000";
```

---

## 🔐 Environment Setup & Security

The following are **gitignored** and must never be committed:

| File / Folder | Reason |
|---|---|
| `backend/serviceAccountKey.json` | Firebase Admin private key — full database access |
| `.env` / `.env.local` | API keys and secrets |
| `venv/` | Python virtual environment |
| `node_modules/` | JS dependencies |
| `.expo/` | Auto-generated by Expo |
| `backend/model/*.pt` | Large binary model files |
| `backend/model/*.h5` | Large binary model files |
| `backend/.deepface/` | Auto-generated weights cache by `app.py` at runtime |

---

## 👥 User Roles

| Role | Access |
|---|---|
| **Admin** | Full system view: all users, all devices, all alerts, system arm/disarm |
| **Homeowner** | Own cameras, own detections, trusted visitors, evidence gallery, panic button |

Role is stored in Firestore under `users/{uid}.role` and set at signup. The `_layout.jsx` enforces role-based routing on every navigation event.

---

## 🧠 AI Detection Details

| Threat | Model | Confidence Threshold | Confirmation Gate |
|---|---|---|---|
| Weapon | `weapon.pt` (YOLOv8) | 0.70 | 3 consecutive frames |
| Violence | `fight.pt` (YOLOv8) | 0.65 | 3 consecutive frames |
| Stranger | DeepFace Facenet512 | cosine distance < 0.38 | Per-frame |

- **Alert cooldown:** 60 seconds per threat type per device (prevents alert spam)
- **Tracking:** Confirmed bounding boxes persist on screen for 3 seconds without re-detection
- **Face pipeline:** Haar cascade pre-filter → BGR→RGB conversion → Facenet512 cosine verify

---

## 📱 Key Features

- **Biometric Signup** — Face photo captured and stored as base64 in Firestore at registration
- **Remember Me** — Persistent login via AsyncStorage with explicit opt-in
- **Fullscreen Camera View** — Tap any device card to expand the AI stream
- **Evidence Gallery** — Every detection saves a JPEG snapshot; downloadable and shareable
- **Panic Button** — Long-press triggers an emergency alert in Firestore + prompts a call to 15
- **Trusted Visitors** — Whitelist management with profile photos stored in Firestore
- **Auto Cleanup** — Activity logs older than 7 days are automatically deleted from Firestore

---

## 📄 License

This project was developed as a Final Year Project (FYP). All rights reserved.