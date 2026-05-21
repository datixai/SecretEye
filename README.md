# SecretEye AI-Powered Home Surveillance System

> The Eye That Never Sleeps

SecretEye is a full-stack AI security platform built as a Final Year Project. It combines a cross-platform **React Native (Expo)** mobile app with a **Python Flask** AI backend to deliver real-time weapon detection, violence recognition, and facial identity verification — powered by YOLOv8 and face_recognition library, with Firebase as the cloud backbone.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native · Expo Router · NativeWind (Tailwind) |
| AI Backend | Python · Flask · YOLOv8 · face_recognition (dlib) · OpenCV |
| Database | Firebase Firestore (real-time) |
| Auth | Firebase Authentication |
| Storage | Firebase Storage · AsyncStorage |

---

## Project Structure

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
│   │   ├── activity.jsx
│   │   ├── dashboard.jsx
│   │   ├── devices.jsx
│   │   ├── manageUsers.jsx
│   │   ├── panic.jsx
│   │   ├── reports-and-alerts.jsx
│   │   ├── settings.jsx
│   │   └── system-control.jsx
│   │
│   └── homeowner/                        # Homeowner role screens
│       ├── activity.jsx                  # Live Firestore detection feed
│       ├── dashboard.jsx
│       ├── devices.jsx                   # Add cameras, view live streams
│       ├── evidence.jsx                  # Detection image gallery
│       ├── manage-zones.jsx
│       ├── panic.jsx                     # One-touch emergency broadcast
│       ├── reportAlerts.jsx
│       ├── reports.jsx
│       ├── settings.jsx
│       ├── surveillance.jsx
│       └── trusted-visitors.jsx
│
├── assets/
│   ├── aiSecurity.mp4
│   ├── logo.png
│   └── images/
│       ├── android-icon-background.png
│       ├── android-icon-foreground.png
│       ├── android-icon-monochrome.png
│       ├── splash-icon.png
│       └── favicon.png
│
├── backend/                              # Python AI Hub
│   ├── app.py                            # Main Flask server — AI + Firebase
│   ├── downloadmodel.py                  # Download YOLO models from HuggingFace
│   ├── web.py                            # Standalone AI test web app (port 5002)
│   ├── test_lab.py                       # Single-file AI test lab (port 5001)
│   ├── test_face.py                      # Face recognition test script
│   ├── test_fight.py                     # Violence model test script
│   ├── test_weapon.py                    # Gun model test script
│   ├── test_weapon1.py                   # Multi-weapon model test script
│   ├── classes.py                        # Print model class names
│   ├── requirements.txt                  # Exact package versions
│   ├── serviceAccountKey.json            # NOT committed — see Environment Setup
│   ├── faces/                            # NOT committed — face reference images
│   │   └── person_name.jpg               # Filename = person name
│   ├── model/                            # NOT committed — AI model weights
│   │   ├── weapon.pt                     # YOLOv8 gun detection
│   │   ├── weapon1.pt                    # YOLOv8 gun+knife+grenade detection
│   │   └── fight.pt                      # YOLOv8 violence detection
│   ├── video/                            # NOT committed — test videos
│   └── runs/                             # NOT committed — detection output videos
│
├── components/
│   ├── AlertCard.jsx
│   ├── CustomButton.jsx
│   ├── CustomInput.jsx
│   ├── DashboardCard.jsx
│   ├── HomeFooter.jsx
│   ├── HomeownerDBCard.jsx
│   └── RoleSelector.jsx
│
├── lib/
│   └── firebase.js                       # NOT committed — Firebase client init
│
├── app.json
├── babel.config.js
├── metro.config.js
├── package.json
├── tailwind.config.js
└── README.md
```

---

## How It Works

```
Mobile App  ──(Firestore realtime)──►  Firebase Cloud
                                              │
                                     writes detections/{}
                                              │
Python AI Hub (app.py)  ──── Firebase Admin SDK
    │
    ├── Web Login          → Firebase Auth REST API
    ├── Video Upload       → YOLO inference → evidence frames → Firestore
    ├── Live Webcam        → Face recognition + YOLO → Firestore alerts
    ├── face_recognition   → Compare vs faces/ folder → Stranger / Name
    ├── YOLOv8 weapon.pt   → Gun detection
    ├── YOLOv8 weapon1.pt  → Gun + Knife + Grenade detection
    └── YOLOv8 fight.pt    → Violence / fight detection
```

1. User logs into the web dashboard at `http://PC_IP:5000` with their SecretEye credentials.
2. They upload a video or start the live webcam.
3. AI models run on every frame — weapon, violence, and face recognition simultaneously.
4. On confirmed detection — an alert is written to `detections/` in Firestore with a base64 evidence frame.
5. The mobile app listens in real-time via `onSnapshot` and shows the alert in the Activity and Evidence screens.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11
- Android phone (for APK installation)
- A Firebase project with Firestore, Auth, and Storage enabled

---

## Part 1 — Mobile App Setup

### 1. Clone the Repository

```bash
git clone https://github.com/datixai/SecretEye.git
cd SecretEye
```

### 2. Install JS Dependencies

```bash
npm install
```

### 3. Create Environment File

Create `.env.local` in the root `SecretEye/` folder:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Get these values from: Firebase Console → Project Settings → General → Your Apps → Web App

### 4. Create lib/firebase.js

Create `lib/firebase.js` (gitignored — must be created manually):

```js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
export const db   = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
```

### 5. Build and Install APK on Android Phone

Enable Wireless Debugging on the phone:
- Settings → Developer Options → Wireless Debugging → Enable
- Note the IP address and port shown (e.g. `192.168.1.115:40621`)

Connect phone via ADB:
```powershell
adb connect 192.168.1.115:40621
adb devices
```

Set Java home and build the release APK:
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npx expo run:android --variant release
```

First release build takes 30-60 minutes (compiling native modules). Future builds take 3-5 minutes from cache.

APK is saved at:
```
android/app/build/outputs/apk/release/app-release.apk
```

To manually install on phone after build:
```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

To send APK to client — share `app-release.apk` via WhatsApp or USB. Client enables "Install from unknown sources" in phone settings and taps the file to install.

---

## Part 2 — Python AI Backend Setup

### 1. Navigate to Backend Folder

```powershell
cd D:\SecretEye\backend
```

### 2. Create Virtual Environment

```powershell
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies

```powershell
pip install -r requirements.txt
```

If `requirements.txt` is not available, install manually:

```powershell
pip install flask flask-cors firebase-admin ultralytics opencv-python face_recognition Pillow requests numpy
```

> Note: `face_recognition` requires `dlib` which compiles from source. If compilation fails due to missing Visual Studio, install the pre-built wheel:
> Send `dlib-20.0.1-cp311-cp311-win_amd64.whl` to the client and install:
> ```powershell
> pip install dlib-20.0.1-cp311-cp311-win_amd64.whl
> pip install face_recognition
> ```

### 4. Place Firebase Service Account Key

Download from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key

Save as:
```
D:\SecretEye\backend\serviceAccountKey.json
```

### 5. Download AI Models

```powershell
python downloadmodel.py
```

This downloads `weapon.pt` and `fight.pt` from HuggingFace into `model/` folder.

For the multi-weapon model (knife, grenade, gun):
```powershell
python weapon1.py
```

### 6. Add Face Reference Images

Create the `faces/` folder inside `backend/`:
```
backend/faces/
    ahmed.jpg       # recognized as "Ahmed"
    john.jpg        # recognized as "John"
    sara.png        # recognized as "Sara"
```

Filename without extension = person's display name. Use clear front-facing photos.

### 7. Start the AI Hub

```powershell
python app.py
```

Open in any browser on the same network:
```
http://YOUR_PC_IP:5000
```

Login with your SecretEye mobile app email and password.

---

## Part 3 — AI Web Hub Usage

After logging in at `http://YOUR_PC_IP:5000`:

### Video Analysis Tab
- Upload any MP4, AVI, or MOV video
- Select a detection model:
  - **All Models** — weapon + violence + face recognition together
  - **Violence** — fight/violence detection only
  - **Gun Only** — firearm detection only
  - **All Weapons** — gun + knife + grenade
  - **Face Only** — identify people vs faces/ database
- Adjust confidence threshold with the slider
- Click Run Detection — progress bar shows frame-by-frame progress
- Output video with bounding boxes plays in browser when complete
- Every detection is automatically sent to Firestore — visible in mobile app Activity and Evidence screens
- Output video also saved locally to `runs/detect/`

### Live Webcam Tab
- Click Start Webcam to open the PC camera
- AI runs in real time — face recognition every 3 frames, weapon/violence every 4 frames
- Stranger faces and threats send alerts to Firestore automatically
- Click Stop Webcam when done

### Recent Alerts Tab
- Shows all detections from the current session

---

## Part 4 — Test Scripts

Run individual model tests from the `backend/` folder:

```powershell
# Test violence model on a video
python test_fight.py

# Test gun model
python test_weapon.py

# Test multi-weapon model (knife, gun, grenade)
python test_weapon1.py

# Test face recognition
python test_face.py

# Check model class names
python classes.py

# Standalone AI test website (port 5001 — no login required)
python test_lab.py
# Open: http://localhost:5001

# Standalone video detection web app (port 5002)
python web.py
# Open: http://localhost:5002
```

---

## AI Models

| Model | File | Classes | Source |
|---|---|---|---|
| Gun Detection | `model/weapon.pt` | Gun | HuggingFace: Subh775/Firearm_Detection_Yolov8n |
| Multi-Weapon | `model/weapon1.pt` | Gun, knife, grenade, explosion | HuggingFace: Subh775/Threat-Detection-YOLOv8n |
| Violence | `model/fight.pt` | non_violence, violence | HuggingFace: Musawer14/fight_detection_yolov8 |
| Face Recognition | face_recognition library | Any person in faces/ folder | dlib HOG + 128-d face encoding |

Default confidence thresholds in `app.py`:
```python
WEAPON_CONF  = 0.40
VIOLENCE_CONF = 0.40
FACE_TOLERANCE = 0.50   # lower = stricter matching
```

---

## Environment Setup and Security

The following files are gitignored and must be created manually on each PC:

| File / Folder | Reason |
|---|---|
| `backend/serviceAccountKey.json` | Firebase Admin private key |
| `.env.local` | Firebase API keys |
| `lib/firebase.js` | Firebase client config |
| `venv/` or `.venv/` | Python virtual environment |
| `node_modules/` | JS dependencies |
| `android/` | Android build output |
| `backend/model/*.pt` | Large binary model files |
| `backend/faces/` | Personal face reference photos |
| `backend/video/` | Test videos |
| `backend/runs/` | Detection output videos |

---

## Firestore Rules

Firestore security rules expire every 30 days. If the app shows a white screen or permission errors, republish rules:

Firebase Console → Firestore → Rules → Publish:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## User Roles

| Role | Access |
|---|---|
| Admin | Full system view — all users, all devices, all alerts |
| Homeowner | Own cameras, own detections, evidence gallery, panic button |

Role is stored in Firestore under `users/{uid}.role` and set at signup. `_layout.jsx` enforces role-based routing on every navigation event.

---

## Keystore (APK Signing)

The release APK is signed with a keystore file:

```
Location:  android/app/secreteye.keystore
Password:  Ahmed1
Alias:     secreteye
```

Keep this file backed up. Losing it means you cannot update the app on phones that have the current version installed.

---

## Daily Server Startup

```powershell
cd D:\SecretEye\backend
venv\Scripts\activate
python app.py
```

Open browser: `http://YOUR_PC_IP:5000`

Stop server: `Ctrl + C`

---

## License

This project was developed as a Final Year Project (FYP) by Ahmed Ali under the brand Datix AI. All rights reserved.
