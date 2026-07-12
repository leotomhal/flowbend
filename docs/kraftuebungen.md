# Kraft-Übungen — Bild-Briefing

Vorlage zum Erstellen/Prompten der Bilder für weitere Kraft-Übungen.
Dateiname = `id` + `.webp` (case-sensitive). PNG/JPG-Upload genügt – die
`optimize-images`-Action wandelt automatisch in WebP um. Danach trage ich die
`image`-Pfade in `data/poses.json` ein.

## ✅ Bereits vorhanden (mit Fotos)
`pushup` · `situp` · `squat` · `lunge` · `jumpingJack` (laut) · `mountainClimber`

## 🎯 10 weitere Übungen

| Datei | Name (DE) | Fokus | Laut? | Bildbeschreibung (prompt-tauglich) |
|---|---|---|---|---|
| `img/wallSit.webp` | Wandsitz | Beine, Kraft | – | Person sitzt mit dem Rücken flach an einer Wand, Oberschenkel waagerecht, Knie 90°, als säße sie auf einem unsichtbaren Stuhl. Seitenansicht. |
| `img/tricepDip.webp` | Trizeps-Dips | Arme, Brust, Kraft | – | Person stützt sich rücklings mit den Händen auf einer Kante/Bank ab, Beine vorn, Ellbogen beugen sich nach hinten, Gesäß sinkt. Seitenansicht. |
| `img/superman.webp` | Superman | Rücken, Gesäß, Kraft | – | Person in Bauchlage, Arme nach vorn und Beine nach hinten gleichzeitig angehoben, Körper wie eine flache Wippe. Seitenansicht. |
| `img/deadBug.webp` | Käfer (Dead Bug) | Core, Kraft | – | Person auf dem Rücken, Arme senkrecht nach oben, Beine im 90°-Winkel angehoben; gegengleich ein Arm und das andere Bein ausgestreckt. Seitenansicht. |
| `img/bicycleCrunch.webp` | Fahrrad-Crunch | Core, Bauch, Kraft | – | Person auf dem Rücken, Oberkörper angehoben, ein Ellbogen zum gegenüberliegenden angezogenen Knie gedreht, anderes Bein gestreckt. Leichte Schrägansicht. |
| `img/reverseCrunch.webp` | Umgekehrter Crunch | Core, Kraft | – | Person auf dem Rücken, Knie gebeugt zur Brust gezogen, Becken leicht vom Boden gehoben, Arme flach am Boden. Seitenansicht. |
| `img/inchworm.webp` | Inchworm (Raupe) | Ganzkörper, Kraft | – | Person aus dem Vorbeugen, Hände am Boden, „läuft" auf den Händen nach vorn in die Plank-Position. Seitenansicht, gern als eine klare Zwischenpose. |
| `img/squatJump.webp` | Strecksprung | Beine, Kraft | **laut** | Person springt aus der Kniebeuge explosiv nach oben ab, Füße knapp über dem Boden, Körper gestreckt, Arme mitschwingend. Seitenansicht. |
| `img/burpee.webp` | Burpee | Ganzkörper, Kraft | **laut** | Dynamische Ganzkörperübung; als klare Einzelpose die Hocke mit beiden Händen am Boden, Beine nach hinten in die Plank kickend. Seitenansicht. |
| `img/highKnees.webp` | Knieheben (High Knees) | Beine, Kraft | **laut** | Person läuft auf der Stelle, ein Knie hüfthoch angezogen, gegengleicher Arm vorn, aufrechter Oberkörper. Frontal- oder Seitenansicht. |

## Stil-Zusatz (für einen einheitlichen Look)
An jeden Prompt denselben Stil anhängen, passend zu den bestehenden Bildern, z. B.:

> *„… einzelne Figur, ganzer Körper, heller oder transparenter Hintergrund, gleicher Illustrations-/Fotostil wie die übrigen Übungsbilder, warme Orangetöne, keine Zahlen/kein Text im Bild, quadratisch"*

## Hinweise
- **Laute Übungen** (springend/stampfend) bekommen später das `loud`-Flag → werden im **Leise-Modus** automatisch ausgeblendet.
- Nach dem Hochladen: `image`-Pfade in `poses.json` eintragen (mache ich), dann `python3 tools/check-poses.py` zum Abgleich.
- Sinnvolle neue Zirkel danach: z. B. „Ruhiger Core-Zirkel" (nur leise) und „HIIT" (mit lauten Übungen).
