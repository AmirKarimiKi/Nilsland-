"""Step 2: silhouette-driven faceless clay bust from the photo mask -> assets-src/bust.glb (untextured, Y up, face +Z).

Method (single photo, so depth is INFERRED, not measured):
  * per image row: centre + half-width come from the person mask (head contour, hair mass, jaw/neck, collar, shoulders)
  * ears are removed (rows 500-800 opened along the vertical axis), facial detail is NOT modelled (faceless clay bust)
  * each row becomes a superellipse cross-section; depth/width ratio and z-offset follow anatomical plausibility
  * marching cubes on the smooth implicit field -> closed watertight mesh
Model units: 1 unit = 1000 px of the 2000x1500 working image; x=(px-1000)/1000, y=(1500-py)/1000, z toward the viewer.
"""
import numpy as np, cv2, trimesh
from scipy.ndimage import gaussian_filter1d, grey_opening, gaussian_filter
from skimage import measure

m = cv2.imread('work/mask.png', 0) > 0
H, W = m.shape
ys = np.where(m.any(1))[0]; y0, y1 = ys[0], H - 1
xl = np.full(H, np.nan); xr = np.full(H, np.nan)
for y in range(y0, y1 + 1):
    xs = np.where(m[y])[0]
    if len(xs): xl[y], xr[y] = xs[0], xs[-1]
hw = (xr - xl) / 2; cx = (xr + xl) / 2
valid = ~np.isnan(hw)
hw = np.where(valid, hw, 0.0); cx = np.where(valid, cx, np.nanmean(cx))
# remove ears: opening along rows between 480 and 820 only
hw_o = grey_opening(hw, size=230)
w = np.zeros(H); w[480:820] = np.clip((np.arange(480, 820) - 480) / 40, 0, 1) * np.clip((820 - np.arange(480, 820)) / 40, 0, 1)
hw = hw * (1 - w) + np.minimum(hw, hw_o) * w
hw = gaussian_filter1d(hw, 14); hw[:260] = gaussian_filter1d(hw, 30)[:260]; cx = gaussian_filter1d(cx, 25)   # smooth contour, round the dome
cx[:] = np.where(np.arange(H) < 1100, gaussian_filter1d(cx, 60), cx)   # head/collar axis stays straight

def ramp(y, a, b, va, vb):
    t = np.clip((y - a) / (b - a), 0, 1); t = t * t * (3 - 2 * t); return va + (vb - va) * t
yy = np.arange(H).astype(float)
k = np.where(yy < 880, 1.12, ramp(yy, 880, 1060, 1.12, 0.95))            # depth/width ratio: head -> collar
k = np.where(yy > 1060, ramp(yy, 1100, 1380, 0.95, 0.50), k)             # collar -> shoulders (flatter)
n = ramp(yy, 600, 1300, 2.2, 3.0)                                        # squarer toward the chest
zc = ramp(yy, 880, 1100, 0.0, -0.12) * hw                                # collar sits slightly behind the head axis
zc = np.where(yy > 1100, ramp(yy, 1100, 1300, -0.12, -0.10) * hw, zc)
k = k * ramp(yy, 820, 1010, 1.0, 0.80) if False else k
k = np.where((yy > 780) & (yy < 1060), k * (1 - 0.18 * np.sin(np.clip((yy - 780) / 280, 0, 1) * np.pi / 2)), k)   # receding chin / jaw
roll = 1 + 0.10 * np.exp(-((yy - 900) / 55.0) ** 2)                                                              # turtleneck roll
hd = np.minimum(k * hw, 360.0) * roll
hw = hw * (1 + 0.04 * np.exp(-((yy - 900) / 55.0) ** 2))

# voxel field
S = 5.0                                          # px per voxel
xmin, xmax = 250, 1850; zr = 520
gx = np.arange(xmin, xmax, S); gz = np.arange(-zr, zr + S, S)
yrows = np.arange(y0 - 20, H + 20, S)          # padded so top/bottom close
F = np.full((len(yrows), len(gz), len(gx)), -1.0, np.float32)
X = gx[None, :]; Z = gz[:, None]
for i, y in enumerate(yrows):
    yi = int(np.clip(y, 0, H - 1))
    if y < y0 or y > H - 1 or hw[yi] < 3: continue
    u = (X - cx[yi]) / hw[yi]; v = (Z - zc[yi]) / hd[yi]
    r = (np.abs(u) ** n[yi] + np.abs(v) ** n[yi]) ** (1 / n[yi])
    F[i] = (1 - r).astype(np.float32)
F = gaussian_filter(F, 1.0)
verts, faces, normals, _ = measure.marching_cubes(F, 0.0, spacing=(S, S, S))
# verts: (row, z, x) in px steps -> model units
vy = yrows[0] + verts[:, 0]; vz = gz[0] + verts[:, 1]; vx = gx[0] + verts[:, 2]
V = np.stack([(vx - 1000) / 1000, (1500 - vy) / 1000, vz / 1000], 1)
mesh = trimesh.Trimesh(V, faces[:, ::-1], process=True)   # flip winding after axis swap
trimesh.smoothing.filter_taubin(mesh, iterations=12)
mesh.fix_normals()
print('watertight', mesh.is_watertight, 'verts', len(mesh.vertices), 'faces', len(mesh.faces), 'bounds', mesh.bounds.round(3).tolist())
assert mesh.is_watertight, 'mesh not closed'
_ = mesh.vertex_normals  
mesh.export('assets-src/bust.glb')
