"""Overlay baked points / mesh silhouette on the reference photo to check fit (front, orthographic). Output: work/overlay_*.jpg"""
import numpy as np, cv2, json, trimesh
img = cv2.resize(cv2.imread('assets-src/reference-photo.jpg'), (2000, 1500), interpolation=cv2.INTER_AREA)
meta = json.load(open('public/assets/portrait-meta.json'))
b = np.fromfile('public/assets/portrait-points.bin', np.uint8).reshape(-1, 10)
pos = b[:, :6].copy().view('<u2').reshape(-1, 3) / 65535.0 - 0.5
kind = b[:, 9]; c = np.array(meta['center']); e = meta['extent']
m = pos * e + c                                   # model units
px = np.stack([m[:, 0] * 1000 + 1000, 1500 - m[:, 1] * 1000], 1)
ov = img.copy()
for k, col in [(0, (255, 255, 0)), (1, (0, 0, 255)), (2, (255, 0, 0))]:
    for x, y in px[kind == k][::6 if k == 0 else 1]:
        cv2.circle(ov, (int(x), int(y)), 2, col, -1)
cv2.imwrite('work/overlay_points.jpg', cv2.resize(ov, (1000, 750)))
# silhouette IoU of the mesh (front ortho) vs the photo person mask
mask = cv2.imread('work/mask.png', 0) > 0
mesh = trimesh.load('assets-src/bust.glb', force='mesh'); V = mesh.vertices
sil = np.zeros((1500, 2000), np.uint8)
tri = np.stack([V[mesh.faces][:, :, 0] * 1000 + 1000, 1500 - V[mesh.faces][:, :, 1] * 1000], 2).astype(np.int32)
for t in tri[::2]: cv2.fillConvexPoly(sil, t, 255)
sil = cv2.morphologyEx(sil, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
iou = (sil & mask).sum() / (sil | mask).sum(); print('front silhouette IoU vs photo mask: %.3f' % iou)
ov2 = img.copy(); ov2[sil & ~mask] = (0, 0, 255); ov2[mask & ~sil] = (255, 160, 0)
cv2.imwrite('work/overlay_silhouette.jpg', cv2.resize(ov2, (1000, 750)))
