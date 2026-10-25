# VERBINDLICHE KORREKTUR – Made of Dots (25.10.2026)

## Priorität und Quelle
Die ursprüngliche Benutzeranweisung lautet: die EXISTIERENDE WebGL-Arbeit aus https://www.avivashishta.com/blog/made-of-dots-webgl-point-cloud-portrait so originalgetreu wie möglich mit der Person aus `assets-src/reference-photo.jpg` nachbauen. Originaldemo: https://www.avivashishta.com/lab/made-of-dots. Diese Referenzen bestimmen Stil, Bildsprache, Modellierungsansatz, Motion und Interaction. Das Benutzerfoto bestimmt ausschließlich die personenspezifischen Attribute. KEINE anderen von Assistenten erzeugten Porträts, Fantasieeffekte, künstlerischen Neuinterpretationen oder illustrierte 4K-Stills verwenden. Wenn Referenzdemo nicht abrufbar ist: Artikel als Spezifikation verwenden und fehlenden optischen Abgleich offen benennen.

## WICHTIGE INHALTLICHE KORREKTUR
Im Artikel erklärt der Autor ausdrücklich, warum er die *realistische* Image-to-3D-Rekonstruktion aus dem Foto verworfen hat: Gesichtsdetail wird in Punkten visuelles Rauschen. Seine erfolgreiche Umsetzung basiert auf **einer reduzierten, faceless clay bust**: keine modellierten Augen, Nase, Lippen/Mund oder Ohren; stattdessen charakteristische Silhouette, Haarform, Kiefer/Kinn, Hals, Brille und Kleidung. Das muss hier identisch gehandhabt werden. Vorherige Prompts, die realistische Gesichtszüge oder einen leuchtenden CGI-Kopf verlangen, sind widerrufen. Das Foto bleibt die Quelle für die individuelle Silhouette, kein beliebiger Standardkopf. Dies ist der maßgebliche Kompromiss: originalgetreue Methodik UND individueller Bezug.

## Echte Fotoreferenz (verbindlich)
SHA-256 von `assets-src/reference-photo.jpg`: `6b57a99f26232e5ebe9b710c52ac9a76a9428f6dc5383aa29d943c2b7df0d832`.
Erkennbar: kurze, gerade silber-/hellgraue, zur Seite gelegte Haare; glattrasiert (KEIN Vollbart); recht breite runde bis weich eckige dunkelbraune/Schildpatt-Vollrandbrille; schwarzer Rollkragen; freundlicher Gesichtsausdruck im Foto; Kopf-Schulter-Ansicht. Das Foto darf NUR für Proportionen und Merkmale der stylisierten Büste herangezogen werden. Das Clay-Modell hat KEINEN modellierten Mund oder Augen, d. h. das Lächeln wird nicht geometrisch abgebildet. Keine lockigen Haare, kein Bart, keine anderes Alter/Person, keine rechteckige Halbrandbrille, kein Quarter-Zip statt des Rollkragens.

## Tatsächlicher Originalartikel: verbindliche Effektspezifikation
1. Front- UND genaue 90°-Seitenansicht der **gleichen** glatten matt hellgrauen Tonbüste, reinweißes Studio, gesamter Kopf/Hals/Schultern im Bild; Seite gilt als KI-geschätzte, nicht echte Referenzansicht.
2. Beide Bilder in Multi-Image-to-3D (Higgsfield/Meshy oder Tripo) konvertieren, **ohne Texturen**, GLB mit echter Oberflächengeometrie. No fake plane, 2.5D, billboard, Screenshot oder generischer Ersatzkopf.
3. Three.js `MeshSurfaceSampler` zur flächengewichteten Abtastung von 66.000 Punkten. Entsprechend der existierenden Pipeline gepackt in binäre Punktdaten samt Normalen und Label „Büste/Brille“; keine durchgehend ausgehärtete Pixelmaske.
4. Brille mit separaten Punktkurven zeichnen, dem originalen Foto entsprechend runde/gerundete **Vollrand**-Fassung statt der Halbrandbrille des Artikelfotos; Brücken- und Bügelgeometrie; überschneidende Scan-Punkte gezielt entfernen, ohne leere Glasflächen zu erzeugen. Brille in 3D leicht vor dem Gesicht, keine zweiten Brillenränder.
5. REALER Streaming-Loader: feiner Ring aus Punkten; Prozentwert muss echte Download-Bytes repräsentieren. Bei 100% entwindet sich der Ring und seine Punkte fliegen zur Büste; **ein** herunterlaufendes diagonales Lichtband/Sweep, dann Ruhe.
6. Ruhiger Scan-Look: **weiche, gaußförmige, überwiegend gleichmäßig graue Punkte** unterschiedlicher Größen; keine harten weißen Sandkörner. Minimale Beleuchtungsakzente, Hintergrund dunkel, sehr dezentes Staub-/Filmgrain. Kein sichtbarer Halo, keine Wellenbänder, keine Explosionen, kein Neon-Orange, kein Portrait-Foto-Overlay.
7. Mauszeiger = lokales Licht; Kopf dreht sich dezent zum Cursor. Über Brille selten ein blauer Schimmer. Keine Partikel-Kollisionen, Klick-Explosionen oder dauernde Animationen.
8. Hochwertige, zurückhaltende Originalästhetik. 4K UHD 3840 × 2160 (16:9) als echter WebGL-Framebuffer auf geeigneter Hardware; Pixel-Budget/Hardware-Limits/Adaptive Resolution; adaptive Punktzahl z. B. 36k auf Mobil; keine unbewiesenen 60 FPS behaupten.

Referenzartikel enthält u.a. folgende Parameter als Stilanker: `float a = exp(-r*r*16.);` für weiche Punktfragmente sowie konstante Grundhelligkeit mit subtiler Key-/Rim-/Cursor-Beleuchtung. Kein exaktes Kopieren fremden gesamten Quellcodes nötig.

## Aktueller Arbeitsstand
Repo `AmirKarimiKi/Nilsland-`, Branch `claude/made-of-dots-portrait`, letzter von Claude mitgeteilter Commit `f88e2da`. Auf diesem Branch weiterarbeiten, nicht erneut auf älteres ZIP/Prototyp wechseln. Der Nutzer hat gemeldet, dass Build, Shader, Loader, Mobile, GLB-Prüfung, Bake und 4K-Buffer-Prüfungen teilweise bereits funktionieren; bitte eigenständig im Branch überprüfen. Das Originalfoto befindet sich privat unter `assets-src/reference-photo.jpg`; nicht in `public` oder dist ausliefern. Der alte Git-Commit `bd3b6f8` enthält es laut Claude noch in der Historie: keinen Force-Push ohne gesonderte Genehmigung durchführen.

## Nächste reale Arbeitsschritte
- Anleitung und Demo selbst öffnen und gegen Umsetzung vergleichen. Aussagen zu Originaltreue nur nach visueller Prüfung.
- Front- und Side-Clay-Ansichten gemäß beigefügten Prompts erzeugen; den Side-View ausdrücklich als KI-inferiert kennzeichnen.
- Erreichbaren Image-to-3D-Provider ausführen, GLB als `assets-src/bust.glb` anlegen. Falls nicht erreichbar: nicht behaupten, es existiere; präzise einen einzigen externen Schritt dokumentieren. Keine Fake-GLB aus Primitiven als fertiges Porträt.
- `npm run check:glb`, `npm run integrate`, `npm run build` im EXISTIERENDEN Repo ausführen; Modell gegebenenfalls korrekt rotieren, Brillenpunkte kalibrieren, Bilder und Punktwolke vergleichen.
- Originaldemo, echte 4K-Framebuffer-Abmessung, Desktop/Mobile und Accessibility nachprüfen; Messungen auf Software GL klar kennzeichnen, FPS auf realer GPU nicht erfinden.
- Das Endergebnis darf erst `fertig` heißen, wenn echtes, motivspezifisches GLB und binäre Punkte vorliegen und die Optik der Artikelreferenz entspricht.

## Abnahme – harte Negativkriterien
FALSCH: Ein 16:9-Poster mit ausdrucksstark realistischem Gesicht, lockigen Haaren oder Bart, weißen glitzernden Konturen, abstrakten Partikel-Ribbons oder Text/Branding im Motiv. FALSCH: rein statische Bilder, 2.5D-Vorschau, generische Büste, künstliche Lichteffekte ohne Originalabgleich. RICHTIG: reduzierte animierte faceless Tonbüste aus echter 3D-Oberfläche, Identität über Kopfkontur/Haar/Brille/Kleidung; dezente weiße/graue Punktwolke, echter Lade-Ring und subtiler Cursor-Lichteffekt.

## Rückmeldung an Nutzer
Nur konkrete Erledigungen/Blocker auflisten. Keine erneuten Geschmacksauswahlen, keine Aufforderung zu weiteren Fotos und kein vortäuschendes Fertigmelden.
