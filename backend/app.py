"""
=============================================================
  AI Security Hub — Flask Backend for Android App
  v3.1  —  Production-grade POC
=============================================================
  Models    : weapon.pt  |  fight.pt (violence class only)  |  DeepFace Facenet512
  Stream    : MJPEG  →  /video_feed?userId=X&device=Y
  Snapshot  : JPEG   →  /snapshot?userId=X&device=Y   ← NEW (React Native friendly)
  Firebase  : reads  devices/{doc}  (userId, name, ip, status)
              reads  users/{userId} (faceReference base64)
              writes detections/{}  (Weapon | Violence | Stranger)

  KEY DESIGN DECISIONS:
  1. CONFIRMATION GATE  — YOLO detection must appear in CONFIRM_FRAMES_NEEDED
     consecutive inference frames before alert fires. Kills false-positive spam.
  2. FACE CONFIRMATION  — FIX: face result now also gated by FACE_CONFIRM_NEEDED
     consecutive Stranger frames before alert fires. Previously one bad DeepFace
     frame = immediate Stranger alert → false alarm flood.
  3. OBJECT TRACKING   — last confirmed YOLO box held on screen for TRACK_HOLD_SEC.
  4. HIGH CONFIDENCE   — weapon/violence conf 0.70/0.65.
  5. STREAM QUALITY    — CAP_PROP_BUFFERSIZE=1, resize-before-YOLO,
     DETECT_EVERY_N=4, FACE_EVERY_N=40, JPEG quality=65.
  6. SNAPSHOT ENDPOINT — /snapshot returns the latest processed frame as a single
     JPEG. React Native's <Image> component cannot consume MJPEG (multipart HTTP
     responses) — it fetches once, renders the first boundary, and stops. The app
     polls /snapshot every ~300ms instead, which <Image> handles perfectly.
  7. THREAD SAFETY     — ThreadPoolExecutor for Firebase writes (bounded),
     one FaceIDWorker thread per device, all queues maxsize=1.
  8. ALERT COOLDOWN    — 60s per type per device.
  9. WINDOWS COMPAT    — FIX: /tmp/ replaced with tempfile.gettempdir() so the
     backend runs correctly on both Windows and Linux.
=============================================================
"""

import os, time, base64, threading, queue, logging, shutil, tempfile
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from ultralytics import YOLO
from deepface import DeepFace

# ─────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("SecurityHub")

# ─────────────────────────────────────────────────────────────
# Flask + thread pool
# ─────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)
_alert_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="fb-write")

# ─────────────────────────────────────────────────────────────
# Firebase
# ─────────────────────────────────────────────────────────────
KEY_PATH = "serviceAccountKey.json"
if not firebase_admin._apps:
    if not os.path.exists(KEY_PATH):
        log.error(f"FATAL: '{KEY_PATH}' not found.")
        raise FileNotFoundError(KEY_PATH)
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db = firestore.client()
log.info("✅ Firebase connected.")

# ─────────────────────────────────────────────────────────────
# AI Models
# ─────────────────────────────────────────────────────────────
log.info("⌛ Loading AI models…")

WEAPON_MODEL_PATH = "model/weapon.pt"
FIGHT_MODEL_PATH  = "model/fight.pt"
FACENET512_LOCAL  = os.path.join("model", "facenet512_weights.h5")

for p in (WEAPON_MODEL_PATH, FIGHT_MODEL_PATH):
    if not os.path.exists(p):
        raise FileNotFoundError(f"Model not found: '{p}'")

weapon_model = YOLO(WEAPON_MODEL_PATH)
fight_model  = YOLO(FIGHT_MODEL_PATH)

# DeepFace — load from local model/ if available
if os.path.exists(FACENET512_LOCAL):
    os.environ["DEEPFACE_HOME"] = os.path.abspath(".")
    df_weights_dir = os.path.join(".", ".deepface", "weights")
    os.makedirs(df_weights_dir, exist_ok=True)
    df_local = os.path.join(df_weights_dir, "facenet512_weights.h5")
    if not os.path.exists(df_local):
        shutil.copy2(FACENET512_LOCAL, df_local)
    DeepFace.build_model("Facenet512")
    log.info("✅ DeepFace Facenet512 — loaded from model/ (offline).")
else:
    log.warning("⚠️  model/facenet512_weights.h5 not found — run download_models.py")
    DeepFace.build_model("Facenet512")
    log.info("✅ DeepFace Facenet512 ready.")

VIOLENCE_CLASS_ID = next(
    (cid for cid, name in fight_model.names.items() if name.lower() == "violence"), None
)
if VIOLENCE_CLASS_ID is None:
    log.warning("⚠️  'violence' class not found in fight.pt — all classes used.")
else:
    log.info(f"✅ fight.pt classes: {fight_model.names}  →  using class {VIOLENCE_CLASS_ID}")
log.info("✅ All models ready.")

# ─────────────────────────────────────────────────────────────
# Tunable constants
# ─────────────────────────────────────────────────────────────
WEAPON_CONF           = 0.70
VIOLENCE_CONF         = 0.65
CONFIRM_FRAMES_NEEDED = 3      # consecutive YOLO hits before weapon/violence alert
CONFIRM_EXIT_FRAMES   = 5      # consecutive misses before label un-confirms
FACE_CONFIRM_NEEDED   = 2      # FIX: consecutive Stranger results before face alert
                               # Previously 1 bad DeepFace frame = immediate alert
FACE_THRESH           = 0.38   # cosine distance — lower = stricter
TRACK_HOLD_SEC        = 3.0
ALERT_COOLDOWN_SEC    = 60
DETECT_EVERY_N        = 4
FACE_EVERY_N          = 40
YOLO_INPUT_WIDTH      = 640
STREAM_FPS_CAP        = 0.1    # FIX: was 0.033 (30fps) — too aggressive for WiFi.
                               # 0.1 = 10fps which is stable on local networks.
                               # /snapshot polling at 300ms is the preferred
                               # method for React Native anyway.
STREAM_QUALITY        = 65

# ─────────────────────────────────────────────────────────────
# Runtime state
# ─────────────────────────────────────────────────────────────
latest_frames:  dict = {}
worker_threads: dict = {}
stop_flags:     dict = {}


# ─────────────────────────────────────────────────────────────
# Firebase helpers
# ─────────────────────────────────────────────────────────────

def get_homeowner_ref(user_id: str):
    try:
        doc = db.collection("users").document(user_id).get()
        if not doc.exists:
            log.warning(f"[{user_id}] No user document.")
            return None, None
        face_data = doc.to_dict().get("faceReference")
        if not face_data:
            log.warning(f"[{user_id}] faceReference empty.")
            return None, None
        if "base64," in face_data:
            face_data = face_data.split("base64,")[1]
        nparr   = np.frombuffer(base64.b64decode(face_data), np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            log.error(f"[{user_id}] Could not decode faceReference.")
            return None, None

        # FIX: use tempfile.gettempdir() instead of hardcoded /tmp/
        # /tmp/ is Unix-only and does not exist on Windows, causing a crash.
        # tempfile.gettempdir() returns the correct temp directory for any OS:
        #   Linux/macOS → /tmp
        #   Windows     → C:\Users\<user>\AppData\Local\Temp
        tmp_path = os.path.join(tempfile.gettempdir(), f"ref_{user_id}.jpg")
        cv2.imwrite(tmp_path, img_bgr)
        log.info(f"[{user_id}] Homeowner reference ready {img_bgr.shape}.")
        return img_bgr, tmp_path
    except Exception as e:
        log.error(f"[{user_id}] get_homeowner_ref: {e}")
        return None, None


def frame_to_b64(frame: np.ndarray, quality: int = 55) -> str:
    small = cv2.resize(frame, (480, 320))
    _, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def save_alert(user_id: str, device_name: str, alert_type: str,
               frame: np.ndarray, cooldown_map: dict):
    key = f"{user_id}_{device_name}_{alert_type}"
    now = time.time()
    if now - cooldown_map.get(key, 0) < ALERT_COOLDOWN_SEC:
        return
    cooldown_map[key] = now
    frame_copy = frame.copy()
    def _write():
        try:
            db.collection("detections").add({
                "userId":     user_id,
                "deviceName": device_name,
                "type":       alert_type,
                "imageUrl":   frame_to_b64(frame_copy),
                "priority":   "High" if alert_type in ("Weapon", "Violence") else "Medium",
                "timestamp":  firestore.SERVER_TIMESTAMP,
                "status":     "new",
            })
            log.info(f"🚨 Alert → [{device_name}] {alert_type}")
        except Exception as e:
            log.error(f"Firebase write [{device_name}/{alert_type}]: {e}")
    _alert_pool.submit(_write)


# ─────────────────────────────────────────────────────────────
# Confirmation gate (YOLO — weapon / violence)
# ─────────────────────────────────────────────────────────────

class ConfirmationGate:
    """
    Two-stage gate for YOLO labels:
    STAGE 1 — Entry: detection must appear in CONFIRM_FRAMES_NEEDED consecutive
              inference frames before being treated as real.
    STAGE 2 — Exit hysteresis: once confirmed, label is only removed after
              CONFIRM_EXIT_FRAMES consecutive misses (prevents re-trigger on
              a single missed frame).
    """
    def __init__(self,
                 needed:      int = CONFIRM_FRAMES_NEEDED,
                 exit_frames: int = CONFIRM_EXIT_FRAMES):
        self._needed      = needed
        self._exit_frames = exit_frames
        self._hit_counter : dict = {}
        self._miss_counter: dict = {}
        self._confirmed   : set  = set()

    def update(self, detected_labels: list) -> list:
        newly_confirmed = []
        detected_set    = set(detected_labels)

        for label in detected_set:
            self._hit_counter[label]  = self._hit_counter.get(label, 0) + 1
            self._miss_counter[label] = 0
            if (self._hit_counter[label] >= self._needed
                    and label not in self._confirmed):
                self._confirmed.add(label)
                newly_confirmed.append(label)

        for label in list(self._hit_counter):
            if label not in detected_set:
                self._hit_counter[label] = 0
                if label in self._confirmed:
                    self._miss_counter[label] = self._miss_counter.get(label, 0) + 1
                    if self._miss_counter[label] >= self._exit_frames:
                        self._confirmed.discard(label)
                        self._miss_counter[label] = 0
                else:
                    self._miss_counter[label] = 0

        return newly_confirmed

    def is_confirmed(self, label: str) -> bool:
        return label in self._confirmed

    def active(self) -> list:
        return list(self._confirmed)


# ─────────────────────────────────────────────────────────────
# Tracked box
# ─────────────────────────────────────────────────────────────

class TrackedBox:
    def __init__(self, frame: np.ndarray, box_xyxy, label: str, color: tuple):
        x1, y1, x2, y2 = [int(v) for v in box_xyxy]
        self.label     = label
        self.color     = color
        self.last_seen = time.time()
        self._box      = (x1, y1, x2 - x1, y2 - y1)

    def update(self, frame: np.ndarray):
        pass

    def refresh(self, frame: np.ndarray, box_xyxy):
        x1, y1, x2, y2 = [int(v) for v in box_xyxy]
        self._box      = (x1, y1, x2 - x1, y2 - y1)
        self.last_seen = time.time()

    def is_expired(self) -> bool:
        return (time.time() - self.last_seen) > TRACK_HOLD_SEC

    def draw(self, frame: np.ndarray):
        if not self._box:
            return
        x, y, w, h = self._box
        cv2.rectangle(frame, (x, y), (x + w, y + h), self.color, 2)
        (tw, th), _ = cv2.getTextSize(self.label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(frame, (x, y - th - 10), (x + tw + 8, y), self.color, -1)
        cv2.putText(frame, self.label, (x + 4, y - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)


# ─────────────────────────────────────────────────────────────
# Face-ID worker
# ─────────────────────────────────────────────────────────────

class FaceIDWorker:
    """
    Dedicated background thread for DeepFace.verify.
    Camera loop submits frames non-blocking; results collected non-blocking.
    """
    def __init__(self, ref_img_path: str, threshold: float = FACE_THRESH):
        self.ref_path  = ref_img_path
        self.threshold = threshold
        self._in_q     = queue.Queue(maxsize=1)
        self._out_q    = queue.Queue(maxsize=1)
        self._cascade  = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self._thread = threading.Thread(target=self._run, daemon=True, name="face-id")
        self._thread.start()

    def submit(self, frame_bgr: np.ndarray):
        try:
            self._in_q.put_nowait(frame_bgr)
        except queue.Full:
            pass

    def get_result(self):
        try:
            return self._out_q.get_nowait()
        except queue.Empty:
            return None

    def stop(self):
        try: self._in_q.put_nowait(None)
        except queue.Full: pass

    def _push(self, label, dist, box):
        try: self._out_q.get_nowait()
        except queue.Empty: pass
        self._out_q.put((label, dist, box))

    def _run(self):
        faces = []
        while True:
            frame_bgr = self._in_q.get()
            if frame_bgr is None:
                break
            try:
                gray  = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                faces = self._cascade.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=6, minSize=(60, 60)
                )
                if len(faces) == 0:
                    self._push("No Face", 1.0, None)
                    continue
                box       = tuple(faces[0])
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                res = DeepFace.verify(
                    img1_path        = frame_rgb,
                    img2_path        = self.ref_path,
                    model_name       = "Facenet512",
                    detector_backend = "opencv",
                    enforce_detection= True,
                    distance_metric  = "cosine",
                    silent           = True,
                )
                dist  = res["distance"]
                label = "Homeowner" if dist < self.threshold else "Stranger"
                self._push(label, dist, box)
            except Exception as e:
                log.debug(f"FaceID error: {e}")
                box = tuple(faces[0]) if len(faces) > 0 else None
                self._push("Stranger", 1.0, box)


# ─────────────────────────────────────────────────────────────
# Annotation helpers
# ─────────────────────────────────────────────────────────────

def draw_face_box(frame: np.ndarray, box: tuple, label: str, dist: float):
    if not box:
        return frame
    x, y, w, h  = box
    color       = (0, 200, 0) if label == "Homeowner" else (0, 0, 220)
    tag         = f"{label} ({dist:.2f})"
    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
    (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    cv2.rectangle(frame, (x, y - th - 10), (x + tw + 6, y), color, -1)
    cv2.putText(frame, tag, (x + 3, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255,255,255), 2)
    return frame


def draw_hud(frame: np.ndarray, face_label: str, confirmed_threats: list):
    h, w      = frame.shape[:2]
    danger    = bool(confirmed_threats) or face_label == "Stranger"
    color     = (0, 0, 220) if danger else (0, 200, 0)
    threats_s = ", ".join(confirmed_threats) if confirmed_threats else "Clear"
    cv2.rectangle(frame, (0, 0), (w, 46), (0, 0, 0), -1)
    cv2.putText(frame, f"Face: {face_label}  |  {threats_s}",
                (10, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.70, color, 2)
    return frame


def resize_for_yolo(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    if w == YOLO_INPUT_WIDTH:
        return frame
    scale = YOLO_INPUT_WIDTH / w
    return cv2.resize(frame, (YOLO_INPUT_WIDTH, int(h * scale)),
                      interpolation=cv2.INTER_LINEAR)


def refresh_or_create_tracker(tracked_boxes: list, frame: np.ndarray,
                               box_xyxy, label: str, color: tuple):
    for tb in tracked_boxes:
        if tb.label == label:
            tb.refresh(frame, box_xyxy)
            return
    tracked_boxes.append(TrackedBox(frame, box_xyxy, label, color))


# ─────────────────────────────────────────────────────────────
# Camera worker
# ─────────────────────────────────────────────────────────────

def camera_worker(user_id: str, device_name: str,
                  stream_ip: str, stop_event: threading.Event):
    storage_key  = f"{user_id}_{device_name}"
    cooldown_map : dict = {}

    stream_url = (stream_ip if stream_ip.startswith(("http://","https://","rtsp://"))
                  else f"http://{stream_ip}/video")
    log.info(f"▶  [{device_name}]  {stream_url}")

    _, ref_path     = get_homeowner_ref(user_id)
    face_worker_obj = FaceIDWorker(ref_path, FACE_THRESH) if ref_path else None
    if not face_worker_obj:
        log.warning(f"[{device_name}] Face ID disabled.")

    face_label    = "Scanning…"
    face_dist     = 1.0
    face_box      = None
    frame_count   = 0
    gate          = ConfirmationGate(CONFIRM_FRAMES_NEEDED)
    tracked_boxes : list = []

    # FIX: face confirmation counter — require FACE_CONFIRM_NEEDED consecutive
    # Stranger results before firing alert. Previously one bad DeepFace frame
    # (blur, partial occlusion, lighting change) immediately triggered an alert.
    face_stranger_count = 0

    cap = cv2.VideoCapture(stream_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    reconnect_delay = 2

    while not stop_event.is_set():
        ret, frame = cap.read()

        if not ret:
            log.warning(f"[{device_name}] Stream lost — retry in {reconnect_delay}s")
            cap.release()
            time.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 30)
            cap = cv2.VideoCapture(stream_url)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            continue

        reconnect_delay = 2
        frame_count    += 1
        display         = frame.copy()
        run_detection   = (frame_count % DETECT_EVERY_N  == 0)
        run_face        = face_worker_obj is not None and (frame_count % FACE_EVERY_N == 0)

        # ── face result ──────────────────────────────────────────────────────
        if face_worker_obj:
            result = face_worker_obj.get_result()
            if result:
                new_label, new_dist, new_box = result
                face_label = new_label
                face_dist  = new_dist
                face_box   = new_box if new_label != "No Face" else None

                # FIX: gate face alerts — require consecutive Stranger frames
                if face_label == "Stranger":
                    face_stranger_count += 1
                    if face_stranger_count >= FACE_CONFIRM_NEEDED:
                        save_alert(user_id, device_name, "Stranger", display, cooldown_map)
                        face_stranger_count = 0  # reset after confirmed alert fires
                        log.info(f"[{device_name}] ✔ CONFIRMED: Stranger after "
                                 f"{FACE_CONFIRM_NEEDED} frames → alert sent")
                else:
                    # Any non-Stranger result resets the gate
                    face_stranger_count = 0

        # ── YOLO inference ───────────────────────────────────────────────────
        if run_detection:
            yolo_frame   = resize_for_yolo(frame)
            raw_detected = []
            w_res        = None
            v_boxes      = []

            try:
                w_res = weapon_model.predict(yolo_frame, conf=WEAPON_CONF,
                                             verbose=False, iou=0.45)
                if w_res and len(w_res[0].boxes) > 0:
                    raw_detected.append("Weapon")
            except Exception as e:
                log.error(f"[{device_name}] Weapon: {e}")

            try:
                f_res = fight_model.predict(
                    yolo_frame, conf=VIOLENCE_CONF, verbose=False, iou=0.45,
                    classes=[VIOLENCE_CLASS_ID] if VIOLENCE_CLASS_ID is not None else None,
                )
                v_boxes = [b for b in f_res[0].boxes
                           if VIOLENCE_CLASS_ID is not None
                           and int(b.cls[0]) == VIOLENCE_CLASS_ID]
                if v_boxes:
                    raw_detected.append("Violence")
            except Exception as e:
                log.error(f"[{device_name}] Violence: {e}")

            newly_confirmed = gate.update(raw_detected)
            for label in newly_confirmed:
                save_alert(user_id, device_name, label, display, cooldown_map)
                log.info(f"[{device_name}] ✔ CONFIRMED: {label} after "
                         f"{CONFIRM_FRAMES_NEEDED} frames → alert sent")

            if gate.is_confirmed("Weapon") and w_res is not None and len(w_res[0].boxes) > 0:
                for box in w_res[0].boxes:
                    refresh_or_create_tracker(tracked_boxes, frame,
                                               box.xyxy[0], "Weapon", (0, 0, 220))
            if gate.is_confirmed("Violence") and v_boxes:
                for box in v_boxes:
                    refresh_or_create_tracker(tracked_boxes, frame,
                                               box.xyxy[0], "Violence", (0, 100, 255))

        # ── face ID submit ───────────────────────────────────────────────────
        if run_face:
            face_worker_obj.submit(frame.copy())

        # ── advance + draw tracked boxes ─────────────────────────────────────
        active_threats = []
        alive = []
        for tb in tracked_boxes:
            if tb.is_expired():
                continue
            tb.update(display)
            if gate.is_confirmed(tb.label):
                tb.draw(display)
                active_threats.append(tb.label)
            alive.append(tb)
        tracked_boxes = alive

        # ── face box ─────────────────────────────────────────────────────────
        if face_box and face_label not in ("No Face", "Scanning…"):
            display = draw_face_box(display, face_box, face_label, face_dist)

        # ── HUD ──────────────────────────────────────────────────────────────
        display = draw_hud(display, face_label, list(dict.fromkeys(active_threats)))

        # ── store latest frame ───────────────────────────────────────────────
        latest_frames[storage_key] = display

    cap.release()
    if face_worker_obj:
        face_worker_obj.stop()
    latest_frames.pop(storage_key, None)
    log.info(f"■  [{device_name}] Worker stopped.")


# ─────────────────────────────────────────────────────────────
# Worker lifecycle
# ─────────────────────────────────────────────────────────────

def ensure_worker_running(user_id: str, device_name: str) -> bool:
    key = f"{user_id}_{device_name}"
    if key in worker_threads and worker_threads[key].is_alive():
        return True
    try:
        docs = (db.collection("devices")
                .where("userId", "==", user_id)
                .where("name",   "==", device_name)
                .limit(1).get())
    except Exception as e:
        log.error(f"Firestore lookup: {e}")
        return False
    if not docs:
        log.warning(f"Device not found userId={user_id} name={device_name}")
        return False
    data   = docs[0].to_dict()
    status = data.get("status", "").lower()
    ip     = data.get("ip", "").strip()
    if status != "active":
        log.info(f"[{device_name}] status='{status}' — not starting.")
        return False
    if not ip:
        log.error(f"[{device_name}] No IP in Firestore.")
        return False
    stop_event      = threading.Event()
    stop_flags[key] = stop_event
    t = threading.Thread(target=camera_worker,
                         args=(user_id, device_name, ip, stop_event),
                         daemon=True, name=f"cam-{key}")
    t.start()
    worker_threads[key] = t
    log.info(f"[{device_name}] Worker launched ip={ip}.")
    return True


def stop_worker(user_id: str, device_name: str):
    key = f"{user_id}_{device_name}"
    if key in stop_flags:
        stop_flags[key].set()
        log.info(f"[{device_name}] Stop signal sent.")


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    active = [k for k, t in worker_threads.items() if t.is_alive()]
    return jsonify({
        "status": "online", "active_workers": active,
        "model_classes": {"weapon": weapon_model.names, "fight": fight_model.names},
        "config": {
            "weapon_conf":          WEAPON_CONF,
            "violence_conf":        VIOLENCE_CONF,
            "confirm_frames":       CONFIRM_FRAMES_NEEDED,
            "face_confirm_needed":  FACE_CONFIRM_NEEDED,
            "track_hold_sec":       TRACK_HOLD_SEC,
            "alert_cooldown_sec":   ALERT_COOLDOWN_SEC,
            "stream_fps_cap":       1 / STREAM_FPS_CAP,
        },
    })


@app.route("/video_feed")
def video_feed():
    """Legacy MJPEG stream — kept for browser/VLC clients. React Native app
    should use /snapshot instead (polling is more reliable on mobile)."""
    user_id     = request.args.get("userId", "").strip()
    device_name = request.args.get("device",  "").strip()
    if not user_id or not device_name:
        return jsonify({"error": "userId and device params required"}), 400
    key = f"{user_id}_{device_name}"
    ensure_worker_running(user_id, device_name)

    def generate():
        placeholder = None
        while True:
            frame = latest_frames.get(key)
            if frame is None:
                if placeholder is None:
                    ph = np.zeros((320, 480, 3), dtype=np.uint8)
                    cv2.putText(ph, "AI Hub Connecting…",  (70, 155),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (180,180,180), 2)
                    cv2.putText(ph, "Waiting for stream…", (85, 200),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120,120,120), 1)
                    _, buf      = cv2.imencode(".jpg", ph)
                    placeholder = buf.tobytes()
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + placeholder + b"\r\n")
            else:
                _, buf = cv2.imencode(".jpg", frame,
                                      [cv2.IMWRITE_JPEG_QUALITY, STREAM_QUALITY])
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + buf.tobytes() + b"\r\n")
            time.sleep(STREAM_FPS_CAP)

    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/snapshot")
def snapshot():
    """
    FIX: NEW endpoint for React Native app.

    Returns the latest AI-processed frame as a single JPEG image.
    React Native's <Image> component cannot handle MJPEG (multipart HTTP) —
    it fetches the URL once, parses the first boundary as a JPEG, and never
    updates again. Polling this endpoint at ~300ms intervals gives a stable
    live feed that Image handles correctly.

    The app uses t=Date.now() as a query param to prevent caching.
    Response headers also disable all caching layers.
    """
    user_id     = request.args.get("userId", "").strip()
    device_name = request.args.get("device",  "").strip()
    if not user_id or not device_name:
        return jsonify({"error": "userId and device params required"}), 400

    key = f"{user_id}_{device_name}"
    ensure_worker_running(user_id, device_name)

    frame = latest_frames.get(key)
    if frame is None:
        # Return a connecting placeholder
        ph = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.putText(ph, "Connecting...", (55, 110),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (150, 150, 150), 2)
        cv2.putText(ph, "AI Hub starting...", (35, 150),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (100, 100, 100), 1)
        _, buf = cv2.imencode(".jpg", ph)
    else:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, STREAM_QUALITY])

    response = Response(buf.tobytes(), mimetype="image/jpeg")
    # Hard-disable all caching so every poll gets a fresh frame
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"]        = "no-cache"
    response.headers["Expires"]       = "0"
    return response


@app.route("/start_device", methods=["POST"])
def start_device():
    data = request.get_json(silent=True) or {}
    user_id, device_name = data.get("userId","").strip(), data.get("device","").strip()
    if not user_id or not device_name:
        return jsonify({"error": "userId and device required"}), 400
    return jsonify({"started": ensure_worker_running(user_id, device_name),
                    "device": device_name})


@app.route("/stop_device", methods=["POST"])
def stop_device():
    data = request.get_json(silent=True) or {}
    user_id, device_name = data.get("userId","").strip(), data.get("device","").strip()
    if not user_id or not device_name:
        return jsonify({"error": "userId and device required"}), 400
    stop_worker(user_id, device_name)
    return jsonify({"stopped": True, "device": device_name})


@app.route("/upload-video", methods=["POST"])
def upload_video():
    """
    FIX: NEW endpoint — previously called by devices.jsx but missing from backend.
    Accepts a video file uploaded from the mobile camera, runs AI analysis on it
    in a background thread, and writes any detections to Firestore.
    """
    # FIX: was reading "userEmail" — detections use userId (uid) consistently
    user_id = request.form.get("userId", "").strip()
    if not user_id:
        return jsonify({"error": "userId required"}), 400

    if "video" not in request.files:
        return jsonify({"error": "No video file in request"}), 400

    video_file = request.files["video"]

    # Save to OS temp dir (cross-platform — works on Windows and Linux)
    tmp_path = os.path.join(
        tempfile.gettempdir(),
        f"upload_{user_id}_{int(time.time())}.mp4"
    )
    video_file.save(tmp_path)
    log.info(f"[upload-video] Saved {tmp_path} for user {user_id}")

    def process_in_background():
        try:
            cap         = cv2.VideoCapture(tmp_path)
            frame_count = 0
            gate        = ConfirmationGate(CONFIRM_FRAMES_NEEDED)
            cooldown    = {}

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_count += 1

                if frame_count % DETECT_EVERY_N == 0:
                    yolo_frame   = resize_for_yolo(frame)
                    raw_detected = []

                    try:
                        w_res = weapon_model.predict(yolo_frame, conf=WEAPON_CONF, verbose=False)
                        if w_res and len(w_res[0].boxes) > 0:
                            raw_detected.append("Weapon")
                    except Exception as e:
                        log.debug(f"[upload-video] weapon: {e}")

                    try:
                        f_res = fight_model.predict(
                            yolo_frame, conf=VIOLENCE_CONF, verbose=False,
                            classes=[VIOLENCE_CLASS_ID] if VIOLENCE_CLASS_ID is not None else None,
                        )
                        if any(int(b.cls[0]) == VIOLENCE_CLASS_ID for b in f_res[0].boxes
                               if VIOLENCE_CLASS_ID is not None):
                            raw_detected.append("Violence")
                    except Exception as e:
                        log.debug(f"[upload-video] violence: {e}")

                    for label in gate.update(raw_detected):
                        save_alert(user_id, "Mobile Upload", label, frame, cooldown)

            cap.release()
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            log.info(f"[upload-video] Done — {frame_count} frames for user {user_id}")
        except Exception as e:
            log.error(f"[upload-video] processing error: {e}")

    _alert_pool.submit(process_in_background)
    return jsonify({"status": "processing", "message": "Video submitted for AI analysis"})


@app.route("/status")
def status():
    return jsonify({k: {"alive": t.is_alive(), "has_frame": k in latest_frames}
                    for k, t in worker_threads.items()})


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("🚀 AI Security Hub v3.1 — 0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)