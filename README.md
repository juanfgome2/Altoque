# ALTOQUE

Aplicación web local de mandados y delivery para conectar clientes, deliverys y administradores.

Lema: **Lo que necesites, al toque.**

## Configuración Firebase

1. Creá un proyecto en Firebase.
2. Activá Authentication con proveedor Email/Password.
3. Activá Cloud Firestore.
4. Copiá la configuración web del proyecto en `js/firebase-config.js`.
5. Publicá reglas tomando como base `firebase.rules`.

Para crear un administrador, registrá un usuario normal y cambiá su documento en `users/{uid}`:

```json
{
  "role": "admin",
  "status": "active",
  "suspended": false
}
```

## Estructura

- `index.html`: estructura de pantallas, formularios y paneles.
- `Stylo.css`: diseño responsive, minimalista, verde y blanco.
- `app.js`: archivo legado para evitar caché rota; la app real está en `js/app.js`.
- `js/app.js`: arranque, eventos de formularios y suscripciones en tiempo real.
- `js/firebase-config.js`: credenciales y ajustes editables de Firebase.
- `js/firebase.js`: inicialización de Firebase y APIs usadas.
- `js/services.js`: operaciones de Authentication y Firestore.
- `js/state.js`: estado global y limpieza de listeners.
- `js/dom.js`: referencias DOM, toast y utilidades visuales.
- `js/router.js`: navegación entre landing, auth y paneles.
- `js/render.js`: renderizado de pedidos, usuarios, chat y suscripciones.
- `js/format.js`: formatos de fechas, dinero, estados y snapshots.
- `firebase.rules`: reglas base de seguridad para Firestore.
- `dev-server.ps1`: servidor local simple para probar módulos ES sin Node/Python.

## Probar en local

```powershell
powershell -ExecutionPolicy Bypass -File .\dev-server.ps1
```

Después abrí `http://127.0.0.1:5173/`.

## Colecciones Firestore

- `users`: perfiles con `role`, `status`, `available` y `suspended`.
- `orders`: pedidos con cliente, delivery, estado, categoría, dirección y calificación.
- `messages`: chat interno por `orderId`.
- `subscriptions`: planes gestionados por administrador.

## Capacitor

El proyecto no depende de un framework ni de APIs del navegador incompatibles. Para empaquetarlo luego:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init ALTOQUE com.altoque.app --web-dir .
npx cap add android
```
