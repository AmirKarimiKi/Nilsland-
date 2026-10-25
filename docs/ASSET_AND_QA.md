> **Teilweise überholt** durch `CORRECTED_SPEC_2026-10-25.md` (gesichtslose Tonbüste; kein Lächeln/keine Zähne modelliert).

# Asset & QA / completion checklist

## Files and ownership
- `assets-src/reference-photo.jpg`: ORIGINAL user-supplied photo; sole source of identity. Avoid deploying or publishing this photo.
- `assets-src/bust.glb`: **NOT INCLUDED**; generated externally from the real photo (and optional matching clay views).
- `public/assets/portrait-points.bin`: only after baking the real GLB, expected 660000 bytes (66000×10).
- `public/assets/portrait-meta.json`: only after real bake.

## Accuracy checklist
- [ ] Short straight gray/silver hair (not dark curly)
- [ ] Clean-shaven (no beard)
- [ ] Brown rounded full-rim/tortoiseshell glasses
- [ ] Natural visible teeth in smile
- [ ] Same facial contours as original photo
- [ ] Black turtleneck silhouette
- [ ] Side/rear reconstruction explicitly approximate
- [ ] Face orientation +Z / Y-up / centered
- [ ] Glasses curves do not duplicate geometry
- [ ] Real GLB is not generic test fixture
- [ ] Same source face in final dot-cloud

## Tests (after true GLB exists)
- `npm run check:glb` gives geometry/normals/orientation results.
- `npm run integrate` must bake/validate and produce 660000-byte binary, 66000 points.
- Build and screenshots with live real model, 4K DPR1 and DPR2, phone/touch, error states.
- 60 FPS is TARGET for adequate GPU, not an accepted value without real device FPS measurement.
- Check legal/privacy: source photograph not served from public web root, no secrets in repo, avoid source photo history leaks; changing remote git history is destructive and requires explicit approval.

## Wrong-image exclusion
All AI concept images previously shown with black curly hair, full beard, looking upward, or a stylized Nilsland dashboard are NOT likeness sources and are NOT enclosed. They must not be used to derive clay views or 3D mesh.

## Verification disclosure
The supplied asset contains one JPEG reference and instructions; it does **not** contain a reconstructed bust.glb or finished website. Do not confuse this with acceptance of final product.
