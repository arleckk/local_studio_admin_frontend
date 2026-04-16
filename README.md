# Local Studio Admin Frontend

Frontend separado en React + Vite para `local_studio_backend`.

Está pensado como consola inicial para:

- login / register / logout
- ver sesión actual
- bootstrap de acceso al publisher
- ver access/memberships del publisher
- crear/editar metadata de plugins
- subir releases
- listar members e invitations
- ver review queue y ejecutar approve / reject / request changes

## Stack

- React 18
- TypeScript
- Vite
- CSS simple sin dependencias UI externas

## Requisitos

- Node.js 20+
- `local_studio_backend` corriendo

## Variables de entorno

Copia `.env.example` a `.env` y ajusta lo que necesites.

### Opción A — llamar directo al backend

```bash
VITE_API_BASE_URL=http://localhost:45121
```

Esto hace que el navegador llame directo a FastAPI.

### Opción B — usar proxy de Vite en desarrollo

```bash
VITE_DEV_PROXY_TARGET=http://localhost:45121
```

En esta opción puedes dejar `VITE_API_BASE_URL` vacío para trabajar sobre rutas relativas `/api/...`.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Valores por defecto útiles para local

Si no cambias nada, la UI ya puede precargar estos valores cuando existan en `.env`:

- `VITE_DEFAULT_PUBLISHER_SLUG=local-studio`
- `VITE_DEFAULT_PUBLISHER_API_KEY=local-studio-backend-publisher`
- `VITE_DEFAULT_ADMIN_API_KEY=local-studio-backend-admin`

## Flujo recomendado

1. Login o register.
2. En **Publisher**, usar la API key una sola vez en **Grant my account access**.
3. Cargar memberships y profile.
4. En **Plugins**, crear el plugin.
5. En **Releases**, subir el paquete.
6. En **Admin reviews**, revisar la cola y aprobar/rechazar.

## Nota importante sobre CORS

El backend actual ya viene con CORS abierto por defecto en desarrollo, así que esta app puede correr en otro puerto sin problema.
