"""Step 1 of the local photo->bust reconstruction: person mask via GrabCut. Output: work/mask.png (2000x1500 scale)."""
import cv2, numpy as np, sys, os
os.makedirs('work', exist_ok=True)
img = cv2.imread('assets-src/reference-photo.jpg'); img = cv2.resize(img, (2000, 1500), interpolation=cv2.INTER_AREA)
small = cv2.resize(img, (1000, 750), interpolation=cv2.INTER_AREA)
mask = np.full(small.shape[:2], cv2.GC_PR_BGD, np.uint8)
# priors measured on the photo (1000x750 scale): sure background on the far left/right/top corners, sure person in the core
mask[:450, :250] = cv2.GC_BGD; mask[:450, 760:] = cv2.GC_BGD; mask[:, :120] = cv2.GC_BGD; mask[:, 930:] = cv2.GC_BGD; mask[:25] = cv2.GC_BGD
mask[120:700, 360:640] = cv2.GC_PR_FGD
mask[200:420, 400:600] = cv2.GC_FGD          # face + glasses
mask[140:260, 565:612] = cv2.GC_FGD; mask[140:260, 335:420] = cv2.GC_FGD   # hair on both sides
mask[600:750, 220:900] = cv2.GC_PR_FGD; mask[700:750, 330:860] = cv2.GC_FGD   # sweater / shoulders
bg = np.zeros((1, 65)); fg = np.zeros((1, 65))
cv2.grabCut(small, mask, None, bg, fg, 8, cv2.GC_INIT_WITH_MASK)
m = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m); k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = (lab == k).astype(np.uint8) * 255
# fill holes
ff = m.copy(); h, w = ff.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255); m = m | cv2.bitwise_not(ff)
m = cv2.resize(m, (2000, 1500), interpolation=cv2.INTER_LINEAR); m = (m > 127).astype(np.uint8) * 255
cv2.imwrite('work/mask.png', m)
ov = img.copy(); ov[m == 0] = (ov[m == 0] * 0.25).astype(np.uint8); cv2.imwrite('work/mask_overlay.jpg', cv2.resize(ov, (1000, 750)))
print('mask px', int((m > 0).sum()))
