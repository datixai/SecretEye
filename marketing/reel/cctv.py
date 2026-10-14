"""Synthetic night-vision CCTV scenes for the SecretEye promo reel.

Everything here is drawn procedurally (no real people or third-party footage),
so the output is safe to publish.

  python cctv.py snapshots OUT_DIR     -> detection snapshots (jpg)
  python cctv.py serve                 -> fake IP cameras on 127.0.0.1:8091-8094 (/shot.jpg)
"""
import http.server
import io
import math
import os
import random
import sys
import threading
import time
from datetime import datetime, timedelta

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 960, 540
FONT = "C:/Windows/Fonts/consola.ttf"
FONT_B = "C:/Windows/Fonts/consolab.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_B if bold else FONT, size)
    except OSError:
        return ImageFont.load_default()


# ---------------------------------------------------------------- primitives
def vgrad(w, h, top, bottom):
    t = np.linspace(0, 1, h)[:, None]
    col = np.array(top)[None, None, :] * (1 - t[..., None]) + np.array(bottom)[None, None, :] * t[..., None]
    return np.repeat(col, w, axis=1)


def glow(arr, cx, cy, radius, strength):
    yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    arr += (np.clip(1 - d, 0, 1) ** 2)[..., None] * strength
    return arr


def person(d, x, feet, h, pose="stand", shade=28, facing=1, phase=0.0):
    """Draws a silhouette. x = centre, feet = y of feet, h = height in px."""
    c = (shade, shade, shade)
    head_r = h * 0.075
    head_y = feet - h + head_r
    sh_y = feet - h * 0.80
    hip_y = feet - h * 0.47
    sw = h * 0.13  # half shoulder width
    hw = h * 0.09
    lw = max(2, int(h * 0.075))

    if pose == "hood":
        d.ellipse([x - head_r * 1.35, head_y - head_r * 1.3, x + head_r * 1.35, head_y + head_r * 1.4], fill=c)
    else:
        d.ellipse([x - head_r, head_y - head_r, x + head_r, head_y + head_r], fill=c)
    d.rectangle([x - head_r * 0.45, head_y + head_r * 0.6, x + head_r * 0.45, sh_y + 4], fill=c)
    torso_w = 1.15 if pose == "hood" else 1.0
    d.polygon([(x - sw * torso_w, sh_y), (x + sw * torso_w, sh_y), (x + hw * 1.1, hip_y), (x - hw * 1.1, hip_y)], fill=c)
    d.ellipse([x - sw * torso_w - lw * 0.5, sh_y - lw * 0.5, x - sw * torso_w + lw * 0.9, sh_y + lw], fill=c)
    d.ellipse([x + sw * torso_w - lw * 0.9, sh_y - lw * 0.5, x + sw * torso_w + lw * 0.5, sh_y + lw], fill=c)

    # legs
    swing = math.sin(phase) * h * 0.12 if pose == "walk" else 0
    stance = h * 0.07 if pose in ("aim", "punch", "fight") else h * 0.04
    for s, sw_ in ((-1, swing), (1, -swing)):
        knee = (x + s * stance * 0.9 + sw_ * 0.5, hip_y + (feet - hip_y) * 0.5)
        foot = (x + s * stance * 1.4 + sw_, feet)
        d.line([(x + s * hw * 0.6, hip_y), knee, foot], fill=c, width=lw + 2, joint="curve")
        fx0, fx1 = sorted((foot[0] - lw * facing, foot[0] + lw * 1.6 * facing))
        d.ellipse([fx0, feet - lw * 0.6, fx1, feet + lw * 0.4], fill=c)

    # arms
    def arm(sx, pts):
        d.line([(sx, sh_y + lw * 0.3)] + pts, fill=c, width=lw, joint="curve")

    near = x + facing * sw
    far = x - facing * sw
    if pose == "aim":
        hand = (x + facing * h * 0.52, sh_y + h * 0.02)
        arm(near, [hand])
        arm(far, [(x + facing * h * 0.2, sh_y + h * 0.1), hand])
        gx, gy = hand
        d.polygon([(gx, gy - lw * 1.1), (gx + facing * h * 0.13, gy - lw * 1.1), (gx + facing * h * 0.13, gy - lw * 0.1),
                   (gx + facing * h * 0.03, gy - lw * 0.1), (gx + facing * h * 0.035, gy + h * 0.06), (gx - facing * h * 0.01, gy + h * 0.06)], fill=c)
    elif pose == "punch":
        arm(near, [(x + facing * h * 0.5, sh_y - h * 0.01)])
        arm(far, [(x + facing * h * 0.02, sh_y + h * 0.15), (x + facing * h * 0.12, sh_y + h * 0.02)])
    elif pose == "fight":
        arm(near, [(x + facing * h * 0.18, sh_y + h * 0.16), (x + facing * h * 0.2, sh_y - h * 0.02)])
        arm(far, [(x - facing * h * 0.05, sh_y + h * 0.2), (x + facing * h * 0.1, sh_y + h * 0.05)])
    elif pose == "walk":
        a = math.sin(phase) * h * 0.12
        arm(near, [(x + a * 0.6, sh_y + h * 0.17), (x + a, sh_y + h * 0.33)])
        arm(far, [(x - a * 0.6, sh_y + h * 0.17), (x - a, sh_y + h * 0.33)])
    else:  # stand / hood
        arm(near, [(x + facing * sw * 1.05, sh_y + h * 0.17), (x + facing * sw * 0.9, sh_y + h * 0.32)])
        arm(far, [(x - facing * sw * 1.05, sh_y + h * 0.17), (x - facing * sw * 0.9, sh_y + h * 0.32)])


# ---------------------------------------------------------------- scenes
def scene_gate(people):
    a = vgrad(W, H, (16, 20, 18), (58, 62, 58))
    a = glow(a, 180, 120, 380, 70)
    a = glow(a, 800, 130, 260, 40)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    # ground
    d.polygon([(0, 390), (W, 390), (W, H), (0, H)], fill=(66, 70, 66))
    for i in range(9):
        y = 395 + i * i * 2.2
        d.line([(0, y), (W, y)], fill=(74, 78, 74), width=1)
    # perimeter wall
    d.rectangle([0, 210, 300, 395], fill=(86, 90, 86))
    d.rectangle([660, 210, W, 395], fill=(86, 90, 86))
    d.rectangle([0, 200, 310, 214], fill=(104, 108, 104))
    d.rectangle([650, 200, W, 214], fill=(104, 108, 104))
    # pillars
    for px in (300, 640):
        d.rectangle([px, 170, px + 22, 395], fill=(112, 116, 112))
        d.rectangle([px - 6, 162, px + 28, 174], fill=(124, 128, 124))
    # gate bars
    d.rectangle([322, 190, 640, 198], fill=(40, 44, 40))
    d.rectangle([322, 372, 640, 380], fill=(40, 44, 40))
    for gx in range(330, 640, 18):
        d.rectangle([gx, 190, gx + 5, 395], fill=(38, 42, 38))
    # lamp
    d.rectangle([170, 96, 192, 112], fill=(190, 196, 190))
    d.line([(181, 112), (181, 210)], fill=(60, 64, 60), width=4)
    # tree silhouette
    for r, cx, cy in ((90, 860, 120), (70, 920, 170), (80, 790, 160)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(30, 34, 30))
    for p in people:
        person(d, **p)
    return img


def scene_driveway(people):
    a = vgrad(W, H, (20, 22, 22), (70, 72, 70))
    a = glow(a, 480, 90, 420, 55)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.polygon([(0, 360), (W, 360), (W, H), (0, H)], fill=(78, 80, 78))
    # paving perspective lines
    for i in range(-8, 9):
        d.line([(480 + i * 40, 360), (480 + i * 150, H)], fill=(70, 72, 70), width=2)
    # house + garage door
    d.rectangle([90, 120, 870, 362], fill=(96, 98, 96))
    d.polygon([(70, 125), (480, 30), (890, 125)], fill=(52, 54, 52))
    d.rectangle([520, 190, 830, 362], fill=(122, 124, 122))
    for y in range(200, 362, 20):
        d.line([(520, y), (830, y)], fill=(104, 106, 104), width=3)
    d.rectangle([150, 180, 260, 280], fill=(150, 156, 150))
    d.line([(205, 180), (205, 280)], fill=(96, 98, 96), width=5)
    d.line([(150, 230), (260, 230)], fill=(96, 98, 96), width=5)
    # car
    d.rounded_rectangle([560, 300, 900, 430], 30, fill=(40, 42, 40))
    d.polygon([(610, 300), (650, 245), (800, 245), (850, 300)], fill=(36, 38, 36))
    d.polygon([(628, 298), (660, 256), (725, 256), (725, 298)], fill=(88, 92, 88))
    d.polygon([(735, 298), (735, 256), (795, 256), (832, 298)], fill=(88, 92, 88))
    for wx in (625, 835):
        d.ellipse([wx - 34, 400, wx + 34, 468], fill=(20, 22, 20))
        d.ellipse([wx - 16, 418, wx + 16, 450], fill=(70, 72, 70))
    for p in people:
        person(d, **p)
    return img


def scene_backdoor(people):
    a = vgrad(W, H, (14, 16, 16), (50, 52, 50))
    a = glow(a, 470, 170, 300, 85)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 400], fill=None)
    # brick wall texture
    for row, y in enumerate(range(20, 400, 26)):
        off = 0 if row % 2 else 40
        for x in range(-40 + off, W, 80):
            d.rectangle([x + 2, y + 2, x + 78, y + 24], outline=(44, 46, 44), width=1)
    # door with lit window
    d.rectangle([380, 140, 560, 400], fill=(74, 76, 74))
    d.rectangle([410, 165, 530, 250], fill=(196, 202, 196))
    d.line([(470, 165), (470, 250)], fill=(74, 76, 74), width=4)
    d.ellipse([532, 280, 544, 292], fill=(150, 154, 150))
    # porch light
    d.rectangle([590, 150, 608, 176], fill=(220, 226, 220))
    # steps + ground
    d.rectangle([350, 400, 590, 420], fill=(90, 92, 90))
    d.rectangle([330, 420, 610, 442], fill=(84, 86, 84))
    d.polygon([(0, 440), (W, 440), (W, H), (0, H)], fill=(62, 64, 62))
    # plant pots + bin
    for px in (300, 650):
        d.polygon([(px - 26, 400), (px + 26, 400), (px + 18, 440), (px - 18, 440)], fill=(58, 60, 58))
        d.ellipse([px - 40, 330, px + 40, 405], fill=(34, 36, 34))
    d.rounded_rectangle([760, 330, 840, 440], 8, fill=(48, 50, 48))
    for p in people:
        person(d, **p)
    return img


def scene_living(people):
    """Indoor, lights on, colour."""
    a = vgrad(W, H, (58, 52, 46), (92, 80, 68))
    a = glow(a, 760, 160, 260, 60)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.polygon([(0, 400), (W, 400), (W, H), (0, H)], fill=(104, 84, 66))
    for i in range(1, 12):
        d.line([(i * 90 - 40, 400), (i * 120 - 180, H)], fill=(96, 78, 60), width=2)
    # window
    d.rectangle([110, 90, 380, 300], fill=(24, 30, 44))
    d.rectangle([110, 90, 380, 300], outline=(140, 126, 110), width=8)
    d.line([(245, 90), (245, 300)], fill=(140, 126, 110), width=6)
    for sx, sy in ((150, 130), (300, 160), (200, 220), (340, 250)):
        d.ellipse([sx, sy, sx + 3, sy + 3], fill=(200, 200, 210))
    # sofa
    d.rounded_rectangle([380, 300, 760, 430], 26, fill=(60, 74, 92))
    d.rounded_rectangle([360, 330, 420, 440], 18, fill=(54, 66, 84))
    d.rounded_rectangle([720, 330, 780, 440], 18, fill=(54, 66, 84))
    d.rounded_rectangle([420, 350, 720, 400], 14, fill=(70, 86, 106))
    # lamp
    d.polygon([(730, 110), (790, 110), (805, 170), (715, 170)], fill=(232, 210, 160))
    d.line([(760, 170), (760, 300)], fill=(50, 44, 40), width=5)
    d.rectangle([740, 296, 780, 304], fill=(50, 44, 40))
    # rug + table
    d.ellipse([360, 440, 800, 520], fill=(120, 70, 60))
    d.rounded_rectangle([480, 430, 680, 455], 6, fill=(70, 50, 36))
    # picture frame
    d.rectangle([480, 140, 640, 240], fill=(160, 140, 110))
    d.rectangle([492, 152, 628, 228], fill=(70, 96, 110))
    for p in people:
        person(d, **p)
    return img


SCENES = {
    "gate": ("CAM 01", "FRONT GATE", scene_gate, True),
    "driveway": ("CAM 02", "DRIVEWAY", scene_driveway, True),
    "backdoor": ("CAM 03", "BACK DOOR", scene_backdoor, True),
    "living": ("CAM 04", "LIVING ROOM", scene_living, False),
}


# ---------------------------------------------------------------- camera look
def camera_look(img, cam, label, when, ir, seed, boxes=()):
    rnd = np.random.default_rng(seed)
    img = img.filter(ImageFilter.GaussianBlur(1.3))
    a = np.asarray(img).astype(np.float32)
    if ir:
        g = a.mean(axis=2, keepdims=True)
        a = np.concatenate([g * 0.92, g * 1.0, g * 0.95], axis=2)
        a = (a - 30) * 1.25 + 30
    yy, xx = np.mgrid[0:H, 0:W]
    vig = 1 - 0.55 * (((xx - W / 2) / (W / 1.6)) ** 2 + ((yy - H / 2) / (H / 1.4)) ** 2)
    a *= np.clip(vig, 0.35, 1)[..., None]
    a += rnd.normal(0, 7 if ir else 4, a.shape[:2])[..., None]
    a[::3] *= 0.94  # faint scanlines
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)

    for (x0, y0, x1, y1, text, colour) in boxes:
        L = 22
        for (cx, cy, dx, dy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
            d.line([(cx, cy), (cx + dx * L, cy)], fill=colour, width=4)
            d.line([(cx, cy), (cx, cy + dy * L)], fill=colour, width=4)
        d.rectangle([x0, y0, x1, y1], outline=colour, width=1)
        f = font(18, True)
        tw = d.textlength(text, font=f)
        d.rectangle([x0, y0 - 28, x0 + tw + 16, y0], fill=colour)
        d.text((x0 + 8, y0 - 25), text, font=f, fill=(255, 255, 255))

    f = font(20, True)
    d.text((18, 14), f"{cam}  {label}", font=f, fill=(235, 240, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    ts = when.strftime("%d-%m-%Y  %H:%M:%S")
    d.text((W - 18 - d.textlength(ts, font=f), 14), ts, font=f, fill=(235, 240, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    if int(time.time() * 2) % 2 == 0 or boxes:
        d.ellipse([18, H - 34, 32, H - 20], fill=(230, 40, 40))
    d.text((40, H - 38), "REC", font=f, fill=(235, 240, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    d.text((W - 150, H - 38), "IR  1080P", font=f, fill=(200, 205, 200), stroke_width=2, stroke_fill=(0, 0, 0))
    return img


# ---------------------------------------------------------------- outputs
RED, ORANGE, AMBER = (239, 68, 68), (249, 115, 22), (245, 158, 11)

SNAPSHOTS = {
    # name: scene, people, boxes
    "weapon_gate": ("gate", [dict(x=470, feet=470, h=300, pose="aim", shade=26, facing=1)],
                    [(392, 150, 640, 480, "WEAPON  96%", RED)]),
    "weapon_gate2": ("gate", [dict(x=560, feet=455, h=280, pose="aim", shade=30, facing=-1)],
                     [(380, 150, 640, 465, "WEAPON  91%", RED)]),
    "violence_drive": ("driveway", [dict(x=360, feet=480, h=270, pose="punch", shade=26, facing=1),
                                    dict(x=500, feet=486, h=262, pose="fight", shade=34, facing=-1)],
                       [(268, 196, 580, 492, "VIOLENCE  89%", ORANGE)]),
    "stranger_back": ("backdoor", [dict(x=300, feet=470, h=300, pose="hood", shade=24, facing=1)],
                      [(232, 150, 372, 482, "UNKNOWN FACE", AMBER)]),
    "stranger_gate": ("gate", [dict(x=250, feet=460, h=260, pose="hood", shade=28, facing=1)],
                      [(190, 182, 312, 470, "UNKNOWN FACE", AMBER)]),
    "stranger_drive": ("driveway", [dict(x=300, feet=470, h=250, pose="walk", shade=30, facing=1, phase=0.9)],
                       [(232, 210, 372, 480, "UNKNOWN FACE", AMBER)]),
}


def snapshot(name, when, w=640):
    scene, people, boxes = SNAPSHOTS[name]
    cam, label, fn, ir = SCENES[scene]
    img = camera_look(fn(people), cam, label, when, ir, seed=hash(name) & 0xFFFF, boxes=boxes)
    return img.resize((w, int(w * H / W)), Image.LANCZOS)


def live_frame(scene):
    cam, label, fn, ir = SCENES[scene]
    t = time.time()
    people = []
    if scene == "driveway":  # someone walks across, then leaves frame
        x = (t * 60) % 1500 - 200
        people = [dict(x=x, feet=470, h=230, pose="walk", shade=34, facing=1, phase=t * 5)]
    img = camera_look(fn(people), cam, label, datetime.now(), ir, seed=int(t * 10) & 0xFFFF)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82)
    return buf.getvalue()


PORTS = {8091: "gate", 8092: "driveway", 8093: "backdoor", 8094: "living"}


def serve():
    def handler_for(scene):
        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                body = live_frame(scene)
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass
        return H

    for port, scene in PORTS.items():
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler_for(scene))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        print(f"camera {scene} on http://127.0.0.1:{port}/shot.jpg", flush=True)
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    if sys.argv[1] == "snapshots":
        out = sys.argv[2]
        os.makedirs(out, exist_ok=True)
        now = datetime.now()
        for i, n in enumerate(SNAPSHOTS):
            snapshot(n, now - timedelta(minutes=7 * i)).save(f"{out}/{n}.jpg", quality=80)
        for s in SCENES:
            open(f"{out}/live_{s}.jpg", "wb").write(live_frame(s))
    else:
        serve()
