"""Renders background.html to build/background.tiff (1x + 2x) for the installer window.
Usage (from desktop/): python3 build/dmg/render.py   (needs Python Playwright and Chrome)
"""
import os, subprocess
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
build = os.path.dirname(here)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    for scale, name in ((1, 'bg.png'), (2, 'bg@2x.png')):
        pg = b.new_page(viewport={'width': 660, 'height': 460}, device_scale_factor=scale)
        pg.goto('file://' + os.path.join(here, 'background.html'))
        pg.evaluate('document.fonts.ready')
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(here, name))
    b.close()
subprocess.run(['tiffutil', '-cathidpicheck', os.path.join(here, 'bg.png'), os.path.join(here, 'bg@2x.png'), '-out', os.path.join(build, 'background.tiff')], check=True)
print('wrote', os.path.join(build, 'background.tiff'))
