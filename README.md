# Made of Dots — Portrait Study (Testseite)

Eigenständige Vite + Three.js-Testseite nach dem Workflow aus
https://www.avivashishta.com/blog/made-of-dots-webgl-point-cloud-portrait
(Foto → Tonbüste front/seitlich → GLB → 66.000 flächengewichtete Punkte → WebGL). Anleitung: `CLAUDE_MASTERPROMPT.md`.
Kein fremder Originalcode wurde übernommen; das Original wurde nicht abgerufen, nur der Masterprompt befolgt.

## Status — ehrlich

| Baustein | Status |
|---|---|
| Vite/Three.js-Seite, Shader, Streaming-Loader mit Ring, Intro, Sweep, Cursor-Licht, Kopfdrehung, Brillen-Glanz | **fertig, getestet** |
| Bake-Skript (`npm run bake`): MeshSurfaceSampler, 10 Byte/Punkt, Brillen-Kurvenpunkte, lokale Entfernung überlappender Punkte, deterministisch | **fertig, an Testmodell geprüft** |
| Responsive/Touch/reduced-motion/Mobil-Punktlimit/WebGL-Fehler- und Kontextverlust-Zustand | **fertig** |
| Tonbüste Front + Seite (Bild-Output) | **FEHLT** — siehe unten |
| Echtes GLB des Porträts | **FEHLT** — manueller Schritt |
| `public/assets/portrait-points.bin` des Porträts | **FEHLT** (entsteht erst aus dem GLB) |
| Kalibrierung der Brille am echten Modell | **FEHLT** (`--glasses`-Parameter) |

Ohne `portrait-points.bin` zeigt die Seite die **2.5D-Foto-Vorschau** (gelb gekennzeichnet). Das ist **nicht** die 3D-Skulptur.

### Warum fehlen die Bilder und das GLB?
- Die in dieser Sitzung angebundene Bild-Integration (Arcads/Nilsland) meldete **0 verbleibende Credits**; daher wurde nichts generiert und das Foto nicht hochgeladen. Es gibt hier außerdem keine Higgsfield-/Tripo-Anbindung. Es wurde nichts vorgetäuscht.
- **Direkt nutzbare Prompts:** `prompts/01-front-clay-bust.txt`, `prompts/02-side-clay-bust.txt` (Seitenansicht = KI-Rekonstruktion).
- Das Foto zeigt eine **honigbraune Schildpatt-Brille**; der Masterprompt verlangt eine **dunkle** Vollrandbrille. Ich bin dem Masterprompt gefolgt (Prompt verlangt „dark full-rim“) — bitte bestätigen, falls die Schildpatt-Optik gewünscht ist.

**Blocker und exakte Handlung: siehe `ASSET-REQUIREMENTS.md`.** Brillen-Standardwerte sind jetzt aus den Proportionen des Referenzfotos (runde Panto-Fassung) abgeleitet.

## Befehle
```
npm install
npm run dev                # Entwicklung
npm run build && npm run preview   # Produktions-Build, http://localhost:4173
npm run test:fixture       # Primitiv-Testbüste erzeugen + backen -> public/assets/test/
```
Testseiten-URLs: `/` (Porträt-Asset oder 2.5D-Vorschau), `/?asset=test` (Pipeline-Test mit Primitiv-Büste, **nicht das Porträt**).

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
