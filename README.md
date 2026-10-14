<p align="center">
  <img src="mobile/assets/images/logo.png" alt="SecretEye" width="140" />
</p>

<h1 align="center">SecretEye</h1>
<p align="center"><b>Smart AI security for every home</b><br/>A product by <a href="https://datixai.com">Datix AI</a></p>

---

SecretEye watches a home's cameras with AI — detecting **weapons**, **violence** and **unknown faces** — and alerts the homeowner within seconds. A one-tap **SOS** reaches the SecretEye control centre, whose staff respond from a dedicated admin website.

## Product

| Part | Folder | Used by | Tech |
|---|---|---|---|
| Mobile app | `mobile/` | Homeowners (Android, Google Play) | Expo SDK 54 · Expo Router · TypeScript · NativeWind |
| Admin website | `admin/` | Control-centre staff | Vite · React · TypeScript · Tailwind |
| AI hub | `backend/` | Runs the AI models | Python · Flask · YOLOv8 · face_recognition |
| Cloud | `firebase/` | Auth, database rules, data model | Firebase Auth · Cloud Firestore |
| Marketing | `marketing/` | Promo reel generator | Playwright · Python · ffmpeg |

```
mobile app ──┐                                  ┌── admin website
             ├──── Firebase (Auth + Firestore) ─┤
AI hub ──────┘      writes detections           └── AI Lab → AI hub API
```

### Mobile app features
- **Home** — arm / disarm, today's threat stats, latest alerts, camera strip, SOS shortcut
- **Alerts** — real-time feed with snapshot evidence, filters, save & share, in-app banner for new threats
- **Cameras** — add IP cameras, connection test, live view, on/off
- **Trusted people** — faces the AI never flags as strangers
- **Detection settings** — choose which threats to be alerted about
- **Emergency SOS** — hold to alert the control centre; see when help is on the way; call police (15)
- **Account** — profile, password, privacy policy, help, delete account

### Admin website features
Overview dashboard · Emergencies (live, with sound) · Homeowners · Detections · Cameras · Admins · AI Lab (test the models on video or webcam)

## Setup

### 1. Firebase
Both apps read the Firebase web config from env files (never committed).

`mobile/.env.local`
```
EXPO_PUBLIC_FIREBASE_API_KEY=…
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=…
EXPO_PUBLIC_FIREBASE_PROJECT_ID=…
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=…
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
EXPO_PUBLIC_FIREBASE_APP_ID=…
```
`admin/.env.local` — the same values with the `VITE_` prefix, plus `VITE_BACKEND_URL=http://localhost:5000`.

Deploy the security rules and indexes (see [firebase/DATA_MODEL.md](firebase/DATA_MODEL.md)):
```bash
cd firebase && firebase deploy --only firestore
```

### 2. Mobile app
```bash
cd mobile
npm install
npx expo start            # scan the QR code with Expo Go
npm run web               # or run in a browser
```
Release builds use EAS: `npx eas build -p android --profile preview` (APK) or `--profile production` (Play Store AAB).

### 3. Admin website
```bash
cd admin
npm install
npm run dev               # http://localhost:5173
```
Only accounts with `role: "admin"` can sign in. Create the first admin by setting `role` to `admin` on their `users/{uid}` document in the Firebase console; after that, admins promote others from the **Admins** page.

### 4. AI hub
```bash
cd backend
python -m venv venv && venv\Scripts\activate
pip install <dlib wheel for your Python>   # Windows only
pip install -r requirements.txt
copy .env.example .env
python scripts/download_models.py          # weapon.pt, weapon1.pt, fight.pt → model/
python app.py                              # http://0.0.0.0:5000
```
Also needs `backend/serviceAccountKey.json` (Firebase console → Project settings → Service accounts). Photos of known people go in `backend/faces/<name>.jpg`.

## How alerts flow
1. The AI hub analyses video and, when a threat is confirmed, writes a `detections` document with a snapshot — unless the homeowner has disarmed the system or switched that threat type off.
2. The homeowner's app shows it instantly (in-app banner, Alerts badge).
3. Pressing **SOS** raises an emergency on the admin **Emergencies** page with a sound; the homeowner sees when it is acknowledged.

## Roles
- **Homeowner** — mobile app only. Signing up always creates a homeowner.
- **Admin** — admin website only.

## Ownership
SecretEye is proprietary software owned and developed by **Datix AI**. © Datix AI. All rights reserved.
See [LICENSE](LICENSE). Contact: [datixai.com](https://datixai.com) · datixai.com@gmail.com
