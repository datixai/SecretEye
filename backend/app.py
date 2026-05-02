"""
=============================================================
  SecretEye — AI Security Hub  v5.0
=============================================================
  WEB LOGIN ADDED:
    Open http://PC_IP:5000 in browser
    Enter your SecretEye email + password (same as mobile app)
    Flask verifies against Firebase Auth via REST API
    Only YOUR devices start — no other users' cameras touched
    /monitor shows only YOUR streams and detections

  DUAL STREAM per device:
    raw_frames[key]    → /raw-snapshot  (mobile app clean preview)
    latest_frames[key] → /snapshot + /monitor (AI boxes + HUD)

  Endpoints:
    GET/POST /           — login page
    GET      /logout     — logout
    GET      /monitor    — web dashboard (protected)
    GET      /recent-detections
    GET      /raw-snapshot
    GET      /snapshot
    GET      /video_feed
    POST     /start_device
    POST     /stop_device
    POST     /upload-video
    GET      /status
    GET      /health
=============================================================
"""

import os, time, base64, threading, queue, logging, shutil, tempfile, requests
from concurrent.futures import ThreadPoolExecutor
from functools import wraps
import cv2
import numpy as np
from flask import (Flask, Response, jsonify, redirect, render_template_string,
                   request, session, url_for)
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from ultralytics import YOLO
from deepface import DeepFace

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("SecurityHub")

# ─── Flask ────────────────────────────────────────────────────────────────────
app             = Flask(__name__)
app.secret_key  = "secreteye-datix-ai-2026"   # for session cookies
CORS(app)
_alert_pool     = ThreadPoolExecutor(max_workers=8, thread_name_prefix="fb-write")

# ─── Firebase REST API key (for web login) ────────────────────────────────────
# Get from Firebase Console → Project Settings → General → Web API Key
FIREBASE_API_KEY = os.environ.get(
    "FIREBASE_API_KEY",
    os.environ.get("EXPO_PUBLIC_FIREBASE_API_KEY", "")
)
# Try to load from .env.local if not set
if not FIREBASE_API_KEY:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if "EXPO_PUBLIC_FIREBASE_API_KEY" in line:
                    FIREBASE_API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

if not FIREBASE_API_KEY:
    log.warning("⚠️  FIREBASE_API_KEY not found — web login will not work.")
    log.warning("    Set it in backend/.env or as environment variable.")

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
WEAPON_MODEL_PATH = "model/weapon.pt"
FIGHT_MODEL_PATH  = "model/fight.pt"
FACENET512_LOCAL  = os.path.join("model", "facenet512_weights.h5")

for p in (WEAPON_MODEL_PATH, FIGHT_MODEL_PATH):
    if not os.path.exists(p):
        raise FileNotFoundError(f"Model not found: '{p}'")

weapon_model = YOLO(WEAPON_MODEL_PATH)
fight_model  = YOLO(FIGHT_MODEL_PATH)

if os.path.exists(FACENET512_LOCAL):
    os.environ["DEEPFACE_HOME"] = os.path.abspath(".")
    df_dir = os.path.join(".", ".deepface", "weights")
    os.makedirs(df_dir, exist_ok=True)
    df_dst = os.path.join(df_dir, "facenet512_weights.h5")
    if not os.path.exists(df_dst):
        shutil.copy2(FACENET512_LOCAL, df_dst)
    DeepFace.build_model("Facenet512")
    log.info("✅ DeepFace Facenet512 — offline mode.")
else:
    DeepFace.build_model("Facenet512")
    log.info("✅ DeepFace Facenet512 ready.")

VIOLENCE_CLASS_ID = next(
    (k for k, v in fight_model.names.items() if v.lower() == "violence"), None)
log.info(f"✅ Models ready. Violence class: {VIOLENCE_CLASS_ID}")

# ─── Constants ────────────────────────────────────────────────────────────────
WEAPON_CONF           = 0.70
VIOLENCE_CONF         = 0.65
CONFIRM_FRAMES_NEEDED = 3
CONFIRM_EXIT_FRAMES   = 5
FACE_CONFIRM_NEEDED   = 2
FACE_THRESH           = 0.38
TRACK_HOLD_SEC        = 3.0
ALERT_COOLDOWN_SEC    = 60
DETECT_EVERY_N        = 4
FACE_EVERY_N          = 40
YOLO_INPUT_WIDTH      = 640
STREAM_FPS_CAP        = 0.1
STREAM_QUALITY        = 65

# ─── Runtime State ────────────────────────────────────────────────────────────
latest_frames:     dict = {}
raw_frames:        dict = {}
worker_threads:    dict = {}
stop_flags:        dict = {}
recent_detections: dict = {}   # per user_id
recent_lock = threading.Lock()


# ─── Auth Helper ──────────────────────────────────────────────────────────────

def firebase_sign_in(email: str, password: str):
    """Authenticate with Firebase using email/password via REST API.
    Returns user dict with uid, email, displayName or None on failure."""
    if not FIREBASE_API_KEY:
        log.error("FIREBASE_API_KEY not set — cannot authenticate.")
        return None
    try:
        resp = requests.post(
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
            f"?key={FIREBASE_API_KEY}",
            json={"email": email, "password": password, "returnSecureToken": True},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "uid":         data["localId"],
                "email":       data["email"],
                "displayName": data.get("displayName", email.split("@")[0]),
            }
        err = resp.json().get("error", {}).get("message", "Unknown error")
        log.warning(f"Firebase login failed: {err}")
        return None
    except Exception as e:
        log.error(f"firebase_sign_in: {e}")
        return None


def login_required(f):
    """Decorator — redirects to login if not authenticated."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated


# ─── Per-User Device Startup ──────────────────────────────────────────────────

def start_user_devices(user_id: str):
    """Start camera workers for all active devices belonging to user_id only."""
    log.info(f"🔍 Starting devices for user {user_id}…")
    try:
        docs = (db_client.collection("devices")
                .where("userId", "==", user_id)
                .where("status", "==", "Active")
                .get())
        count = 0
        for doc in docs:
            d    = doc.to_dict()
            name = d.get("name", "").strip()
            ip   = d.get("ip",   "").strip()
            if name and ip:
                ensure_worker_running(user_id, name, ip)
                count += 1
        log.info(f"✅ Started {count} device(s) for user {user_id}")
    except Exception as e:
        log.error(f"start_user_devices: {e}")


def stop_user_devices(user_id: str):
    """Stop all camera workers belonging to user_id."""
    prefix = f"{user_id}_"
    for key in list(worker_threads.keys()):
        if key.startswith(prefix):
            if key in stop_flags:
                stop_flags[key].set()
    log.info(f"■ Stopped all workers for user {user_id}")


# ─── Firebase Helpers ─────────────────────────────────────────────────────────

def get_homeowner_ref(user_id):
    try:
        doc = db_client.collection("users").document(user_id).get()
        if not doc.exists: return None, None
        face_data = doc.to_dict().get("faceReference")
        if not face_data: return None, None
        if "base64," in face_data:
            face_data = face_data.split("base64,")[1]
        nparr   = np.frombuffer(base64.b64decode(face_data), np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None: return None, None
        tmp = os.path.join(tempfile.gettempdir(), f"ref_{user_id}.jpg")
        cv2.imwrite(tmp, img_bgr)
        return img_bgr, tmp
    except Exception as e:
        log.error(f"get_homeowner_ref: {e}")
        return None, None


def frame_to_b64(frame, quality=55):
    small = cv2.resize(frame, (480, 320))
    _, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def save_alert(user_id, device_name, alert_type, frame, cooldown_map):
    key = f"{user_id}_{device_name}_{alert_type}"
    now = time.time()
    if now - cooldown_map.get(key, 0) < ALERT_COOLDOWN_SEC: return
    cooldown_map[key] = now
    fc = frame.copy()
    with recent_lock:
        if user_id not in recent_detections:
            recent_detections[user_id] = []
        recent_detections[user_id].insert(0, {
            "type":      alert_type,
            "device":    device_name,
            "time":      time.strftime("%H:%M:%S"),
            "image_b64": frame_to_b64(fc),
        })
        if len(recent_detections[user_id]) > 20:
            recent_detections[user_id].pop()

    def _write():
        try:
            db_client.collection("detections").add({
                "userId":     user_id,
                "deviceName": device_name,
                "type":       alert_type,
                "imageUrl":   frame_to_b64(fc),
                "priority":   "High" if alert_type in ("Weapon","Violence") else "Medium",
                "timestamp":  firestore.SERVER_TIMESTAMP,
                "status":     "new",
            })
            log.info(f"🚨 [{device_name}] {alert_type} → Firestore")
        except Exception as e:
            log.error(f"Firebase write: {e}")
    _alert_pool.submit(_write)


# ─── Confirmation Gate ────────────────────────────────────────────────────────

class ConfirmationGate:
    def __init__(self, needed=CONFIRM_FRAMES_NEEDED, exit_frames=CONFIRM_EXIT_FRAMES):
        self._needed=needed; self._exit=exit_frames
        self._hit:dict={}; self._miss:dict={}; self._conf:set=set()

    def update(self, labels):
        nc=[]; s=set(labels)
        for l in s:
            self._hit[l]=self._hit.get(l,0)+1; self._miss[l]=0
            if self._hit[l]>=self._needed and l not in self._conf:
                self._conf.add(l); nc.append(l)
        for l in list(self._hit):
            if l not in s:
                self._hit[l]=0
                if l in self._conf:
                    self._miss[l]=self._miss.get(l,0)+1
                    if self._miss[l]>=self._exit:
                        self._conf.discard(l); self._miss[l]=0
                else: self._miss[l]=0
        return nc

    def is_confirmed(self,l): return l in self._conf
    def active(self): return list(self._conf)


# ─── Tracked Box ─────────────────────────────────────────────────────────────

class TrackedBox:
    def __init__(self, box_xyxy, label, color):
        x1,y1,x2,y2=[int(v) for v in box_xyxy]
        self.label=label; self.color=color
        self.last_seen=time.time(); self._box=(x1,y1,x2-x1,y2-y1)

    def refresh(self, box_xyxy):
        x1,y1,x2,y2=[int(v) for v in box_xyxy]
        self._box=(x1,y1,x2-x1,y2-y1); self.last_seen=time.time()

    def is_expired(self): return (time.time()-self.last_seen)>TRACK_HOLD_SEC

    def draw(self, frame):
        if not self._box: return
        x,y,w,h=self._box
        cv2.rectangle(frame,(x,y),(x+w,y+h),self.color,2)
        (tw,th),_=cv2.getTextSize(self.label,cv2.FONT_HERSHEY_SIMPLEX,0.6,2)
        cv2.rectangle(frame,(x,y-th-10),(x+tw+8,y),self.color,-1)
        cv2.putText(frame,self.label,(x+4,y-5),
                    cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,255,255),2)


# ─── FaceID Worker ────────────────────────────────────────────────────────────

class FaceIDWorker:
    def __init__(self, ref_path, threshold=FACE_THRESH):
        self.ref_path=ref_path; self.threshold=threshold
        self._in_q=queue.Queue(maxsize=1); self._out_q=queue.Queue(maxsize=1)
        self._cascade=cv2.CascadeClassifier(
            cv2.data.haarcascades+"haarcascade_frontalface_default.xml")
        threading.Thread(target=self._run,daemon=True,name="face-id").start()

    def submit(self,frame):
        try: self._in_q.put_nowait(frame)
        except queue.Full: pass

    def get_result(self):
        try: return self._out_q.get_nowait()
        except queue.Empty: return None

    def stop(self):
        try: self._in_q.put_nowait(None)
        except queue.Full: pass

    def _push(self,label,dist,box):
        try: self._out_q.get_nowait()
        except queue.Empty: pass
        self._out_q.put((label,dist,box))

    def _run(self):
        faces=[]
        while True:
            frame=self._in_q.get()
            if frame is None: break
            try:
                gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
                faces=self._cascade.detectMultiScale(gray,1.1,6,minSize=(60,60))
                if len(faces)==0: self._push("No Face",1.0,None); continue
                box=tuple(faces[0])
                res=DeepFace.verify(
                    img1_path=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB),
                    img2_path=self.ref_path,model_name="Facenet512",
                    detector_backend="opencv",enforce_detection=True,
                    distance_metric="cosine",silent=True)
                dist=res["distance"]
                self._push("Homeowner" if dist<self.threshold else "Stranger",dist,box)
            except Exception as e:
                log.debug(f"FaceID: {e}")
                self._push("Stranger",1.0,tuple(faces[0]) if len(faces)>0 else None)


# ─── Drawing Helpers ──────────────────────────────────────────────────────────

def draw_face_box(frame,box,label,dist):
    if not box: return frame
    x,y,w,h=box; color=(0,200,0) if label=="Homeowner" else (0,0,220)
    tag=f"{label} ({dist:.2f})"
    cv2.rectangle(frame,(x,y),(x+w,y+h),color,2)
    (tw,th),_=cv2.getTextSize(tag,cv2.FONT_HERSHEY_SIMPLEX,0.55,2)
    cv2.rectangle(frame,(x,y-th-10),(x+tw+6,y),color,-1)
    cv2.putText(frame,tag,(x+3,y-5),cv2.FONT_HERSHEY_SIMPLEX,0.55,(255,255,255),2)
    return frame

def draw_hud(frame,face_label,threats):
    h,w=frame.shape[:2]
    danger=bool(threats) or face_label=="Stranger"
    color=(0,0,220) if danger else (0,200,0)
    ts=", ".join(threats) if threats else "Clear"
    cv2.rectangle(frame,(0,0),(w,46),(0,0,0),-1)
    cv2.putText(frame,f"Face: {face_label}  |  {ts}",
                (10,32),cv2.FONT_HERSHEY_SIMPLEX,0.70,color,2)
    return frame

def resize_for_yolo(frame):
    h,w=frame.shape[:2]
    if w==YOLO_INPUT_WIDTH: return frame
    s=YOLO_INPUT_WIDTH/w
    return cv2.resize(frame,(YOLO_INPUT_WIDTH,int(h*s)),interpolation=cv2.INTER_LINEAR)

def refresh_tracker(tbs,box_xyxy,label,color):
    for tb in tbs:
        if tb.label==label: tb.refresh(box_xyxy); return
    tbs.append(TrackedBox(box_xyxy,label,color))


# ─── Camera Worker ────────────────────────────────────────────────────────────

def camera_worker(user_id, device_name, stream_ip, stop_event):
    key=f"{user_id}_{device_name}"; cooldown={}
    stream_url=(stream_ip if stream_ip.startswith(("http://","https://","rtsp://"))
                else f"http://{stream_ip}/video")
    log.info(f"▶ [{device_name}] {stream_url}")

    _,ref_path=get_homeowner_ref(user_id)
    face_worker=FaceIDWorker(ref_path) if ref_path else None
    if not face_worker: log.warning(f"[{device_name}] Face ID disabled.")

    face_label="Scanning…"; face_dist=1.0; face_box=None
    face_stranger_count=0; frame_count=0
    gate=ConfirmationGate(); tbs=[]

    cap=cv2.VideoCapture(stream_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,1)
    reconnect_delay=2

    while not stop_event.is_set():
        ret,frame=cap.read()
        if not ret:
            log.warning(f"[{device_name}] Stream lost — retry {reconnect_delay}s")
            cap.release(); time.sleep(reconnect_delay)
            reconnect_delay=min(reconnect_delay*2,30)
            cap=cv2.VideoCapture(stream_url)
            cap.set(cv2.CAP_PROP_BUFFERSIZE,1); continue

        reconnect_delay=2; frame_count+=1
        raw_frames[key]=frame.copy()
        display=frame.copy()

        run_det =(frame_count%DETECT_EVERY_N==0)
        run_face=face_worker is not None and (frame_count%FACE_EVERY_N==0)

        if face_worker:
            res=face_worker.get_result()
            if res:
                nl,nd,nb=res; face_label=nl; face_dist=nd
                face_box=nb if nl!="No Face" else None
                if face_label=="Stranger":
                    face_stranger_count+=1
                    if face_stranger_count>=FACE_CONFIRM_NEEDED:
                        save_alert(user_id,device_name,"Stranger",display,cooldown)
                        face_stranger_count=0
                else: face_stranger_count=0

        if run_det:
            yf=resize_for_yolo(frame); rd=[]; w_res=None; v_boxes=[]
            try:
                w_res=weapon_model.predict(yf,conf=WEAPON_CONF,verbose=False,iou=0.45)
                if w_res and len(w_res[0].boxes)>0: rd.append("Weapon")
            except Exception as e: log.error(f"[{device_name}] Weapon: {e}")
            try:
                f_res=fight_model.predict(yf,conf=VIOLENCE_CONF,verbose=False,iou=0.45,
                    classes=[VIOLENCE_CLASS_ID] if VIOLENCE_CLASS_ID is not None else None)
                v_boxes=[b for b in f_res[0].boxes if VIOLENCE_CLASS_ID is not None
                         and int(b.cls[0])==VIOLENCE_CLASS_ID]
                if v_boxes: rd.append("Violence")
            except Exception as e: log.error(f"[{device_name}] Violence: {e}")
            for label in gate.update(rd):
                save_alert(user_id,device_name,label,display,cooldown)
            if gate.is_confirmed("Weapon") and w_res and len(w_res[0].boxes)>0:
                for b in w_res[0].boxes:
                    refresh_tracker(tbs,b.xyxy[0],"Weapon",(0,0,220))
            if gate.is_confirmed("Violence") and v_boxes:
                for b in v_boxes:
                    refresh_tracker(tbs,b.xyxy[0],"Violence",(0,100,255))

        if run_face: face_worker.submit(frame.copy())

        active=[]; alive=[]
        for tb in tbs:
            if tb.is_expired(): continue
            if gate.is_confirmed(tb.label): tb.draw(display); active.append(tb.label)
            alive.append(tb)
        tbs=alive
        if face_box and face_label not in ("No Face","Scanning…"):
            display=draw_face_box(display,face_box,face_label,face_dist)
        display=draw_hud(display,face_label,list(dict.fromkeys(active)))
        latest_frames[key]=display

    cap.release()
    if face_worker: face_worker.stop()
    latest_frames.pop(key,None); raw_frames.pop(key,None)
    log.info(f"■ [{device_name}] Stopped.")


# ─── Worker Lifecycle ─────────────────────────────────────────────────────────

def ensure_worker_running(user_id, device_name, ip=None):
    key=f"{user_id}_{device_name}"
    if key in worker_threads and worker_threads[key].is_alive(): return True
    if not ip:
        try:
            docs=(db_client.collection("devices")
                  .where("userId","==",user_id)
                  .where("name","==",device_name).limit(1).get())
        except Exception as e:
            log.error(f"Firestore lookup: {e}"); return False
        if not docs: return False
        data=docs[0].to_dict()
        if data.get("status","").lower()!="active": return False
        ip=data.get("ip","").strip()
    if not ip: return False
    stop_event=threading.Event(); stop_flags[key]=stop_event
    t=threading.Thread(target=camera_worker,
                       args=(user_id,device_name,ip,stop_event),
                       daemon=True,name=f"cam-{key}")
    t.start(); worker_threads[key]=t
    return True


def stop_worker(user_id, device_name):
    key=f"{user_id}_{device_name}"
    if key in stop_flags: stop_flags[key].set()


# ─── HTML Templates ───────────────────────────────────────────────────────────

LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SecretEye — Login</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0f172a;display:flex;align-items:center;
         justify-content:center;min-height:100vh;
         font-family:'Segoe UI',sans-serif}
    .card{background:#1e293b;border-radius:24px;padding:48px 40px;
          width:100%;max-width:420px;border:1px solid #334155;
          box-shadow:0 24px 64px rgba(0,0,0,0.5)}
    .logo{text-align:center;margin-bottom:32px}
    .logo h1{font-size:28px;font-weight:800;color:#0891b2;letter-spacing:1px}
    .logo p{color:#64748b;font-size:14px;margin-top:6px}
    .field{margin-bottom:20px}
    label{display:block;font-size:12px;font-weight:700;color:#64748b;
          text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
    input{width:100%;background:#0f172a;border:1px solid #334155;
          border-radius:12px;padding:14px 16px;color:#e2e8f0;
          font-size:14px;outline:none;transition:border-color .2s}
    input:focus{border-color:#0891b2}
    .btn{width:100%;background:#0891b2;color:#fff;border:none;
         border-radius:12px;padding:16px;font-size:15px;font-weight:700;
         cursor:pointer;margin-top:8px;letter-spacing:1px;
         transition:background .2s}
    .btn:hover{background:#0e7490}
    .error{background:#7f1d1d;color:#fca5a5;padding:12px 16px;
           border-radius:10px;font-size:13px;margin-bottom:20px;
           border:1px solid #991b1b}
    .footer{text-align:center;margin-top:24px;color:#475569;font-size:12px}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>🔐 SecretEye</h1>
    <p>AI Security Monitor</p>
  </div>
  {% if error %}
  <div class="error">{{ error }}</div>
  {% endif %}
  <form method="POST">
    <div class="field">
      <label>Email Address</label>
      <input type="email" name="email" placeholder="your@email.com"
             value="{{ email }}" required autofocus>
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" name="password" placeholder="••••••••" required>
    </div>
    <button type="submit" class="btn">SIGN IN →</button>
  </form>
  <div class="footer">Use the same credentials as the SecretEye mobile app</div>
</div>
</body>
</html>"""


MONITOR_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SecretEye Monitor</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0f172a;color:#e2e8f0;font-family:'Segoe UI',sans-serif}
    .nav{background:#1e293b;padding:14px 24px;display:flex;align-items:center;
         justify-content:space-between;border-bottom:2px solid #0891b2}
    .nav h1{font-size:18px;font-weight:800;color:#0891b2;letter-spacing:1px}
    .nav-right{display:flex;align-items:center;gap:16px}
    .user-tag{font-size:12px;color:#94a3b8}
    .status{font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:6px}
    .dot{width:8px;height:8px;border-radius:50%;background:#22c55e;
         animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .logout{font-size:12px;color:#ef4444;text-decoration:none;font-weight:600;
            padding:6px 12px;border:1px solid #7f1d1d;border-radius:8px}
    .logout:hover{background:#7f1d1d}
    .layout{display:grid;grid-template-columns:1fr 320px;height:calc(100vh - 58px)}
    .streams{padding:20px;overflow-y:auto}
    .streams h2{font-size:11px;font-weight:700;color:#64748b;
                text-transform:uppercase;letter-spacing:2px;margin-bottom:14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px}
    .cam-card{background:#1e293b;border-radius:14px;overflow:hidden;border:1px solid #334155}
    .cam-card img{width:100%;display:block;min-height:220px;object-fit:cover;background:#0f172a}
    .cam-label{padding:10px 14px;font-size:12px;color:#94a3b8;font-weight:600;
               display:flex;align-items:center;gap:6px}
    .live-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;
              animation:pulse 1s infinite}
    .sidebar{background:#1e293b;border-left:1px solid #334155;
             display:flex;flex-direction:column;overflow:hidden}
    .sidebar h2{padding:16px 18px;font-size:11px;font-weight:700;color:#64748b;
                text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid #334155}
    .alerts{flex:1;overflow-y:auto;padding:12px}
    .alert-card{background:#0f172a;border-radius:12px;margin-bottom:10px;
                overflow:hidden;border:1px solid #1e293b}
    .alert-card img{width:100%;height:90px;object-fit:cover;display:block}
    .alert-meta{padding:8px 12px}
    .alert-type{font-size:13px;font-weight:700}
    .Weapon{color:#ef4444}.Violence{color:#f97316}.Stranger{color:#a855f7}
    .alert-info{font-size:11px;color:#475569;margin-top:3px}
    .empty{text-align:center;padding:40px 16px;color:#475569;font-size:13px;line-height:1.8}
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-track{background:#0f172a}
    ::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
  </style>
</head>
<body>
<nav class="nav">
  <h1> SecretEye Monitor</h1>
  <div class="nav-right">
    <div class="status"><span class="dot"></span>AI Active — Datix AI</div>
    <span class="user-tag">{{ display_name }}</span>
    <a href="/logout" class="logout">Sign Out</a>
  </div>
</nav>
<div class="layout">
  <div class="streams">
    <h2>Your Live AI Streams Bounding Boxes + HUD</h2>
    <div class="grid" id="grid"><div class="empty">Loading cameras…</div></div>
  </div>
  <div class="sidebar">
    <h2>Recent Detections</h2>
    <div class="alerts" id="alerts">
      <div class="empty">No detections yet.<br>AI is monitoring…</div>
    </div>
  </div>
</div>
<script>
const UID = "{{ uid }}";
async function refreshCameras(){
  try{
    const d=await(await fetch('/status?uid='+UID)).json();
    const keys=Object.keys(d).filter(k=>d[k].alive&&d[k].has_frame);
    const grid=document.getElementById('grid');
    if(!keys.length){
      grid.innerHTML='<div class="empty">📷<br><br>No active cameras.<br>Make sure your cameras are set to Active in the app.</div>';
      return;
    }
    if(grid.querySelector('.empty')) grid.innerHTML='';
    keys.forEach(key=>{
      const parts=key.split('_');
      const uid=parts[0]; const name=parts.slice(1).join(' ');
      if(uid!==UID) return; // only show this user's cameras
      let card=document.getElementById('c-'+key);
      if(!card){
        card=document.createElement('div');
        card.className='cam-card'; card.id='c-'+key;
        card.innerHTML=`<img id="i-${key}" src="" alt="${name}"><div class="cam-label"><span class="live-dot"></span>${name.toUpperCase()}</div>`;
        grid.appendChild(card);
      }
      const img=document.getElementById('i-'+key);
      if(img) img.src=`/snapshot?userId=${uid}&device=${encodeURIComponent(name)}&t=${Date.now()}`;
    });
  }catch(e){console.log('cam err',e)}
}
async function refreshAlerts(){
  try{
    const d=await(await fetch('/recent-detections?uid='+UID)).json();
    const el=document.getElementById('alerts');
    if(!d.length){el.innerHTML='<div class="empty">No detections yet.<br>AI is monitoring…</div>';return;}
    el.innerHTML=d.map(a=>`<div class="alert-card">
      ${a.image_b64?`<img src="${a.image_b64}">`:''}
      <div class="alert-meta">
        <div class="alert-type ${a.type}">⚠ ${a.type.toUpperCase()}</div>
        <div class="alert-info">${a.device} · ${a.time}</div>
      </div></div>`).join('');
  }catch(e){console.log('alerts err',e)}
}
refreshCameras(); refreshAlerts();
setInterval(refreshCameras,1500);
setInterval(refreshAlerts,4000);
</script>
</body>
</html>"""


# ─── Web Routes ───────────────────────────────────────────────────────────────

@app.route("/", methods=["GET", "POST"])
def login_page():
    """Login page — authenticates against Firebase Auth."""
    if "user" in session:
        return redirect(url_for("monitor"))

    error = None
    email = ""

    if request.method == "POST":
        email    = request.form.get("email", "").strip()
        password = request.form.get("password", "").strip()

        if not email or not password:
            error = "Please enter both email and password."
        else:
            user = firebase_sign_in(email, password)
            if user:
                session["user"] = user
                # Start only this user's camera workers in background
                threading.Thread(
                    target=start_user_devices,
                    args=(user["uid"],),
                    daemon=True
                ).start()
                log.info(f"✅ Web login: {email} (uid={user['uid']})")
                return redirect(url_for("monitor"))
            else:
                error = "Incorrect email or password. Try again."

    return render_template_string(LOGIN_HTML, error=error, email=email)


@app.route("/logout")
def logout():
    """Stop user's workers and clear session."""
    user = session.get("user")
    if user:
        threading.Thread(
            target=stop_user_devices,
            args=(user["uid"],),
            daemon=True
        ).start()
        log.info(f"■ Web logout: {user['email']}")
    session.clear()
    return redirect(url_for("login_page"))


@app.route("/monitor")
@login_required
def monitor():
    """Web dashboard — protected, shows only logged-in user's streams."""
    user = session["user"]
    return render_template_string(
        MONITOR_HTML,
        uid=user["uid"],
        display_name=user.get("displayName", user["email"]),
    )


# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    active=[k for k,t in worker_threads.items() if t.is_alive()]
    return jsonify({"status":"online","active_workers":active,
        "model_classes":{"weapon":weapon_model.names,"fight":fight_model.names}})


@app.route("/recent-detections")
def recent_detections_endpoint():
    # uid param for web monitor; falls back to session user
    uid = request.args.get("uid", "")
    if not uid and "user" in session:
        uid = session["user"]["uid"]
    with recent_lock:
        return jsonify(list(recent_detections.get(uid, [])))


@app.route("/raw-snapshot")
def raw_snapshot():
    uid  = request.args.get("userId","").strip()
    name = request.args.get("device","").strip()
    if not uid or not name:
        return jsonify({"error":"userId and device required"}),400
    key=f"{uid}_{name}"
    ensure_worker_running(uid,name)
    frame=raw_frames.get(key)
    if frame is None:
        ph=np.zeros((240,320,3),dtype=np.uint8)
        cv2.putText(ph,"Connecting...",(55,110),cv2.FONT_HERSHEY_SIMPLEX,0.8,(80,80,80),2)
        _,buf=cv2.imencode(".jpg",ph)
    else:
        _,buf=cv2.imencode(".jpg",frame,[cv2.IMWRITE_JPEG_QUALITY,STREAM_QUALITY])
    resp=Response(buf.tobytes(),mimetype="image/jpeg")
    resp.headers.update({"Cache-Control":"no-cache, no-store","Pragma":"no-cache","Expires":"0"})
    return resp


@app.route("/snapshot")
def snapshot():
    uid  = request.args.get("userId","").strip()
    name = request.args.get("device","").strip()
    if not uid or not name:
        return jsonify({"error":"userId and device required"}),400
    key=f"{uid}_{name}"
    ensure_worker_running(uid,name)
    frame=latest_frames.get(key)
    if frame is None:
        ph=np.zeros((240,320,3),dtype=np.uint8)
        cv2.putText(ph,"AI Hub Starting...",(40,120),cv2.FONT_HERSHEY_SIMPLEX,0.7,(100,100,100),2)
        _,buf=cv2.imencode(".jpg",ph)
    else:
        _,buf=cv2.imencode(".jpg",frame,[cv2.IMWRITE_JPEG_QUALITY,STREAM_QUALITY])
    resp=Response(buf.tobytes(),mimetype="image/jpeg")
    resp.headers.update({"Cache-Control":"no-cache, no-store","Pragma":"no-cache","Expires":"0"})
    return resp


@app.route("/video_feed")
def video_feed():
    uid  = request.args.get("userId","").strip()
    name = request.args.get("device","").strip()
    if not uid or not name:
        return jsonify({"error":"userId and device required"}),400
    key=f"{uid}_{name}"; ensure_worker_running(uid,name)
    def generate():
        ph=None
        while True:
            frame=latest_frames.get(key)
            if frame is None:
                if ph is None:
                    p=np.zeros((320,480,3),dtype=np.uint8)
                    cv2.putText(p,"Connecting...",(100,160),cv2.FONT_HERSHEY_SIMPLEX,0.9,(80,80,80),2)
                    _,b=cv2.imencode(".jpg",p); ph=b.tobytes()
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"+ph+b"\r\n"
            else:
                _,buf=cv2.imencode(".jpg",frame,[cv2.IMWRITE_JPEG_QUALITY,STREAM_QUALITY])
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"+buf.tobytes()+b"\r\n"
            time.sleep(STREAM_FPS_CAP)
    return Response(generate(),mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/start_device",methods=["POST"])
def start_device():
    data=request.get_json(silent=True) or {}
    uid=data.get("userId","").strip(); name=data.get("device","").strip()
    if not uid or not name: return jsonify({"error":"userId and device required"}),400
    return jsonify({"started":ensure_worker_running(uid,name),"device":name})


@app.route("/stop_device",methods=["POST"])
def stop_device_endpoint():
    data=request.get_json(silent=True) or {}
    uid=data.get("userId","").strip(); name=data.get("device","").strip()
    if not uid or not name: return jsonify({"error":"userId and device required"}),400
    stop_worker(uid,name)
    return jsonify({"stopped":True,"device":name})


@app.route("/upload-video",methods=["POST"])
def upload_video():
    uid=request.form.get("userId","").strip()
    if not uid: return jsonify({"error":"userId required"}),400
    if "video" not in request.files: return jsonify({"error":"No video file"}),400
    vf=request.files["video"]
    tmp=os.path.join(tempfile.gettempdir(),f"upload_{uid}_{int(time.time())}.mp4")
    vf.save(tmp)
    def process():
        try:
            cap=cv2.VideoCapture(tmp); n=0; g=ConfirmationGate(); cd={}
            while True:
                ret,frame=cap.read()
                if not ret: break
                n+=1
                if n%DETECT_EVERY_N==0:
                    yf=resize_for_yolo(frame); rd=[]
                    try:
                        w=weapon_model.predict(yf,conf=WEAPON_CONF,verbose=False)
                        if w and len(w[0].boxes)>0: rd.append("Weapon")
                    except: pass
                    try:
                        f=fight_model.predict(yf,conf=VIOLENCE_CONF,verbose=False,
                            classes=[VIOLENCE_CLASS_ID] if VIOLENCE_CLASS_ID else None)
                        if any(int(b.cls[0])==VIOLENCE_CLASS_ID for b in f[0].boxes
                               if VIOLENCE_CLASS_ID is not None): rd.append("Violence")
                    except: pass
                    for label in g.update(rd): save_alert(uid,"Mobile Upload",label,frame,cd)
            cap.release()
            try: os.remove(tmp)
            except: pass
        except Exception as e: log.error(f"upload-video: {e}")
    _alert_pool.submit(process)
    return jsonify({"status":"processing"})


@app.route("/status")
def status():
    uid = request.args.get("uid","")
    result = {}
    for k,t in worker_threads.items():
        # filter by uid if provided
        if uid and not k.startswith(uid+"_"):
            continue
        result[k]={"alive":t.is_alive(),"has_frame":k in latest_frames}
    return jsonify(result)


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__=="__main__":
    log.info("🚀 SecretEye AI Hub v5.0 — http://0.0.0.0:5000")
    log.info("🌐 Open in browser: http://YOUR_PC_IP:5000")
    log.info("   Login with your SecretEye app credentials")
    app.run(host="0.0.0.0",port=5000,debug=False,threaded=True)