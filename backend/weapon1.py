from huggingface_hub import hf_hub_download, list_repo_files
import shutil, os

os.makedirs("model", exist_ok=True)

# Check what files are available
print("Files in repo:")
files = list(list_repo_files("Subh775/Threat-Detection-YOLOv8n"))
print(files)

# Download — detects: Gun, Knife, Grenade, Explosive
print("\nDownloading multi-class weapon model...")
path = hf_hub_download(
    repo_id="Subh775/Threat-Detection-YOLOv8n",
    filename="weights/best.pt"
)
shutil.copy(path, "model/weapon1.pt")
print("✅ weapon1.pt saved — Gun, Knife, Grenade, Explosive")