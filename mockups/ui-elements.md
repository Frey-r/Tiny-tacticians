# Catálogo: UI Elements

Inventario visual del pack de interfaz en `src/client/assets/sprites/UI Elements/`
(+ `UI Dices/` al mismo nivel). Es un set "hand-drawn" medieval/fantasía repartido
en 3 sub-carpetas:

- `UI Elements/UI Elements/` — set principal (botones, barras, iconos, avatares...).
- `UI Elements/UI Banners from the store page/` — extra de banners/cintas de la página de la tienda del asset.
- `UI Elements/UI Dices/` — spritesheet de dados.

Estado: ✅ ya integrado en el código (`assets.ts`) · ⬜ disponible pero sin usar todavía.

| Carpeta / archivo | Qué es (visual) | Para qué sirve en Tiny Tacticians | Estado |
|---|---|---|---|
| `Banners/Banner.png` + `Banner_Slots.png` | Panel rectangular tipo madera/pergamino azul oscuro, esquinas redondeadas y borde negro grueso. `_Slots` es la guía 9-slice (3×3) de la misma textura. | Fondo de paneles/diálogos: ya expuesto como `PANEL.banner` en `assets.ts`. | ✅ (Banner) / ⬜ (Banner_Slots, solo guía de recorte) |
| `Bars/BigBar_Base`, `BigBar_Fill`, `SmallBar_Base`, `SmallBar_Fill` | Barra alargada de extremos redondeados. "Base" = fondo bisel vacío; "Fill" = franja de color con brillo, pensada para recortar en X según progreso. | Barra de vida/energía en combate (RunPlayScene, PvpCombatScene), XP de consejeros, progreso de reclutamiento. | ✅ SmallBar en `hpBar` (fill horneado en gris y tintado verde/rojo) / ⬜ BigBar |
| `Buttons/*` (Big/Small/Tiny × Blue/Red × Round/Square × Regular/Pressed) | Familia completa de botones con estado presionado, dos colores (azul = acción neutral/confirmar, rojo = peligro/cancelar) y tres tamaños. | Reemplazar los botones planos de `widgets.ts` (CTA "JUGAR", cerrar, confirmar combate) con feedback visual real de pulsado. | ✅ `retroButton`: lime→BigBlue, maroon→BigRed, grey→SmallBlueSquare desaturado, con arte Pressed real (ver `ui/bake.ts`) / ⬜ Tiny y Round |
| `Cursors/Cursor_01..04` | 4 cursores dibujados a mano (flecha simple, flecha con brillo, variantes en azul/blanco). | Cursor custom vía CSS (`cursor: url(...)`) sobre el canvas, para reforzar identidad visual en vez del puntero del sistema. | ⬜ |
| `Human Avatars/Avatars_01..25` | 25 retratos 256×256 (guerreros, encapuchados, magas, etc.), estilo pintado. | Retrato estable por consejero/general vía `avatarFor(seed)` / `avatarKeyFor(seed)` (hash del id). | ✅ |
| `Icons/Icon_01..12` | Iconos 64×64: mazo, tronco, moneda, carne, espada, escudo, flecha verde, flecha naranja, cruz, engranaje, info, nota musical. | Recursos (madera/oro/carne), stats OFE/DEF, flechas de progreso, cerrar, opciones, ayuda, música — vía `ICON.*`. | ✅ |
| `Papers/RegularPaper`, `SpecialPaper` | Textura de pergamino envejecido en dos tonos (beige normal / gris-azulado con detalle dorado en la esquina), preparada para 9-slice. | Fondo de tarjetas y modales vía `PANEL.paper` / `PANEL.paperSpecial`; "special" ideal para resaltar rareza o eventos especiales. | ✅ |
| `Ribbons/BigRibbons.png`, `SmallRibbons.png` | Cintas/banderines en 5 colores (turquesa, rojo, amarillo, morado, gris-azul), 3 formas c/u: bandera con muesca, rectángulo plano, bandera en punta. | Etiqueta de rareza/rol de consejero (color = tier), nameplate sobre unidades en combate, distintivo "nuevo"/"jefe". | ⬜ |
| `Swords/Swords.png` | Espada clavada en base de piedra en los mismos 5 colores que Ribbons, + variantes de "hoja suelta" a juego. | Separador visual entre secciones, marcador de tier de arma, decoración de cabecera en pantallas de combate. | ⬜ |
| `Wood Table/WoodTable.png`, `WoodTable_Slots.png` | Tablón de madera oscura con veta horizontal, panel cuadrado. `_Slots` trae el 9-slice. | Fondo de bandeja de recompensas/inventario o tablero donde se disponen las cartas de consejero — variedad de material frente al "paper". | ⬜ |
| `UI Banners from the store page/Banner/Banner.png`, `Slots.png` | Banner vertical más elaborado: cabecera de pergamino con cinta turquesa colgando (recta o en punta, varias combinaciones en la hoja). | Cabecera de pantallas grandes (Home, resultado de combate) o modal de recompensa destacada. | ⬜ |
| `UI Banners from the store page/Ribbons/Ribbon_{Black,Blue,Purple,Red,Yellow}.png` | Cinta suelta de un solo color por archivo (a diferencia de la hoja combinada `Ribbons/SmallRibbons`). | Mismo uso que `Ribbons/*` pero como textura individual — más simple de cargar en Phaser sin recortar spritesheet. | ⬜ |
| `UI Dices/dices_sprite.png` | Spritesheet 6×3 (168×86, frame 28×28): fila superior = caras 1-6 con pips, fila central = dados "en blanco" (giro), fila inferior = símbolos/gemas. | Resolución de combate por dados (`diceRoller.ts`, ver [decisions/0011](../decisions/0011-resolucion-por-dados.md)) vía `DICE` en `assets.ts`. | ✅ (fila de símbolos inferior aún libre) |

## Prioridad sugerida para mejorar el estilo

1. ~~**Buttons**~~ ✅ integrados en `retroButton` (todas las pantallas heredan el skin).
2. ~~**Bars**~~ ✅ SmallBar integrada en `hpBar` (combate). BigBar libre para XP/progreso.
3. **Ribbons / Ribbon_\*** — colorea rareza/tier de consejeros y remates de tarjetas sin esfuerzo (ya combinan con Papers/Swords).
4. **Wood Table** y **Cursors** — detalles de ambientación, menor prioridad.

> Nota técnica: los PNG de Buttons grandes y Bars vienen como parches 3×3/3×1
> separados por huecos transparentes ("slots"). `ui/bake.ts` los recompone en
> BootScene en texturas contiguas nine-slice (`UI_BAKES`/`BTN_SKIN`/`BAR_SKIN`
> en `assets.ts`, rangos medidos píxel a píxel).
