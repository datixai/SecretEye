"""
SecretEye — AI Hub (API)  v7

Runs the AI models and writes detections to Firestore for the SecretEye app.
The admin website's "AI Lab" page drives it through the JSON API below.

    cd backend
    venv\\Scripts\\activate
    python app.py                # http://0.0.0.0:5000

Config: backend/.env (see .env.example). Firebase key: backend/serviceAccountKey.json
Models: model/weapon.pt, model/weapon1.pt (optional), model/fight.pt
Faces:  faces/<name>.jpg  →  recognised as <Name>; anyone else is a "Stranger"

API (all except /api/health need an admin's Firebase ID token:
     header "Authorization: Bearer <token>" or ?token=<token>)
    GET  /api/health
    POST /api/process            multipart: video, model, conf, userId
    GET  /api/jobs/<id>
    GET  /api/jobs/<id>/output
    POST /api/webcam/start       json: { userId }
    POST /api/webcam/stop
    GET  /api/webcam/frame
"""

import base64
import glob
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import wraps

import cv2
import face_recognition as fr
import firebase_admin
import numpy as np
from dotenv import load_dotenv
from firebase_admin import auth as fb_auth
from firebase_admin import credentials, firestore
from flask import Flask, Response, g, jsonify, request, send_file
from flask_cors import CORS
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"))

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("SecretEye")

# ─── Config ───────────────────────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 5000))
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
KEY_PATH = os.environ.get("FIREBASE_KEY_PATH", "serviceAccountKey.json")
ALERT_COOLDOWN_SEC = int(os.environ.get("ALERT_COOLDOWN_SEC", 60))
FACES_DIR = "faces"
FACE_TOLERANCE = 0.50
FACE_SKIP = 3
UPLOAD_DIR = "uploads_tmp"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Flask ────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500 MB uploads
CORS(app, origins=ALLOWED_ORIGINS)
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="ai-worker")

# ─── Firebase Admin ───────────────────────────────────────────────────────────
if not firebase_admin._apps:
    if not os.path.exists(KEY_PATH):
        raise FileNotFoundError(f"'{KEY_PATH}' not found — download it from Firebase Console › Service accounts.")
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db_client = firestore.client()
log.info("✅ Firebase connected.")

# ─── AI Models ────────────────────────────────────────────────────────────────
log.info("⌛ Loading AI models…")
WEAPON_MODEL_PATH = "model/weapon.pt"
WEAPON1_MODEL_PATH = "model/weapon1.pt"
FIGHT_MODEL_PATH = "model/fight.pt"

for p in (WEAPON_MODEL_PATH, FIGHT_MODEL_PATH):
    if not os.path.exists(p):
        raise FileNotFoundError(f"Model not found: '{p}' — run scripts/download_models.py")

weapon_model = YOLO(WEAPON_MODEL_PATH)
fight_model = YOLO(FIGHT_MODEL_PATH)
weapon1_model = YOLO(WEAPON1_MODEL_PATH) if os.path.exists(WEAPON1_MODEL_PATH) else weapon_model

VIOLENCE_CLASS_ID = next((k for k, v in fight_model.names.items() if "violence" in v.lower()), 1)

log.info(f"✅ weapon.pt  — {weapon_model.names}")
log.info(f"✅ weapon1.pt — {weapon1_model.names}")
log.info(f"✅ fight.pt   — {fight_model.names} | violence class: {VIOLENCE_CLASS_ID}")


# ─── Face Database ────────────────────────────────────────────────────────────
def load_face_db():
    known_enc, names = [], []
    os.makedirs(FACES_DIR, exist_ok=True)
    paths = sorted(p for p in glob.glob(os.path.join(FACES_DIR, "*")) if p.lower().endswith((".jpg", ".jpeg", ".png")))
    for path in paths:
        name = os.path.splitext(os.path.basename(path))[0].capitalize()
        encs = fr.face_encodings(fr.load_image_file(path))
        if encs:
            known_enc.append(encs[0])
            names.append(name)
            log.info(f"  👤 Face loaded: {name}")
    return known_enc, names


known_encodings, known_names = load_face_db()
log.info(f"✅ Face DB: {known_names}")

# ─── State ────────────────────────────────────────────────────────────────────
jobs = {}
webcam_state = {"running": False, "stop": threading.Event(), "user_id": None, "latest": None}

# ─── Firestore helpers ────────────────────────────────────────────────────────
# Which homeowner setting switches each detection type on/off.
TYPE_SETTING = {"Weapon": "weaponEnabled", "Gun": "weaponEnabled", "Violence": "violenceEnabled", "Stranger": "faceEnabled"}
LEGACY_SETTING = {"weaponEnabled": "isWeaponAlertEnabled", "faceEnabled": "isFaceEnabled"}
_settings_cache = {}  # user_id → (fetched_at, dict)


def user_settings(user_id):
    """Homeowner's alert settings (cached for 10 s)."""
    cached = _settings_cache.get(user_id)
    if cached and time.time() - cached[0] < 10:
        return cached[1]
    try:
        snap = db_client.collection("settings").document(user_id).get()
        data = snap.to_dict() or {}
    except Exception as e:
        log.warning(f"settings read failed: {e}")
        data = {}
    _settings_cache[user_id] = (time.time(), data)
    return data


def alert_allowed(user_id, det_type):
    s = user_settings(user_id)
    if s.get("armed") is False:
        return False
    key = TYPE_SETTING.get(det_type)
    if not key:
        return True
    return s.get(key, s.get(LEGACY_SETTING.get(key, ""), True)) is not False


def frame_to_b64(frame, w=480, h=320, quality=60):
    small = cv2.resize(frame, (w, h))
    _, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def save_detection(user_id, source_name, det_type, frame, cooldown, on_saved=None):
    """Write a detection + snapshot to Firestore, respecting cooldown and the homeowner's settings."""
    key = f"{user_id}_{source_name}_{det_type}"
    now = time.time()
    if now - cooldown.get(key, 0) < ALERT_COOLDOWN_SEC:
        return
    cooldown[key] = now
    if not alert_allowed(user_id, det_type):
        log.info(f"⏸  [{source_name}] {det_type} skipped — disabled/disarmed for {user_id}")
        return
    snapshot = frame.copy()

    def _write():
        try:
            db_client.collection("detections").add({
                "userId": user_id,
                "deviceName": source_name,
                "type": det_type,
                "imageUrl": frame_to_b64(snapshot),
                "priority": "High" if det_type in ("Weapon", "Gun", "Violence") else "Medium",
                "status": "new",
                "timestamp": firestore.SERVER_TIMESTAMP,
            })
            log.info(f"🚨 [{source_name}] {det_type} → Firestore (user={user_id})")
            if on_saved:
                on_saved(det_type)
        except Exception as e:
            log.error(f"Firestore write: {e}")

    _pool.submit(_write)


# ─── Auth ─────────────────────────────────────────────────────────────────────
def admin_required(f):
    """Accept only Firebase users whose users/{uid}.role == 'admin'."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else request.args.get("token", "")
        if not token:
            return jsonify({"error": "Missing token"}), 401
        try:
            decoded = fb_auth.verify_id_token(token)
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
        profile = db_client.collection("users").document(decoded["uid"]).get().to_dict() or {}
        if profile.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        g.admin_uid = decoded["uid"]
        return f(*args, **kwargs)

    return wrapper


# ─── AI helpers ───────────────────────────────────────────────────────────────
def run_yolo_on_frame(frame, model, conf, class_filter=None):
    """Run YOLO on a frame. Returns (detections_list, annotated_frame)."""
    results = model.predict(frame, conf=conf, verbose=False, iou=0.45, classes=[class_filter] if class_filter is not None else None)
    display = frame.copy()
    dets = []
    if results and len(results[0].boxes) > 0:
        for box in results[0].boxes:
            cls = int(box.cls[0])
            name = model.names[cls]
            c = float(box.conf[0])
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0]]
            color = (0, 0, 220) if "gun" in name.lower() or "weapon" in name.lower() else (0, 100, 255)
            cv2.rectangle(display, (x1, y1), (x2, y2), color, 2)
            cv2.putText(display, f"{name} {c:.0%}", (x1, max(y1 - 8, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            dets.append({"class": name, "conf": round(c, 3)})
    return dets, display


def run_face_on_frame(frame):
    """Face recognition on a frame. Returns list of (name, box, color)."""
    small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
    locs = fr.face_locations(rgb, model="hog")
    encs = fr.face_encodings(rgb, locs)
    results = []
    for (top, right, bottom, left), enc in zip(locs, encs):
        top *= 2
        right *= 2
        bottom *= 2
        left *= 2
        name, color = "Stranger", (0, 0, 255)
        if known_encodings:
            distances = fr.face_distance(known_encodings, enc)
            best = int(np.argmin(distances))
            if distances[best] < FACE_TOLERANCE:
                name, color = known_names[best], (0, 220, 0)
        results.append((name, (top, right, bottom, left), color))
    return results


def annotate_faces(frame, face_results):
    display = frame.copy()
    for name, (top, right, bottom, left), color in face_results:
        cv2.rectangle(display, (left, top), (right, bottom), color, 2)
        cv2.rectangle(display, (left, bottom), (right, bottom + 32), color, -1)
        cv2.putText(display, name, (left + 6, bottom + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    return display


# ─── Video processing (background job) ───────────────────────────────────────
def process_video_job(job_id, input_path, output_path, model_id, conf, user_id, source_name):
    job = jobs[job_id]
    job.update({"status": "running", "message": "Starting AI analysis…"})
    cooldown = {}

    def counted(det_type):
        job["detections"] = job.get("detections", 0) + 1

    def alert(det_type, frame):
        save_detection(user_id, source_name, det_type, frame, cooldown, on_saved=counted)

    try:
        cap = cv2.VideoCapture(input_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = int(cap.get(cv2.CAP_PROP_FPS)) or 25
        # avc1 (H.264) plays in browsers; fall back to mp4v if unavailable.
        writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"avc1"), fps, (w, h))
        if not writer.isOpened():
            writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

        model_map = {
            "weapon": (weapon_model, None, "Gun"),
            "weapon1": (weapon1_model, None, "Weapon"),
            "violence": (fight_model, VIOLENCE_CLASS_ID, "Violence"),
        }
        frame_count, face_cache, start = 0, [], time.time()

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1
            display = frame.copy()

            if model_id in ("face", "all"):
                if model_id == "all":
                    dets_w, disp_w = run_yolo_on_frame(frame, weapon_model, conf)
                    if dets_w:
                        alert("Weapon", frame)
                        display = disp_w
                    dets_v, disp_v = run_yolo_on_frame(frame, fight_model, conf, VIOLENCE_CLASS_ID)
                    if dets_v:
                        alert("Violence", frame)
                        display = disp_v
                if frame_count % FACE_SKIP == 0:
                    face_cache = run_face_on_frame(frame)
                display = annotate_faces(display, face_cache)
                if any(name == "Stranger" for name, _, _ in face_cache):
                    alert("Stranger", frame)
            else:
                m, cf, label = model_map[model_id]
                dets, display = run_yolo_on_frame(frame, m, conf, cf)
                if dets:
                    alert(label, frame)

            writer.write(display)
            job.update({"progress": int(frame_count / total * 100), "message": f"Processing frame {frame_count}/{total}"})

        cap.release()
        writer.release()
        job.update({
            "status": "done", "progress": 100, "message": "Complete",
            "frames": frame_count, "elapsed": round(time.time() - start, 1),
        })
        log.info(f"✅ Job {job_id} done — {frame_count} frames in {job['elapsed']}s")
    except Exception as e:
        log.exception(f"Job {job_id} failed")
        job.update({"status": "error", "message": str(e)})
    finally:
        try:
            os.remove(input_path)
        except OSError:
            pass


# ─── Webcam worker ────────────────────────────────────────────────────────────
def webcam_worker(user_id, stop_event):
    log.info(f"📷 Webcam started for user {user_id}")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        webcam_state["running"] = False
        log.error("❌ Cannot open webcam")
        return
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cooldown, frame_count, face_cache = {}, 0, []

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue
        frame_count += 1
        display = frame.copy()

        if frame_count % FACE_SKIP == 0:
            face_cache = run_face_on_frame(frame)
            if any(name == "Stranger" for name, _, _ in face_cache):
                save_detection(user_id, "Webcam", "Stranger", frame, cooldown)
        display = annotate_faces(display, face_cache)

        if frame_count % 4 == 0:
            try:
                dets_w, disp_w = run_yolo_on_frame(frame, weapon_model, 0.45)
                if dets_w:
                    save_detection(user_id, "Webcam", "Weapon", frame, cooldown)
                    display = annotate_faces(disp_w, face_cache)
                dets_v, disp_v = run_yolo_on_frame(frame, fight_model, 0.40, VIOLENCE_CLASS_ID)
                if dets_v:
                    save_detection(user_id, "Webcam", "Violence", frame, cooldown)
                    display = annotate_faces(disp_v, face_cache)
            except Exception as e:
                log.warning(f"webcam inference: {e}")

        _, buf = cv2.imencode(".jpg", display, [cv2.IMWRITE_JPEG_QUALITY, 70])
        webcam_state["latest"] = buf.tobytes()
        time.sleep(0.05)

    cap.release()
    webcam_state.update({"running": False, "latest": None})
    log.info("📷 Webcam stopped")


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "models": {"weapon": list(weapon_model.names.values()), "weapon1": list(weapon1_model.names.values()), "fight": list(fight_model.names.values())},
        "faces": known_names,
        "webcam": webcam_state["running"],
    })


def _homeowner_exists(user_id):
    return bool(user_id) and db_client.collection("users").document(user_id).get().exists


@app.post("/api/process")
@admin_required
def process():
    video = request.files.get("video")
    model_id = request.form.get("model", "all")
    user_id = request.form.get("userId", "")
    try:
        conf = min(max(float(request.form.get("conf", 0.40)), 0.05), 0.95)
    except ValueError:
        conf = 0.40
    if not video:
        return jsonify({"error": "No video uploaded"}), 400
    if model_id not in ("all", "face", "weapon", "weapon1", "violence"):
        return jsonify({"error": "Unknown model"}), 400
    if not _homeowner_exists(user_id):
        return jsonify({"error": "Unknown homeowner"}), 400

    job_id = uuid.uuid4().hex[:8]
    ext = os.path.splitext(video.filename or "")[1].lower()
    if ext not in (".mp4", ".avi", ".mov", ".mkv", ".webm"):
        ext = ".mp4"
    tmp_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
    video.save(tmp_path)

    out_dir = os.path.join("runs", "detect", f"{model_id}_{datetime.now():%Y%m%d_%H%M%S}")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"output_{job_id}.mp4")
    source_name = os.path.splitext(os.path.basename(video.filename or ""))[0] or "Upload"

    jobs[job_id] = {"status": "queued", "progress": 0, "message": "Queued…", "output_path": out_path, "detections": 0}
    _pool.submit(process_video_job, job_id, tmp_path, out_path, model_id, conf, user_id, source_name)
    return jsonify({"job_id": job_id})


@app.get("/api/jobs/<job_id>")
@admin_required
def job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Not found"}), 404
    return jsonify({k: v for k, v in job.items() if k != "output_path"})


@app.get("/api/jobs/<job_id>/output")
@admin_required
def job_output(job_id):
    job = jobs.get(job_id)
    if not job or job["status"] != "done":
        return jsonify({"error": "Not ready"}), 404
    return send_file(os.path.abspath(job["output_path"]), mimetype="video/mp4", conditional=True)


@app.post("/api/webcam/start")
@admin_required
def webcam_start():
    user_id = (request.get_json(silent=True) or {}).get("userId", "")
    if not _homeowner_exists(user_id):
        return jsonify({"error": "Unknown homeowner"}), 400
    if webcam_state["running"]:
        webcam_state["user_id"] = user_id
        return jsonify({"started": True})
    stop = threading.Event()
    webcam_state.update({"stop": stop, "user_id": user_id, "running": True})
    threading.Thread(target=webcam_worker, args=(user_id, stop), daemon=True).start()
    time.sleep(0.5)
    if not webcam_state["running"]:
        return jsonify({"error": "Could not open the server's webcam"}), 500
    return jsonify({"started": True})


@app.post("/api/webcam/stop")
@admin_required
def webcam_stop():
    webcam_state["stop"].set()
    return jsonify({"stopped": True})


@app.get("/api/webcam/frame")
@admin_required
def webcam_frame():
    frame_bytes = webcam_state.get("latest")
    if not frame_bytes:
        ph = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.putText(ph, "Webcam starting...", (60, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 120, 120), 1)
        frame_bytes = cv2.imencode(".jpg", ph)[1].tobytes()
    resp = Response(frame_bytes, mimetype="image/jpeg")
    resp.headers["Cache-Control"] = "no-cache, no-store"
    return resp


if __name__ == "__main__":
    log.info(f"🚀 SecretEye AI Hub v7 — http://0.0.0.0:{PORT}  (allowed origins: {ALLOWED_ORIGINS})")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
