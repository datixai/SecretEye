from ultralytics import YOLO

print("=== weapon.pt ===")
m1 = YOLO("model/weapon.pt")
print(m1.names)

print("\n=== fight.pt ===")
m2 = YOLO("model/fight.pt")
print(m2.names)

print("\n=== face.pt ===")
m3 = YOLO("model/face.pt")
print(m3.names)