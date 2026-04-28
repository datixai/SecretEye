"""
=============================================================
  SecretEye — Model Converter  v3
  NO TensorFlow dependency — avoids all protobuf conflicts.

  Uses two paths:
    Path A: Ultralytics tflite export (if protobuf fixed)
    Path B: ONNX → TFLite via onnxruntime + flatbuffers
            (guaranteed to work regardless of TF version)

  Run:
    cd D:\SecretEye\backend
    venv\Scripts\activate
    python convert_models.py
=============================================================
"""

import os, sys, shutil, time, subprocess, struct

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR  = os.path.join(BASE_DIR, "model")
OUTPUT_DIR = os.path.join(BASE_DIR, "tflite_models")
ASSETS_DIR = os.path.join(BASE_DIR, "..", "assets", "models")
IMGSZ      = 320

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

MODELS = [
    {"pt": os.path.join(MODEL_DIR, "weapon.pt"), "name": "weapon"},
    {"pt": os.path.join(MODEL_DIR, "fight.pt"),  "name": "fight"},
]

# ─── Helpers ─────────────────────────────────────────────────────────────────
def sep(): print("\n" + "─" * 60)

def find_file(directory, ext):
    for root, _, files in os.walk(directory):
        for f in files:
            if f.endswith(ext):
                return os.path.join(root, f)
    return None

def copy_outputs(src, name):
    mb = os.path.getsize(src) / 1024 / 1024
    for d in [OUTPUT_DIR, ASSETS_DIR]:
        dst = os.path.join(d, f"{name}.tflite")
        shutil.copy2(src, dst)
        print(f"   ✅ {dst}  ({mb:.1f} MB)")

def save_labels(pt_path, name):
    try:
        from ultralytics import YOLO
        m = YOLO(pt_path)
        labels = [m.names[i] for i in sorted(m.names.keys())]
        for d in [OUTPUT_DIR, ASSETS_DIR]:
            with open(os.path.join(d, f"{name}_labels.txt"), "w") as f:
                f.write("\n".join(labels))
        print(f"   ✅ Labels: {labels}")
    except Exception as e:
        print(f"   ⚠️  Labels skipped: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Fix protobuf then try Ultralytics native export
# ══════════════════════════════════════════════════════════════════════════════
def fix_protobuf():
    """Downgrade protobuf to the version TensorFlow 2.21 expects."""
    print("   Fixing protobuf version conflict...")
    r = subprocess.run(
        [sys.executable, "-m", "pip", "install", "protobuf==5.29.6", "-q"],
        capture_output=True, text=True
    )
    if r.returncode == 0:
        print("   ✅ protobuf downgraded to 5.29.6")
        return True
    print(f"   ⚠️  protobuf fix failed: {r.stderr[-200:]}")
    return False


def try_ultralytics_tflite(pt_path, name):
    print("   Trying Ultralytics native TFLite export...")
    try:
        # Re-import after protobuf fix
        import importlib
        import ultralytics
        importlib.reload(ultralytics)
        from ultralytics import YOLO

        model = YOLO(pt_path)
        model.export(
            format   = "tflite",
            imgsz    = IMGSZ,
            int8     = False,
            half     = False,
            nms      = True,
            simplify = False,
        )
        stem   = os.path.splitext(os.path.basename(pt_path))[0]
        result = find_file(os.path.join(MODEL_DIR, f"{stem}_saved_model"), ".tflite")
        if not result:
            result = find_file(MODEL_DIR, ".tflite")
        if result:
            copy_outputs(result, name)
            return True
        return False
    except Exception as e:
        print(f"   ⚠️  Ultralytics TFLite failed: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — ONNX export + standalone ONNX→TFLite converter
# No TensorFlow import needed at all
# ══════════════════════════════════════════════════════════════════════════════
def export_onnx(pt_path, name):
    """Export .pt → .onnx using Ultralytics (no TF involved)."""
    from ultralytics import YOLO
    onnx_out = os.path.join(MODEL_DIR, f"{name}.onnx")
    print(f"   Exporting to ONNX → {onnx_out}")
    model = YOLO(pt_path)
    model.export(
        format   = "onnx",
        imgsz    = IMGSZ,
        simplify = False,
        nms      = True,
        opset    = 12,
    )
    # Ultralytics saves it alongside the .pt file
    auto = os.path.join(
        os.path.dirname(pt_path),
        os.path.splitext(os.path.basename(pt_path))[0] + ".onnx"
    )
    if os.path.exists(auto) and auto != onnx_out:
        shutil.copy2(auto, onnx_out)
    if os.path.exists(onnx_out):
        print(f"   ✅ ONNX OK: {onnx_out}")
        return onnx_out
    if os.path.exists(auto):
        print(f"   ✅ ONNX OK: {auto}")
        return auto
    return None


def onnx_to_tflite_via_ai_edge(onnx_path, name):
    """
    Use ai-edge-litert (Google's official TFLite converter, no full TF needed).
    pip install ai-edge-litert
    """
    print("   Trying ai-edge-litert converter...")
    try:
        from ai_edge_litert.onnx import convert   # pip install ai-edge-litert
        tflite_model = convert(onnx_path)
        out = os.path.join(MODEL_DIR, f"{name}.tflite")
        with open(out, "wb") as f:
            f.write(tflite_model)
        copy_outputs(out, name)
        return True
    except ImportError:
        print("   ai-edge-litert not installed, trying next method...")
        return False
    except Exception as e:
        print(f"   ⚠️  ai-edge-litert failed: {e}")
        return False


def onnx_to_tflite_via_subprocess(onnx_path, name):
    """
    Run conversion in a fresh Python process so TF imports don't
    conflict with the already-loaded modules in this process.
    """
    print("   Trying subprocess TFLite conversion (isolated process)...")
    script = f"""
import os, sys
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
try:
    import tensorflow as tf
    converter = tf.lite.TFLiteConverter.from_saved_model(r"{onnx_path}")
    converter.optimizations = []
    tflite = converter.convert()
    out = r"{os.path.join(MODEL_DIR, name + '.tflite')}"
    open(out, "wb").write(tflite)
    print("OK:" + out)
except Exception as e:
    print("FAIL:" + str(e))
"""
    r = subprocess.run([sys.executable, "-c", script],
                       capture_output=True, text=True)
    if "OK:" in r.stdout:
        out = r.stdout.split("OK:")[1].strip()
        if os.path.exists(out):
            copy_outputs(out, name)
            return True
    print(f"   ⚠️  subprocess convert failed: {r.stdout[-200:]} {r.stderr[-200:]}")
    return False


def onnx_to_tflite_via_onnx2tflite(onnx_path, name):
    """
    Last resort: onnx2tflite package — completely independent of TensorFlow.
    pip install onnx2tflite
    """
    print("   Trying onnx2tflite (TF-free)...")
    try:
        from onnx2tflite import onnx_converter   # pip install onnx2tflite
        out = os.path.join(MODEL_DIR, f"{name}.tflite")
        onnx_converter(
            onnx_model_path  = onnx_path,
            output_path      = out,
            input_node_names = None,
            input_shape      = None,
            target_formats   = ["tflite"],
            weight_quant     = False,
            int8_model       = False,
        )
        if os.path.exists(out):
            copy_outputs(out, name)
            return True
    except ImportError:
        # auto-install and retry
        print("   Installing onnx2tflite...")
        r = subprocess.run([sys.executable, "-m", "pip", "install",
                            "onnx2tflite", "-q"],
                           capture_output=True, text=True)
        if r.returncode == 0:
            return onnx_to_tflite_via_onnx2tflite(onnx_path, name)
    except Exception as e:
        print(f"   ⚠️  onnx2tflite failed: {e}")
    return False


# ══════════════════════════════════════════════════════════════════════════════
# MAIN CONVERSION LOGIC
# ══════════════════════════════════════════════════════════════════════════════
def convert(pt_path, name):
    sep()
    print(f"📦  {name}.pt  →  {name}.tflite")

    if not os.path.exists(pt_path):
        print(f"❌ Not found: {pt_path}")
        return False

    start = time.time()

    # ── Attempt 1: fix protobuf + Ultralytics tflite ──────────────────────────
    fix_protobuf()
    if try_ultralytics_tflite(pt_path, name):
        print(f"✅  Done in {time.time()-start:.0f}s")
        save_labels(pt_path, name)
        return True

    # ── Attempt 2: ONNX export then convert without TF ────────────────────────
    print("\n   Falling back to ONNX-based conversion (no TensorFlow)...")
    onnx_path = export_onnx(pt_path, name)
    if not onnx_path:
        print("❌ ONNX export failed — cannot continue.")
        return False

    for fn in [onnx_to_tflite_via_ai_edge,
               onnx_to_tflite_via_onnx2tflite,
               onnx_to_tflite_via_subprocess]:
        if fn(onnx_path, name):
            print(f"✅  Done in {time.time()-start:.0f}s")
            save_labels(pt_path, name)
            return True

    print(f"\n❌ All methods failed for {name}.pt")
    print("   Run this and try again:")
    print("   pip install protobuf==5.29.6 onnx2tf onnx2tflite ai-edge-litert")
    return False


def main():
    print("=" * 60)
    print("  SecretEye — YOLOv8 → TFLite Converter  v3")
    print("=" * 60)
    print(f"  Model dir  : {MODEL_DIR}")
    print(f"  Output dir : {OUTPUT_DIR}")
    print(f"  Assets dir : {ASSETS_DIR}")
    print(f"  Image size : {IMGSZ}×{IMGSZ}  (mobile optimised)")

    results = {m["name"]: convert(m["pt"], m["name"]) for m in MODELS}

    sep()
    print("\n  RESULTS")
    for name, ok in results.items():
        print(f"  {name:10} → {'✅ SUCCESS' if ok else '❌ FAILED'}")

    if all(results.values()):
        print(f"""
  Files ready:
    {OUTPUT_DIR}\\weapon.tflite
    {OUTPUT_DIR}\\fight.tflite
    {ASSETS_DIR}\\weapon.tflite
    {ASSETS_DIR}\\fight.tflite

  Next steps:
    npm install react-native-fast-tflite react-native-vision-camera
    Add to app.json plugins: ["react-native-vision-camera"]
    npx expo run:android
""")


if __name__ == "__main__":
    main()