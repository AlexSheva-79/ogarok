"""Готовит картинки игры из исходников GPT (фон маджента #FF00FF).
Запуск: python3 tools/prepare_assets.py <папка с исходниками>
"""
import sys, os, numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage
SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'assets', 'img')
os.makedirs(OUT, exist_ok=True)

def load(name):
    return np.array(Image.open(os.path.join(SRC, name)).convert('RGB')).astype(int)

def key(im):
    """Убирает маджента-фон: мягкая альфа + подавление розового ореола."""
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    m = np.clip((np.minimum(R, B) - G - 60) / 60, 0, 1)
    a = (1 - m)
    rgb = im.copy().astype(float)
    spill = np.minimum(R, B) > G + 20
    rgb[..., 0] = np.where(spill, np.minimum(R, G + (R - G) / 3), R)
    rgb[..., 2] = np.where(spill, np.minimum(B, G + (B - G) / 3), B)
    # частичная прозрачность на краях — убираем розовый цвет совсем
    edge = (a < 0.98) & (a > 0)
    rgb[..., 0] = np.where(edge, np.minimum(rgb[..., 0], rgb[..., 1] + 30), rgb[..., 0])
    rgb[..., 2] = np.where(edge, np.minimum(rgb[..., 2], rgb[..., 1] + 30), rgb[..., 2])
    return np.dstack([rgb.clip(0, 255), a * 255]).astype(np.uint8)

def pieces(rgba, min_area=3000, pad=4):
    lab, n = ndimage.label(rgba[..., 3] > 50)
    out = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        area = (lab[s] == i + 1).sum()
        if area < min_area:
            continue
        y0, y1 = max(0, s[0].start - pad), min(rgba.shape[0], s[0].stop + pad)
        x0, x1 = max(0, s[1].start - pad), min(rgba.shape[1], s[1].stop + pad)
        crop = rgba[y0:y1, x0:x1].copy()
        mask = ndimage.binary_dilation(lab[y0:y1, x0:x1] == i + 1, iterations=3)
        crop[..., 3] = np.where(mask, crop[..., 3], 0)
        out.append(((x0, y0), Image.fromarray(crop, 'RGBA')))
    out.sort(key=lambda p: (p[0][1] // 200, p[0][0]))
    return out

def save(img, name, maxw=None, maxh=None, scale=None):
    if scale:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    if maxw and img.width > maxw:
        img = img.resize((maxw, round(img.height * maxw / img.width)), Image.LANCZOS)
    if maxh and img.height > maxh:
        img = img.resize((round(img.width * maxh / img.height), maxh), Image.LANCZOS)
    img.save(os.path.join(OUT, name), optimize=True)
    print(name, img.size)
    return img

# --- кладка башни: бесшовная текстура 512×512 ---
k = Image.open(os.path.join(SRC, 'кладка.png')).convert('RGB').resize((512, 512), Image.LANCZOS)
k.save(os.path.join(OUT, 'tower.jpg'), quality=88)

# --- бездна: склеиваем верх и низ, чтобы не было шва ---
b = np.array(Image.open(os.path.join(SRC, 'бездна.png')).convert('RGB')).astype(float)
h = b.shape[0]; band = 200
w = np.linspace(0, 1, band)[:, None, None]
out = b[:h - band].copy()
out[:band] = b[:band] * w + b[h - band:] * (1 - w)   # низ плавно перетекает в верх
b = out
Image.fromarray(b.clip(0, 255).astype(np.uint8)).resize((720, round(720 * b.shape[0] / b.shape[1])), Image.LANCZOS).save(os.path.join(OUT, 'abyss.jpg'), quality=85)

# --- болото ---
sw = key(load('болото.png'))
y0 = 250
save(Image.fromarray(sw[y0:], 'RGBA'), 'swamp.png', maxw=1080)

# --- ступеньки: из длинной плиты делаем короткую (концы + середина) ---
st = pieces(key(load('ступеньки.png')))
for (pos, img), name in zip(st, ['ledge', 'ledge_crumble', 'ledge_slime']):
    a = np.array(img)
    hh = a.shape[0]
    # высота плиты без потёков (по первой плите) ~ 240
    part = int(hh * 1.55)
    left, right = a[:, :part], a[:, -part:]
    out = np.concatenate([left, right], axis=1)
    save(Image.fromarray(out, 'RGBA'), name + '.png', maxw=300)

# --- дверь ---
save(pieces(key(load('дверь.png')))[0][1], 'door.png', maxw=260)

# --- ловушки: зубы закрыты / открыты / лифт ---
tr = pieces(key(load('ловушки.png')))
for (pos, img), name in zip(tr, ['teeth_closed', 'teeth_open', 'lift']):
    save(img, name + '.png', maxw=240)

# --- враги ---
en = pieces(key(load('враги.png')))
for (pos, img), name in zip(en, ['enemy_eye', 'enemy_blob', 'enemy_spike']):
    save(img, name + '.png', maxw=220)

# --- бонусы ---
bo = pieces(key(load('бонусы.png')))
for (pos, img), name in zip(bo, ['b_jump', 'b_tongue', 'b_shell', 'b_stone', 'b_magnet', 'b_burp']):
    save(img, name + '.png', maxw=160)

# --- интерфейс ---
ui = pieces(key(load('интерфейс.png')))
for (pos, img), name in zip(ui, ['ui_timer', 'ui_life', 'ui_slot', 'ui_play', 'ui_pause', 'ui_restart', 'ui_home', 'ui_sound', 'ui_mute']):
    save(img, name + '.png', maxw=180)

# --- вершина и название ---
save(pieces(key(load('вершина.png')))[0][1], 'top.png', maxw=800)
ti = key(load('название.png'))
ys, xs = np.where(ti[..., 3] > 50)
save(Image.fromarray(ti[max(0, ys.min() - 6):ys.max() + 6, max(0, xs.min() - 6):xs.max() + 6], 'RGBA'), 'title.png', maxw=1000)

# --- детали героя (кукла) ---
de = pieces(key(load('детали.png')), pad=2)
names = {}
for (pos, img) in de:
    names[pos] = img
# порядок по координатам на листе
def nearest(x, y):
    return min(names.items(), key=lambda kv: (kv[0][0] - x) ** 2 + (kv[0][1] - y) ** 2)[1]
parts = {
    'h_body': nearest(76, 148), 'h_candle': nearest(757, 144), 'h_flame': nearest(1253, 147),
    'h_lid': nearest(1204, 368), 'h_tongue': nearest(662, 415), 'h_leg': nearest(753, 616), 'h_arm': nearest(1157, 626),
}
HS = 0.4   # кукла в игре мельче исходника
for n, img in parts.items():
    save(img, n + '.png', scale=HS)

# глаз героя (для вспыхнувшей Великой Свечи): круг из тела
body = parts['h_body']; bx, by = 386, 160
eye = body.crop((bx - 90, by - 90, bx + 90, by + 90))
mk = Image.new('L', eye.size, 0); ImageDraw.Draw(mk).ellipse((6, 6, 174, 174), fill=255)
mk = mk.filter(ImageFilter.GaussianBlur(2))
e = Image.new('RGBA', eye.size, (0, 0, 0, 0)); e.paste(eye, (0, 0), mk)
save(e, 'eye.png', maxw=160)

# --- иконка: голова уменьшена под круглую маску Android ---
ic = Image.open(os.path.join(SRC, 'иконка.png')).convert('RGB')
def icon(size, shrink=0.70):
    a = np.array(ic).astype(float)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = Image.new('RGB', (size, size), tuple(int(v) for v in border.mean(0)))
    s = round(size * shrink)
    fg = ic.resize((s, s), Image.LANCZOS)
    yy, xx = np.mgrid[0:s, 0:s]
    r = np.hypot(xx - s / 2, yy - s / 2) / (s / 2)
    m = Image.fromarray((np.clip((1.0 - r) / 0.28, 0, 1) * 255).astype(np.uint8))
    bg.paste(fg, ((size - s) // 2, (size - s) // 2), m)
    return bg
icon(192).save(os.path.join(OUT, '..', 'icon-192.png'))
icon(512).save(os.path.join(OUT, '..', 'icon-512.png'))
res = os.path.join(ROOT, 'resources', 'android', 'res')
for d, (lg, fgs) in {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}.items():
    p = os.path.join(res, 'mipmap-' + d); os.makedirs(p, exist_ok=True)
    icon(lg, 0.80).save(os.path.join(p, 'ic_launcher.png'))
    r = icon(lg, 0.80).convert('RGBA'); m = Image.new('L', r.size, 0); ImageDraw.Draw(m).ellipse((0, 0, lg - 1, lg - 1), fill=255); r.putalpha(m)
    r.save(os.path.join(p, 'ic_launcher_round.png'))
    icon(fgs, 0.58).save(os.path.join(p, 'ic_launcher_foreground.png'))   # 66 из 108 dp видны всегда
os.makedirs(os.path.join(res, 'values'), exist_ok=True)
open(os.path.join(res, 'values', 'ic_launcher_background.xml'), 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#100A1A</color>\n</resources>\n')

# --- заставка: название на тёмном фоне ---
title = Image.open(os.path.join(OUT, 'title.png'))
for d, sz in {'drawable': (480, 320), 'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
              'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920), 'drawable-land-mdpi': (480, 320),
              'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280)}.items():
    p = os.path.join(res, d); os.makedirs(p, exist_ok=True)
    sp = Image.new('RGB', sz, (16, 10, 26))
    tw = int(min(sz[0] * 0.8, sz[1] * 0.8 * title.width / title.height))
    t = title.resize((tw, round(title.height * tw / title.width)), Image.LANCZOS)
    sp.paste(t, ((sz[0] - t.width) // 2, (sz[1] - t.height) // 2), t)
    sp.save(os.path.join(p, 'splash.png'))
print('готово')
