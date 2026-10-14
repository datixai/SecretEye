"""
Download the YOLO model weights into backend/model/ (run once).

    cd backend
    venv\Scripts\activate
    python scripts/download_models.py
"""

import os
import shutil

from huggingface_hub import hf_hub_download

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model")

MODELS = [
    # (target file, Hugging Face repo, file in repo, description)
    ("weapon.pt", "Subh775/Firearm_Detection_Yolov8n", "weights/best.pt", "guns"),
    ("weapon1.pt", "Subh775/Threat-Detection-YOLOv8n", "weights/best.pt", "gun, knife, grenade, explosive"),
    ("fight.pt", "Musawer14/fight_detection_yolov8", "yolo_small_weights.pt", "violence"),
]


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
    for target, repo, filename, what in MODELS:
        dest = os.path.join(MODEL_DIR, target)
        if os.path.exists(dest):
            print(f"✅ {target} already present — skipping")
            continue
        print(f"⬇  {target} ({what}) from {repo}…")
        shutil.copy(hf_hub_download(repo_id=repo, filename=filename), dest)
        print(f"✅ {target} saved")
    print("\nAll models ready in backend/model/")


if __name__ == "__main__":
    main()
