#!/usr/bin/env node
/* Erzeugt docs/bilder-todo.md: alle Übungen ohne Foto (leeres image-Feld
   -> Strichmännchen-Fallback). Aufruf: node tools/list-missing-images.js */
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const poses = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "poses.json"), "utf-8"));
const missing = poses.filter(p => !p.image);
const date = new Date().toISOString().slice(0, 10);

let md = "# Bilder-Todo — Übungen ohne Foto\n\n";
md += "_Automatisch aus `data/poses.json` erzeugt (leeres `image`-Feld ⇒ Strichmännchen-Fallback)._\n";
md += `_Stand: ${date} · ${missing.length} von ${poses.length} Übungen ohne Bild._\n\n`;
md += "Sobald ein Foto vorliegt: WebP nach `img/<id>.webp` legen (die `optimize-images`-Action\n";
md += "wandelt hochgeladene PNG/JPG automatisch um) und in `data/poses.json` das `image`-Feld\n";
md += "der Pose auf `\"img/<id>.webp\"` setzen.\n\n";
md += "| # | Übung | id | Position | Typ |\n|---:|---|---|---|---|\n";
missing.forEach((x, i) => {
  md += `| ${i + 1} | ${x.nameDe || x.name} | \`${x.id}\` | ${x.position} | ${x.circuitOnly ? "Kraft" : "Mobilität"} |\n`;
});
md += "\n---\n\nRegenerieren: `node tools/list-missing-images.js`\n";

fs.writeFileSync(path.join(ROOT, "docs", "bilder-todo.md"), md);
console.log(`docs/bilder-todo.md geschrieben (${missing.length} Einträge).`);
