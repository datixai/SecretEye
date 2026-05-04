import face_recognition
import os, cv2
import numpy as np
from datetime import datetime

# ─── Config ───────────────────────────────────────────────────────────────────
FACES_DIR   = "faces"
TEST_VIDEO  = "video/girl.mp4"
TOLERANCE   = 0.50
SKIP_FRAMES = 3

# ─── Load known faces ─────────────────────────────────────────────────────────
known_encodings = []
known_names     = []

print("Loading face database...")
for file in os.listdir(FACES_DIR):
    if file.lower().endswith((".jpg", ".jpeg", ".png")):
        path  = os.path.join(FACES_DIR, file)
        name  = os.path.splitext(file)[0].capitalize()
        image = face_recognition.load_image_file(path)
        encs  = face_recognition.face_encodings(image)
        if encs:
            known_encodings.append(encs[0])
            known_names.append(name)
            print(f"  ✅ {name}")
        else:
            print(f"  ⚠️  No face found in {file} — use a clearer photo")

print(f"\n✅ Database ready: {known_names}\n")

# ─── Setup output folder (same as YOLO runs/detect/predict/) ──────────────────
timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
output_dir = os.path.join("runs", "detect", f"face_{timestamp}")
os.makedirs(output_dir, exist_ok=True)

input_name  = os.path.splitext(os.path.basename(TEST_VIDEO))[0]
output_path = os.path.join(output_dir, f"{input_name}.mp4")

# ─── Open video ───────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(TEST_VIDEO)
if not cap.isOpened():
    print(f"❌ Could not open: {TEST_VIDEO}")
    exit()

width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps    = int(cap.get(cv2.CAP_PROP_FPS)) or 25
total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

# ─── Video writer ─────────────────────────────────────────────────────────────
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

print(f"📹 Input : {TEST_VIDEO}")
print(f"💾 Output: {output_path}")
print(f"🎞️  Frames: {total}  |  FPS: {fps}\n")

frame_count  = 0
last_results = []

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # Run recognition every SKIP_FRAMES
    if frame_count % SKIP_FRAMES == 0:
        small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
        rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

        locations = face_recognition.face_locations(rgb, model="hog")
        encodings = face_recognition.face_encodings(rgb, locations)

        last_results = []

        for (top, right, bottom, left), enc in zip(locations, encodings):
            top *= 2; right *= 2; bottom *= 2; left *= 2

            name  = "Stranger"
            color = (0, 0, 255)  # red

            if known_encodings:
                distances = face_recognition.face_distance(known_encodings, enc)
                best_idx  = int(np.argmin(distances))
                if distances[best_idx] < TOLERANCE:
                    name  = known_names[best_idx]
                    color = (0, 220, 0)  # green

            last_results.append((top, right, bottom, left, name, color))
            print(f"Frame {frame_count}: {name}")

    # Draw boxes
    for (top, right, bottom, left, name, color) in last_results:
        cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
        cv2.rectangle(frame, (left, bottom), (right, bottom + 32), color, -1)
        cv2.putText(frame, name, (left + 6, bottom + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)

    cv2.putText(frame, f"Frame: {frame_count}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

    # Show window
    cv2.imshow("SecretEye — Face Recognition  (Q to quit)", frame)

    # Save frame to output video
    writer.write(frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
writer.release()
cv2.destroyAllWindows()

print(f"\n✅ Done! Output saved to: {output_path}")