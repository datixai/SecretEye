from ultralytics import YOLO

model = YOLO("model/fight.pt")

results = model.predict(
    source="video/violence.mp4",
    conf=0.40,
    show=True,
    save=True,
    verbose=True
)

for r in results:
    for box in r.boxes:
        cls  = int(box.cls[0])
        conf = float(box.conf[0])
        name = model.names[cls]
        print(f"Detected: {name} — {conf:.0%} confidence")