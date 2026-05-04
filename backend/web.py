"""
SecretEye — AI Detection Web App
web.py

Run:
    cd D:\SecretEye\backend
    venv\Scripts\activate
    python web.py

Open: http://localhost:5002

Models:
    model/fight.pt    → Violence detection
    model/weapon.pt   → Gun detection
    model/weapon1.pt  → Gun + Knife + Grenade
    face_recognition  → Face recognition vs faces/ folder
"""

import os, cv2, uuid, threading, time, base64
import numpy as np
from datetime import datetime
from flask import Flask, request, jsonify, render_template_string, send_file
from flask_cors import CORS
from ultralytics import YOLO
import face_recognition as fr

# ─── Load YOLO Models ─────────────────────────────────────────────────────────
print("⌛ Loading models...")
fight_model   = YOLO("model/fight.pt")
weapon_model  = YOLO("model/weapon.pt")
weapon1_model = YOLO("model/weapon1.pt")

VIOLENCE_CLASS_ID = next(
    (k for k, v in fight_model.names.items() if "violence" in v.lower()), 1)

print(f"  ✅ fight.pt   — {fight_model.names}")
print(f"  ✅ weapon.pt  — {weapon_model.names}")
print(f"  ✅ weapon1.pt — {weapon1_model.names}")

# ─── Load Face Database ───────────────────────────────────────────────────────
FACES_DIR   = "faces"
TOLERANCE   = 0.50
SKIP_FRAMES = 3

def load_face_db():
    known_encodings, known_names = [], []
    if not os.path.exists(FACES_DIR):
        os.makedirs(FACES_DIR)
        return known_encodings, known_names
    for file in os.listdir(FACES_DIR):
        if file.lower().endswith((".jpg",".jpeg",".png")):
            path  = os.path.join(FACES_DIR, file)
            name  = os.path.splitext(file)[0].capitalize()
            image = fr.load_image_file(path)
            encs  = fr.face_encodings(image)
            if encs:
                known_encodings.append(encs[0])
                known_names.append(name)
                print(f"  ✅ Face loaded: {name}")
    return known_encodings, known_names

known_encodings, known_names = load_face_db()
print(f"  ✅ Face DB: {known_names}\n")

# ─── Job tracking ─────────────────────────────────────────────────────────────
jobs = {}  # job_id → {status, progress, output_path, message}

# ─── HTML ─────────────────────────────────────────────────────────────────────
HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SecretEye — AI Detection</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f8fafc;color:#0f172a;font-family:'Inter',sans-serif;min-height:100vh}

/* Nav */
nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 32px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.nav-brand{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800;color:#0f172a}
.nav-brand span{color:#2563eb}
.nav-tag{font-size:11px;background:#eff6ff;color:#2563eb;padding:3px 10px;border-radius:100px;font-weight:600;letter-spacing:.5px}

/* Layout */
.container{max-width:1000px;margin:0 auto;padding:48px 24px}
h1{font-family:'Space Grotesk',sans-serif;font-size:36px;font-weight:800;margin-bottom:8px}
.subtitle{color:#64748b;font-size:15px;margin-bottom:40px}

/* Card */
.card{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.card-title{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:20px}

/* Upload */
.upload-zone{border:2px dashed #cbd5e1;border-radius:14px;padding:48px 24px;text-align:center;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;background:#f8fafc}
.upload-zone:hover,.upload-zone.drag{border-color:#2563eb;background:#eff6ff}
.upload-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;z-index:2}
.upload-icon{font-size:40px;margin-bottom:12px}
.upload-title{font-weight:700;font-size:16px;margin-bottom:6px}
.upload-sub{font-size:13px;color:#94a3b8}
.file-name{margin-top:12px;font-size:13px;color:#2563eb;font-weight:600;display:none}

/* Model selector */
.model-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media(max-width:600px){.model-grid{grid-template-columns:1fr}}
.model-card{border:2px solid #e2e8f0;border-radius:14px;padding:18px;cursor:pointer;transition:all .2s;background:#fff}
.model-card:hover{border-color:#93c5fd;background:#eff6ff}
.model-card.selected{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
.model-card input{display:none}
.model-icon{font-size:28px;margin-bottom:8px}
.model-name{font-weight:700;font-size:14px;margin-bottom:4px}
.model-desc{font-size:12px;color:#64748b}

/* Run button */
.run-btn{width:100%;padding:16px;border-radius:14px;border:none;background:#2563eb;color:#fff;font-size:16px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.5px;margin-top:8px}
.run-btn:hover{background:#1d4ed8;transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,.3)}
.run-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}

/* Progress */
#progress-card{display:none}
.progress-bar-wrap{background:#e2e8f0;border-radius:100px;height:8px;overflow:hidden;margin:16px 0}
.progress-bar{height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed);border-radius:100px;transition:width .3s;width:0%}
.progress-text{font-size:13px;color:#64748b;text-align:center}
.status-msg{font-size:14px;font-weight:600;color:#0f172a;margin-bottom:8px}

/* Result */
#result-card{display:none}
.result-video{width:100%;border-radius:14px;border:1px solid #e2e8f0;background:#0f172a;max-height:500px}
.result-meta{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px}
.meta-item{font-size:13px}
.meta-label{color:#94a3b8;margin-right:4px}
.meta-val{font-weight:600;color:#0f172a}
.download-btn{display:inline-flex;align-items:center;gap:8px;margin-top:16px;padding:10px 20px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;color:#0f172a;text-decoration:none;transition:all .2s}
.download-btn:hover{background:#e2e8f0}

/* Face DB info */
.face-db-row{display:flex;align-items:center;gap:10px;font-size:13px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;margin-bottom:16px}
.face-db-row.empty{background:#fffbeb;border-color:#fcd34d}
</style>
</head>
<body>

<nav>
  <div class="nav-brand">Secret<span>Eye</span></div>
  <span class="nav-tag">AI Detection Lab</span>
</nav>

<div class="container">
  <h1>AI Video Detection</h1>
  <p class="subtitle">Upload a video, choose a model, and get results with bounding boxes</p>

  <!-- Upload -->
  <div class="card">
    <div class="card-title">Step 1 — Upload Video</div>
    <div class="upload-zone" id="drop-zone">
      <input type="file" id="file-input" accept="video/*">
      <div class="upload-icon">🎬</div>
      <div class="upload-title">Click or drag your video here</div>
      <div class="upload-sub">MP4, AVI, MOV supported</div>
      <div class="file-name" id="file-name"></div>
    </div>
  </div>

  <!-- Model selector -->
  <div class="card">
    <div class="card-title">Step 2 — Choose Model</div>

    <!-- Face DB status -->
    <div class="face-db-row" id="face-db-row">
      <span id="face-db-text">👤 Loading face database...</span>
    </div>

    <div class="model-grid">
      <label class="model-card selected">
        <input type="radio" name="model" value="fight" checked>
        <div class="model-icon">⚡</div>
        <div class="model-name">Violence Detection</div>
        <div class="model-desc">Detects fights and violent behaviour</div>
      </label>
      <label class="model-card">
        <input type="radio" name="model" value="weapon">
        <div class="model-icon">🔫</div>
        <div class="model-name">Gun Detection</div>
        <div class="model-desc">Detects firearms and guns</div>
      </label>
      <label class="model-card">
        <input type="radio" name="model" value="weapon1">
        <div class="model-icon">🗡️</div>
        <div class="model-name">Weapon Detection</div>
        <div class="model-desc">Gun + Knife + Grenade + Explosive</div>
      </label>
      <label class="model-card">
        <input type="radio" name="model" value="face">
        <div class="model-icon">👤</div>
        <div class="model-name">Face Recognition</div>
        <div class="model-desc">Identify people vs your faces/ database</div>
      </label>
    </div>

    <!-- Confidence slider (hidden for face model) -->
    <div id="conf-section" style="margin-top:20px">
      <label style="font-size:13px;color:#64748b;font-weight:600">
        CONFIDENCE THRESHOLD: <span id="conf-val" style="color:#2563eb">40%</span>
      </label>
      <input type="range" id="conf-slider" min="10" max="90" value="40"
             style="width:100%;margin-top:8px;accent-color:#2563eb"
             oninput="document.getElementById('conf-val').textContent=this.value+'%'">
    </div>

    <button class="run-btn" id="run-btn" onclick="runDetection()" disabled>
      ▶ Run Detection
    </button>
  </div>

  <!-- Progress -->
  <div class="card" id="progress-card">
    <div class="card-title">Processing</div>
    <div class="status-msg" id="status-msg">Starting...</div>
    <div class="progress-bar-wrap">
      <div class="progress-bar" id="progress-bar"></div>
    </div>
    <div class="progress-text" id="progress-text">0%</div>
  </div>

  <!-- Result -->
  <div class="card" id="result-card">
    <div class="card-title">Result</div>
    <video class="result-video" id="result-video" controls></video>
    <div class="result-meta" id="result-meta"></div>
    <a class="download-btn" id="download-btn" href="#" download>⬇ Download Output Video</a>
  </div>

</div>

<script>
let currentFile = null;
let pollInterval = null;

// Face DB status
fetch('/face-db-status').then(r=>r.json()).then(d=>{
  const row  = document.getElementById('face-db-row');
  const text = document.getElementById('face-db-text');
  if (d.count === 0) {
    row.className = 'face-db-row empty';
    text.textContent = '⚠ No faces in database — add images to backend/faces/ folder';
  } else {
    text.textContent = `👤 Face database: ${d.count} person(s) — ${d.names.join(', ')}`;
  }
});

// Model card selection
document.querySelectorAll('.model-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const val = card.querySelector('input').value;
    document.getElementById('conf-section').style.display = val === 'face' ? 'none' : 'block';
  });
});

// Upload
const dz = document.getElementById('drop-zone');
const fi = document.getElementById('file-input');
dz.addEventListener('dragover', e=>{e.preventDefault();dz.classList.add('drag')});
dz.addEventListener('dragleave', ()=>dz.classList.remove('drag'));
dz.addEventListener('drop', e=>{e.preventDefault();dz.classList.remove('drag');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0])});
fi.addEventListener('change', ()=>{if(fi.files[0])handleFile(fi.files[0])});

function handleFile(file) {
  currentFile = file;
  const fn = document.getElementById('file-name');
  fn.textContent = `📄 ${file.name}  ·  ${(file.size/1024/1024).toFixed(1)} MB`;
  fn.style.display = 'block';
  document.getElementById('run-btn').disabled = false;
  document.getElementById('result-card').style.display = 'none';
}

async function runDetection() {
  if (!currentFile) return;
  const model = document.querySelector('input[name=model]:checked').value;
  const conf  = document.getElementById('conf-slider').value / 100;

  document.getElementById('run-btn').disabled = true;
  document.getElementById('progress-card').style.display = 'block';
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-text').textContent = '0%';
  document.getElementById('status-msg').textContent = 'Uploading video...';

  const fd = new FormData();
  fd.append('video', currentFile);
  fd.append('model', model);
  fd.append('conf',  conf);

  try {
    const resp = await fetch('/process', {method:'POST', body:fd});
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    pollProgress(data.job_id);
  } catch(e) {
    document.getElementById('status-msg').textContent = '❌ Error: ' + e.message;
    document.getElementById('run-btn').disabled = false;
  }
}

function pollProgress(jobId) {
  pollInterval = setInterval(async () => {
    try {
      const resp = await fetch(`/progress/${jobId}`);
      const data = await resp.json();

      const pct = data.progress || 0;
      document.getElementById('progress-bar').style.width = pct + '%';
      document.getElementById('progress-text').textContent = pct + '%';
      document.getElementById('status-msg').textContent = data.message || 'Processing...';

      if (data.status === 'done') {
        clearInterval(pollInterval);
        showResult(data);
      } else if (data.status === 'error') {
        clearInterval(pollInterval);
        document.getElementById('status-msg').textContent = '❌ ' + data.message;
        document.getElementById('run-btn').disabled = false;
      }
    } catch(e) {
      console.log('poll error', e);
    }
  }, 800);
}

function showResult(data) {
  document.getElementById('progress-card').style.display = 'none';
  document.getElementById('result-card').style.display = 'block';
  document.getElementById('run-btn').disabled = false;

  const videoUrl = `/output/${data.job_id}`;
  const vid = document.getElementById('result-video');
  vid.src = videoUrl;
  vid.load();

  document.getElementById('download-btn').href = videoUrl;
  document.getElementById('download-btn').download = data.filename || 'output.mp4';

  document.getElementById('result-meta').innerHTML = `
    <div class="meta-item"><span class="meta-label">Model:</span><span class="meta-val">${data.model_name}</span></div>
    <div class="meta-item"><span class="meta-label">Frames:</span><span class="meta-val">${data.frames}</span></div>
    <div class="meta-item"><span class="meta-label">Time:</span><span class="meta-val">${data.elapsed}s</span></div>
    <div class="meta-item"><span class="meta-label">Saved to:</span><span class="meta-val">${data.output_path}</span></div>
  `;

  vid.scrollIntoView({behavior:'smooth'});
}
</script>
</body>
</html>"""

# ─── Flask App ────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

UPLOAD_DIR = "uploads_tmp"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route("/")
def index():
    return render_template_string(HTML)

@app.route("/face-db-status")
def face_db_status():
    return jsonify({"count": len(known_names), "names": known_names})

# ─── Processing functions ─────────────────────────────────────────────────────

def process_yolo(job_id, input_path, output_path, model, conf, model_name):
    jobs[job_id]["status"]  = "running"
    jobs[job_id]["message"] = f"Running {model_name}..."

    cap   = cv2.VideoCapture(input_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps   = int(cap.get(cv2.CAP_PROP_FPS)) or 25

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    # Get class filter for fight model
    filter_class = None
    if model_name == "Violence":
        filter_class = VIOLENCE_CLASS_ID

    frame_count = 0
    start       = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1

        results = model.predict(frame, conf=conf, verbose=False, iou=0.45,
                                classes=[filter_class] if filter_class is not None else None)

        if results and len(results[0].boxes) > 0:
            for box in results[0].boxes:
                cls  = int(box.cls[0])
                name = model.names[cls]
                c    = float(box.conf[0])
                x1,y1,x2,y2 = [int(v) for v in box.xyxy[0]]
                color = (0,0,220) if model_name in ("Violence","Gun") else (0,100,255)
                cv2.rectangle(frame,(x1,y1),(x2,y2),color,2)
                cv2.putText(frame,f"{name} {c:.0%}",(x1,max(y1-8,20)),
                            cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,255,255),2)

        writer.write(frame)
        pct = int(frame_count / total * 100) if total > 0 else 0
        jobs[job_id]["progress"] = pct
        jobs[job_id]["message"]  = f"{model_name} — frame {frame_count}/{total}"

    cap.release()
    writer.release()

    jobs[job_id].update({
        "status":      "done",
        "progress":    100,
        "message":     "Done!",
        "frames":      frame_count,
        "elapsed":     round(time.time()-start, 1),
        "model_name":  model_name,
        "output_path": output_path,
    })


def process_face(job_id, input_path, output_path):
    jobs[job_id]["status"]  = "running"
    jobs[job_id]["message"] = "Running face recognition..."

    cap   = cv2.VideoCapture(input_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps   = int(cap.get(cv2.CAP_PROP_FPS)) or 25

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    frame_count  = 0
    last_results = []
    start        = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1

        if frame_count % SKIP_FRAMES == 0:
            small = cv2.resize(frame,(0,0),fx=0.5,fy=0.5)
            rgb   = cv2.cvtColor(small,cv2.COLOR_BGR2RGB)
            locations = fr.face_locations(rgb, model="hog")
            encodings = fr.face_encodings(rgb, locations)
            last_results = []
            for (top,right,bottom,left), enc in zip(locations, encodings):
                top*=2; right*=2; bottom*=2; left*=2
                name  = "Stranger"
                color = (0,0,255)
                if known_encodings:
                    distances = fr.face_distance(known_encodings, enc)
                    best_idx  = int(np.argmin(distances))
                    if distances[best_idx] < TOLERANCE:
                        name  = known_names[best_idx]
                        color = (0,220,0)
                last_results.append((top,right,bottom,left,name,color))

        for (top,right,bottom,left,name,color) in last_results:
            cv2.rectangle(frame,(left,top),(right,bottom),color,2)
            cv2.rectangle(frame,(left,bottom),(right,bottom+32),color,-1)
            cv2.putText(frame,name,(left+6,bottom+22),
                        cv2.FONT_HERSHEY_SIMPLEX,0.75,(255,255,255),2)

        writer.write(frame)
        pct = int(frame_count/total*100) if total > 0 else 0
        jobs[job_id]["progress"] = pct
        jobs[job_id]["message"]  = f"Face recognition — frame {frame_count}/{total}"

    cap.release()
    writer.release()

    jobs[job_id].update({
        "status":      "done",
        "progress":    100,
        "message":     "Done!",
        "frames":      frame_count,
        "elapsed":     round(time.time()-start, 1),
        "model_name":  "Face Recognition",
        "output_path": output_path,
    })


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/process", methods=["POST"])
def process():
    video    = request.files.get("video")
    model_id = request.form.get("model", "fight")
    conf     = float(request.form.get("conf", 0.40))

    if not video:
        return jsonify({"error": "No video uploaded"}), 400

    # Save input video
    job_id   = str(uuid.uuid4())[:8]
    ext      = os.path.splitext(video.filename)[1] or ".mp4"
    tmp_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
    video.save(tmp_path)

    # Output path — same structure as YOLO runs/detect/
    timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_name_map = {
        "fight":   "Violence",
        "weapon":  "Gun",
        "weapon1": "Weapon",
        "face":    "Face",
    }
    mname      = model_name_map.get(model_id, model_id)
    out_dir    = os.path.join("runs", "detect", f"{mname}_{timestamp}")
    os.makedirs(out_dir, exist_ok=True)
    out_path   = os.path.join(out_dir, f"output_{job_id}.mp4")
    out_fname  = f"output_{job_id}.mp4"

    # Init job
    jobs[job_id] = {
        "status":      "queued",
        "progress":    0,
        "message":     "Starting...",
        "output_path": out_path,
        "filename":    out_fname,
        "tmp_path":    tmp_path,
    }

    # Pick model and run in background thread
    model_map = {
        "fight":   (fight_model,   "Violence"),
        "weapon":  (weapon_model,  "Gun"),
        "weapon1": (weapon1_model, "Weapon"),
    }

    def run():
        try:
            if model_id == "face":
                process_face(job_id, tmp_path, out_path)
            else:
                m, mn = model_map[model_id]
                process_yolo(job_id, tmp_path, out_path, m, conf, mn)
        except Exception as e:
            jobs[job_id]["status"]  = "error"
            jobs[job_id]["message"] = str(e)
            print(f"Job {job_id} error: {e}")

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"job_id": job_id})


@app.route("/progress/<job_id>")
def progress(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/output/<job_id>")
def output(job_id):
    job = jobs.get(job_id)
    if not job or job["status"] != "done":
        return jsonify({"error": "Not ready"}), 404
    return send_file(job["output_path"], mimetype="video/mp4")


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🚀 SecretEye AI Detection Web")
    print("   Open: http://localhost:5002")
    print("   Press Ctrl+C to stop\n")
    app.run(host="0.0.0.0", port=5002, debug=False, threaded=True)