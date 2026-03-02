# Diless Design Tokens: Golden Rules

Estas reglas definen como usar los tokens de color en UI para mantener consistencia visual en Diless, incluso cuando se itera sin pasar por Figma.

## Core color tokens (light default)

- `--bg-base`: fondo principal de la app (editor, lectura, páginas).
- `--bg-surface`: fondo de contenedores flotantes y paneles (`account`, `share`, `shortcuts`, `projects`, `chat`).
- `--bg-overlay`: fondo de contenedores internos/fijos sobre `bg-base` o `bg-surface` (inputs, bubbles, overlays suaves).
- `--bg-hover`: fondo hover para superficies con `bg-surface` o `bg-overlay`.

- `--text-primary`: textos primarios.
- `--text-muted`: textos secundarios.
- `--text-dim`: placeholders y metadata de baja jerarquía.

- `--border-subtle`: borde default para inputs, paneles, divisores.
- `--border-accent`: borde acentuado cuando un control necesita más énfasis.

- `--brand-accent`: color principal de marca.
- `--brand-border`: borde asociado al color de marca.
- `--accent-primary`: color secundario de marca / acento UI.

## Container rules

- Paneles flotantes (`dropdowns`, `popovers`, `menus`, `chat card`, `share panel`, `project switcher`) deben usar `--bg-surface`.
- Contenedores internos dentro de paneles (`input`, `user bubble`, áreas de edición de texto corto) deben usar `--bg-overlay`.
- Hover de items dentro de paneles debe usar `--bg-hover`.

## Typography rules (semantic system)

- `--font-sans`, `--font-ui` y `--font-reading` usan `Helvetica Neue`.
- `--font-serif` (`Roboto Serif`) se usa para todos los títulos `display/*` y `heading/*`.
- `--font-code` se usa para labels mono (paneles UPPERCASE), atajos y snippets.

### Golden rule: semantic prefixes are atomic

- Los tokens semánticos se usan **por prefijo completo**.
- No mezclar prefijos entre propiedades. Ejemplo:
  - ✅ `--heading-md-size` + `--heading-md-line` + `--heading-md-spacing`
  - ❌ `--display-sm-size` junto a `--heading-lg-line`

### Heading / Display (Roboto Serif)

- `display-sm`: H1 de landing / títulos editoriales grandes (en la app lo usamos para el título principal del artículo/apunte).
- `heading-lg`: títulos de 1ra jerarquía en app (menos frecuente).
- `heading-md`: títulos de 2da jerarquía (page title de lectura, `h1` de reading markdown).
- `heading-sm`: títulos de 3ra jerarquía (`h2` de reading markdown).
- `heading-xs`: títulos de 4ta jerarquía (`h3` de reading markdown).

Propiedades compartidas (no tokenizadas) para `display/*` y `heading/*`:
- `font-family: var(--font-serif)`
- `font-weight: 560`
- `font-variation-settings: 'GRAD' -40, 'wdth' 53, 'opsz' 88`

### Text (Helvetica Neue)

- `text-xl`: títulos UI grandes (flows, modales, secciones fuera del artículo).
- `text-lg`: títulos UI medianos.
- `text-md`: cuerpo mediano / subtítulos UI.
- `text-sm`: body UI pequeño e inputs.
- `text-xs`: captions, metadata menor y helper text.

Todos los `text-*` usan por defecto:
- `font-family: var(--font-ui)`
- `font-weight: var(--weight-regular)`

Para destacar cuerpo de texto:
- `--weight-medium`
- `--weight-ibold`

### Reading body (editor + read page)

- `--type-reading-body-*` gobierna:
  - cuerpo del artículo
  - cuerpo del editor markdown
  - subtitle del editor (para responder al switch `A+ / A-`)
- El switch de tamaño (`A+`) solo modifica `--type-reading-body-size`, `--type-reading-body-line`, `--type-reading-body-tracking`.

## Implementation notes

- Preferir tokens semánticos (`--bg-surface`, `--text-muted`) antes que hex directos.
- Si aparece un color hardcoded repetido, promoverlo a token antes de reutilizarlo.
- Mantener compatibilidad con tokens legacy (`--accent`) mientras siga existiendo código heredado.
- Evitar crear tokens sueltos de `size/line/spacing` fuera de un prefijo semántico (`display-*`, `heading-*`, `text-*`) salvo casos especiales como `type-reading-body` o `type-mono-xs`.
