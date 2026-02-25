# Diless AI Setup (Anthropic)

Esta guía deja AI funcionando primero en local y luego en producción.

## Resumen de arquitectura

- `Frontend` (Vercel / `diless.vercel.app`)
- `Backend` Express (Railway / Render / Fly)
- `Supabase` (DB + Auth)
- `Anthropic API` (Claude)

Importante:
- La API key de Anthropic va **solo en el backend**.
- El frontend nunca debe exponer `ANTHROPIC_API_KEY`.

## 1) Activar AI en local

### Backend (`server/.env`)

Edita `server/.env` y agrega/ajusta:

```env
AI_ENABLED=true
ANTHROPIC_API_KEY=tu_api_key_de_anthropic

# Opcional (si quieres ajustar modelo o comportamiento)
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_TEMPERATURE=0.7
```

Notas:
- `ANTHROPIC_MODEL` ahora es configurable por env.
- `ANTHROPIC_TEMPERATURE` es opcional (0 a 1).

### Frontend (`apps/web/.env.local`)

Edita `apps/web/.env.local` y ajusta:

```env
VITE_AI_ENABLED=true
VITE_CHAT_API_URL=http://localhost:3003
```

## 2) Levantar local (web + server)

Desde la carpeta del proyecto:

```bash
cd "/Users/santiventura/Documents/Idea to MVP/Diless App"
npm run dev
```

### Verificación rápida

- Web: `http://localhost:5176`
- Health backend: `http://localhost:3003/health`

`/health` ahora devuelve si AI está activa y qué modelo está usando.

Ejemplo esperado:

```json
{
  "status": "ok",
  "ai": {
    "enabled": true,
    "provider": "anthropic",
    "model": "claude-sonnet-4-6"
  }
}
```

## 3) Qué esperar al activarlo

- El chat AI reaparece en la UI (porque `VITE_AI_ENABLED=true`).
- Si `AI_ENABLED=true` pero falta `ANTHROPIC_API_KEY`, el backend no inicia (esperado).
- MCP `arena` quedó desactivado por default para evitar warnings durante este setup.

## 4) Producción (Diless)

### Frontend (Vercel proyecto `diless`)

Variables ya usadas por el frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CHAT_API_URL`
- `VITE_AI_ENABLED`

Para activar AI en producción:

- `VITE_AI_ENABLED=true`
- `VITE_CHAT_API_URL=https://TU_BACKEND_PUBLICO`

## 5) Backend de producción (Railway recomendado)

Despliega la carpeta `server` (o el repo con root adecuado) en Railway/Render/Fly.

Variables mínimas del backend:

```env
PORT=3003
FRONTEND_URL=https://diless.vercel.app

SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

AI_ENABLED=true
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Opcionales:

```env
ANTHROPIC_TEMPERATURE=0.7
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

## 6) Activación final en producción (orden recomendado)

1. Desplegar backend con `AI_ENABLED=true` y `ANTHROPIC_API_KEY`.
2. Probar `https://TU_BACKEND/health`.
3. En Vercel (`diless`), cambiar:
   - `VITE_CHAT_API_URL=https://TU_BACKEND_PUBLICO`
   - `VITE_AI_ENABLED=true`
4. Deploy a producción:

```bash
cd "/Users/santiventura/Documents/Idea to MVP/Diless App"
npm run vercel:prod
```

## 7) Siguiente paso recomendado (Diless)

Antes de abrir AI a usuarios:
- adaptar el prompt a preparación de sermones
- definir límites de uso/costo
- decidir si usarás Stripe desde el inicio o después
