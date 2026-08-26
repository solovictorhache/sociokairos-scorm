# sociokairos-stats-worker

Contador de uso anónimo para SOCIOKAIROS Research (línea Profesional). No
sustituye al formulario de registro (Formspree, nombre/institución/email):
esto es un ping sin datos personales — un id de dispositivo al azar guardado
en `localStorage` — para poder contar dispositivos activos sin depender de
los límites de envíos de Formspree.

La base de datos D1 (`sociokairos-stats`) ya existe en tu cuenta de
Cloudflare. Falta un solo paso, que no se puede hacer desde este entorno de
Claude por una restricción de red del sandbox (no por permisos): desplegar
el Worker desde tu propio ordenador.

## Desplegar (una vez, ~2 minutos)

```bash
cd cloudflare/stats-worker
npx wrangler login          # abre el navegador para autenticarte
npx wrangler deploy         # sube y publica el Worker
npx wrangler secret put ADMIN_KEY   # te pide un valor: invéntate una clave y guárdala
```

Al terminar, `wrangler` imprime la URL pública, algo como:

```
https://sociokairos-stats-worker.<tu-subdominio>.workers.dev
```

## Después de desplegar

1. Copia esa URL.
2. Pégamela (o edita tú mismo `SK_STATS_PING_ENDPOINT` en
   `native-app/pro-src/wiring.js`) y reconstruye la app Profesional con
   `python3 native-app/pro-src/build_pro.py`.
3. Para ver el conteo: `https://<tu-worker>.workers.dev/count?key=<tu ADMIN_KEY>`.

## Notas

- No hay datos personales en esta base: solo un id de dispositivo aleatorio,
  fecha y, opcionalmente, versión/plataforma de la app.
- Si algún día quieres borrar todo: `npx wrangler d1 execute sociokairos-stats --command "DELETE FROM pings"`.
