# Assets — exakter Blocker und Handlung

**Blocker (einziger):** Es steht kein Image-to-3D-/Bild-Dienst zur Verfügung.
- Keine Higgsfield-/Tripo-/Meshy-Integration in der Sitzung; keine API-Schlüssel in der Umgebung.
- `api.tripo3d.ai`, `platform.higgsfield.ai`, `api.meshy.ai` aus dem Sandbox-Netz nicht erreichbar.
- Arcads (Nilsland) hat 0 Credits → keine Bildgenerierung. Das Foto wurde deshalb nicht hochgeladen.

**Stand Higgsfield (laut Übergabe):** In einer separaten ChatGPT-Sitzung ist Higgsfield verbunden, das Foto ist dort als Media hochgeladen; der Katalog zeigt `image_to_3d` und `multi_image_to_3d` (Meshy) sowie `sam_3_3d`. Diese Media-ID gilt nur in jenem Account und ist hier nicht nutzbar. In dieser Claude-Sitzung ist weiterhin keine 3D-Aktion erreichbar (keine Integration, keine Schlüssel, Hosts gesperrt, Arcads 0 Credits).

**Benötigt — einzige konkrete Benutzerhandlung:** ein `bust.glb` des Porträts.
1. Eingabe: `assets-src/reference-photo.jpg` (Frontal). Besser: zusätzlich mit `prompts/01…`/`02…` eine Tonbüste (Front + 90°-Seite, KI-Rekonstruktion) erzeugen und in Higgsfield *Multi-Image-to-3D* (Meshy) mit beiden Bildern einspeisen; alternativ *Image-to-3D* nur mit dem Foto.
2. Export: GLB, **ohne Textur/Material** (Geometrie genügt), Kopf + Schultern, ca. 50–200k Dreiecke, Y oben, Gesicht nach +Z, aufrecht und nicht rotiert, ein Objekt.
3. Ablage: `assets-src/bust.glb` (nicht öffentlich deployen).
4. `npm run bake -- assets-src/bust.glb`
5. Erwartete Ausgabe: `public/assets/portrait-points.bin` (66.000 × 10 = 660.000 Byte) + `public/assets/portrait-meta.json`. Danach `npm run dev` bzw. `npm run build && npm run preview`.
6. Brille im Nahausschnitt prüfen; ggf. `--glasses cx,cy,lensR,spacing,dz` (Modelleinheiten) anpassen und neu backen. Die Standardwerte sind Heuristiken aus den Fotoproportionen (runde Panto-Fassung).

Ohne `portrait-points.bin` zeigt die Seite einen expliziten Fehlerzustand („PORTRAIT-ASSET FEHLT“). Kein Platzhalter gilt als fertig.

## Sobald `assets-src/bust.glb` vorliegt (vorbereiteter Ablauf, keine Architekturänderung nötig)
```
npm run check:glb                 # Geometrie/Ausrichtung prüfen (Dreiecke, Maße, Z-up?, Blickrichtung, Textur)
npm run integrate                 # check:glb -> bake (66.000 Punkte, Brille) -> check-bake
# Ausrichtung korrigieren, falls check:glb warnt:   npm run bake -- assets-src/bust.glb --rotate -90,0,0   (Z-up)
#                                                    npm run bake -- assets-src/bust.glb --rotate 0,180,0   (Gesicht nach -Z)
# Brille nachziehen:                                 npm run bake -- assets-src/bust.glb --glasses cx,cy,lensR,spacing,dz
node scripts/check-bake.mjs       # prüft 66.000 Punkte, 660.000 Byte, Fassungs-/Glaspunkte
npm run build && npm run preview  # danach: node scripts/verify-browser.mjs  (4K-/Mobil-Screenshots, Buffergröße)
```
Danach: Brille im Nahausschnitt gegen das Foto prüfen (Linsenradius, Abstand, Sitz auf dem Nasenrücken, Bügel), Vorder- und Seitenansicht kontrollieren, auf einem echten 4K-Display FPS messen, dann committen und pushen. `assets-src/bust.glb` ist per `.gitignore` nicht im Repo; `portrait-points.bin` und `portrait-meta.json` werden committet.

## Verbindliche Vorgabe (korrigiertes Paket, ersetzt alle früheren Gestaltungsanweisungen)
Maßgeblich: `docs/CORRECTED_SPEC_2026-10-25.md`. Umgesetzt wird die **stilisierte, gesichtslose matt hellgraue Tonbüste** wie im Originalartikel (keine Augen, Nase, Mund, Ohren; Identität über Kopfkontur, Frisur, runde Vollrandbrille, Kiefer, Rollkragen). Das Lächeln wird nicht modelliert. Die Brille im Foto ist schildpatt, im Clay-Modell mattgrau. Die Prompts: `prompts/01-clay-front-FACELESS.txt`, `02-clay-side-FACELESS-inferred.txt` (Seite = KI-Schätzung), `03-image-to-3d-GLB.txt`. Alle früheren Prompts (realistische/identitätstreue Gesichter) sind widerrufen.
Foto-SHA-256: `6b57a99f26232e5ebe9b710c52ac9a76a9428f6dc5383aa29d943c2b7df0d832`.
`docs/ASSET_AND_QA.md` ist in Teilen überholt (Zähne/Lächeln, sichtbare Gesichtszüge): gilt nicht mehr.

Datenschutz: `assets-src/reference-photo.jpg` ist nicht in `public/` und nicht im Build, steckt aber noch in der Git-Historie (Commit bd3b6f8). Entfernen erfordert einen Force-Push und erfolgt nur nach ausdrücklicher Freigabe.

Nicht abgeglichen: Artikel und Demo (`avivashishta.com`) sind aus dieser Umgebung nicht erreichbar (DNS-Fehler). Der visuelle Abgleich mit der Originaldemo steht daher aus; Stilparameter stammen aus Masterprompt und korrigierter Spezifikation.

## Aktueller Stand des GLB
`assets-src/bust.glb` ist ein **lokal aus dem Foto rekonstruiertes** Silhouetten-Modell (siehe README). Für die tutorialtreue Variante (Front-/Seiten-Tonbüste → Meshy) bleibt weiterhin die externe Handlung oben offen; das Ergebnis ersetzt `assets-src/bust.glb`, danach `npm run integrate`.
