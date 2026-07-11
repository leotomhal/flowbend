#!/usr/bin/env python3
"""Gleicht data/poses.json mit den Bildern in img/ ab.

Zeigt, welche Pose-Bilder fehlen, welche vorhanden sind und welche mit
falscher Dateiendung vorliegen (poses.json erwartet exakt img/<id>.png).

Aufruf:  python3 tools/check-poses.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "img")

poses = json.load(open(os.path.join(ROOT, "data", "poses.json"), encoding="utf-8"))
existing = {f for f in os.listdir(IMG)
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))}

present, missing, mismatch = [], [], []
for p in poses:
    want = os.path.basename(p["image"])          # z. B. cobra.png
    stem = os.path.splitext(want)[0]
    if want in existing:
        present.append(p["id"])
    else:
        alt = sorted(e for e in existing if os.path.splitext(e)[0] == stem)
        if alt:
            mismatch.append((p["id"], want, alt[0]))
        else:
            missing.append((p["id"], p["name"]))

stems = {os.path.splitext(os.path.basename(p["image"]))[0] for p in poses}
extra = sorted(e for e in existing if os.path.splitext(e)[0] not in stems)

print(f"Posen: {len(poses)}  |  vorhanden: {len(present)}  |  "
      f"fehlen: {len(missing)}  |  falsche Endung: {len(mismatch)}")

if missing:
    print(f"\n❌ FEHLEN ({len(missing)}):")
    for pid, name in missing:
        print(f"   img/{pid}.png   – {name}")

if mismatch:
    print(f"\n⚠️  FALSCHE ENDUNG ({len(mismatch)}) – App erwartet .png:")
    for pid, want, have in mismatch:
        print(f"   habe img/{have}  →  umbenennen in img/{want}")

if extra:
    print(f"\nℹ️  UNZUGEORDNET ({len(extra)}) – Bild ohne passende Pose-id:")
    for e in extra:
        print(f"   img/{e}")

if not missing and not mismatch:
    print("\n✅ Alle 58 Pose-Bilder vorhanden.")
