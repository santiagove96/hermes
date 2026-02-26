# Diless Design Tokens: Golden Rules

Estas reglas definen como usar los tokens de color en UI para mantener consistencia visual en Diless, incluso cuando se itera sin pasar por Figma.

## Core color tokens (light default)

- `--bg-base`: fondo principal de la app (editor, lectura, páginas).
- `--bg-surface`: fondo de contenedores flotantes y paneles (`account`, `share`, `shortcuts`, `projects`, `chat`).
- `--bg-overlay`: fondo de contenedores internos/fijos sobre `bg-base` o `bg-surface` (inputs, bubbles, overlays suaves).
- `--bg-elevated`: superficie más alta o estado elevado (cartas blancas / capas con más contraste).
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

## Typography rules (current app usage)

- UI controls y navegación usan fuente UI (`system sans`).
- Editor markdown y lectura pública usan `--font-reading` (`Diless Helvetica Neue`).
- Código, atajos y snippets usan fuente monospace.

## Implementation notes

- Preferir tokens semánticos (`--bg-surface`, `--text-muted`) antes que hex directos.
- Si aparece un color hardcoded repetido, promoverlo a token antes de reutilizarlo.
- Mantener compatibilidad con tokens legacy (`--accent`, `--hermes-accent`, `--hermes-border`) mientras siga existiendo código heredado.
