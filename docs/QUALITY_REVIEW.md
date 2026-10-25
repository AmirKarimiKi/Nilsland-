# Visuelle Qualitätsprüfung (Basis 989591a, abschließender Durchgang)

**Einordnung:** Die Büste ist eine **fotoabgeleitete Näherung** (lokal aus dem einen Foto gebaut). Sie ist **keine identitätsgetreue KI-3D-Rekonstruktion**. Tiefe, Seitenprofil, Rückseite und Haarrelief sind **geschätzt**.

## Bilder
- `docs/compare-photo-vs-pointcloud.jpg` – Foto | Punktwolke 0° | 45° | 90° (Punktwolke ohne UI, `?yaw=`, `?clean`)
- `docs/qa-overlay-baked-points-on-photo.jpg` – gebackene Punkte auf dem Foto (gelb: Fläche, rot: Fassung, blau: Glas)
- `docs/qa-overlay-silhouette-vs-photo.jpg` – Netz-Silhouette gegen Foto-Maske (rot: Netz außerhalb, blau: Maske außerhalb)
- `docs/screenshots/portrait-4k-3840x2160.jpg` (Buffer 3840×2160), `portrait-desktop-1280x720.jpg`, `portrait-mobile-390x844.jpg`, `portrait-yaw{0,45,90}.jpg`
- `docs/clay-preview-front-45-90deg-inferred.png` – Netz-Vorschau (grobe Software-Darstellung)

## Messbare Ergebnisse
| Prüfung | Ergebnis |
|---|---|
| Front-Silhouette Netz vs. Foto-Maske (IoU, `tools/compare_overlay.py`) | **0,986** (Ohren absichtlich entfernt) |
| Brille: Kreissuche auf den Linsenrändern im Foto (2000×1500-Maßstab) | Mittelpunkte (816,564)/(1084,556), Mittellinien-Radius ≈108 px, **Neigung −1,7°** (rechte Linse höher); in `assets-src/glasses.json`, der Bake wendet `tiltDeg` auf Fassung, Brücke, Bügel und Glaspunkte an. Die frühere Schätzung lag ~20 px zu tief und ~15 % zu groß. |
| Kragenspitze rechts | **entfernt**: Ursache war eine dunkle Pixel-Sliver am Kragenrand, die die Kragenachse verschob; Kragenkontur kommt jetzt aus der Personenmaske |
| Punktdatei | 66.000 Punkte, 660.000 Byte, `check-bake` OK (Fläche/Fassung/Glas) |
| Drawing-Buffer | **3840×2160** (CSS 3840 @dpr1) in diesem Lauf nachgewiesen |
| FPS | Software-GL ~4 FPS bei 4K – **kein Maß für GPU**; echte GPU nicht gemessen |
| Skripte erneut ausgeführt | `check:glb` (Warnung: Kopfmitte −0,117 vom Bbox-Zentrum – Schultern asymmetrisch, unkritisch), `integrate`, `check-bake`, `build`, `test:fixture`, `scripts/verify-browser.mjs` (4K, Mobil, Desktop), `tools/compare_overlay.py`: alle ohne Fehler |

## Seitenprofil (Punkt 3 der Aufgabe)
Es wurde **nichts** geändert. Das Foto zeigt nur die Frontansicht; für Stirn-/Kinnprofil, Hinterkopf und Brusttiefe gibt es keine Referenz, die eine weitere Änderung begründen würde. Das Profil bleibt die dokumentierte Annahme (Kurven in `tools/build_bust.py`). Die Kragentiefe stammt weiterhin aus der im Foto gemessenen Kragenbreite.

## Verbleibende Abweichungen
1. **Gedrungenes Seitenprofil** (Kopf auf kurzem, dickem Kragen); Profil geschätzt, nicht belegbar.
2. **Frisur:** Silhouette/Volumen aus dem Foto; Strähnen/Scheitel als flaches Relief, in 66.000 Punkten nicht sichtbar; Silbergrau geht in der einfarbigen Darstellung verloren.
3. **Kragen/Hals:** In der Frontansicht nur als leichter Wulst-/Kantenansatz erkennbar (Material und Farbe fehlen); keine einzelne Rollkragenfalte.
4. **Brille:** kreisrunde Linsen und gleichmäßige Fassung; die Schildpatt-Fassung des Fotos ist dicker und leicht oval. Bügel enden ohne Ohr.
5. **Tutorial:** keine Front-/Seiten-Tonbüsten-Bilder, kein Multi-Image-to-3D (Meshy/Higgsfield); Originalartikel/-demo nicht abrufbar → kein Abgleich gegen die Referenzdemo (Loader, Sweep, Licht, Kopfdrehung folgen der Spezifikation, nicht gegen die Demo verglichen).
6. `docs/screenshots/missing-asset-error.jpg` stammt aus einem früheren Lauf (Fehlerzustand, Code unverändert).
7. Das Foto liegt in `assets-src/` (nicht im Build) und ist in den Vergleichsbildern enthalten; es steckt außerdem in der Git-Historie (Commit bd3b6f8).
