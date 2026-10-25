# Abschlussbericht – Made of Dots 4K (fotoabgeleitete Näherung)

**Einordnung:** Die Büste ist eine **fotoabgeleitete Näherung** (lokal aus dem einen Foto gebaut), **keine** identitätsgetreue KI-3D-Rekonstruktion und **kein** Meshy/Higgsfield/Tripo-Modell. Tiefe, Seitenprofil, Rückseite und Haarrelief sind **geschätzt**.

## Interaktive Animation (Überarbeitung)
**Phase 1 – einmalige Entfaltung (≈4,4 s):** ein Ring aus Punkten dreht sich 0,8 s, löst sich dann von oben nach unten (Kopf zuerst, danach Kragen und Schultern) und fliegt in einem kurzen, sich auflösenden Schwung in die Büste (ease-out, zeitversetzt, Punkte in Flug etwas größer/heller). Danach genau ein Licht-Sweep.
**Phase 2 – ruhig + interaktiv:** Der Kopf dreht sich über den Schultern zum Cursor (bis ±24° Gieren, ±7° Nicken, Körper folgt zu 28 %), mit kritisch gedämpfter Verzögerung (~0,4 s, Geschwindigkeit begrenzt, kein Überschwingen). Kamera-Parallaxe (±0,22) für Raumwirkung. Das Cursor-Licht liegt knapp vor der Oberfläche, hellt und vergrößert die Punkte in seinem Umkreis (Pool, ~1,5× heller), mit schwachem Glanz auf Brille, Kopf und Kragen; auf den Gläsern kühler Reflex. Tiefenstaffelung: nähere Punkte größer/heller. Vor der ersten Cursorbewegung wandert das Licht langsam als Hinweis, danach folgt es dem Cursor; verlässt der Cursor das Fenster, kehrt der Kopf sanft zurück. Reduced Motion: kein Intro, kein Sweep, keine Kopfdrehung.
**Nicht ergänzt:** keine Partikelexplosionen, keine zufälligen Bewegungen, kein Dauerflimmern, keine neuen Farben (nur der schon spezifizierte kühle Reflex auf den Gläsern).

## Nachweise zur Bewegung (headless Chromium, Software-GL; Details `docs/verify-behaviour.log`, `docs/VERIFY_RESULTS.json`)
- Entfaltung: Silhouettenhöhe über Zeit z. B. `0:172 → 0.26:218 → 0.39:230 → 0.66:334 → 0.98:324 → 1:324` (Ring → Büste, mehrere Zwischenstände).
- Kopfdrehung: Cursor rechts → Yaw +0,367 rad; Wechsel nach links → −0,367 rad; Spitzen-Winkelgeschwindigkeit 0,7–1,0 rad/s (Grenze 1,5), Überschwingen 1,000, Verzögerung messbar (nach ~0,1 s erst ~0,06 rad).
- Cursor-Licht: Helligkeit der beleuchteten Region ×1,48 (Kopf) und ×1,53 (Brust) gegenüber Cursor in der Ecke.
- Bildschirmaufzeichnung der echten Anwendung (800×450, Software-GL ~15 FPS, daher ruckelnder als auf einer GPU): `docs/demo-interaction.mp4` (erzeugt mit `scripts/record-demo.mjs`).
- Live-Demo (privates Artifact): https://claude.ai/artifact/6bVjGDifk1xMFAHjxhPVGD

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
| `npm run verify-behaviour` | 11/11 PASS: Lade-Prozent, Fehlerzustand ohne Asset, Reduced Motion (inkl. keine Kopfdrehung), Intro läuft, Entfaltung sichtbar über Zeit, Kopfdrehung weich (kein Überschwingen, Geschwindigkeit begrenzt), Richtungswechsel, Cursor-Lichtpool, Touch, Context-Loss/-Restore | `docs/verify-behaviour.log`, `docs/VERIFY_RESULTS.json` |
| Front-Silhouette Netz vs. Foto-Maske (IoU) | 0,986 | `docs/silhouette-iou.txt` |
| Brille am Foto (Kreissuche) | Mittelpunkte (816,564)/(1084,556), r≈108 px, Neigung 1,7° (rechts höher) | `docs/qa-overlay-baked-points-on-photo.jpg`, `assets-src/glasses.json` |
| Produktionsbuild enthält kein Referenzfoto | geprüft (`dist/` ohne `reference-photo`) | |

## Bilder
`docs/compare-photo-vs-pointcloud.jpg` (Foto | 0° | 45° | 90°), `docs/screenshots/portrait-4k-3840x2160.jpg`, `portrait-desktop-1280x720.jpg`, `portrait-mobile-390x844.jpg`, `portrait-yaw0/45/90.jpg`, `missing-asset-error.jpg`, `docs/qa-overlay-*.jpg`, `docs/clay-preview-front-45-90deg-inferred.png`.

## Verbleibende Einschränkungen (nicht ohne externe Dienste/Hardware erfüllbar)
1. **Kein Direktvergleich mit Originalartikel/-demo**: `avivashishta.com` ist weiterhin nicht erreichbar. Die Dynamik (Entfaltungsdauer, Winkel, Lichtstärke) folgt der dokumentierten Spezifikation und meiner Einschätzung der gewünschten Wirkung, **nicht** einer gemessenen Demo; die Zahlen sind nicht aus dem Original abgeleitet.
2. **Kein Meshy/Higgsfield/Tripo-GLB und keine Tonbüsten-Bilder** (Dienste unerreichbar, keine GPU, Arcads 0 Credits). Ersatz: lokale Silhouetten-Rekonstruktion (`tools/`). Ein externes `bust.glb` lässt sich per `npm run integrate` einsetzen (Brille ggf. mit `assets-src/glasses.json` nachziehen).
3. **Seitenprofil/Haar**: Das Profil bleibt eine angenommene Kurve (gedrungen), das Haar nur ein flaches Relief (mit Key-Licht jetzt schwach erkennbar, Strähnen nicht einzeln); Silbergrau geht in der einfarbigen Darstellung verloren. Weitere Änderungen hätten keine Fotogrundlage.
4. **Keine reale GPU-Bildrate gemessen.** Software-GL: ~4 FPS bei 4K, ~12–15 FPS bei 720p, ~26 FPS mobil – **kein Maß für GPU**. Die FPS-Anzeige im Overlay misst auf dem Zielgerät. Adaptive Auflösung (ab >22 ms Frame-Zeit, Schritte ×0,85 bis 0,55) ist implementiert, aber nur im Software-Lauf beobachtet.
5. Das **Lade-Prozent** wurde im Test nur als 0 % → 100 % beobachtet (Ressource wird im Test als Ganzes ausgeliefert); die Berechnung folgt den empfangenen Bytes.
6. Das **Referenzfoto** liegt in `assets-src/` (nicht in `public/`/Build), ist in den Vergleichsbildern enthalten und steckt in der Git-Historie (Commit bd3b6f8); Entfernen würde einen Force-Push erfordern (nicht ohne Freigabe).
