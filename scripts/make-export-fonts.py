"""Build static export fonts (Regular/Bold/Italic/BoldItalic) from assets/fonts.

Run: python3 scripts/make-export-fonts.py && node scripts/gen-export-font-metrics.mjs
OFL: fonts with a Reserved Font Name (Lora, Merriweather, Playfair Display) may
not keep that name once modified (instanced), so their instances get a neutral
family name. Lato ships as static files and is copied unmodified.
"""
import os, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC, OUT = "assets/fonts", "assets/fonts/export"
# id: (family name in export files, upright, italic, fixed axes)
FONTS = {
  "literata": ("Literata Export", "literata/Literata[opsz,wght].ttf", "literata/Literata-Italic[opsz,wght].ttf", {"opsz": 24}),
  "lora": ("Sermon Export Serif A", "lora/Lora[wght].ttf", "lora/Lora-Italic[wght].ttf", {}),
  "merriweather": ("Sermon Export Serif B", "merriweather/Merriweather[opsz,wdth,wght].ttf", "merriweather/Merriweather-Italic[opsz,wdth,wght].ttf", {"opsz": 24, "wdth": 100}),
  "playfair-display": ("Sermon Export Serif C", "playfair-display/PlayfairDisplay[wght].ttf", "playfair-display/PlayfairDisplay-Italic[wght].ttf", {}),
  "source-serif-4": ("Source Serif 4 Export", "source-serif-4/SourceSerif4[opsz,wght].ttf", "source-serif-4/SourceSerif4-Italic[opsz,wght].ttf", {"opsz": 24}),
  "inter": ("Inter Export", "inter/Inter[opsz,wght].ttf", "inter/Inter-Italic[opsz,wght].ttf", {"opsz": 24}),
  "open-sans": ("Open Sans Export", "open-sans/OpenSans[wdth,wght].ttf", "open-sans/OpenSans-Italic[wdth,wght].ttf", {"wdth": 100}),
  "montserrat": ("Montserrat Export", "montserrat/Montserrat[wght].ttf", "montserrat/Montserrat-Italic[wght].ttf", {}),
  "nunito-sans": ("Nunito Sans Export", "nunito-sans/NunitoSans[YTLC,opsz,wdth,wght].ttf", "nunito-sans/NunitoSans-Italic[YTLC,opsz,wdth,wght].ttf", {"opsz": 12, "wdth": 100, "YTLC": 500}),
  "jetbrains-mono": ("JetBrains Mono Export", "jetbrains-mono/JetBrainsMono[wght].ttf", "jetbrains-mono/JetBrainsMono-Italic[wght].ttf", {}),
}
STYLES = [("Regular", False, 400), ("Bold", False, 700), ("Italic", True, 400), ("BoldItalic", True, 700)]

for st in STYLES:
  shutil.copy(f"{SRC}/lato/Lato-{st[0]}.ttf", f"{OUT}/lato-{st[0]}.ttf")

for fid, (name, up, it, extra) in FONTS.items():
  for style, ital, w in STYLES:
    f = TTFont(os.path.join(SRC, it if ital else up))
    axes = {a.axisTag for a in f["fvar"].axes}
    loc = {"wght": w}
    loc.update({k: v for k, v in extra.items() if k in axes})
    inst = instantiateVariableFont(f, loc, updateFontNames=False)
    sub = {"Regular": "Regular", "Bold": "Bold", "Italic": "Italic", "BoldItalic": "Bold Italic"}[style]
    ps = name.replace(" ", "") + "-" + style
    nt = inst["name"]
    for rec in list(nt.names):
      if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
        nt.removeNames(nameID=rec.nameID)
    for pid, eid, lid in [(3, 1, 0x409), (1, 0, 0)]:
      nt.setName(name, 1, pid, eid, lid); nt.setName(sub, 2, pid, eid, lid)
      nt.setName(ps, 3, pid, eid, lid); nt.setName(f"{name} {sub}", 4, pid, eid, lid); nt.setName(ps, 6, pid, eid, lid)
    os2 = inst["OS/2"]; os2.usWeightClass = w
    bold = w == 700
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | (0x20 if bold else 0) | (0x01 if ital else 0) | (0x40 if not bold and not ital else 0)
    inst["head"].macStyle = (1 if bold else 0) | (2 if ital else 0)
    inst.save(f"{OUT}/{fid}-{style}.ttf")
  print(fid)
