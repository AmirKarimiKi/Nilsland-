"""Quick matte-clay front/side renders of the GLB for visual checks (software, no GPU)."""
import numpy as np, trimesh, cv2, sys
mesh = trimesh.load(sys.argv[1] if len(sys.argv) > 1 else 'assets-src/bust.glb', force='mesh')
def render(rotY, size=(560, 740)):
    R = trimesh.transformations.rotation_matrix(np.radians(rotY), [0, 1, 0])
    v = (mesh.vertices - [0, 0.72, 0]) @ R[:3, :3].T; n = mesh.vertex_normals @ R[:3, :3].T
    W, H = size; s = H / 1.6
    px = (v[:, 0] * s + W / 2).astype(int); py = (H / 2 - v[:, 1] * s).astype(int)
    img = np.full((H, W), 255, np.uint8); zb = np.full((H, W), -9.0)
    light = np.array([-0.4, 0.5, 0.8]); light /= np.linalg.norm(light)
    sh = np.clip(n @ light, 0, 1) * 0.75 + 0.2
    tri = v[mesh.faces]; fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    order = np.argsort(tri[:, :, 2].mean(1))
    for f in order:
        if fn[f, 2] <= 0: continue
        pts = np.stack([px[mesh.faces[f]], py[mesh.faces[f]]], 1).astype(np.int32)
        c = int(np.clip(sh[mesh.faces[f]].mean() * 215, 0, 255)); cv2.fillConvexPoly(img, pts, c)
    return img
cv2.imwrite('work/preview_front_side.png', np.hstack([render(0), render(-90), render(35)]))
