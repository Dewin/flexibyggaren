# FlexiByggaren 🚙🛤️

En interaktiv Progressive Web App (PWA) för att fota sina **Flexi-Trax**-delar, spara sitt garage och få skräddarsydda banförslag med **LEGO-liknande steg-för-steg-ritningar** och **svensk röstuppläsning**.

## Funktioner
- 📸 **100% Lokal Bildscanner**: Ta kort på dina räls-sektioner och specialdelar direkt med mobilkameran. Webbläsaren analyserar färger (röd, gul, blå, grön) och former helt lokalt via Canvas och räknar ut ungefärligt antal bitar, centimeter och specialdelar.
- 🧰 **Mitt Garage**: Sparas automatiskt i telefonen (`localStorage`). Visar både **antal rälsbitar/länkar** och **längd i cm / meter** (`1 bit ≈ 2,25 cm`) samt alla viktiga specialdelar:
  - 🏛️ Brostöd / Bropelare (Våning 2)
  - 🌉 Fast Bro / Hängbro
  - 🔀 Y-växlar (Spårbyte)
  - ✖️ X-korsning (4-vägskorsning)
  - ⛰️ Tunnel / Grotta / Berg
  - 🔄 Vändskiva / Loop / Ramp
- 🗺️ **Smarta Banförslag & Slumpgenerator**:
  - Skalar automatiskt banornas längd och specialdelar efter ditt garage.
  - Inkluderar bl.a. **🏆 Stora Mega-Banan ("Använd ALLA våra delar!")**, **🎱 Klassiska Bro-Åttan**, **🌉 Bro- & Tunneldalen**, **🔀 Växel-Labyrinten**, **🟢 Lilla Sprint-Rundan**, **🐍 Orm-Slingan Grand Prix** samt en **🎲 Slumpa ny bana!**-generator.
- 📐 **Interaktiv Steg-för-Steg-ritning (LEGO-manual-vy)**:
  - Visar exakt vilka delar (`antal bitar`, `ca cm` och `specialdelar`) som ska plockas fram i varje steg.
  - Aktuellt steg lyser upp på SVG-ritningen med tydliga **A ➔ B**-kopplingspunkter, riktningspilar och våning-markering (**Våning 1** på golvet vs **Våning 2** uppe på bropelare).
  - **🚙 Testkör bilen!**: Animerar en Flexi-Trax-bil som kör runt hela den ritade banan med tuta och strålkastare!
- 🗣️ **Svensk Röstuppläsning & Ljudeffekter**: Läser automatiskt upp varje byggsteg på svenska (`Web Speech API`) så barnen kan trycka *"Nästa steg"* och bygga själva!
