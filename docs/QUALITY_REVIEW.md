# Visuelle Qualitätsprüfung (Basis 59bf4c2)

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
| Front-Silhouette Netz vs. Foto-Maske (IoU, `tools/compare_overlay.py`) | **0,984** (Ohren absichtlich entfernt, daher nicht 1,0) |
| Brille: Mittelpunkte/Radius gegen die Fassung im Foto (Overlay) | Fassung deckt sich mit den Linsen im Foto; Maße in `assets-src/glasses.json` (lensR 0,120, Abstand 0,300, Mitte -0,048/0,917) |
| Punktdatei | 66.000 Punkte, 660.000 Byte, `check-bake` OK |
| Drawing-Buffer | **3840×2160** (CSS 3840 @dpr1) nachgewiesen; zusätzlich 1920×1080 @dpr2 → 3840×2160 (früherer Lauf, Code unverändert) |
| FPS | Software-GL: ~4 FPS bei 4K – **kein Maß für GPU**; echte GPU nicht gemessen |

## Korrigiert in diesem Durchgang (nur mit Fotogrundlage)
- **Brille:** Position und Größe per Overlay gegen das Foto nachgemessen (vorher ~8 px zu weit rechts, ~10 % zu groß); Fassung dünner. Rahmen und Bügel folgen jetzt der tatsächlichen Kopfoberfläche (Z aus den Oberflächenpunkten) statt einer flachen Ebene → liegt bei 45° eng am Kopf.
- **Kragen:** Breite wird auf die Foto-Silhouette begrenzt, Kiefer-Breite unterhalb der Wangen auf die Kragenbreite begrenzt (Hintergrund-Spitze entfernt); Kragentiefe an die im Foto gemessene Kragenbreite angepasst (rund statt flach).
- **Hilfsmittel:** `?clean` blendet UI für Vergleichsbilder aus.

## Verbleibende Abweichungen
1. **Gedrungenes Seitenprofil bleibt**: Kopf sitzt auf kurzem, dickem Kragen; Gesichts-/Stirnprofil ist eine angenommene Kurve. Das Foto liefert dafür keine Referenz – daher keine weiteren anatomischen Ergänzungen.
2. **Frisur:** Silhouette und Volumen stammen aus dem Foto; Strähnen/Scheitel sind als flaches Relief angedeutet und in 66.000 Punkten **nicht sichtbar**. Die silbergraue Farbe geht in der einfarbigen Punktdarstellung verloren.
3. **Kragen:** am rechten oberen Rand bleibt eine kleine spitze Kante (im 4K-Bild sichtbar, nahe 1120/630 im 2000-px-Anzeigemaßstab).
4. **Brille:** runde Vollrandfassung, aber Foto-Rahmen ist Schildpatt (dick, leicht asymmetrisch geneigt); Neigung (rechte Linse ~3° höher) nicht übernommen. Bügel enden ohne Ohr.
5. **Tutorial-Abweichungen:** keine Front-/Seiten-Tonbüsten-Bilder, kein Multi-Image-to-3D (Meshy/Higgsfield), Originalartikel/-demo nicht abrufbar → **kein Abgleich mit der Referenzdemo**. Sweep, Loader, Licht, Kopfdrehung folgen der Spezifikation, wurden aber nicht gegen die Demo verglichen.
6. Das Foto selbst liegt in `assets-src/` (nicht im Build) und ist in den Vergleichsbildern enthalten; es steckt außerdem in der Git-Historie (Commit bd3b6f8).
