# Camera moves, captions, title and end cards, over the recorded frames.
# Frames are 2560x1440 (1280x720 CSS px at 2x); output is 1920x1080.
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
log = json.load(open(sys.argv[3]))
card = log['card']; ccx, ccy = card['x'] + card['w'] / 2, card['y'] + card['h'] / 2
FPS, OW, OH, S = 30, 1920, 1080, 2
F = '/usr/share/fonts/opentype/inter/Inter-'
font = lambda w, n: ImageFont.truetype(F + w + '.otf', n)
WIDE = (640, 360, 1.0)
CAM = [  # (t, cx, cy, zoom) in CSS px
    (0, *WIDE), (2.3, *WIDE), (2.9, 905, 470, 1.6), (3.9, 905, 470, 1.6), (4.6, *WIDE),
    (7.7, *WIDE), (8.7, 880, 430, 1.35), (11.3, 880, 430, 1.35), (12.0, *WIDE),
    (12.3, *WIDE), (12.9, 860, 500, 1.5), (14.5, 860, 500, 1.5), (15.2, *WIDE), (99, *WIDE)]
CAPS = [  # (start, end, text)
    (1.9, 6.35, 'Swipe ← in the air for the next page'),
    (6.45, 7.6, 'Swipe → to go back'),
    (7.75, 11.95, 'Zoom in, then pinch and drag the page'),
    (12.15, 15.2, 'Hold a fist to pause. The camera turns off.'),
]
ease = lambda u: u * u * (3 - 2 * u)
def cam(t):
    for a, b in zip(CAM, CAM[1:]):
        if a[0] <= t < b[0]:
            u = ease((t - a[0]) / (b[0] - a[0]))
            z = math.exp(math.log(a[3]) + (math.log(b[3]) - math.log(a[3])) * u)
            # move the centre so it feels like one smooth zoom
            k = (1 / a[3] - 1 / z) / (1 / a[3] - 1 / b[3]) if a[3] != b[3] else u
            return a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, z
    return WIDE
def fade(t, a, b, d=0.25):
    return max(0, min(1, (t - a) / d, (b - t) / d))
def pill(img, text, alpha, y=46):
    if alpha <= 0: return
    f = font('SemiBold', 34)
    d = ImageDraw.Draw(img)
    w = d.textlength(text, font=f)
    pad, h = 30, 72
    x0 = (OW - w) / 2 - pad
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    L = ImageDraw.Draw(layer)
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0, y + 8, x0 + w + 2 * pad, y + h + 8], h / 2, fill=(0, 0, 0, int(70 * alpha)))
    layer = Image.alpha_composite(layer, sh.filter(ImageFilter.GaussianBlur(14)))
    L = ImageDraw.Draw(layer)
    L.rounded_rectangle([x0, y, x0 + w + 2 * pad, y + h], h / 2, fill=(24, 27, 31, int(232 * alpha)))
    L.text((OW / 2, y + h / 2 - 1), text, font=f, fill=(255, 255, 255, int(255 * alpha)), anchor='mm')
    img.alpha_composite(layer)
def card_overlay(img, alpha, title, sub, url=None):
    if alpha <= 0: return
    blur = img.filter(ImageFilter.GaussianBlur(18 * alpha))
    veil = Image.new('RGBA', img.size, (246, 245, 241, int(215 * alpha)))
    out = Image.alpha_composite(blur, veil)
    t = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(t)
    a = int(255 * alpha)
    d.text((OW / 2, OH / 2 - 70), title, font=font('Bold', 104), fill=(31, 35, 40, a), anchor='mm')
    d.text((OW / 2, OH / 2 + 30), sub, font=font('Regular', 38), fill=(87, 96, 106, a), anchor='mm')
    if url: d.text((OW / 2, OH / 2 + 110), url, font=font('SemiBold', 32), fill=(3, 105, 161, a), anchor='mm')
    out.alpha_composite(t)
    img.paste(out)
frames = sorted(os.listdir(SRC))
frames = [f for f in frames if f.endswith('.png')]
for i, name in enumerate(frames):
    t = i / FPS
    im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    cx, cy, z = cam(t)
    w, h = 1280 / z, 720 / z
    cx = min(max(cx, w / 2), 1280 - w / 2); cy = min(max(cy, h / 2), 720 - h / 2)
    box = tuple(int(round(v * S)) for v in (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
    im = im.resize((OW, OH), Image.LANCZOS, box=box)
    for a, b, text in CAPS:
        pill(im, text, fade(t, a, b))
    card_overlay(im, 1 - min(1, max(0, (t - 1.3) / 0.45)), 'Turn the page', 'Read PDFs hands-free, with a wave of your hand')
    card_overlay(im, min(1, max(0, (t - 15.35) / 0.5)), 'Turn the page', 'Swipe, pinch and pause. Your camera never leaves your device.', 'amberandmuji.github.io/Turn-the-page')
    im.convert('RGB').save(os.path.join(OUT, name))
