"""
=============================================================
  AI Security Hub — Flask Backend for Android App
  v3.0  —  Production-grade POC
=============================================================
  Models    : weapon.pt  |  fight.pt (violence class only)  |  DeepFace Facenet512
  Stream    : MJPEG  →  /video_feed?userId=X&device=Y
  Firebase  : reads  devices/{doc}  (userId, name, ip, status)
              reads  users/{userId} (faceReference base64)
              writes detections/{}  (Weapon | Violence | Stranger)

  KEY DESIGN DECISIONS:
  1. CONFIRMATION GATE  — detection must appear in CONFIRM_FRAMES_NEEDED
     consecutive inference frames before alert fires. Kills false-positive spam.
  2. OBJECT TRACKING   — last confirmed YOLO box is held on screen for
     TRACK_HOLD_SEC seconds so boxes are smooth, not jumping every frame.
  3. HIGH CONFIDENCE   — weapon/violence conf raised to 0.70/0.65.
  4. STREAM QUALITY    — CAP_PROP_BUFFERSIZE=1, resize-before-YOLO,
     DETECT_EVERY_N=4, FACE_EVERY_N=40, JPEG quality=65.
  5. THREAD SAFETY     — ThreadPoolExecutor for Firebase writes (bounded),
     one FaceIDWorker thread per device, all queues maxsize=1.
  6. ALERT COOLDOWN    — 60s per type per device.
=============================================================
"""

import os, time, base64, threading, queue, logging, shutil
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
WEAPON_CONF           = 0.70   # raised — model must be very sure before flagging
VIOLENCE_CONF         = 0.65
CONFIRM_FRAMES_NEEDED = 3      # consecutive hits  before first alert fires
CONFIRM_EXIT_FRAMES   = 5      # consecutive misses before label un-confirms
                               # (prevents re-trigger on single missed frame)
FACE_THRESH           = 0.38   # cosine distance — lower = stricter
TRACK_HOLD_SEC        = 3.0    # keep tracking box on screen for N seconds
ALERT_COOLDOWN_SEC    = 60     # min gap between same-type alerts per device
DETECT_EVERY_N        = 4      # run YOLO every N frames
FACE_EVERY_N          = 40     # run face ID every N frames
YOLO_INPUT_WIDTH      = 640    # resize frame to this width before YOLO
STREAM_FPS_CAP        = 0.033  # ~30 fps MJPEG yield rate
STREAM_QUALITY        = 65     # JPEG quality to Android

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
        tmp_path = f"/tmp/ref_{user_id}.jpg"
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
# Confirmation gate
# ─────────────────────────────────────────────────────────────

class ConfirmationGate:
    """
    Two-stage gate that eliminates false-positive alert spam:

    STAGE 1 — Entry gate (confirm before first alert):
      Detection must appear in CONFIRM_FRAMES_NEEDED consecutive inference
      frames before it is treated as real. A single bad frame can never
      trigger an alert.

    STAGE 2 — Exit hysteresis (don't un-confirm on a single miss):
      Once confirmed, a label is only removed when it has been ABSENT for
      CONFIRM_EXIT_FRAMES consecutive inference frames. One missed frame
      (blur, occlusion, skip) does NOT reset the gate — which was the root
      cause of the every-second alert loop:
        detect×3 → confirmed → alert → miss×1 → un-confirmed → counter=0
        → detect×3 → confirmed → alert → miss×1 → ...  (repeats forever)

    ALERT FIRE RULE:
      newly_confirmed only contains a label on the FIRST time it crosses
      the entry threshold. It is never re-added while already confirmed.
      Combined with the 60s cooldown in save_alert this gives hard guarantee
      of at most one alert per 60s per label per device.
    """
    def __init__(self,
                 needed:      int = CONFIRM_FRAMES_NEEDED,
                 exit_frames: int = CONFIRM_EXIT_FRAMES):
        self._needed      = needed
        self._exit_frames = exit_frames
        self._hit_counter : dict = {}   # consecutive hits
        self._miss_counter: dict = {}   # consecutive misses (only counts when confirmed)
        self._confirmed   : set  = set()

    def update(self, detected_labels: list) -> list:
        """
        Feed the set of labels detected in this inference frame.
        Returns labels that just became newly confirmed (first time only).
        """
        newly_confirmed = []
        detected_set    = set(detected_labels)

        # ── labels present this frame ──
        for label in detected_set:
            self._hit_counter[label]  = self._hit_counter.get(label, 0) + 1
            self._miss_counter[label] = 0   # reset miss streak

            if (self._hit_counter[label] >= self._needed
                    and label not in self._confirmed):
                self._confirmed.add(label)
                newly_confirmed.append(label)

        # ── labels absent this frame ──
        for label in list(self._hit_counter):
            if label not in detected_set:
                self._hit_counter[label] = 0   # reset entry counter

                if label in self._confirmed:
                    # Only un-confirm after sustained absence
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
# Tracked box  (no contrib needed — pure box-hold approach)
# ─────────────────────────────────────────────────────────────

class TrackedBox:
    """
    Holds a detection box on screen for TRACK_HOLD_SEC seconds after the
    last YOLO confirmation.  No opencv-contrib dependency needed.

    Why CSRT was removed:
      cv2.TrackerCSRT_create() lives in opencv-contrib-python, NOT in the
      standard opencv-python package.  Installing contrib just for one
      tracker would add ~200 MB and break many existing setups.

    What we do instead:
      When YOLO detects the object we store the box coordinates + timestamp.
      On every frame we draw that box.  When YOLO re-detects we update the
      coordinates (smooth natural update).  When TRACK_HOLD_SEC seconds pass
      without a new YOLO hit the box expires and disappears.

      Result: boxes stay visible and stable for 3 seconds after each YOLO
      confirmation — same user-visible behaviour, zero extra dependencies.
    """
    def __init__(self, frame: np.ndarray, box_xyxy, label: str, color: tuple):
        x1, y1, x2, y2 = [int(v) for v in box_xyxy]
        self.label     = label
        self.color     = color
        self.last_seen = time.time()
        # Store as (x, y, w, h) for cv2.rectangle compatibility
        self._box      = (x1, y1, x2 - x1, y2 - y1)

    def update(self, frame: np.ndarray):
        # No-op — we don't do pixel tracking, just time-based hold
        pass

    def refresh(self, frame: np.ndarray, box_xyxy):
        """Called every time YOLO re-detects this label — updates box + timestamp."""
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
    Camera loop submits frames non-blocking; results are collected non-blocking.
    Pipeline: Haar cascade check → BGR→RGB → DeepFace verify (Facenet512, cosine)
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
    """
    Core loop. Every frame:
      - Read from stream  (auto-reconnect with exponential back-off)
      - Every DETECT_EVERY_N  → YOLO weapon + violence → ConfirmationGate
           → newly confirmed  → save Firebase alert + TrackedBox
      - Every FACE_EVERY_N    → submit to FaceIDWorker
           → pick up result   → update face state
      - Every frame           → advance TrackedBoxes (CSRT), expire old ones
      - Draw all boxes + HUD  → store in latest_frames for MJPEG
    """
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
        run_detection   = (frame_count % DETECT_EVERY_N == 0)
        run_face        = face_worker_obj is not None and (frame_count % FACE_EVERY_N == 0)

        # ── face result ───────────────────────────────────────
        if face_worker_obj:
            result = face_worker_obj.get_result()
            if result:
                new_label, new_dist, new_box = result
                face_label = new_label
                face_dist  = new_dist
                face_box   = new_box if new_label != "No Face" else None
                if face_label == "Stranger":
                    save_alert(user_id, device_name, "Stranger", display, cooldown_map)

        # ── YOLO inference ────────────────────────────────────
        if run_detection:
            yolo_frame   = resize_for_yolo(frame)
            raw_detected = []
            w_res        = None
            v_boxes      = []

            # Run models — only collect labels here, NO box drawing yet
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

            # Feed gate — alert fires ONCE on first confirmation only
            newly_confirmed = gate.update(raw_detected)
            for label in newly_confirmed:
                save_alert(user_id, device_name, label, display, cooldown_map)
                log.info(f"[{device_name}] ✔ CONFIRMED: {label} after {CONFIRM_FRAMES_NEEDED} frames → alert sent")

            # Create/refresh tracked boxes ONLY for confirmed labels
            # Unconfirmed detections are completely invisible — no box drawn
            if gate.is_confirmed("Weapon") and w_res is not None and len(w_res[0].boxes) > 0:
                for box in w_res[0].boxes:
                    refresh_or_create_tracker(tracked_boxes, frame,
                                               box.xyxy[0], "Weapon", (0, 0, 220))
            if gate.is_confirmed("Violence") and v_boxes:
                for box in v_boxes:
                    refresh_or_create_tracker(tracked_boxes, frame,
                                               box.xyxy[0], "Violence", (0, 100, 255))

        # ── face ID submit ────────────────────────────────────
        if run_face:
            face_worker_obj.submit(frame.copy())

        # ── advance + draw tracked boxes ─────────────────────
        # Only draw box if: not expired AND gate has confirmed the label
        active_threats = []
        alive = []
        for tb in tracked_boxes:
            if tb.is_expired():
                continue
            tb.update(display)
            if gate.is_confirmed(tb.label):
                tb.draw(display)               # box only visible when confirmed
                active_threats.append(tb.label)
            alive.append(tb)                   # keep in list even if unconfirmed (tracking continues)
        tracked_boxes = alive

        # ── face box ──────────────────────────────────────────
        if face_box and face_label not in ("No Face", "Scanning…"):
            display = draw_face_box(display, face_box, face_label, face_dist)

        # ── HUD ───────────────────────────────────────────────
        display = draw_hud(display, face_label, list(dict.fromkeys(active_threats)))

        # ── store ─────────────────────────────────────────────
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
            "weapon_conf": WEAPON_CONF, "violence_conf": VIOLENCE_CONF,
            "confirm_frames": CONFIRM_FRAMES_NEEDED,
            "track_hold_sec": TRACK_HOLD_SEC,
            "alert_cooldown_sec": ALERT_COOLDOWN_SEC,
        },
    })


@app.route("/video_feed")
def video_feed():
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


@app.route("/status")
def status():
    return jsonify({k: {"alive": t.is_alive(), "has_frame": k in latest_frames}
                    for k, t in worker_threads.items()})


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("🚀 AI Security Hub v3.0 — 0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)