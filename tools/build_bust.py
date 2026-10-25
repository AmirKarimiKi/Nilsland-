"""Step 2 (v2): faceless clay bust reconstructed from ONE photo -> assets-src/bust.glb (untextured, Y up, face +Z).

APPROXIMATION - single photo, so all depth is inferred, not measured:
  * HEAD volume  : row-wise contour from the photo mask WITHOUT the black sweater (hair outline, temples, cheeks, jaw, chin);
                   ears removed; depth comes from a hand-set anatomical profile (forehead, brow, cheek, chin recess, occiput, nape)
  * COLLAR+BODY  : row-wise contour of the dark sweater only (rolled turtleneck rising behind the jaw, sloping shoulders)
  * the two volumes are united (max of implicit fields) so the jaw sits in front of the collar
  * HAIR         : front/top tuft (brushed-up crest), side-part groove and diagonal strand relief, taken from the photo crop
  * NO eyes / nose / mouth / ears (faceless clay bust as in the tutorial)
Model units: 1 unit = 1000 px of the 2000x1500 working image; x=(px-1000)/1000, y=(1500-py)/1000, +z toward the viewer.
"""
import numpy as np, cv2, trimesh
from scipy.ndimage import gaussian_filter1d, grey_opening, gaussian_filter
from skimage import measure

img = cv2.resize(cv2.imread('assets-src/reference-photo.jpg'), (2000, 1500), interpolation=cv2.INTER_AREA)
person = cv2.imread('work/mask.png', 0) > 0
H, W = person.shape
dark = (img.max(2) < 88) & person
dark = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
head = person & ~dark
head[1100:] = False
head = cv2.morphologyEx(head.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(head); head = lab == (1 + np.argmax(st[1:, cv2.CC_STAT_AREA]))
head = cv2.morphologyEx(head.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8)).astype(bool)
head[860:, :640] = False; head[860:, 1290:] = False   # jaw rows: drop the bright-background tip beside the right collar (head is <= ~330 px from the axis there)
body = person.copy(); body[:840] = False   # collar top ~y840; contour from the person mask (a dark-pixel sliver at the right collar edge used to shift the axis -> spike)

def extents(mask, y_from, y_to):
    xl = np.zeros(H); xr = np.zeros(H); ok = np.zeros(H, bool)
    for y in range(y_from, y_to):
        xs = np.where(mask[y])[0]
        if len(xs) > 8: xl[y], xr[y], ok[y] = xs[0], xs[-1], True
    hw = np.where(ok, (xr - xl) / 2, 0.0); cx = np.where(ok, (xr + xl) / 2, np.nan)
    good = np.where(ok)[0]; cx = np.interp(np.arange(H), good, cx[good])
    return hw, cx
yy = np.arange(H).astype(float)
ramp = lambda a, b, va, vb: va + (vb - va) * (lambda t: t * t * (3 - 2 * t))(np.clip((yy - a) / (b - a), 0, 1))

# ---------------------------------------------------------------- head contour
hwH, cxH = extents(head, 60, 1100)
hwH_o = grey_opening(hwH, size=230)                       # ears off (rows 480-820 only)
w = np.zeros(H); r = np.arange(480, 820); w[480:820] = np.clip((r - 480) / 40, 0, 1) * np.clip((820 - r) / 40, 0, 1)
hwH = hwH * (1 - w) + np.minimum(hwH, hwH_o) * w
hwH = gaussian_filter1d(hwH, 16); hwH[:260] = gaussian_filter1d(hwH, 24)[:260]
cxH = gaussian_filter1d(cxH, 40)
# head depth profile (px; + toward the viewer). Forehead/brow/cheek front, chin recess, occiput bulge, nape, jaw underside.
fy = [300, 450, 560, 735, 880, 950, 1040]; fz = [290, 330, 355, 345, 305, 270, 205]
by = [300, 450, 600, 750, 850, 950, 1040]; bz = [-340, -395, -400, -340, -250, -120, 40]
zf = gaussian_filter1d(np.interp(yy, fy, fz), 12); zb = gaussian_filter1d(np.interp(yy, by, bz), 12)
dome = np.sqrt(np.clip(1 - ((300 - yy) / 235.0) ** 2, 0, 1)); dome = np.where(yy < 300, dome, 1.0)
zf = zf * dome; zb = zb * dome
zcH = (zf + zb) / 2; hdH = (zf - zb) / 2

# ---------------------------------------------------------------- collar + shoulders contour
hwB, cxB = extents(body, 840, H)
hwP, cxP = extents(person, 840, H)
hwB = np.minimum(hwB, hwP + 2); cxB = np.where(hwB > 0, cxB, cxP)   # never wider than the photo silhouette
hwB = gaussian_filter1d(hwB, 10); cxB = gaussian_filter1d(cxB, 30)
_s = np.clip((yy - 840) / 90.0, 0, 1); hwB = hwB * (0.80 + 0.20 * np.sqrt(1 - (1 - _s) ** 2))   # rounded collar top
rollB = 1 + 0.10 * np.exp(-((yy - 880) / 45.0) ** 2)     # turtleneck roll
bfy = [800, 1000, 1060, 1150, 1300, 1500]; bfz = [200, 215, 245, 255, 300, 330]
bby = [800, 1040, 1150, 1300, 1500]; bbz = [-270, -275, -280, -300, -330]
zfB = np.interp(yy, bfy, bfz); zbB = np.interp(yy, bby, bbz)
zcB = (zfB + zbB) / 2; hdB = (zfB - zbB) / 2 * rollB * (0.80 + 0.20 * np.sqrt(1 - (1 - _s) ** 2)); hwB = hwB * (1 + 0.5 * (rollB - 1))   # roll ring: +10% depth, +5% width at the collar top (after the silhouette clamp)
nB = ramp(800, 1300, 2.3, 3.0)

# ---------------------------------------------------------------- hair features (px, 2000x1500 working scale)
Y_HAIRLINE = 255
S = 5.0
xmin, xmax = 250, 1850; zr = 520
gx = np.arange(xmin, xmax, S); gz = np.arange(-zr, zr + S, S); yrows = np.arange(24, H + 24, S)
F = np.full((len(yrows), len(gz), len(gx)), -1.0, np.float32)
X = gx[None, :]; Z = gz[:, None]
def sup(u, v, n): return 1 - (np.abs(u) ** n + np.abs(v) ** n) ** (1 / n)
rng = np.random.RandomState(4)
ph = rng.uniform(0, 6.28, 3)
for i, y in enumerate(yrows):
    yi = int(np.clip(y, 0, H - 1)); f = np.full((len(gz), len(gx)), -1.0, np.float32)
    if hwH[yi] > 3 and 66 <= y < 1100:
        fh = sup((X - cxH[yi]) / hwH[yi], (Z - zcH[yi]) / max(hdH[yi], 1), 2.4)
        hairW = float(np.clip((Y_HAIRLINE + 30 - yi) / 60, 0, 1))                                  # top cap
        side = np.clip((np.abs(X - cxH[yi]) / hwH[yi] - 0.80) / 0.12, 0, 1) * (1 if yi < 520 else 0)  # sideburn band
        hw_map = np.maximum(hairW, side)
        if hw_map.max() > 0:
            s = 0.82 * (X - 1000) + 0.57 * (y - 150)                                                   # strands run up/right (photo)
            relief = 3.6 * np.sin(2 * np.pi * s / 40.0 + ph[0] + 1.5 * np.sin(2 * np.pi * (0.57 * (X - 1000) - 0.82 * (y - 150)) / 130)) + 2.4 * np.sin(2 * np.pi * (0.57 * (X - 1000) - 0.82 * (y - 150)) / 90 + ph[1])
            d = np.abs(0.82 * (X - 960) + 0.57 * (y - 200) + 0.0) / 1.0                              # side-part line (approx.) through (960,200)
            part = -6.0 * np.exp(-((0.57 * (X - 960) - 0.82 * (y - 200) - 20) ** 2) / (2 * 9.0 ** 2)) * np.clip((Y_HAIRLINE - y + 40) / 60, 0, 1)
            fh = fh + hw_map * (relief + part) / hwH[yi]
        f = fh.astype(np.float32)
    if hwB[yi] > 3 and 840 <= y <= H - 1:
        fb = sup((X - cxB[yi]) / hwB[yi], (Z - zcB[yi]) / hdB[yi], nB[yi]); f = np.maximum(f, fb.astype(np.float32))
    F[i] = f
F = gaussian_filter(F, 0.7)
verts, faces, _, _ = measure.marching_cubes(F, 0.0, spacing=(S, S, S))
vy = yrows[0] + verts[:, 0]; vz = gz[0] + verts[:, 1]; vx = gx[0] + verts[:, 2]
V = np.stack([(vx - 1000) / 1000, (1500 - vy) / 1000, vz / 1000], 1)
mesh = trimesh.Trimesh(V, faces[:, ::-1], process=True)
parts = mesh.split(only_watertight=False)
mesh = max(parts, key=lambda m: len(m.faces)); print('components', len(parts), 'kept faces', len(mesh.faces))
if not mesh.is_watertight:
    trimesh.repair.fill_holes(mesh); trimesh.repair.fix_winding(mesh)
assert mesh.is_watertight, 'marching-cubes mesh not closed (edges: %d)' % (len(mesh.edges_unique) - len(mesh.edges_unique[trimesh.grouping.group_rows(mesh.edges_sorted, require_count=2)]) if False else 0)
full = len(mesh.faces)
# (no decimation: keeps the mesh closed; ~500k faces at 5 px voxels)
trimesh.smoothing.filter_taubin(mesh, iterations=22)
mesh.fix_normals()
print('full faces', full, 'watertight after decimation', mesh.is_watertight, 'verts', len(mesh.vertices), 'faces', len(mesh.faces), 'bounds', mesh.bounds.round(3).tolist())
_ = mesh.vertex_normals
mesh.export('assets-src/bust.glb')
