from huggingface_hub import hf_hub_download
import shutil, os

os.makedirs("model", exist_ok=True)

# weapon model
print("Downloading weapon model...")
path = hf_hub_download(
    repo_id="Subh775/Firearm_Detection_Yolov8n",
    filename="weights/best.pt"
)
shutil.copy(path, "model/weapon.pt")
print("✅ weapon.pt saved")

# fight model
print("Downloading fight model...")
path2 = hf_hub_download(
    repo_id="Musawer14/fight_detection_yolov8",
    filename="yolo_small_weights.pt"
)
shutil.copy(path2, "model/fight.pt")
print("✅ fight.pt saved")

print("\n✅ Both models ready in model/ folder")