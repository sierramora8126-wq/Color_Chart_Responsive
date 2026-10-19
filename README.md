# Allied S&T Color Selector V4.1

A customer-facing local prototype built with HTML + CSS + Three.js + JSON.

## Run
1. Open this folder in VS Code.
2. Make sure Live Server is enabled.
3. Right-click `index.html` -> Open with Live Server.
4. Keep the internet connection enabled because Three.js is loaded from a CDN.

## V3 model improvements
- Clean gable main building with roof slopes and roof panel seams.
- Vertical wall panel joints and wainscot break.
- Separate formed-looking corner, eave, rake, ridge, base, jamb, head, gutter and downspout elements.
- Front canopy with posts and gable framing.
- Right-side annex to show an additional roof condition.
- Separate optional parapet condition.
- Customer callouts positioned around the model.
- Front / isometric / side views.
- Allied color catalog from the supplied color chart.

## V4.1 changes
- Parapet is now built on the existing building's sidewall (left / right / both) with cap trim + back panel; the separate parapet building was removed.
- "F.O. Trims" is a single group (jambs, heads, sills).
- Wainscot is optional: panel color, trim yes/no, trim color.
- Every optional item has an "N/A" color option that removes it from the 3D model (canopy, lean-to, gutter, downspout, ridge, rake, eave, corner, base, F.O. trims).
- SIGN AND PRINT works: validates customer data, captures signature, prints a 2-page sheet (selections + color reference).

## V4.2 changes
- MODEL OPTIONS now sits under Customer Information: Canopy, Lean-to, Parapet (+ side), Wainscot (+ trim) and Liner Panel (None / Wall / Roof / Wall + Roof). All start deactivated.
- An optional item appears in BUILDING COLORS, in the 3D model, in the callouts and in the printed sheet only while it is activated.
- Liner Panel adds "Liner Panel - Wall" / "Liner Panel - Roof" colors. With a liner active, a side cutaway (toggle) hides the right half of the building so the interior liner can be seen.
- Wall liner: Full height or selected height (4-14 ft). With a selected height you can add Base Trim Liner and Cap Trim Liner (each with its own color). Roof liner is color only. The wall liner leaves doors, windows and louvers open.
- Eave gutter and rake trim are now modeled from PBR-style sheet profiles (pointed face, lips, step and hem) instead of plain boxes.
- "Show panel seams" removed: seams are always visible.

## V4.3 changes (responsive)
- Celular/tablet en vertical: el modelo 3D queda arriba (46% de la altura) y los controles hacen scroll debajo, así el cliente ve el cambio de color mientras elige. En horizontal se mantiene el layout lado a lado con sidebar más angosto.
- La cámara se aleja automáticamente según el aspecto de la pantalla (el edificio completo cabe en vertical) y las vistas FRONT / ISO / SIDE respetan ese ajuste.
- En pantallas pequeñas aparece un selector flotante Front / Iso / Side sobre el modelo, y las etiquetas (callouts) pasan a un formato compacto.
- Táctil: orbitar con un dedo, pellizcar para zoom, dos dedos para desplazar, tocar una pieza para encontrar su color. Controles de 44 px y campos de 16 px (sin zoom automático en iOS).
- La hoja impresa (SIGN AND PRINT) ahora captura las 2 vistas con un encuadre fijo, sin importar el tamaño de la pantalla.
- Sombras a 2048 px en dispositivos táctiles para mejor rendimiento.
