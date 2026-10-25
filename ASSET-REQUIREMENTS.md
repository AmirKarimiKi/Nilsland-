# Fehlende Assets — exakter Blocker und Handlung

**Blocker (einziger):** Es steht kein Image-to-3D-/Bild-Dienst zur Verfügung.
- Keine Higgsfield-/Tripo-/Meshy-Integration in der Sitzung; keine API-Schlüssel in der Umgebung.
- `api.tripo3d.ai`, `platform.higgsfield.ai`, `api.meshy.ai` aus dem Sandbox-Netz nicht erreichbar.
- Arcads (Nilsland) hat 0 Credits → keine Bildgenerierung. Das Foto wurde deshalb nicht hochgeladen.

**Benötigt (in dieser Reihenfolge):**
1. `assets-src/clay-front.png` — Prompt `prompts/01-front-clay-bust.txt` + `public/assets/reference-photo.jpg`.
2. `assets-src/clay-side.png` — Prompt `prompts/02-side-clay-bust.txt` + Foto + Frontansicht (KI-Rekonstruktion, so kennzeichnen).
3. `assets-src/bust.glb` — Higgsfield Multi-Image-to-3D oder Tripo, beide Bilder, ohne Textur, +Y oben, Gesicht +Z.
4. `npm run bake -- assets-src/bust.glb` → erzeugt `public/assets/portrait-points.bin` (660.000 Byte) + `portrait-meta.json`. Die Seite lädt sie automatisch.
5. Brille prüfen (`npm run dev`, Nahansicht) und ggf. `--glasses cx,cy,lensR,spacing,dz` nachziehen.

Ein von mir handgebautes Primitiv-/Foto-Höhenfeld-Modell wäre kein „echtes“ Porträt-GLB und wurde bewusst nicht als solches ausgegeben.
