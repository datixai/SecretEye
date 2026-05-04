from huggingface_hub import hf_hub_download
import shutil, os

os.makedirs("model", exist_ok=True)

print("Downloading face detection model...")
path = hf_hub_download(
    repo_id="arnabdhar/YOLOv8-Face-Detection",
    filename="model.pt"
)
shutil.copy(path, "model/face.pt")
print("✅ face.pt saved to model/face.pt")