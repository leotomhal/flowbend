# Pose-Bilder

Hier liegen die Pose-Bilder und die App-Icons.

- Die App nutzt **WebP**: Dateiname = Pose-`id` aus `data/poses.json`, z. B. `img/cobra.webp`.
- **PNG/JPG einfach hochladen genügt** – die `optimize-images`-Action verkleinert sie auf
  max. 800 px und wandelt sie automatisch in `img/<id>.webp` um (das Original wird entfernt).
- **Case-sensitive** auf Linux-Hosts: `Cobra.webp` lädt nicht und fällt aufs Strichmännchen zurück.
- Fehlt ein Bild oder lädt es nicht, zeigt flowbend automatisch das animierte SVG-Strichmännchen.
- `icon.svg`, `icon-192.png`, `icon-512.png` sind die PWA-/Browser-Icons.

Empfohlen: quadratisch bis hochkant, heller Hintergrund, möglichst einheitlicher Stil
(die App zeigt sie in voller Breite bis max. 340 px Höhe).
