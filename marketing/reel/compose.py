"""Composes the 40s vertical promo reel from the recorded clips.

  python compose.py            -> out/secreteye-reel.mp4 (1080x1920, 30fps, H.264 + AAC)
  python compose.py --preview  -> a few still frames in work/preview/
"""
import functools
import json
import math
import os
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, "work", "clips")
FFMPEG = os.path.join(HERE, "node_modules", "ffmpeg-static", "ffmpeg.exe")
FONTS = os.path.join(HERE, "..", "..", "mobile", "node_modules", "@expo-google-fonts", "inter")
LOGO = os.path.join(HERE, "..", "..", "mobile", "assets", "images", "logo.png")

W, H, FPS, DUR = 1080, 1920, 30, 40.0
BG = (11, 18, 32)
ACCENT = (34, 211, 238)
DANGER = (239, 68, 68)
OK = (34, 197, 94)
TEXT = (229, 231, 235)
MUTED = (148, 163, 184)

# phone geometry (at scale 1)
CSS_W, CSS_H, STATUS = 390, 844, 40          # recorded viewport + fake status bar (css px)
SCR_W = 600                                   # on-screen width of the phone display
K = SCR_W / CSS_W                             # css px -> output px
SCR_H = round((CSS_H + STATUS) * K)
BEZEL = 16
PH_W, PH_H = SCR_W + BEZEL * 2, SCR_H + BEZEL * 2
PHONE_CX, PHONE_CY = W / 2, 1150             # phone centre at rest
MAXS = 1.6                                    # largest zoom we prepare assets for


def font(weight, size):
    name = {"regular": "400Regular", "medium": "500Medium", "semibold": "600SemiBold", "bold": "700Bold",
            "extrabold": "800ExtraBold", "black": "900Black"}[weight]
    return ImageFont.truetype(os.path.join(FONTS, name, f"Inter_{name}.ttf"), size)


# ---------------------------------------------------------------- easing / helpers
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):  # easeInOutCubic
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ramp(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def keyed(t, keys):
    """keys: [(time, value)] -> eased interpolation (value may be tuple)."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            p = ease((t - t0) / (t1 - t0))
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * p for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * p
    return keys[-1][1]


# ---------------------------------------------------------------- clips
class Clip:
    def __init__(self, name, segments):
        self.name = name
        self.dir = os.path.join(CLIPS, name)
        m = json.load(open(os.path.join(self.dir, "meta.json")))
        self.t0 = m["t0"]
        self.frames = [(f["t"] - self.t0, f["file"]) for f in m["frames"]]
        self.taps = [(x["t"] - self.t0, x["x"], x["y"]) for x in m["taps"]]
        self.holds = [(x["t"] - self.t0, x["x"], x["y"], x["ms"] / 1000) for x in m["holds"]]
        self.segments = segments  # [(src_a, src_b, speed)]
        self.duration = sum((b - a) / s for a, b, s in segments)

    def src_time(self, local):
        acc = 0.0
        for a, b, s in self.segments:
            d = (b - a) / s
            if local <= acc + d:
                return a + (local - acc) * s
            acc += d
        a, b, s = self.segments[-1]
        return b

    def out_time(self, src):
        """Inverse map (None if src isn't shown)."""
        acc = 0.0
        for a, b, s in self.segments:
            if a <= src <= b:
                return acc + (src - a) / s
            acc += (b - a) / s
        return None

    @functools.lru_cache(maxsize=8)
    def image(self, file):
        return Image.open(os.path.join(self.dir, file)).convert("RGB")

    def frame_at(self, src):
        f = self.frames[0][1]
        for t, name in self.frames:
            if t <= src:
                f = name
            else:
                break
        return self.image(f)


# ---------------------------------------------------------------- timeline
# (clip, segments, headline, subline, camera keys [(local_t, scale, (fx, fy) css focus)])
SCENES = [
    ("welcome", [(0.3, 3.5, 1)], "Meet *SecretEye*", "AI home security in your pocket",
     [(0, 1.0, None)]),
    ("home", [(0.8, 5.2, 1)], "Your home *at a glance*", "Arm, monitor and stay in control",
     [(0, 1.0, None), (4.4, 1.04, None)]),
    ("cameras", [(0.4, 6.2, 1)], "Live from *every camera*", "Watch your home from anywhere",
     [(0, 1.0, None), (3.3, 1.0, None), (4.4, 1.42, (195, 150)), (5.8, 1.46, (195, 150))]),
    ("alert", [(3.0, 10.2, 1)], "^Threat detected.^ Instantly.", "AI spots weapons, violence & strangers",
     [(0, 1.0, None), (0.5, 1.22, (195, 40)), (2.1, 1.22, (195, 40)), (2.9, 1.0, None),
      (3.4, 1.0, None), (4.3, 1.45, (195, 165)), (5.9, 1.45, (195, 165)), (7.2, 1.0, None)]),
    ("alerts", [(0.4, 4.4, 1)], "Evidence, *organised*", "Every alert saved with its snapshot",
     [(0, 1.0, None), (4.0, 1.03, None)]),
    ("trusted", [(1.6, 4.8, 1)], "Knows *who belongs*", "Trusted faces never raise an alarm",
     [(0, 1.0, None), (3.2, 1.03, None)]),
    ("sos", [(0.5, 3.4, 1), (3.4, 6.2, 2), (6.2, 7.7, 1)], "One hold. ^Help is coming.^", "SOS reaches the control centre instantly",
     [(0, 1.0, None), (0.5, 1.3, (195, 200)), (2.6, 1.3, (195, 200)), (3.4, 1.0, None)]),
]
INTRO_END = 3.0
XFADE = 0.28
_t = INTRO_END
TIMELINE = []
for name, segs, h1, h2, cam in SCENES:
    c = Clip(name, segs)
    TIMELINE.append(dict(clip=c, start=_t, end=_t + c.duration, h1=h1, h2=h2, cam=cam))
    _t += c.duration
OUTRO_START = _t
assert OUTRO_START < DUR - 2.5, OUTRO_START


def scene_at(t):
    for i, s in enumerate(TIMELINE):
        if s["start"] <= t < s["end"]:
            return i, s
    return None, None


def event_times():
    """Absolute times of taps, holds and key moments (for SFX + overlays)."""
    taps, holds = [], []
    for s in TIMELINE:
        c = s["clip"]
        for t, x, y in c.taps:
            o = c.out_time(t)
            if o is not None:
                taps.append((s["start"] + o, s, x, y))
        for t, x, y, d in c.holds:
            o = c.out_time(t)
            if o is not None:
                holds.append((s["start"] + o, s, x, y, d))
    return taps, holds


TAPS, HOLDS = event_times()
SC = {s["clip"].name: s for s in TIMELINE}
ALERT_T = SC["alert"]["start"] + SC["alert"]["clip"].out_time(3.72)
SOS_SENT_T = SC["sos"]["start"] + SC["sos"]["clip"].out_time(3.0)
ACK_T = SC["sos"]["start"] + SC["sos"]["clip"].out_time(6.45)


# ---------------------------------------------------------------- static assets
def rounded_mask(w, h, r, ss=3):
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def build_phone(scale):
    """Phone body (RGBA) at a given scale, plus the screen rect inside it."""
    sw, sh = round(SCR_W * scale), round(SCR_H * scale)
    b = round(BEZEL * scale)
    pw, ph = sw + 2 * b, sh + 2 * b
    pad = round(60 * scale)
    img = Image.new("RGBA", (pw + 2 * pad, ph + 2 * pad), (0, 0, 0, 0))
    # soft shadow + accent glow
    sh_l = Image.new("L", img.size, 0)
    ImageDraw.Draw(sh_l).rounded_rectangle([pad, pad + 20 * scale, pad + pw, pad + ph + 20 * scale], 70 * scale, fill=170)
    sh_l = sh_l.filter(ImageFilter.GaussianBlur(36 * scale))
    img.paste((0, 0, 0, 255), (0, 0), sh_l)
    glow_l = Image.new("L", img.size, 0)
    ImageDraw.Draw(glow_l).rounded_rectangle([pad, pad, pad + pw, pad + ph], 70 * scale, fill=60)
    glow_l = glow_l.filter(ImageFilter.GaussianBlur(50 * scale))
    img.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", img.size, ACCENT).split(), glow_l)))
    # body
    body = Image.new("RGBA", (pw, ph), (18, 22, 30, 255))
    bd = ImageDraw.Draw(body)
    bd.rounded_rectangle([0, 0, pw - 1, ph - 1], 64 * scale, outline=(70, 82, 100, 255), width=max(2, round(3 * scale)))
    bd.rounded_rectangle([round(3 * scale), round(3 * scale), pw - 1 - round(3 * scale), ph - 1 - round(3 * scale)], 61 * scale,
                         outline=(8, 10, 14, 255), width=max(2, round(6 * scale)))
    img.paste(body, (pad, pad), rounded_mask(pw, ph, round(64 * scale)))
    # side buttons
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([pad + pw - 1, pad + 300 * scale, pad + pw + 5 * scale, pad + 400 * scale], 3 * scale, fill=(52, 60, 74, 255))
    d.rounded_rectangle([pad + pw - 1, pad + 440 * scale, pad + pw + 5 * scale, pad + 600 * scale], 3 * scale, fill=(52, 60, 74, 255))
    screen_rect = (pad + b, pad + b, sw, sh)
    return img, screen_rect, rounded_mask(sw, sh, round(50 * scale))


PHONE_HI, SCREEN_HI, SMASK_HI = build_phone(MAXS)


@functools.lru_cache(maxsize=1)
def status_bar():
    """Android-style status bar strip, css size 390 x STATUS at 2x."""
    s = 2
    img = Image.new("RGB", (CSS_W * s, STATUS * s), BG)
    d = ImageDraw.Draw(img)
    f = font("semibold", 15 * s)
    d.text((26 * s, 11 * s), "9:41", font=f, fill=TEXT)
    d.ellipse([(CSS_W / 2 - 6) * s, 12 * s, (CSS_W / 2 + 6) * s, 24 * s], fill=(2, 3, 5))
    x = (CSS_W - 26) * s
    d.rounded_rectangle([x - 24 * s, 13 * s, x, 25 * s], 3 * s, outline=TEXT, width=2)
    d.rectangle([x - 21 * s, 16 * s, x - 6 * s, 22 * s], fill=TEXT)
    for i in range(4):  # signal bars
        bx = x - 62 * s + i * 5 * s
        d.rectangle([bx, (24 - 3 * i - 3) * s, bx + 3 * s, 25 * s], fill=TEXT)
    d.pieslice([x - 44 * s, 11 * s, x - 28 * s, 27 * s], 225, 315, fill=TEXT)  # wifi
    return img


LOGO_IMG = Image.open(LOGO).convert("RGBA")
LOGO_IMG = LOGO_IMG.crop(LOGO_IMG.getbbox())
_dx = Image.open(os.path.join(HERE, "assets", "datix-logo.png")).convert("RGB").resize((120, 120), Image.LANCZOS)
DATIX_TILE = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
DATIX_TILE.paste(_dx, (0, 0), rounded_mask(120, 120, 28))


# ---------------------------------------------------------------- background
_yy, _xx = np.mgrid[0:H // 4, 0:W // 4].astype(np.float32)


def background(t, tint=(0, 0, 0), tint_amt=0.0):
    a = np.zeros((H // 4, W // 4, 3), np.float32)
    a[:] = BG
    # two drifting glows
    for cx, cy, r, col, amp in (
        (W / 8 + math.sin(t * 0.35) * 60, H / 8 + math.cos(t * 0.27) * 80, 220, ACCENT, 0.16),
        (W / 4 * 0.85 + math.cos(t * 0.31) * 40, H / 4 * 0.8 + math.sin(t * 0.22) * 70, 260, (59, 130, 246), 0.12),
    ):
        d = np.sqrt((_xx - cx / 1) ** 2 + (_yy - cy / 1) ** 2) / (r / 1)
        g = np.clip(1 - d, 0, 1) ** 2 * amp
        a += g[..., None] * (np.array(col, np.float32) - a)
    if tint_amt > 0:
        edge = np.clip(((_xx - W / 8) / (W / 8)) ** 2 + ((_yy - H / 8) / (H / 8)) ** 2, 0, 1)
        a += (edge * tint_amt)[..., None] * (np.array(tint, np.float32) - a)
    # faint grid
    a[::24, :] += 3
    a[:, ::24] += 3
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return img


# ---------------------------------------------------------------- text
def rich_text(draw, xy_center, text, fnt, base=TEXT, alpha=255):
    """*accent* and ^danger^ spans; centred."""
    parts, cur, mode = [], "", None
    for ch in text:
        if ch in "*^":
            if cur:
                parts.append((cur, mode))
            cur = ""
            mode = None if mode == ch else ch
        else:
            cur += ch
    if cur:
        parts.append((cur, mode))
    total = sum(draw.textlength(p, font=fnt) for p, _ in parts)
    x = xy_center[0] - total / 2
    for p, m in parts:
        col = ACCENT if m == "*" else DANGER if m == "^" else base
        draw.text((x, xy_center[1]), p, font=fnt, fill=col + (alpha,), anchor="ls")
        x += draw.textlength(p, font=fnt)


F_H1 = font("extrabold", 70)
F_H2 = font("medium", 36)


def caption_layer(t):
    i, s = scene_at(t)
    if s is None:
        return None
    layer = Image.new("RGBA", (W, 420), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a_in = ease_out(ramp(t, s["start"] + 0.12, s["start"] + 0.55))
    a_out = 1 - ramp(t, s["end"] - 0.25, s["end"])
    a2_in = ease_out(ramp(t, s["start"] + 0.3, s["start"] + 0.75))
    al = a_in * a_out
    al2 = a2_in * a_out
    if al <= 0:
        return None
    y1 = 250 + (1 - a_in) * 40
    rich_text(d, (W / 2, y1), s["h1"], F_H1, alpha=round(255 * al))
    y2 = 318 + (1 - a2_in) * 30
    d.text((W / 2, y2), s["h2"], font=F_H2, fill=MUTED + (round(255 * al2),), anchor="ms")
    # accent underline that draws in
    lw = 120 * ease_out(ramp(t, s["start"] + 0.35, s["start"] + 0.9)) * a_out
    if lw > 1:
        d.rounded_rectangle([W / 2 - lw / 2, 360, W / 2 + lw / 2, 366], 3, fill=ACCENT + (round(255 * al),))
    return layer


# ---------------------------------------------------------------- phone frame
def screen_content(t):
    """Phone display (css 390 x (844+STATUS) at 2x) for absolute time t, with crossfades."""
    i, s = scene_at(t)
    if s is None:
        s = TIMELINE[-1] if t >= OUTRO_START else TIMELINE[0]
    c = s["clip"]
    local = clamp(t - s["start"], 0, c.duration)
    img = c.frame_at(c.src_time(local))
    if i is not None and i > 0 and local < XFADE:
        p = TIMELINE[i - 1]["clip"]
        prev = p.frame_at(p.src_time(p.duration))
        img = Image.blend(prev, img, ease(local / XFADE))
    full = Image.new("RGB", (CSS_W * 2, (CSS_H + STATUS) * 2), BG)
    full.paste(status_bar(), (0, 0))
    full.paste(img.resize((CSS_W * 2, CSS_H * 2)) if img.size != (CSS_W * 2, CSS_H * 2) else img, (0, STATUS * 2))
    return full, s


def draw_touches(screen, t, s):
    """Tap ripples / hold rings in screen (2x css) coordinates."""
    d = ImageDraw.Draw(screen, "RGBA")
    for tt, ss, x, y in TAPS:
        if ss is not s:
            continue
        dt = t - tt
        if -0.12 <= dt <= 0.55:
            X, Y = x * 2, (y + STATUS) * 2
            if dt < 0:  # finger approaching
                r = 34
                d.ellipse([X - r, Y - r, X + r, Y + r], fill=(255, 255, 255, round(90 * (1 + dt / 0.12))))
            else:
                p = dt / 0.55
                r = 34 + 50 * ease_out(p)
                d.ellipse([X - r, Y - r, X + r, Y + r], outline=(255, 255, 255, round(200 * (1 - p))), width=5)
                r2 = 30 * (1 - p * 0.5)
                d.ellipse([X - r2, Y - r2, X + r2, Y + r2], fill=(255, 255, 255, round(110 * (1 - p))))
    for tt, ss, x, y, dur in HOLDS:
        if ss is not s:
            continue
        c = ss["clip"]
        dt = t - tt
        if 0 <= dt <= dur + 0.3:
            X, Y = x * 2, (y + STATUS) * 2
            fade = 1 - ramp(dt, dur, dur + 0.3)
            r = 44
            d.ellipse([X - r, Y - r, X + r, Y + r], fill=(255, 255, 255, round(90 * fade)))
            pr = clamp(dt / 2.0)
            R = 300
            d.arc([X - R, Y - R, X + R, Y + R], -90, -90 + 360 * pr, fill=(255, 255, 255, round(230 * fade)), width=9)


def phone_layer(t):
    """Returns (rgba phone image, top-left position) or None."""
    if t < INTRO_END - 0.5 or t > DUR:
        return None
    screen, s = screen_content(t)
    draw_touches(screen, t, s)

    # camera: per-scene zoom keys with focus point
    scale, focus = 1.0, None
    if s is not None:
        local = t - s["start"]
        keys = s["cam"]
        scale = keyed(local, [(k[0], k[1]) for k in keys])
        # focus = nearest key with a focus defined, blended by zoom amount
        fks = [k for k in keys if k[2] is not None]
        if fks:
            focus = min(fks, key=lambda k: abs(k[0] - local))[2]
    # entrance / exit
    enter = ease_out(ramp(t, INTRO_END - 0.5, INTRO_END + 0.5))
    exit_ = ease(ramp(t, OUTRO_START, OUTRO_START + 0.8))
    scale *= (0.86 + 0.14 * enter) * (1 - 0.25 * exit_)
    float_y = math.sin(t * 1.3) * 6
    cy = PHONE_CY + (1 - enter) * 700 + float_y + exit_ * 250
    cx = PHONE_CX
    if focus is not None and scale > 1.0:
        z = (scale - 1.0) / 0.45
        fx = (focus[0] - CSS_W / 2) * K
        fy = (focus[1] + STATUS - (CSS_H + STATUS) / 2) * K
        cx -= fx * (scale - 1.0) * min(1, z * 1.6)
        cy -= fy * (scale - 1.0) * min(1, z * 1.6) - 120 * (scale - 1.0)

    f = scale / MAXS
    phone = PHONE_HI.resize((round(PHONE_HI.width * f), round(PHONE_HI.height * f)), Image.BILINEAR)
    sx, sy, sw, sh = SCREEN_HI
    sx, sy, sw, sh = round(sx * f), round(sy * f), round(sw * f), round(sh * f)
    scr = screen.resize((sw, sh), Image.LANCZOS)
    phone.paste(scr, (sx, sy), SMASK_HI.resize((sw, sh), Image.BILINEAR))
    alpha = enter * (1 - exit_)
    if alpha < 1:
        a = phone.getchannel("A").point(lambda v: round(v * alpha))
        phone.putalpha(a)
    return phone, (round(cx - phone.width / 2), round(cy - phone.height / 2))


# ---------------------------------------------------------------- intro / outro
F_BRAND = font("extrabold", 112)
F_TAG = font("medium", 40)
F_SMALL = font("semibold", 30)


def brand_layer(t):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if t < INTRO_END + 0.2:
        out = 1 - ramp(t, INTRO_END - 0.55, INTRO_END - 0.05)
        # scan line sweep
        sy = ease(ramp(t, 0.1, 1.3)) * H
        if 0.1 < t < 1.35:
            for k in range(26):
                a = round(120 * (1 - k / 26) * out)
                d.line([(0, sy - k * 3), (W, sy - k * 3)], fill=ACCENT + (a,), width=3)
        p = ease_out(ramp(t, 0.45, 1.35))
        if p > 0:
            size = round(360 * (0.7 + 0.3 * p))
            logo = LOGO_IMG.resize((size, round(size * LOGO_IMG.height / LOGO_IMG.width)), Image.LANCZOS)
            a = logo.getchannel("A").point(lambda v: round(v * p * out))
            logo.putalpha(a)
            glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            gx, gy = W // 2 - logo.width // 2, 760 - logo.height // 2
            glow.paste(Image.new("RGBA", logo.size, ACCENT + (255,)), (gx, gy), a)
            layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))
            layer.alpha_composite(logo, (gx, gy))
        q = ease_out(ramp(t, 1.0, 1.7))
        if q > 0:
            al = round(255 * q * out)
            y = 1060 + (1 - q) * 40
            rich_text(d, (W / 2, y), "Secret*Eye*", F_BRAND, alpha=al)
        r = ease_out(ramp(t, 1.6, 2.2))
        if r > 0:
            d.text((W / 2, 1140), "AI that never sleeps.", font=F_TAG, fill=MUTED + (round(255 * r * out),), anchor="ms")
    if t >= OUTRO_START + 0.3:
        p = ease_out(ramp(t, OUTRO_START + 0.3, OUTRO_START + 1.1))
        size = round(300 * (0.8 + 0.2 * p))
        logo = LOGO_IMG.resize((size, round(size * LOGO_IMG.height / LOGO_IMG.width)), Image.LANCZOS)
        a = logo.getchannel("A").point(lambda v: round(v * p))
        logo.putalpha(a)
        gx, gy = W // 2 - logo.width // 2, 620 - logo.height // 2
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        glow.paste(Image.new("RGBA", logo.size, ACCENT + (255,)), (gx, gy), a)
        layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))
        layer.alpha_composite(logo, (gx, gy))
        q = ease_out(ramp(t, OUTRO_START + 0.6, OUTRO_START + 1.3))
        rich_text(d, (W / 2, 900 + (1 - q) * 40), "Secret*Eye*", F_BRAND, alpha=round(255 * q))
        r = ease_out(ramp(t, OUTRO_START + 0.9, OUTRO_START + 1.6))
        d.text((W / 2, 985), "Smart AI security for every home", font=F_TAG, fill=MUTED + (round(255 * r),), anchor="ms")
        # feature pills
        u = ease_out(ramp(t, OUTRO_START + 1.2, OUTRO_START + 1.9))
        pills = ["Weapon detection", "Live cameras", "One-tap SOS"]
        widths = [d.textlength(x, font=F_SMALL) + 56 for x in pills]
        x = W / 2 - (sum(widths) + 24 * 2) / 2
        for txt, w_ in zip(pills, widths):
            y0 = 1060 + (1 - u) * 30
            d.rounded_rectangle([x, y0, x + w_, y0 + 64], 32, fill=(19, 28, 46, round(255 * u)), outline=(36, 50, 74, round(255 * u)), width=2)
            d.text((x + w_ / 2, y0 + 43), txt, font=F_SMALL, fill=TEXT + (round(255 * u),), anchor="ms")
            x += w_ + 24
        # CTA
        v = ease_out(ramp(t, OUTRO_START + 1.6, OUTRO_START + 2.3))
        bw, bh = 640, 112
        y0 = 1260 + (1 - v) * 40
        d.rounded_rectangle([W / 2 - bw / 2, y0, W / 2 + bw / 2, y0 + bh], 56, fill=ACCENT + (round(255 * v),))
        d.text((W / 2, y0 + 72), "Coming soon on Google Play", font=font("bold", 38), fill=(4, 47, 58, round(255 * v)), anchor="ms")
        # developer credit
        c = ease_out(ramp(t, OUTRO_START + 1.4, OUTRO_START + 2.0))
        if c > 0:
            al = round(255 * c)
            y0 = 1530 + (1 - c) * 30
            d.line([(W / 2 - 200, y0), (W / 2 + 200, y0)], fill=(36, 50, 74, al), width=2)
            d.text((W / 2, y0 + 62), "DEVELOPED BY", font=font("semibold", 26), fill=MUTED + (al,), anchor="ms")
            fb = font("extrabold", 64)
            tw = d.textlength("Datix AI", font=fb)
            gx = round(W / 2 - (120 + 28 + tw) / 2)
            tile = DATIX_TILE.copy()
            tile.putalpha(tile.getchannel("A").point(lambda v_: round(v_ * c)))
            layer.alpha_composite(tile, (gx, round(y0 + 95)))
            d.text((gx + 148, y0 + 178), "Datix AI", font=fb, fill=TEXT + (al,), anchor="ls")
            d.text((W / 2, y0 + 270), "datixai.com", font=font("semibold", 32), fill=ACCENT + (al,), anchor="ms")
    return layer


# ---------------------------------------------------------------- frame
@functools.lru_cache(maxsize=1)
def vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = ((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2
    return Image.fromarray(np.clip(v * 150, 0, 150).astype(np.uint8))


def render(t):
    # colour pulses: red on threat alert, green when help is on the way
    tint, amt = (0, 0, 0), 0.0
    if ALERT_T - 0.05 <= t <= ALERT_T + 1.4:
        tint, amt = DANGER, 0.55 * (1 - ramp(t, ALERT_T + 0.1, ALERT_T + 1.4)) * ramp(t, ALERT_T - 0.05, ALERT_T + 0.1)
    if SOS_SENT_T - 0.05 <= t <= SOS_SENT_T + 1.4:
        tint, amt = DANGER, 0.45 * (1 - ramp(t, SOS_SENT_T + 0.1, SOS_SENT_T + 1.4))
    if ACK_T - 0.05 <= t <= ACK_T + 1.6:
        tint, amt = OK, 0.4 * (1 - ramp(t, ACK_T + 0.1, ACK_T + 1.6))
    frame = background(t, tint, amt).convert("RGBA")

    pl = phone_layer(t)
    if pl:
        frame.alpha_composite(pl[0], (max(0, pl[1][0]), max(0, pl[1][1])), (max(0, -pl[1][0]), max(0, -pl[1][1])))
    cap = caption_layer(t)
    if cap:
        # dark scrim so captions stay readable over a zoomed phone
        scrim = Image.new("RGBA", (W, 460), (0, 0, 0, 0))
        sa = np.linspace(200, 0, 460).astype(np.uint8)
        scrim.putalpha(Image.fromarray(np.repeat(sa[:, None], W, axis=1)))
        scrim_rgb = Image.new("RGBA", (W, 460), BG + (255,))
        scrim_rgb.putalpha(scrim.getchannel("A"))
        frame.alpha_composite(scrim_rgb, (0, 0))
        frame.alpha_composite(cap, (0, 0))
    frame.alpha_composite(brand_layer(t))
    # vignette + fades
    frame = frame.convert("RGB")
    frame = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), frame, vignette())
    fade = min(ramp(t, 0, 0.35), 1 - ramp(t, DUR - 0.5, DUR))
    if fade < 1:
        frame = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), frame, fade)
    return frame


# ---------------------------------------------------------------- audio
SR = 48000


def synth_audio(path):
    n = int(DUR * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2), np.float32)
    rng = np.random.default_rng(7)

    def add(sig, start, gain=1.0, pan=0.0):
        i = int(start * SR)
        if i >= n:
            return
        sig = sig[: n - i] * gain
        out[i:i + len(sig), 0] += sig * (1 - max(0, pan))
        out[i:i + len(sig), 1] += sig * (1 + min(0, pan))

    def lowpass(x, cutoff):
        a = math.exp(-2 * math.pi * cutoff / SR)
        y = np.empty_like(x)
        acc = 0.0
        # vectorised one-pole via lfilter-like recursion in chunks
        for i in range(0, len(x), 4096):
            seg = x[i:i + 4096]
            for j, v in enumerate(seg):
                acc = (1 - a) * v + a * acc
                y[i + j] = acc
        return y

    # pad: A minor drone with slow swell
    env = np.clip(t / 2.5, 0, 1) * (1 - np.clip((t - (DUR - 2.5)) / 2.5, 0, 1))
    pad = np.zeros(n, np.float32)
    for f, g in ((55, 0.5), (110, 0.35), (164.8, 0.22), (220, 0.18), (261.6, 0.12), (329.6, 0.08)):
        for det in (-0.6, 0.6):
            pad += g * np.sin(2 * math.pi * (f + det) * t + rng.uniform(0, 6))
    pad *= env * (0.75 + 0.25 * np.sin(2 * math.pi * t / 8))
    out[:, 0] += pad * 0.10
    out[:, 1] += pad * 0.10

    bpm = 100
    beat = 60 / bpm
    # kick
    kt = np.arange(int(0.45 * SR)) / SR
    kick = np.sin(2 * math.pi * (45 * kt + (110 / 18) * (1 - np.exp(-18 * kt)))) * np.exp(-kt * 7)
    # hat
    ht = np.arange(int(0.06 * SR)) / SR
    hat = rng.normal(0, 1, len(ht)) * np.exp(-ht * 70)
    hat = hat - np.convolve(hat, np.ones(6) / 6, mode="same")
    b = INTRO_END
    while b < OUTRO_START + 1.0:
        add(kick, b, 0.55)
        if b > TIMELINE[1]["start"]:
            add(hat, b + beat / 2, 0.16, pan=0.3)
        b += beat
    # sub bass pulse on beats (A)
    bt = np.arange(int(beat * SR)) / SR
    bass = np.sin(2 * math.pi * 55 * bt) * np.exp(-bt * 3) * 0.25
    b = INTRO_END
    while b < OUTRO_START:
        add(bass, b, 1.0)
        b += beat * 2

    # risers into the reveal and the outro
    def riser(d):
        rt = np.arange(int(d * SR)) / SR
        noise = rng.normal(0, 1, len(rt)).astype(np.float32)
        x = noise * (rt / d) ** 2
        tone = np.sin(2 * math.pi * (200 + 900 * (rt / d) ** 2) * rt) * (rt / d) ** 3 * 0.4
        return (x * 0.25 + tone) * 0.5

    add(riser(1.4), INTRO_END - 1.4, 0.8)
    add(riser(1.0), OUTRO_START - 1.0, 0.6)

    # impacts
    it = np.arange(int(1.6 * SR)) / SR
    boom = (np.sin(2 * math.pi * (38 + 60 * np.exp(-it * 12)) * it) * np.exp(-it * 2.6)
            + rng.normal(0, 1, len(it)) * np.exp(-it * 18) * 0.3)
    for at, g in ((INTRO_END, 0.9), (ALERT_T, 0.7), (OUTRO_START + 0.3, 0.9)):
        add(boom.astype(np.float32), at, g)

    # UI taps
    ct = np.arange(int(0.05 * SR)) / SR
    click = (np.sin(2 * math.pi * 1800 * ct) * np.exp(-ct * 160)).astype(np.float32)
    for at, *_ in TAPS:
        add(click, at, 0.35)

    # alert chime (two tones) and SOS / acknowledgement cues
    def tone(f, d, decay=6):
        tt = np.arange(int(d * SR)) / SR
        return (np.sin(2 * math.pi * f * tt) * np.exp(-tt * decay) + 0.3 * np.sin(2 * math.pi * 2 * f * tt) * np.exp(-tt * decay * 1.5)).astype(np.float32)

    add(tone(988, 0.5), ALERT_T + 0.05, 0.35)
    add(tone(740, 0.6), ALERT_T + 0.22, 0.35)
    for at, *_ in HOLDS:  # heartbeat-like pulses while holding
        for k in range(3):
            add(kick, at + k * 0.7, 0.35)
    add(tone(880, 0.4), SOS_SENT_T, 0.3)
    add(tone(523, 0.9, 3), ACK_T, 0.25)
    add(tone(659, 0.9, 3), ACK_T + 0.12, 0.25)
    add(tone(784, 1.2, 2.5), ACK_T + 0.24, 0.25)

    # outro chord
    ot = np.arange(int(3.2 * SR)) / SR
    chord = sum(np.sin(2 * math.pi * f * ot) for f in (220, 277.2, 329.6, 440)) * np.exp(-ot * 1.1) * 0.12
    add(chord.astype(np.float32), OUTRO_START + 0.3)

    # master: gentle limiter + fade
    out *= 0.8 / max(1e-6, np.abs(out).max())
    out = np.tanh(out * 1.4) / np.tanh(1.4)
    fade = np.minimum(np.clip(t / 0.3, 0, 1), np.clip((DUR - t) / 0.6, 0, 1))[:, None]
    out *= fade
    pcm = (out * 32767 * 0.9).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- main
def main():
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    if "--preview" in sys.argv:
        pdir = os.path.join(HERE, "work", "preview")
        os.makedirs(pdir, exist_ok=True)
        ts = [float(x) for x in sys.argv[2:]] or [1.6, 4.5, 8.0, 15.5, 17.4, 20.5, 25.0, 29.0, 33.0, 35.6, 38.8]
        for x in ts:
            render(x).save(os.path.join(pdir, f"t{x:05.1f}.jpg"), quality=88)
        print("preview frames ->", pdir)
        return
    wav = os.path.join(HERE, "work", "music.wav")
    synth_audio(wav)
    mp4 = os.path.join(HERE, "out", "secreteye-reel.mp4")
    cmd = [FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", mp4]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    total = int(DUR * FPS)
    for i in range(total):
        proc.stdin.write(render(i / FPS).tobytes())
        if i % 60 == 0:
            print(f"frame {i}/{total}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("wrote", mp4)


if __name__ == "__main__":
    main()
