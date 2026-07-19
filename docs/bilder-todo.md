# Bilder-Todo — Übungen ohne Foto

_Automatisch aus `data/poses.json` erzeugt (leeres `image`-Feld ⇒ Strichmännchen-Fallback)._
_Stand: 2026-07-19 · 11 von 85 Übungen ohne Bild._

Sobald ein Foto vorliegt: WebP nach `img/<id>.webp` legen (die `optimize-images`-Action
wandelt hochgeladene PNG/JPG automatisch um) und in `data/poses.json` das `image`-Feld
der Pose auf `"img/<id>.webp"` setzen.

| # | Übung | id | Position | Typ |
|---:|---|---|---|---|
| 1 | Hüftheben | `gluteBridge` | lying | Kraft |
| 2 | Sumo-Kniebeuge | `sumoSquat` | standing | Kraft |
| 3 | Rückwärts-Ausfallschritt | `reverseLunge` | standing | Kraft |
| 4 | Beinheben | `legRaise` | lying | Kraft |
| 5 | Beinscheren | `flutterKicks` | lying | Kraft |
| 6 | Russischer Twist | `russianTwist` | seated | Kraft |
| 7 | Pike-Liegestütz | `pikePushup` | kneeling | Kraft |
| 8 | Plank mit Schultertippen | `plankShoulderTap` | lying | Kraft |
| 9 | Beinheben rückwärts | `gluteKickback` | kneeling | Kraft |
| 10 | Sprung-Ausfallschritte | `jumpingLunge` | standing | Kraft |
| 11 | Skater-Sprünge | `skater` | standing | Kraft |

---

Regenerieren: `node tools/list-missing-images.js`
