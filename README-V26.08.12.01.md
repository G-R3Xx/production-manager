# Production Manager V26.08.12.01

## Quote item bleed / spacing

- Added optional **Bleed / spacing per side (mm)** to physical quote items.
- The allowance is applied to all four sides for material nesting/yield only.
- Example: a 50 × 200mm sticker with 5mm spacing uses a 60 × 210mm calculation footprint.
- Client-facing finished size remains 50 × 200mm.
- Roll media, sheet yield, backing and laminate use the enlarged footprint.
- The setting is stored per quote line and restored when the line is edited.
