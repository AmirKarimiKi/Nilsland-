# Made of Dots — Portrait Study (Testseite)

Eigenständige Vite + Three.js-Testseite nach dem Workflow aus
https://www.avivashishta.com/blog/made-of-dots-webgl-point-cloud-portrait
(Foto → Tonbüste front/seitlich → GLB → 66.000 flächengewichtete Punkte → WebGL). Anleitung: `CLAUDE_MASTERPROMPT.md`.
Kein fremder Originalcode wurde übernommen; das Original wurde nicht abgerufen, nur der Masterprompt befolgt.

## Status-Matrix (ehrlich)

| Baustein | Status |
|---|---|
| Renderer: Loader-Ring, Intro, Sweep, Cursor-Licht, Kopfdrehung, Glas-Glanz, Touch, reduced-motion, Context-Loss, Fehlerzustand | erstellt, im Headless-Browser getestet |
| 4K: echter Drawing-Buffer 3840×2160 (`docs/screenshots/portrait-4k-3840x2160.jpg`) (CSS 3840 @dpr1 und 1920 @dpr2) | **nachgewiesen** (Software-GL, mit dem Porträt-Asset) |
| `assets-src/bust.glb` | **vorhanden, aber lokal erzeugt** (siehe unten) – nicht Meshy/Higgsfield |
| `public/assets/portrait-points.bin` (66.000 × 10 = 660.000 Byte) + meta | gebacken aus diesem GLB, `check-bake` OK (63.030 Fläche / 2.138 Fassung / 832 Glas) |
| Brille (Fassung, Brücke, Bügel an der Kopfoberfläche), Maße vom Foto (`assets-src/glasses.json`) | erstellt, grob am Foto ausgerichtet |
| Frisur, individuelle Gesichts-/Kopfform, Seitenprofil | **schwach** (siehe Abweichungen) |
| Abgleich mit Originalartikel/-demo | **nicht möglich** (Domain aus der Umgebung nicht erreichbar) |
| Reale GPU-FPS auf 4K-Gerät | **NICHT gemessen** (Software-GL: ~4–6 FPS bei 4K) |

### Wie das GLB entstanden ist – APPROXIMIERTE Geometrie (v2)
Hugging Face, Higgsfield, Meshy und Tripo sind aus der Umgebung nicht erreichbar, es gibt keine GPU und Arcads hat keine Credits. Das GLB wurde deshalb **lokal und klassisch aus dem einen Foto** gebaut (`tools/segment.py` → `tools/build_bust.py`; Python: OpenCV GrabCut, Marching Cubes). Es ist eine **Näherung, kein Scan und keine KI-3D-Rekonstruktion**:
- **Kopf** (ohne schwarzen Pullover) und **Kragen + Schultern** sind getrennte Volumina aus den Foto-Konturen und werden vereinigt, damit der Kiefer vor dem Rollkragen sitzt. Ohren und Gesichtszüge fehlen (gesichtslos).
- **Tiefe/Profil ist geschätzt**: von Hand gesetzte Anatomie-Kurven (Stirn, Braue, Wange, Kinnrücksprung, Hinterkopf, Nacken, Kiefer-Unterseite), nicht gemessen und nicht aus einer Seitenaufnahme.
- **Haar**: Konturvolumen aus dem Foto, Seitenscheitel-Rille und diagonales Strähnenrelief (aus dem Foto-Ausschnitt abgeleitet, bewusst flach, damit es in 66.000 Punkten nicht rauscht). Es gibt keine einzelnen Strähnen.
- **Rollkragen**: gerundete Oberkante mit Wulst; **Schultern** aus der Foto-Kontur, Brusttiefe angenommen.
- Geschlossenes, untexturiertes Netz (~490k Dreiecke, ~12 MB), Y oben, Gesicht +Z.
Prüfansichten: Front/45°/90° des Netzes `docs/clay-preview-front-45-90deg-inferred.png`, der Punktwolke `docs/screenshots/portrait-yaw{0,45,90}.jpg` (`?yaw=<Grad>` fixiert den Drehwinkel, nur zur Inspektion).

**Verbleibende Abweichungen zur Originalanleitung / zum Foto**
- Keine Front-/Seiten-Tonbüsten-Bilder und kein Multi-Image-to-3D (Meshy/Higgsfield/Tripo).
- Profil und Rückseite sind Annahmen; die Büste ist kein belegt originalgetreues Abbild der Person. Wiedererkennbar sind vor allem Kopf-/Schulterumriss, Haarmasse, Kragen und Brillenmaß.
- Der 90°-Blick wirkt noch gedrungen (Kopf auf kurzem Kragen); Kiefer-/Kragenübergang und Schulterneigung sind vereinfacht.
- Haarstruktur nur als flaches Relief; Scheitel-Lage ist aus dem Foto geschätzt.
- Brille: runde Fassung mit Fotomaßen; bei 45°/90° steht sie etwas vor dem flach geformten Gesicht.
- Kein Abgleich mit Originalartikel/-demo möglich (Domain nicht erreichbar).
Neu erzeugen: `python3 tools/segment.py && python3 tools/build_bust.py && npm run integrate` (pip: numpy scipy opencv-python-headless scikit-image trimesh pillow fast-simplification). Ein Meshy-/Higgsfield-`bust.glb` kann unverändert per `npm run integrate` eingesetzt werden.

## Befehle
```
npm install
npm run dev                # Entwicklung
npm run build && npm run preview   # Produktions-Build, http://localhost:4173
npm run check:glb         # Prüft assets-src/bust.glb (Geometrie, Ausrichtung)
npm run integrate         # check:glb + bake + Prüfung des gebackenen Assets
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
