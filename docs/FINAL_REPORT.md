# Abschlussbericht – Made of Dots 4K (fotoabgeleitete Näherung)

**Einordnung:** Die Büste ist eine **fotoabgeleitete Näherung** (lokal aus dem einen Foto gebaut), **keine** identitätsgetreue KI-3D-Rekonstruktion und **kein** Meshy/Higgsfield/Tripo-Modell. Tiefe, Seitenprofil, Rückseite und Haarrelief sind **geschätzt**.

## Endstand
- Branch `claude/made-of-dots-portrait`; Startkommando: `npm install && npm run dev` (Entwicklung) bzw. `npm run build && npm run preview` (Produktion, http://localhost:4173).
- Assets: `assets-src/bust.glb` (untexturiert, geschlossen, Y oben, Gesicht +Z, ~488k Dreiecke), `public/assets/portrait-points.bin` (660000 Byte = 66000 × 10), `public/assets/portrait-meta.json` (Fläche 62040, Fassung 2851, Glas 1109); Prüfsummen in `docs/CHECKSUMS.txt`.
- Neu in diesem Durchgang: feines festes Key-Licht im Shader (laut Spezifikation „subtile Key-/Rim-/Cursor-Akzente“; macht Kopfvolumen, Kragen und Haarrelief lesbar), stärkeres Haarrelief, Intro-Clamp, `check-bake`/`verify-browser`/`verify-behaviour` als npm-Skripte, Verhaltenstests.

## Nachgewiesene Prüfergebnisse (headless Chromium, Software-GL/SwiftShader)
| Prüfung | Ergebnis | Beleg |
|---|---|---|
| `npm run check:glb` | OK; 1 Warnung (Kopfmitte −0,108 zur Bbox, Schultern asymmetrisch) | `docs/CHECK_LOG.txt` |
| `npm run integrate` | OK – 66.000 Punkte, 660.000 Byte | `docs/CHECK_LOG.txt` |
| `npm run check-bake` | OK (Fläche/Fassung/Glas vorhanden) | `docs/CHECK_LOG.txt` |
| `npm run build` | OK | `docs/CHECK_LOG.txt` |
| `npm run test:fixture` | OK (Test-Fixture, nicht das Porträt) | `docs/CHECK_LOG.txt` |
| `npm run verify-browser` | 4K-Buffer **3840×2160** (CSS 3840 @dpr1), Desktop 1280×720, Mobil 36.000 Punkte, keine Konsolenfehler | `docs/verify-browser.log`, `docs/screenshots/` |
| `npm run verify-behaviour` | 7/7 PASS: Lade-Prozent, Fehlerzustand ohne Asset, Reduced Motion (uIntro=1, kein Sweep), Intro läuft normal, Cursor ändert Bild, Touch-Tap + reduzierte Punkte, Context-Loss/-Restore | `docs/verify-behaviour.log`, `docs/VERIFY_RESULTS.json` |
| Front-Silhouette Netz vs. Foto-Maske (IoU) | 0,986 | `docs/silhouette-iou.txt` |
| Brille am Foto (Kreissuche) | Mittelpunkte (816,564)/(1084,556), r≈108 px, Neigung 1,7° (rechts höher) | `docs/qa-overlay-baked-points-on-photo.jpg`, `assets-src/glasses.json` |
| Produktionsbuild enthält kein Referenzfoto | geprüft (`dist/` ohne `reference-photo`) | |

## Bilder
`docs/compare-photo-vs-pointcloud.jpg` (Foto | 0° | 45° | 90°), `docs/screenshots/portrait-4k-3840x2160.jpg`, `portrait-desktop-1280x720.jpg`, `portrait-mobile-390x844.jpg`, `portrait-yaw0/45/90.jpg`, `missing-asset-error.jpg`, `docs/qa-overlay-*.jpg`, `docs/clay-preview-front-45-90deg-inferred.png`.

## Verbleibende Einschränkungen (nicht ohne externe Dienste/Hardware erfüllbar)
1. **Kein Direktvergleich mit Originalartikel/-demo**: `avivashishta.com` ist aus der Umgebung nicht erreichbar (Verbindung abgelehnt/DNS). Loader-Ring, Sweep, Cursor-Licht, Kopfdrehung, Punktsprite (`exp(-r²·16)`), Hintergrund/Korn folgen der dokumentierten Spezifikation, nicht einer gemessenen Demo.
2. **Kein Meshy/Higgsfield/Tripo-GLB und keine Tonbüsten-Bilder** (Dienste unerreichbar, keine GPU, Arcads 0 Credits). Ersatz: lokale Silhouetten-Rekonstruktion (`tools/`). Ein externes `bust.glb` lässt sich per `npm run integrate` einsetzen (Brille ggf. mit `assets-src/glasses.json` nachziehen).
3. **Seitenprofil/Haar**: Das Profil bleibt eine angenommene Kurve (gedrungen), das Haar nur ein flaches Relief (mit Key-Licht jetzt schwach erkennbar, Strähnen nicht einzeln); Silbergrau geht in der einfarbigen Darstellung verloren. Weitere Änderungen hätten keine Fotogrundlage.
4. **Keine reale GPU-Bildrate gemessen.** Software-GL: ~4 FPS bei 4K, ~12–15 FPS bei 720p, ~26 FPS mobil – **kein Maß für GPU**. Die FPS-Anzeige im Overlay misst auf dem Zielgerät. Adaptive Auflösung (ab >22 ms Frame-Zeit, Schritte ×0,85 bis 0,55) ist implementiert, aber nur im Software-Lauf beobachtet.
5. Das **Lade-Prozent** wurde im Test nur als 0 % → 100 % beobachtet (Ressource wird im Test als Ganzes ausgeliefert); die Berechnung folgt den empfangenen Bytes.
6. Das **Referenzfoto** liegt in `assets-src/` (nicht in `public/`/Build), ist in den Vergleichsbildern enthalten und steckt in der Git-Historie (Commit bd3b6f8); Entfernen würde einen Force-Push erfordern (nicht ohne Freigabe).
