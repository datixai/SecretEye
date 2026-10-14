"""Seeds the LOCAL Firebase emulators with a demo homeowner for the promo reel.

Talks only to 127.0.0.1 (anonymous credentials) — it cannot reach production.

  python seed.py reset       wipe emulator data, create demo account + data
  python seed.py alert       add a fresh weapon detection (triggers the in-app banner)
  python seed.py ack         acknowledge the latest open SOS as the control centre
"""
import base64
import io
import json
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone

os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
PROJECT = "secreteye-6896d"
AUTH = "http://127.0.0.1:9099"

import requests  # noqa: E402
from google.auth.credentials import AnonymousCredentials  # noqa: E402
from google.cloud import firestore  # noqa: E402

import cctv  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ACCOUNT_FILE = os.path.join(HERE, "demo-account.json")
db = firestore.Client(project=PROJECT, credentials=AnonymousCredentials())
now = datetime.now(timezone.utc)


def data_uri(name, when):
    buf = io.BytesIO()
    cctv.snapshot(name, when.astimezone()).save(buf, "JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def account():
    return json.load(open(ACCOUNT_FILE))


def reset():
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts").raise_for_status()
    requests.delete(f"http://127.0.0.1:8080/emulator/v1/projects/{PROJECT}/databases/(default)/documents").raise_for_status()

    acc = {"email": "hamza@secreteye.test", "password": "Demo-" + secrets.token_hex(6)}
    r = requests.post(f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
                      json={**acc, "returnSecureToken": True})
    r.raise_for_status()
    uid = r.json()["localId"]
    acc["uid"] = uid
    json.dump(acc, open(ACCOUNT_FILE, "w"), indent=2)

    db.document(f"users/{uid}").set({
        "uid": uid, "fullName": "Hamza Malik", "email": acc["email"], "phoneNumber": "+92 300 1234567",
        "address": "House 12, Street 4, DHA Phase 6, Lahore", "role": "homeowner", "faceReference": None,
        "disabled": False, "createdAt": now - timedelta(days=40),
    })
    db.document(f"settings/{uid}").set({"armed": True, "faceEnabled": True, "weaponEnabled": True, "violenceEnabled": True,
                                        "isFaceEnabled": True, "isWeaponAlertEnabled": True})

    for i, (name, port) in enumerate([("Front Gate", 8091), ("Driveway", 8092), ("Back Door", 8093), ("Living Room", 8094)]):
        db.collection("devices").add({"userId": uid, "name": name, "ip": f"127.0.0.1:{port}", "status": "Active",
                                      "createdAt": now - timedelta(days=30 - i)})

    for name, rel, d in [("Ayesha Malik", "Wife", 38), ("Usman Malik", "Brother", 35), ("Ali Raza", "Driver", 30),
                         ("Fatima Bibi", "Housekeeper", 22)]:
        db.collection("trusted_visitors").add({"homeownerId": uid, "name": name, "relation": rel, "image": None,
                                               "createdAt": now - timedelta(days=d)})

    dets = [  # snapshot, type, camera, age, status
        ("stranger_back", "Stranger", "Back Door", timedelta(minutes=14), "new"),
        ("violence_drive", "Violence", "Driveway", timedelta(minutes=48), "new"),
        ("stranger_drive", "Stranger", "Driveway", timedelta(hours=2, minutes=10), "reviewed"),
        ("weapon_gate2", "Weapon", "Front Gate", timedelta(hours=26), "reviewed"),
        ("stranger_gate", "Stranger", "Front Gate", timedelta(hours=31), "reviewed"),
        ("violence_drive", "Violence", "Driveway", timedelta(days=3, hours=4), "reviewed"),
        ("stranger_back", "Stranger", "Back Door", timedelta(days=4, hours=2), "reviewed"),
        ("stranger_drive", "Stranger", "Driveway", timedelta(days=6), "reviewed"),
    ]
    for snap, typ, cam, age, status in dets:
        when = now - age
        db.collection("detections").add({
            "userId": uid, "deviceName": cam, "type": typ,
            "priority": "High" if typ in ("Weapon", "Violence") else "Medium",
            "status": status, "imageUrl": data_uri(snap, when), "timestamp": when,
        })
    print("seeded demo account", acc["email"], "->", ACCOUNT_FILE)


def alert():
    uid = account()["uid"]
    db.collection("detections").add({
        "userId": uid, "deviceName": "Front Gate", "type": "Weapon", "priority": "High", "status": "new",
        "imageUrl": data_uri("weapon_gate", now), "timestamp": now,
    })
    print("weapon alert added")


def ack():
    uid = account()["uid"]
    docs = [d for d in db.collection("emergency_alerts").where("userId", "==", uid).stream() if d.get("status") == "open"]
    for d in docs:
        d.reference.update({"status": "acknowledged", "acknowledgedBy": "Control Centre — Officer Bilal",
                            "acknowledgedAt": datetime.now(timezone.utc)})
    print("acknowledged", len(docs))


if __name__ == "__main__":
    {"reset": reset, "alert": alert, "ack": ack}[sys.argv[1]]()
