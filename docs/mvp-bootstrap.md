# Sermon MVP Bootstrap (Puntos 2-5)

Estado actual (preparado):
- Repo local en `sermon-prep-mvp`
- Rama base creada: `codex/sermon-mvp-bootstrap`
- AI opcional habilitada por flag (`AI_ENABLED` / `VITE_AI_ENABLED`)

## 2) Fork + clone (pendiente en tu cuenta de GitHub)

Haz el fork del repo original en GitHub (UI web) y luego reconfigura remotes en este clone local:

```bash
cd "/Users/santiventura/Documents/Idea to MVP/sermon-prep-mvp"

# Conservar el repo original como upstream
git remote rename origin upstream

# Reemplazar con tu fork (ajusta TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/hermes.git

# Subir tu rama base
git push -u origin codex/sermon-mvp-bootstrap
```

## 3) Baseline local (levantar proyecto original)

Instalar dependencias:

```bash
npm install
```

Variables de entorno:
- Web: crear `apps/web/.env.local`
- Server: crear `server/.env`

Para este MVP (sin AI):
- `AI_ENABLED=false` en `server/.env`
- `VITE_AI_ENABLED=false` en `apps/web/.env.local`

Levantar web + server:

```bash
npm run dev
```

Notas:
- Con `AI_ENABLED=false`, el backend ya no exige `ANTHROPIC_API_KEY`.
- El chat queda oculto en la UI para evitar errores durante el MVP.

## 4) Rebranding inicial (ya aplicado, mínimo y reversible)

Se ajustaron textos visibles básicos:
- Nombre visible en barra/proyectos: `Sermon Prep`
- Proyecto inicial: `Mi primer sermón`
- Texto inicial del starter project en español

## 5) Infraestructura mínima (sin AI)

### Supabase (Free plan sirve para MVP)

Crear proyecto en Supabase y obtener:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

Configurar esos valores en:
- `apps/web/.env.local`
- `server/.env`

### Migraciones

Opciones:
- Ejecutar los SQL de `supabase/migrations/` en orden (SQL editor), o
- Usar Supabase CLI (si prefieres flujo CLI).

Mínimo recomendado para arrancar:
- Ejecutar todas las migraciones del repo para evitar inconsistencias de features ya existentes.

### Stripe

No necesario para este MVP.
- Puedes dejar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` vacíos.
- El servidor seguirá funcionando (solo billing queda deshabilitado).

### Hosting (más adelante)

Recomendado para MVP:
- Frontend: Vercel
- Backend (Express/SSE): Railway / Render / Fly.io
- DB/Auth: Supabase

## Siguiente paso (cuando cierres el alcance MVP)

Empezar la Fase 1 de producto:
- Dashboard/Home tipo Notion
- Editor de sermón con lienzo único (sin tabs)
- Metadata de sermón y autosave
