"""Kip's pixel wordmark, and every logo file made from it.

The logo is a 9 x 4 grid of squares (brand/kip-logo-original.svg, one square = 17.75 units).
Run from the repo root:  python3 brand/make_logo_assets.py
Writes the logo SVGs, the favicon set (web/public and landing) and the Mac app icon (desktop/build/icon.png).
"""
import io, os
from PIL import Image, ImageDraw, ImageFilter

GRID = [
    'X.X.X.XXX',
    'XX....X.X',
    'X.XXX.XXX',
    'X.X.XXX..',
]
COLS, ROWS = len(GRID[0]), len(GRID)
NAVY, WHITE = (18, 48, 122), (255, 255, 255)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cells = [(c, r) for r, row in enumerate(GRID) for c, ch in enumerate(row) if ch == 'X']

def path(cell=1, ox=0, oy=0):
    """One path: each row's runs of squares merged into rectangles, so there are no hairline seams."""
    d = []
    for r, row in enumerate(GRID):
        c = 0
        while c < COLS:
            if row[c] == 'X':
                s = c
                while c < COLS and row[c] == 'X': c += 1
                x, y, w = ox + s * cell, oy + r * cell, (c - s) * cell
                d.append(f'M{x:g} {y:g}h{w:g}v{cell:g}h{-w:g}z')
            else:
                c += 1
    return ''.join(d)

def svg_logo(fill):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {COLS} {ROWS}" shape-rendering="crispEdges"><path fill="{fill}" d="{path()}"/></svg>\n'

def tile(size, cell, radius=0, bg=NAVY, fg=WHITE):
    """The wordmark centred on a square, at a whole number of pixels per square so it stays crisp."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    g.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg) if radius else g.rectangle([0, 0, size, size], fill=bg)
    ox, oy = (size - COLS * cell) // 2, (size - ROWS * cell) // 2
    for c, r in cells:
        g.rectangle([ox + c * cell, oy + r * cell, ox + (c + 1) * cell - 1, oy + (r + 1) * cell - 1], fill=fg)
    return im

def write(rel, data):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(data, str): open(p, 'w').write(data)
    elif isinstance(data, bytes): open(p, 'wb').write(data)
    else: data.save(p)
    print('wrote', rel)

# logo files
write('brand/kip-logo.svg', svg_logo('#12307a'))
write('brand/kip-logo-white.svg', svg_logo('#ffffff'))

# favicon: white wordmark on a navy tile (32 grid, 3 px squares)
fav = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" rx="7" fill="#12307a"/><path fill="#fff" d="{path(3, 3, 10)}"/></svg>\n'
for site in ('web/public', 'landing'):
    write(f'{site}/favicon.svg', fav)
    ico = io.BytesIO()
    tile(48, 4, 10).save(ico, format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[tile(16, 1, 3), tile(32, 3, 7)])
    write(f'{site}/favicon.ico', ico.getvalue())
    write(f'{site}/apple-touch-icon.png', tile(180, 16))
    write(f'{site}/icon-192.png', tile(192, 16))
    write(f'{site}/icon-512.png', tile(512, 44))

# Mac app icon: the light rounded square Kip has always used, navy wordmark, a soft field of pixels top right
S, P, R = 1024, 100, 185
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([P, P + 18, S - P, S - P + 18], radius=R, fill=(13, 32, 72, 70))
icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
body = Image.new('RGBA', (S, S), (0, 0, 0, 0))
bg = ImageDraw.Draw(body)
bg.rounded_rectangle([P, P, S - P, S - P], radius=R, fill=(240, 246, 253, 255), outline=(222, 233, 245, 255), width=3)
for j in range(14):                      # the pixel field, fading in toward the top-right corner
    for i in range(18):
        x, y = 430 + i * 28, 110 + j * 28
        k = max(0.0, 1 - (((S - P - x) / 520) ** 2 + ((y - P) / 360) ** 2) ** 0.5)
        if k > 0.05:
            s = 4 + 4 * k
            bg.rectangle([x - s / 2, y - s / 2, x + s / 2, y + s / 2], fill=(42, 99, 212, int(110 * k)))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([P, P, S - P, S - P], radius=R, fill=255)
clip = Image.new('RGBA', (S, S), (0, 0, 0, 0)); clip.paste(body, (0, 0), mask)
icon.alpha_composite(clip)
mark = ImageDraw.Draw(icon)
cell = 56
ox, oy = (S - COLS * cell) // 2, (S - ROWS * cell) // 2
for c, r in cells:
    mark.rectangle([ox + c * cell, oy + r * cell, ox + (c + 1) * cell - 1, oy + (r + 1) * cell - 1], fill=NAVY)
write('desktop/build/icon.png', icon)
