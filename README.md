# Made of Dots — Portrait Study (Testseite)

Eigenständige Vite + Three.js-Testseite nach dem Workflow aus
https://www.avivashishta.com/blog/made-of-dots-webgl-point-cloud-portrait
(Foto → Tonbüste front/seitlich → GLB → 66.000 flächengewichtete Punkte → WebGL). Anleitung: `CLAUDE_MASTERPROMPT.md`.
Kein fremder Originalcode wurde übernommen; das Original wurde nicht abgerufen, nur der Masterprompt befolgt.

## Status-Matrix

| Baustein | Status |
|---|---|
| Vite/Three.js-Seite, Shader, Streaming-Loader mit Ring, Intro, Sweep, Cursor-Licht, Kopfdrehung, Brillen-Glanz | erstellt, im Headless-Browser getestet |
| Bake-Skript (66.000 × 10 Byte, Brillenkurven, lokale Punktentfernung) | erstellt, nur an der Test-Fixture getestet |
| 4K: echter Drawing-Buffer, Pixel-Budget, WebGL-Limits, dynamische Auflösung (`?dpr=`, `?fixedres`) | erstellt; **3840×2160-Buffer nachgewiesen** (Software-GL; `docs/screenshots/fixture-4k-3840x2160.jpg`) |
| Punktdichte nach Hardware (66k Desktop / 36k mobil oder schwach, `?points=`) | erstellt |
| Expliziter Fehlerzustand ohne Porträt-Asset | erstellt, getestet (`docs/screenshots/missing-asset-error.jpg`) |
| 2.5D-Fotovorschau | nur `npm run dev` mit `?preview`, nicht im Build, nie „fertig“ |
| **Porträt-GLB `bust.glb`** | **NICHT vorhanden** |
| **`portrait-points.bin` des Porträts** | **NICHT vorhanden** |
| Brillen-Passung, Vergleich mit Foto | **ausstehend** (braucht echtes GLB) |
| **Reale GPU-FPS auf 4K-Gerät** | **NICHT gemessen** (nur SwiftShader: 4–5 FPS bei 4K, 21 FPS mobil; kein Maßstab) |

Blocker und exakte Handlung: `ASSET-REQUIREMENTS.md`. Das Referenzfoto liegt in `assets-src/` (nicht in `public/`, nicht im Build; es steckt aber noch in der Git-Historie, Commit bd3b6f8).
`/?asset=test` zeigt eine Primitiv-Büste und ist **nicht das Porträt**.

## Befehle
```
npm install
npm run dev                # Entwicklung
npm run build && npm run preview   # Produktions-Build, http://localhost:4173
npm run test:fixture       # Primitiv-Testbüste erzeugen + backen -> public/assets/test/
node scripts/verify-browser.mjs   # optional (playwright): Screenshots 4K/mobil + Buffergröße
```
Testseiten-URLs: `/` (Porträt-Asset, sonst Fehlerzustand), `/?asset=test` (Pipeline-Test mit Primitiv-Büste, **nicht das Porträt**).

## Echtes Porträt fertigstellen
1. Prompts aus `prompts/` mit `reference-photo.jpg` in einem Bildgenerator ausführen (Front, dann Seite mit Front als Zusatzreferenz).
2. Beide Bilder in Higgsfield Multi-Image-to-3D oder Tripo → untexturiertes `.glb` (+Y oben, Gesicht nach +Z).
3. `npm run bake -- /pfad/bust.glb` — schreibt `public/assets/portrait-points.bin` (66.000 × 10 Byte = 660.000 Byte) und `portrait-meta.json`.
4. Brille justieren: `npm run bake -- bust.glb --glasses cx,cy,lensR,spacing,dz` (Modelleinheiten; Standardwerte sind nur Heuristiken). `--no-glasses` schaltet sie ab, `--count`, `--seed`, `--out-dir`, `--label` sind ebenfalls möglich.

## Punktformat
`x,y,z uint16 | nx,ny,nz int8 | kind uint8` (0 Oberfläche, 1 Brillenfassung, 2 Brillenglas), little endian, normiert auf die größte Bbox-Seite. Die Punkte sind gemischt, sodass jedes Präfix eine gleichmäßige Teilmenge ist: Mobilgeräte laden nur die ersten 36.000 Punkte (Download wird abgebrochen).

## Prüfergebnisse (Chromium headless, Software-WebGL/SwiftShader)
- `npm install`, `npm run build`: erfolgreich. Keine Konsolenfehler/-warnungen in den drei Läufen.
- Bake des Primitiv-GLB: 66.000 Punkte, 660.000 Byte, 41 native Punkte an der Brille entfernt, Brille separat abgesetzt.
- Desktop 1280×800 und Mobil 390×844 (Touch): Loader, Ring, Intro, Ruhezustand, Mobil-Reduktion auf 36.000 Punkte korrekt.
- **Nicht geprüft:** Bildrate auf echter GPU (SwiftShader: 12–29 FPS ist kein Maßstab), reduced-motion und Kontextverlust nur per Code, nicht im Browser getestet, Echtgeräte, Optik des echten Porträts.
