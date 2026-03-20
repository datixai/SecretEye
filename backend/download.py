"""
download_models.py
==================
Run this ONCE after setting up your environment.

What it does:
  1. Downloads Facenet512 weights via DeepFace  →  ~/.deepface/weights/
  2. Copies facenet512_weights.h5 into your local  model/  folder
  3. Tells server.py to load from  model/  so nothing is re-downloaded

Folder structure after running:
  your_project/
  ├── server.py
  ├── download_models.py
  └── model/
      ├── weapon.pt
      ├── fight.pt
      └── facenet512_weights.h5   ← copied here by this script

Usage:
    python download_models.py
"""

import os
import sys
import shutil

# ── Where to copy the weights locally ──────────────────────────────────────
LOCAL_MODEL_DIR   = "model"
FACENET512_FILE   = "facenet512_weights.h5"

def check_deepface():
    try:
        from deepface import DeepFace
        return DeepFace
    except ImportError:
        print("❌  deepface not installed.")
        print("    Run:  pip install deepface")
        sys.exit(1)

def download_all():
    DeepFace = check_deepface()

    os.makedirs(LOCAL_MODEL_DIR, exist_ok=True)

    deepface_weights_dir = os.path.expanduser("~/.deepface/weights")
    local_facenet_path   = os.path.join(LOCAL_MODEL_DIR, FACENET512_FILE)

    # ── Step 1: check if already copied locally ─────────────────────────────
    if os.path.exists(local_facenet_path):
        size_mb = os.path.getsize(local_facenet_path) / 1_000_000
        print(f"✅  Facenet512 already in model/ folder  ({size_mb:.1f} MB) — nothing to do.")
        print(f"    Path: {os.path.abspath(local_facenet_path)}")
        return

    # ── Step 2: trigger DeepFace download → ~/.deepface/weights/ ───────────
    print("⌛ Downloading Facenet512 weights (~92 MB)…")
    print("   This only happens once. Please wait…\n")
    try:
        DeepFace.build_model("Facenet512")
        print("✅  Download complete.\n")
    except Exception as e:
        print(f"❌  Download failed: {e}")
        sys.exit(1)

    # ── Step 3: copy from ~/.deepface/weights/ → model/ ────────────────────
    src = os.path.join(deepface_weights_dir, FACENET512_FILE)

    if not os.path.exists(src):
        # Some TF/Keras versions store it under a different name — search for it
        print(f"⚠️  Not found at expected path: {src}")
        print("   Searching ~/.deepface/weights/ …")
        candidates = []
        if os.path.exists(deepface_weights_dir):
            candidates = [
                f for f in os.listdir(deepface_weights_dir)
                if "facenet512" in f.lower() or "facenet_512" in f.lower()
            ]
        if candidates:
            src = os.path.join(deepface_weights_dir, candidates[0])
            print(f"   Found: {candidates[0]}")
        else:
            print("❌  Could not locate Facenet512 weights file.")
            print(f"   Check {deepface_weights_dir} manually and copy the .h5 file to model/")
            sys.exit(1)

    print(f"⌛ Copying to model/ folder…")
    shutil.copy2(src, local_facenet_path)
    size_mb = os.path.getsize(local_facenet_path) / 1_000_000
    print(f"✅  Copied → {os.path.abspath(local_facenet_path)}  ({size_mb:.1f} MB)\n")

    # ── Step 4: verify OpenCV Haar cascade (bundled with opencv-python) ─────
    import cv2
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    if os.path.exists(cascade_path):
        print(f"✅  Haar cascade ready (bundled with OpenCV).")
    else:
        print(f"⚠️  Haar cascade not found. Run:  pip install --upgrade opencv-python")

    # ── Summary ─────────────────────────────────────────────────────────────
    print("\n" + "─" * 55)
    print("model/ folder contents:")
    for f in sorted(os.listdir(LOCAL_MODEL_DIR)):
        size_mb = os.path.getsize(os.path.join(LOCAL_MODEL_DIR, f)) / 1_000_000
        print(f"   {f:<45}  {size_mb:7.1f} MB")
    print("─" * 55)
    print("\n✅  All done!  You can now run:  python server.py")
    print("   DeepFace will load weights from model/ — no internet needed.\n")

if __name__ == "__main__":
    download_all()