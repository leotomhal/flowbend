#!/usr/bin/env python3
"""Invariantencheck für die flowbend-Daten.

Prüft:
- jede Pose hat alle Pflichtfelder,
- keine doppelten Pose-ids,
- jedes in poses.json referenzierte Bild existiert in img/,
- jede poseId in routines.json existiert in poses.json.

Exit-Code != 0 bei Fehlern (für CI). Aufruf: python3 tools/check-data.py
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED = ["id", "name", "focus", "position", "image",
            "spine", "lLeg", "rLeg", "lArm", "rArm", "head"]

poses = json.load(open(os.path.join(ROOT, "data", "poses.json"), encoding="utf-8"))
routines = json.load(open(os.path.join(ROOT, "data", "routines.json"), encoding="utf-8"))

errors, ids = [], set()
for p in poses:
    pid = p.get("id", "?")
    for k in REQUIRED:
        if k not in p:
            errors.append(f"Pose {pid}: Pflichtfeld '{k}' fehlt")
    if pid in ids:
        errors.append(f"Doppelte Pose-id: {pid}")
    ids.add(pid)
    img = p.get("image")
    if img and not os.path.isfile(os.path.join(ROOT, img)):
        errors.append(f"Pose {pid}: Bild fehlt ({img})")

for r in routines:
    for ex in r.get("exercises", []):
        if ex.get("poseId") not in ids:
            errors.append(f"Routine {r.get('id')}: poseId '{ex.get('poseId')}' existiert nicht in poses.json")

if errors:
    print("❌ Datencheck fehlgeschlagen:")
    for e in errors:
        print("   -", e)
    sys.exit(1)

print(f"✅ OK: {len(poses)} Posen, {len(routines)} Routinen – alle poseIds & Bilder vorhanden.")
