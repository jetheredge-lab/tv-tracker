"""
Build CueList's icon set from the supplied mockup sheet.

The source is a marketing render, not an exported asset: the icon in it carries
a glossy bezel, a drop shadow, baked-in rounded corners and a lit gradient. Any
of those would look wrong once iOS or Android applies its own mask, so rather
than cropping the icon out, the cyan glyph is isolated by saturation and
recomposited on a flat brand background. The dark cut-outs inside the glyph
(clapper stripes, checkmarks, list rules) fall out for free as background
showing through, which is what they are in the original.
"""
import sys
from PIL import Image
import numpy as np
from scipy import ndimage

SRC = sys.argv[1]
OUT = sys.argv[2]

SLATE = (15, 23, 42)  # #0F172A - the brand's slate

def extract_glyph(path: str) -> Image.Image:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    # Saturated cyan only. The bezel is light but desaturated, so requiring red
    # to sit well below green excludes it without touching the glyph.
    cyan = (g > 120) & (b > 150) & (r < g - 45)

    # Stay inside the bezel entirely.
    inner = np.zeros_like(cyan)
    inner[95:600, 95:600] = True
    cyan &= inner

    # Drop stray specks: JPEG ringing around the glyph edges leaves a few
    # isolated blobs that read as dust once scaled down to a 48px favicon.
    labels, n = ndimage.label(cyan)
    if n > 1:
        sizes = ndimage.sum(cyan, labels, range(1, n + 1))
        keep = np.isin(labels, np.nonzero(sizes > sizes.max() * 0.02)[0] + 1)
        print(f"  components: {n}, kept {keep.sum() / max(cyan.sum(),1):.1%} of pixels")
        cyan = keep

    rgba = np.zeros(a.shape[:2] + (4,), dtype=np.uint8)
    rgba[..., :3] = a
    rgba[..., 3] = np.where(cyan, 255, 0)

    ys, xs = np.where(cyan)
    return Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def render(glyph: Image.Image, size: int, coverage: float, bg) -> Image.Image:
    """Centre the glyph on a square canvas, occupying `coverage` of the edge."""
    canvas = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    target = size * coverage
    gw, gh = glyph.size
    scale = target / max(gw, gh)
    gs = glyph.resize((max(1, round(gw * scale)), max(1, round(gh * scale))), Image.LANCZOS)
    canvas.paste(gs, ((size - gs.size[0]) // 2, (size - gs.size[1]) // 2), gs)
    return canvas


def silhouette(glyph: Image.Image, size: int) -> Image.Image:
    """Android notification icons must be a flat white shape on transparent."""
    g = glyph.copy()
    arr = np.asarray(g).copy()
    arr[..., :3] = 255
    white = Image.fromarray(arr, "RGBA")
    return render(white, size, 0.85, None)


glyph = extract_glyph(SRC)
print(f"  glyph extracted at {glyph.size[0]}x{glyph.size[1]}")

opaque = SLATE + (255,)
jobs = [
    # Full-bleed slate: iOS and the Play Store apply their own mask, so the
    # asset must be square and must not carry its own rounded corners.
    ("icon.png", 1024, 0.68, opaque),
    # Android adaptive foreground: the outer ~25% can be cropped by any mask
    # shape, so the glyph sits well inside the safe zone on transparent.
    ("adaptive-icon.png", 1024, 0.52, None),
    # Browser tab. Tighter framing because detail is lost at 48px.
    ("favicon.png", 48, 0.86, opaque),
    ("splash.png", 1284, 0.42, opaque),
]
for name, size, coverage, bg in jobs:
    img = render(glyph, size, coverage, bg)
    if bg is not None:
        img = img.convert("RGB")
    img.save(f"{OUT}/{name}")
    print(f"  {name:22} {size}x{size}")

silhouette(glyph, 96).save(f"{OUT}/notification-icon.png")
print("  notification-icon.png  96x96 (white silhouette)")

# Web home-screen additions - Expo's export emits none of these itself.
for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
    render(glyph, size, 0.72 if size > 180 else 0.80, opaque).convert("RGB").save(f"{OUT}/{name}")
    print(f"  {name:22} {size}x{size}")
