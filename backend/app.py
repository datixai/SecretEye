"""
=============================================================
  SecretEye — AI Security Hub  v6.0
=============================================================
  Run:
      cd D:\SecretEye\backend
      venv\Scripts\activate
      python app.py

  Open: http://YOUR_PC_IP:5000

  FEATURES:
    - Web login with Firebase Auth (same creds as mobile app)
    - Video upload → AI detection → evidence to Firestore
    - Live PC webcam → face recognition + weapon/violence → alerts
    - Per-user Firestore writes (detections, evidence frames)
    - Output video playable in browser + saved to runs/detect/

  FACE RECOGNITION:
    Add images to backend/faces/ folder
    Filename = person name: xyz.jpg → "xyz"
    Unknown faces → "Stranger" alert sent to Firestore

  MODELS:
    model/weapon.pt   → Gun detection
    model/weapon1.pt  → Gun + Knife + Grenade
    model/fight.pt    → Violence detection
    face_recognition  → Face ID vs faces/ folder
=============================================================
"""

import os, time, base64, threading, queue, uuid, logging, shutil, tempfile, glob, requests
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
from datetime import datetime
import cv2
import numpy as np
from flask import (Flask, Response, jsonify, redirect,
                   render_template_string, request, session, url_for, send_file)
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from ultralytics import YOLO
import face_recognition as fr

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("SecretEye")

# ─── Flask ────────────────────────────────────────────────────────────────────
app            = Flask(__name__)
app.secret_key = "secreteye-hub-2026"
CORS(app)
_pool          = ThreadPoolExecutor(max_workers=8, thread_name_prefix="ai-worker")

# ─── Firebase API Key (for web login) ─────────────────────────────────────────
FIREBASE_API_KEY = os.environ.get("FIREBASE_API_KEY",
    os.environ.get("EXPO_PUBLIC_FIREBASE_API_KEY", ""))

if not FIREBASE_API_KEY:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if "EXPO_PUBLIC_FIREBASE_API_KEY" in line:
                    FIREBASE_API_KEY = line.split("=",1)[1].strip().strip('"\'')
                    break

if not FIREBASE_API_KEY:
    log.warning("⚠️  FIREBASE_API_KEY not found — web login disabled.")

# ─── Firebase Admin ───────────────────────────────────────────────────────────
KEY_PATH = "serviceAccountKey.json"
if not firebase_admin._apps:
    if not os.path.exists(KEY_PATH):
        raise FileNotFoundError(f"'{KEY_PATH}' not found.")
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db_client = firestore.client()
log.info("✅ Firebase connected.")

# ─── AI Models ────────────────────────────────────────────────────────────────
log.info("⌛ Loading AI models…")

WEAPON_MODEL_PATH  = "model/weapon.pt"
WEAPON1_MODEL_PATH = "model/weapon1.pt"
FIGHT_MODEL_PATH   = "model/fight.pt"

for p in (WEAPON_MODEL_PATH, FIGHT_MODEL_PATH):
    if not os.path.exists(p):
        raise FileNotFoundError(f"Model not found: '{p}'")

weapon_model  = YOLO(WEAPON_MODEL_PATH)
fight_model   = YOLO(FIGHT_MODEL_PATH)
weapon1_model = YOLO(WEAPON1_MODEL_PATH) if os.path.exists(WEAPON1_MODEL_PATH) else weapon_model

VIOLENCE_CLASS_ID = next(
    (k for k,v in fight_model.names.items() if "violence" in v.lower()), 1)

log.info(f"✅ weapon.pt  — {weapon_model.names}")
log.info(f"✅ weapon1.pt — {weapon1_model.names}")
log.info(f"✅ fight.pt   — {fight_model.names} | violence class: {VIOLENCE_CLASS_ID}")

# ─── Face Database ────────────────────────────────────────────────────────────
FACES_DIR       = "faces"
FACE_TOLERANCE  = 0.50
FACE_SKIP       = 3

def load_face_db():
    known_enc, known_names = [], []
    if not os.path.exists(FACES_DIR):
        os.makedirs(FACES_DIR)
        return known_enc, known_names
    for ext in ("*.jpg","*.jpeg","*.png","*.JPG","*.PNG"):
        for path in glob.glob(os.path.join(FACES_DIR, ext)):
            name  = os.path.splitext(os.path.basename(path))[0].capitalize()
            image = fr.load_image_file(path)
            encs  = fr.face_encodings(image)
            if encs:
                known_enc.append(encs[0])
                known_names.append(name)
                log.info(f"  👤 Face loaded: {name}")
    return known_enc, known_names

known_encodings, known_names = load_face_db()
log.info(f"✅ Face DB: {known_names}")

# ─── Constants ────────────────────────────────────────────────────────────────
ALERT_COOLDOWN_SEC = 60
UPLOAD_DIR         = "uploads_tmp"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Job tracking (for video processing) ─────────────────────────────────────
jobs = {}

# ─── Webcam state ─────────────────────────────────────────────────────────────
webcam_state = {
    "running":  False,
    "thread":   None,
    "stop":     threading.Event(),
    "user_id":  None,
    "latest":   None,   # latest annotated JPEG bytes
    "cooldown": {},
}

# ─── Firebase helpers ─────────────────────────────────────────────────────────

def frame_to_b64(frame, w=480, h=320, quality=60):
    small = cv2.resize(frame, (w, h))
    _, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

def save_detection(user_id, source_name, det_type, frame, cooldown):
    """Write a detection + evidence frame to Firestore."""
    key = f"{user_id}_{source_name}_{det_type}"
    now = time.time()
    if now - cooldown.get(key, 0) < ALERT_COOLDOWN_SEC:
        return
    cooldown[key] = now
    fc = frame.copy()
    def _write():
        try:
            db_client.collection("detections").add({
                "userId":     user_id,
                "deviceName": source_name,
                "type":       det_type,
                "imageUrl":   frame_to_b64(fc),
                "priority":   "High" if det_type in ("Weapon","Violence") else "Medium",
                "timestamp":  firestore.SERVER_TIMESTAMP,
                "status":     "new",
            })
            log.info(f"🚨 [{source_name}] {det_type} → Firestore (user={user_id})")
        except Exception as e:
            log.error(f"Firestore write: {e}")
    _pool.submit(_write)

# ─── Auth ─────────────────────────────────────────────────────────────────────

def firebase_sign_in(email, password):
    if not FIREBASE_API_KEY:
        return None
    try:
        resp = requests.post(
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
            f"?key={FIREBASE_API_KEY}",
            json={"email": email, "password": password, "returnSecureToken": True},
            timeout=10,
        )
        if resp.status_code == 200:
            d = resp.json()
            return {"uid": d["localId"], "email": d["email"],
                    "name": d.get("displayName", email.split("@")[0])}
        log.warning(f"Login failed: {resp.json().get('error',{}).get('message','')}")
        return None
    except Exception as e:
        log.error(f"firebase_sign_in: {e}")
        return None

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated

# ─── AI Processing Helpers ────────────────────────────────────────────────────

def run_yolo_on_frame(frame, model, conf, class_filter=None):
    """Run YOLO on a frame. Returns (detections_list, annotated_frame)."""
    results = model.predict(frame, conf=conf, verbose=False, iou=0.45,
                            classes=[class_filter] if class_filter is not None else None)
    display = frame.copy()
    dets    = []
    if results and len(results[0].boxes) > 0:
        for box in results[0].boxes:
            cls  = int(box.cls[0])
            name = model.names[cls]
            c    = float(box.conf[0])
            x1,y1,x2,y2 = [int(v) for v in box.xyxy[0]]
            color = (0,0,220) if "gun" in name.lower() or "weapon" in name.lower() \
                    else (0,100,255)
            cv2.rectangle(display,(x1,y1),(x2,y2),color,2)
            cv2.putText(display,f"{name} {c:.0%}",(x1,max(y1-8,20)),
                        cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,255,255),2)
            dets.append({"class": name, "conf": round(c,3)})
    return dets, display

def run_face_on_frame(frame):
    """Run face recognition on a frame. Returns list of (name, box, color)."""
    small = cv2.resize(frame,(0,0),fx=0.5,fy=0.5)
    rgb   = cv2.cvtColor(small,cv2.COLOR_BGR2RGB)
    locs  = fr.face_locations(rgb, model="hog")
    encs  = fr.face_encodings(rgb, locs)
    results = []
    for (top,right,bottom,left), enc in zip(locs, encs):
        top*=2; right*=2; bottom*=2; left*=2
        name  = "Stranger"
        color = (0,0,255)
        if known_encodings:
            distances = fr.face_distance(known_encodings, enc)
            best      = int(np.argmin(distances))
            if distances[best] < FACE_TOLERANCE:
                name  = known_names[best]
                color = (0,220,0)
        results.append((name, (top,right,bottom,left), color))
    return results

def annotate_faces(frame, face_results):
    display = frame.copy()
    for name,(top,right,bottom,left),color in face_results:
        cv2.rectangle(display,(left,top),(right,bottom),color,2)
        cv2.rectangle(display,(left,bottom),(right,bottom+32),color,-1)
        cv2.putText(display,name,(left+6,bottom+22),
                    cv2.FONT_HERSHEY_SIMPLEX,0.75,(255,255,255),2)
    return display

# ─── Video Processing (background job) ───────────────────────────────────────

def process_video_job(job_id, input_path, output_path,
                      model_id, conf, user_id, source_name):
    jobs[job_id].update({"status":"running","message":"Starting AI analysis..."})
    cooldown = {}

    cap   = cv2.VideoCapture(input_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps   = int(cap.get(cv2.CAP_PROP_FPS)) or 25

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    model_map = {
        "weapon":   (weapon_model,  None,              "Gun"),
        "weapon1":  (weapon1_model, None,              "Weapon"),
        "violence": (fight_model,   VIOLENCE_CLASS_ID, "Violence"),
    }

    frame_count = 0
    face_cache  = []
    start       = time.time()

    while True:
        ret, frame = cap.read()
        if not ret: break
        frame_count += 1

        display = frame.copy()

        if model_id == "face":
            if frame_count % FACE_SKIP == 0:
                face_cache = run_face_on_frame(frame)
            display = annotate_faces(frame, face_cache)
            for name,_,_ in face_cache:
                if name == "Stranger":
                    save_detection(user_id, source_name, "Stranger", frame, cooldown)
        elif model_id == "all":
            # Weapon
            dets_w, disp_w = run_yolo_on_frame(frame, weapon_model, conf)
            if dets_w:
                save_detection(user_id, source_name, "Weapon", frame, cooldown)
                display = disp_w
            # Violence
            dets_v, disp_v = run_yolo_on_frame(frame, fight_model, conf, VIOLENCE_CLASS_ID)
            if dets_v:
                save_detection(user_id, source_name, "Violence", frame, cooldown)
                display = disp_v
            # Face
            if frame_count % FACE_SKIP == 0:
                face_cache = run_face_on_frame(frame)
            display = annotate_faces(display, face_cache)
            for name,_,_ in face_cache:
                if name == "Stranger":
                    save_detection(user_id, source_name, "Stranger", frame, cooldown)
        else:
            m, cf, label = model_map[model_id]
            dets, display = run_yolo_on_frame(frame, m, conf, cf)
            if dets:
                save_detection(user_id, source_name, label, frame, cooldown)

        writer.write(display)
        pct = int(frame_count / total * 100)
        jobs[job_id].update({
            "progress": pct,
            "message":  f"Processing frame {frame_count}/{total}",
        })

    cap.release()
    writer.release()

    try: os.remove(input_path)
    except: pass

    jobs[job_id].update({
        "status":      "done",
        "progress":    100,
        "message":     "Complete!",
        "frames":      frame_count,
        "elapsed":     round(time.time()-start, 1),
        "output_path": output_path,
        "filename":    os.path.basename(output_path),
    })
    log.info(f"✅ Job {job_id} done — {frame_count} frames in {jobs[job_id]['elapsed']}s")

# ─── Webcam worker ────────────────────────────────────────────────────────────

def webcam_worker(user_id, stop_event):
    log.info(f"📷 Webcam started for user {user_id}")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        webcam_state["running"] = False
        log.error("❌ Cannot open webcam")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    cooldown    = {}
    frame_count = 0
    face_cache  = []

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue

        frame_count += 1
        display = frame.copy()

        # Face recognition every FACE_SKIP frames
        if frame_count % FACE_SKIP == 0:
            face_cache = run_face_on_frame(frame)
            for name,_,_ in face_cache:
                if name == "Stranger":
                    save_detection(user_id, "Webcam", "Stranger", frame, cooldown)

        display = annotate_faces(display, face_cache)

        # Weapon detection every 4 frames
        if frame_count % 4 == 0:
            try:
                dets_w, disp_w = run_yolo_on_frame(frame, weapon_model, 0.45)
                if dets_w:
                    save_detection(user_id, "Webcam", "Weapon", frame, cooldown)
                    display = annotate_faces(disp_w, face_cache)
            except: pass

            try:
                dets_v, disp_v = run_yolo_on_frame(frame, fight_model, 0.40, VIOLENCE_CLASS_ID)
                if dets_v:
                    save_detection(user_id, "Webcam", "Violence", frame, cooldown)
                    display = annotate_faces(disp_v, face_cache)
            except: pass

        # Encode latest frame as JPEG for streaming
        _, buf = cv2.imencode(".jpg", display, [cv2.IMWRITE_JPEG_QUALITY, 70])
        webcam_state["latest"] = buf.tobytes()

        time.sleep(0.05)  # ~20fps

    cap.release()
    webcam_state["running"] = False
    webcam_state["latest"]  = None
    log.info("📷 Webcam stopped")

# ─────────────────────────────────────────────────────────────────────────────
# HTML Templates
# ─────────────────────────────────────────────────────────────────────────────

LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SecretEye — Sign In</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f1f5f9;display:flex;align-items:center;justify-content:center;
     min-height:100vh;font-family:'Inter',sans-serif}
.card{background:#fff;border-radius:24px;padding:48px 40px;width:100%;max-width:420px;
      box-shadow:0 4px 24px rgba(0,0,0,.08);border:1px solid #e2e8f0}
.logo{text-align:center;margin-bottom:36px}
.logo-icon{font-size:40px;margin-bottom:12px}
.logo h1{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:800;color:#0f172a}
.logo p{color:#64748b;font-size:14px;margin-top:6px}
.field{margin-bottom:18px}
label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;
      text-transform:uppercase;letter-spacing:.5px}
input{width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;
      padding:13px 16px;color:#0f172a;font-size:14px;outline:none;transition:.2s;
      font-family:'Inter',sans-serif}
input:focus{border-color:#2563eb;background:#fff}
.btn{width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;
     padding:15px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;
     font-family:'Inter',sans-serif;transition:.2s;letter-spacing:.3px}
.btn:hover{background:#1d4ed8}
.error{background:#fef2f2;color:#dc2626;padding:12px 16px;border-radius:10px;
       font-size:13px;margin-bottom:18px;border:1px solid #fecaca}
.footer{text-align:center;margin-top:24px;color:#94a3b8;font-size:12px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">🔐</div>
    <h1>SecretEye</h1>
    <p>AI Security Platform</p>
  </div>
  {% if error %}<div class="error">{{ error }}</div>{% endif %}
  <form method="POST">
    <div class="field">
      <label>Email Address</label>
      <input type="email" name="email" placeholder="your@email.com"
             value="{{ email }}" required autofocus>
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter your password" required>
    </div>
    <button type="submit" class="btn">Sign In →</button>
  </form>
  <div class="footer">Use your SecretEye mobile app credentials</div>
</div>
</body>
</html>"""

MAIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SecretEye — AI Hub</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f8fafc;color:#0f172a;font-family:'Inter',sans-serif;min-height:100vh}

/* Nav */
nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 28px;height:58px;
    display:flex;align-items:center;justify-content:space-between;
    position:sticky;top:0;z-index:100;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.nav-brand{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800}
.nav-brand span{color:#2563eb}
.nav-right{display:flex;align-items:center;gap:12px}
.nav-user{font-size:13px;color:#64748b;font-weight:500}
.nav-logout{font-size:13px;color:#ef4444;text-decoration:none;font-weight:600;
            padding:6px 14px;border:1.5px solid #fecaca;border-radius:8px;
            transition:.2s}
.nav-logout:hover{background:#fef2f2}

/* Tabs */
.tabs{display:flex;gap:4px;background:#f1f5f9;border-radius:12px;padding:4px;
      margin-bottom:28px}
.tab{flex:1;padding:10px;border:none;background:none;border-radius:9px;
     font-size:14px;font-weight:600;cursor:pointer;transition:.2s;
     font-family:'Inter',sans-serif;color:#64748b}
.tab.active{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.1)}

/* Layout */
.container{max-width:960px;margin:0 auto;padding:32px 24px 60px}
.page-title{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:800;margin-bottom:4px}
.page-sub{color:#64748b;font-size:14px;margin-bottom:28px}

/* Cards */
.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;
      margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.card-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
            color:#94a3b8;margin-bottom:16px}

/* Upload zone */
.upload-zone{border:2px dashed #cbd5e1;border-radius:14px;padding:44px 24px;
             text-align:center;cursor:pointer;transition:.2s;position:relative;
             overflow:hidden;background:#f8fafc}
.upload-zone:hover,.upload-zone.drag{border-color:#2563eb;background:#eff6ff}
.upload-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;z-index:2}
.upload-icon{font-size:36px;margin-bottom:10px}
.upload-title{font-weight:700;font-size:15px;margin-bottom:4px}
.upload-sub{font-size:13px;color:#94a3b8}
.file-badge{display:none;margin-top:12px;font-size:13px;color:#2563eb;font-weight:600}

/* Model grid */
.model-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
@media(max-width:600px){.model-grid{grid-template-columns:1fr 1fr}}
.model-opt{border:2px solid #e2e8f0;border-radius:12px;padding:16px;
           cursor:pointer;transition:.2s;text-align:center}
.model-opt:hover{border-color:#93c5fd;background:#f0f9ff}
.model-opt.sel{border-color:#2563eb;background:#eff6ff}
.model-opt input{display:none}
.model-opt-icon{font-size:24px;margin-bottom:6px}
.model-opt-name{font-weight:700;font-size:13px}
.model-opt-sub{font-size:11px;color:#94a3b8;margin-top:3px}

/* Conf slider */
.conf-wrap{margin-bottom:20px}
.conf-wrap label{font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:8px}
.conf-wrap label span{color:#2563eb;font-weight:700}
input[type=range]{width:100%;accent-color:#2563eb}

/* Buttons */
.btn-primary{width:100%;padding:15px;border-radius:12px;border:none;
             background:#2563eb;color:#fff;font-size:15px;font-weight:700;
             cursor:pointer;transition:.2s;font-family:'Inter',sans-serif}
.btn-primary:hover{background:#1d4ed8;transform:translateY(-1px);
                   box-shadow:0 4px 16px rgba(37,99,235,.3)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.btn-green{background:#16a34a}.btn-green:hover{background:#15803d}
.btn-red{background:#dc2626}.btn-red:hover{background:#b91c1c}

/* Progress */
.progress-wrap{background:#f1f5f9;border-radius:100px;height:8px;overflow:hidden;margin:14px 0}
.progress-fill{height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed);
               border-radius:100px;transition:width .4s}
.progress-text{font-size:12px;color:#64748b;text-align:center}
.status-line{font-size:14px;font-weight:600;margin-bottom:8px}

/* Result video */
.result-video{width:100%;border-radius:12px;background:#0f172a;max-height:460px;border:1px solid #e2e8f0}
.result-meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}
.meta-it{font-size:13px}
.meta-it span:first-child{color:#94a3b8;margin-right:4px}
.meta-it span:last-child{font-weight:600}
.dl-btn{display:inline-flex;align-items:center;gap:8px;margin-top:14px;
        padding:9px 18px;background:#f1f5f9;border:1px solid #e2e8f0;
        border-radius:10px;font-size:13px;font-weight:600;color:#0f172a;
        text-decoration:none;transition:.2s}
.dl-btn:hover{background:#e2e8f0}

/* Webcam */
.webcam-feed{width:100%;border-radius:14px;background:#0f172a;max-height:460px;
             display:block;border:1px solid #e2e8f0}
.webcam-status{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:12px}
.status-dot{width:8px;height:8px;border-radius:50%;background:#94a3b8}
.status-dot.live{background:#22c55e;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* Face DB badge */
.face-db-badge{display:flex;align-items:center;gap:8px;font-size:13px;padding:10px 14px;
               background:#f0fdf4;border:1px solid #86efac;border-radius:10px;margin-bottom:16px}
.face-db-badge.empty{background:#fffbeb;border-color:#fcd34d;color:#92400e}

/* Hidden */
.hidden{display:none!important}

/* Alert feed */
.alert-feed{max-height:300px;overflow-y:auto}
.alert-item{display:flex;align-items:center;gap:12px;padding:10px 0;
            border-bottom:1px solid #f1f5f9}
.alert-item:last-child{border-bottom:none}
.alert-icon{font-size:20px;flex-shrink:0}
.alert-text{flex:1}
.alert-type{font-weight:700;font-size:13px}
.alert-meta{font-size:11px;color:#94a3b8;margin-top:2px}
.alert-type.Weapon{color:#dc2626}
.alert-type.Violence{color:#ea580c}
.alert-type.Stranger{color:#9333ea}
</style>
</head>
<body>

<nav>
  <div class="nav-brand">Secret<span>Eye</span></div>
  <div class="nav-right">
    <span class="nav-user">{{ user_name }}</span>
    <a href="/logout" class="nav-logout">Sign Out</a>
  </div>
</nav>

<div class="container">
  <div class="page-title">AI Security Hub</div>
  <p class="page-sub">Upload videos for AI analysis or monitor live with your webcam</p>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab active" onclick="switchTab('video',this)">🎬 Video Analysis</button>
    <button class="tab" onclick="switchTab('webcam',this)">📷 Live Webcam</button>
    <button class="tab" onclick="switchTab('alerts',this)">🔔 Recent Alerts</button>
  </div>

  <!-- ─── VIDEO TAB ─────────────────────────────────────── -->
  <div id="tab-video">

    <!-- Upload -->
    <div class="card">
      <div class="card-label">Upload Video</div>
      <div class="upload-zone" id="drop-zone">
        <input type="file" id="file-input" accept="video/*">
        <div class="upload-icon">🎬</div>
        <div class="upload-title">Click or drag your video here</div>
        <div class="upload-sub">MP4 · AVI · MOV supported</div>
        <div class="file-badge" id="file-badge"></div>
      </div>
    </div>

    <!-- Model + Conf -->
    <div class="card">
      <div class="card-label">Detection Model</div>

      <div class="face-db-badge" id="face-db-badge">
        <span id="face-db-txt">👤 Loading face database...</span>
      </div>

      <div class="model-grid">
        <label class="model-opt sel">
          <input type="radio" name="model" value="all" checked>
          <div class="model-opt-icon">🎯</div>
          <div class="model-opt-name">All Models</div>
          <div class="model-opt-sub">Weapon + Violence + Face</div>
        </label>
        <label class="model-opt">
          <input type="radio" name="model" value="violence">
          <div class="model-opt-icon">⚡</div>
          <div class="model-opt-name">Violence</div>
          <div class="model-opt-sub">Fight detection</div>
        </label>
        <label class="model-opt">
          <input type="radio" name="model" value="weapon">
          <div class="model-opt-icon">🔫</div>
          <div class="model-opt-name">Gun Only</div>
          <div class="model-opt-sub">Firearm detection</div>
        </label>
        <label class="model-opt">
          <input type="radio" name="model" value="weapon1">
          <div class="model-opt-icon">🗡️</div>
          <div class="model-opt-name">All Weapons</div>
          <div class="model-opt-sub">Gun + Knife + Grenade</div>
        </label>
        <label class="model-opt">
          <input type="radio" name="model" value="face">
          <div class="model-opt-icon">👤</div>
          <div class="model-opt-name">Face Only</div>
          <div class="model-opt-sub">Recognize vs database</div>
        </label>
      </div>

      <div class="conf-wrap" id="conf-wrap">
        <label>Confidence: <span id="conf-val">40%</span></label>
        <input type="range" id="conf-slider" min="10" max="90" value="40"
               oninput="document.getElementById('conf-val').textContent=this.value+'%'">
      </div>

      <button class="btn-primary" id="run-btn" onclick="runVideo()" disabled>
        ▶ Run Detection
      </button>
    </div>

    <!-- Progress -->
    <div class="card hidden" id="progress-card">
      <div class="card-label">Processing</div>
      <div class="status-line" id="status-line">Starting...</div>
      <div class="progress-wrap">
        <div class="progress-fill" id="progress-fill" style="width:0%"></div>
      </div>
      <div class="progress-text" id="progress-pct">0%</div>
    </div>

    <!-- Result -->
    <div class="card hidden" id="result-card">
      <div class="card-label">Result — Detections sent to your app</div>
      <video class="result-video" id="result-video" controls></video>
      <div class="result-meta" id="result-meta"></div>
      <a class="dl-btn" id="dl-btn" href="#" download>⬇ Download Output Video</a>
    </div>
  </div>

  <!-- ─── WEBCAM TAB ────────────────────────────────────── -->
  <div id="tab-webcam" class="hidden">
    <div class="card">
      <div class="card-label">Live Webcam — PC Camera</div>
      <img class="webcam-feed" id="webcam-feed" src="" alt="Webcam feed">
      <div class="webcam-status">
        <span class="status-dot" id="wcam-dot"></span>
        <span id="wcam-status">Webcam stopped</span>
      </div>
      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn-primary btn-green" id="wcam-start" onclick="startWebcam()"
                style="flex:1">▶ Start Webcam</button>
        <button class="btn-primary btn-red hidden" id="wcam-stop" onclick="stopWebcam()"
                style="flex:1">■ Stop Webcam</button>
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-top:12px">
        Detects faces (vs your faces/ database), weapons and violence in real time.
        Stranger faces and threats are automatically sent to your SecretEye app as alerts.
      </p>
    </div>
  </div>

  <!-- ─── ALERTS TAB ────────────────────────────────────── -->
  <div id="tab-alerts" class="hidden">
    <div class="card">
      <div class="card-label">Recent Detections — This Session</div>
      <div class="alert-feed" id="alert-feed">
        <div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px">
          No detections yet in this session.
        </div>
      </div>
    </div>
  </div>

</div>

<script>
let currentFile = null;
let pollTimer   = null;
let wcamRunning = false;
let alertLog    = [];

// Face DB status
fetch('/face-db-status').then(r=>r.json()).then(d=>{
  const el = document.getElementById('face-db-txt');
  const bd = document.getElementById('face-db-badge');
  if (d.count===0){
    bd.className='face-db-badge empty';
    el.textContent='⚠ No faces in database — add images to backend/faces/ folder';
  } else {
    el.textContent=`👤 Face database: ${d.count} person(s) — ${d.names.join(', ')}`;
  }
});

// Model card selection
document.querySelectorAll('.model-opt').forEach(opt=>{
  opt.addEventListener('click',()=>{
    document.querySelectorAll('.model-opt').forEach(o=>o.classList.remove('sel'));
    opt.classList.add('sel');
    const v = opt.querySelector('input').value;
    document.getElementById('conf-wrap').style.display = v==='face' ? 'none' : 'block';
  });
});

// Upload
const dz = document.getElementById('drop-zone');
const fi = document.getElementById('file-input');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');
  if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])});
fi.addEventListener('change',()=>{if(fi.files[0]) handleFile(fi.files[0])});

function handleFile(file){
  currentFile=file;
  const badge=document.getElementById('file-badge');
  badge.textContent=`📄 ${file.name}  ·  ${(file.size/1024/1024).toFixed(1)} MB`;
  badge.style.display='block';
  document.getElementById('run-btn').disabled=false;
  document.getElementById('result-card').classList.add('hidden');
}

// Tab switching
function switchTab(tab, btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  ['video','webcam','alerts'].forEach(t=>{
    document.getElementById('tab-'+t).classList.toggle('hidden', t!==tab);
  });
  if(tab==='alerts') refreshAlerts();
}

// Run video detection
async function runVideo(){
  if(!currentFile) return;
  const model = document.querySelector('input[name=model]:checked').value;
  const conf  = document.getElementById('conf-slider').value/100;

  document.getElementById('run-btn').disabled=true;
  document.getElementById('progress-card').classList.remove('hidden');
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('progress-fill').style.width='0%';
  document.getElementById('status-line').textContent='Uploading...';

  const fd=new FormData();
  fd.append('video',currentFile);
  fd.append('model',model);
  fd.append('conf',conf);

  try{
    const resp=await fetch('/process',{method:'POST',body:fd});
    const data=await resp.json();
    if(data.error) throw new Error(data.error);
    pollJob(data.job_id);
  }catch(e){
    document.getElementById('status-line').textContent='❌ '+e.message;
    document.getElementById('run-btn').disabled=false;
  }
}

function pollJob(jobId){
  pollTimer=setInterval(async()=>{
    const d=await(await fetch('/progress/'+jobId)).json();
    document.getElementById('progress-fill').style.width=(d.progress||0)+'%';
    document.getElementById('progress-pct').textContent=(d.progress||0)+'%';
    document.getElementById('status-line').textContent=d.message||'Processing...';
    if(d.status==='done'){
      clearInterval(pollTimer);
      showResult(d,jobId);
    } else if(d.status==='error'){
      clearInterval(pollTimer);
      document.getElementById('status-line').textContent='❌ '+d.message;
      document.getElementById('run-btn').disabled=false;
    }
  },800);
}

function showResult(d,jobId){
  document.getElementById('progress-card').classList.add('hidden');
  document.getElementById('result-card').classList.remove('hidden');
  document.getElementById('run-btn').disabled=false;
  const vid=document.getElementById('result-video');
  vid.src='/output/'+jobId+'?t='+Date.now();
  vid.load();
  document.getElementById('dl-btn').href='/output/'+jobId;
  document.getElementById('dl-btn').download=d.filename||'output.mp4';
  document.getElementById('result-meta').innerHTML=`
    <div class="meta-it"><span>Frames:</span><span>${d.frames}</span></div>
    <div class="meta-it"><span>Time:</span><span>${d.elapsed}s</span></div>
    <div class="meta-it"><span>Saved:</span><span>runs/detect/</span></div>
  `;
  vid.scrollIntoView({behavior:'smooth'});
}

// Webcam
async function startWebcam(){
  const resp=await fetch('/webcam/start',{method:'POST'});
  const d=await resp.json();
  if(d.started){
    wcamRunning=true;
    document.getElementById('wcam-start').classList.add('hidden');
    document.getElementById('wcam-stop').classList.remove('hidden');
    document.getElementById('wcam-dot').className='status-dot live';
    document.getElementById('wcam-status').textContent='LIVE — AI detecting...';
    streamWebcam();
  } else {
    alert(d.error||'Could not start webcam');
  }
}

async function stopWebcam(){
  await fetch('/webcam/stop',{method:'POST'});
  wcamRunning=false;
  document.getElementById('wcam-start').classList.remove('hidden');
  document.getElementById('wcam-stop').classList.add('hidden');
  document.getElementById('wcam-dot').className='status-dot';
  document.getElementById('wcam-status').textContent='Webcam stopped';
  document.getElementById('webcam-feed').src='';
}

function streamWebcam(){
  if(!wcamRunning) return;
  const img=document.getElementById('webcam-feed');
  img.src='/webcam/frame?t='+Date.now();
  img.onload=()=>{ if(wcamRunning) setTimeout(streamWebcam,80); };
  img.onerror=()=>{ if(wcamRunning) setTimeout(streamWebcam,500); };
}

// Alerts
async function refreshAlerts(){
  const d=await(await fetch('/session-alerts')).json();
  const el=document.getElementById('alert-feed');
  if(!d.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px">No detections yet in this session.</div>';
    return;
  }
  const icons={Weapon:'🔫',Violence:'⚡',Stranger:'👤'};
  el.innerHTML=d.map(a=>`
    <div class="alert-item">
      <span class="alert-icon">${icons[a.type]||'⚠'}</span>
      <div class="alert-text">
        <div class="alert-type ${a.type}">${a.type.toUpperCase()}</div>
        <div class="alert-meta">${a.source} · ${a.time}</div>
      </div>
    </div>`).join('');
}
</script>
</body>
</html>"""

# ─────────────────────────────────────────────────────────────────────────────
# Flask Routes
# ─────────────────────────────────────────────────────────────────────────────

# Per-session alert log (in memory)
session_alerts = {}  # user_id → list

@app.route("/", methods=["GET","POST"])
def login_page():
    if "user" in session:
        return redirect(url_for("main"))
    error = ""
    email = ""
    if request.method == "POST":
        email    = request.form.get("email","").strip()
        password = request.form.get("password","").strip()
        if not email or not password:
            error = "Please enter both email and password."
        else:
            user = firebase_sign_in(email, password)
            if user:
                session["user"] = user
                session_alerts[user["uid"]] = []
                log.info(f"✅ Login: {email}")
                return redirect(url_for("main"))
            else:
                error = "Incorrect email or password."
    return render_template_string(LOGIN_HTML, error=error, email=email)

@app.route("/logout")
def logout():
    user = session.get("user")
    if user:
        # Stop webcam if running for this user
        if webcam_state["running"] and webcam_state["user_id"] == user["uid"]:
            webcam_state["stop"].set()
    session.clear()
    return redirect(url_for("login_page"))

@app.route("/hub")
@login_required
def main():
    user = session["user"]
    return render_template_string(MAIN_HTML,
        user_name=user.get("name", user["email"]))

@app.route("/face-db-status")
@login_required
def face_db_status():
    return jsonify({"count": len(known_names), "names": known_names})

@app.route("/session-alerts")
@login_required
def get_session_alerts():
    uid = session["user"]["uid"]
    return jsonify(session_alerts.get(uid, []))

# ─── Video processing ─────────────────────────────────────────────────────────

@app.route("/process", methods=["POST"])
@login_required
def process():
    user     = session["user"]
    video    = request.files.get("video")
    model_id = request.form.get("model", "all")
    conf     = float(request.form.get("conf", 0.40))

    if not video:
        return jsonify({"error": "No video uploaded"}), 400

    job_id   = str(uuid.uuid4())[:8]
    ext      = os.path.splitext(video.filename)[1] or ".mp4"
    tmp_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
    video.save(tmp_path)

    ts      = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = os.path.join("runs", "detect", f"{model_id}_{ts}")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"output_{job_id}.mp4")

    jobs[job_id] = {
        "status": "queued", "progress": 0,
        "message": "Queued...", "output_path": out_path,
        "filename": f"output_{job_id}.mp4",
    }

    source_name = os.path.splitext(video.filename)[0] or "Upload"

    def _run():
        # Wrap save_detection to also log to session_alerts
        original_save = save_detection
        def patched_save(uid, sname, dtype, frame, cooldown):
            original_save(uid, sname, dtype, frame, cooldown)
            if uid not in session_alerts:
                session_alerts[uid] = []
            session_alerts[uid].insert(0, {
                "type":   dtype,
                "source": sname,
                "time":   time.strftime("%H:%M:%S"),
            })
            if len(session_alerts[uid]) > 50:
                session_alerts[uid].pop()

        # Temporarily patch
        import builtins
        process_video_job.__globals__["save_detection"] = patched_save
        try:
            process_video_job(job_id, tmp_path, out_path,
                              model_id, conf, user["uid"], source_name)
        finally:
            process_video_job.__globals__["save_detection"] = original_save

    _pool.submit(_run)
    return jsonify({"job_id": job_id})

@app.route("/progress/<job_id>")
@login_required
def progress(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Not found"}), 404
    return jsonify(job)

@app.route("/output/<job_id>")
@login_required
def output(job_id):
    job = jobs.get(job_id)
    if not job or job["status"] != "done":
        return jsonify({"error": "Not ready"}), 404
    return send_file(job["output_path"], mimetype="video/mp4")

# ─── Webcam ───────────────────────────────────────────────────────────────────

@app.route("/webcam/start", methods=["POST"])
@login_required
def webcam_start():
    user = session["user"]
    if webcam_state["running"]:
        return jsonify({"started": True})

    webcam_state["stop"]    = threading.Event()
    webcam_state["user_id"] = user["uid"]
    webcam_state["running"] = True

    t = threading.Thread(
        target=webcam_worker,
        args=(user["uid"], webcam_state["stop"]),
        daemon=True
    )
    t.start()
    webcam_state["thread"] = t
    time.sleep(0.5)

    if not webcam_state["running"]:
        return jsonify({"started": False, "error": "Could not open webcam"})
    return jsonify({"started": True})

@app.route("/webcam/stop", methods=["POST"])
@login_required
def webcam_stop():
    webcam_state["stop"].set()
    webcam_state["running"] = False
    return jsonify({"stopped": True})

@app.route("/webcam/frame")
@login_required
def webcam_frame():
    frame_bytes = webcam_state.get("latest")
    if not frame_bytes:
        # Return placeholder
        ph = np.zeros((240,320,3), dtype=np.uint8)
        cv2.putText(ph,"Webcam not started",(40,120),
                    cv2.FONT_HERSHEY_SIMPLEX,0.6,(80,80,80),1)
        _, buf = cv2.imencode(".jpg", ph)
        frame_bytes = buf.tobytes()
    resp = Response(frame_bytes, mimetype="image/jpeg")
    resp.headers["Cache-Control"] = "no-cache, no-store"
    return resp

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("🚀 SecretEye AI Hub v6.0")
    log.info("   Open: http://YOUR_PC_IP:5000")
    log.info("   Login with your SecretEye mobile app credentials")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)