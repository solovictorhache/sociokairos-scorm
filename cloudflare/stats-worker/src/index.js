/**
 * Contador de uso anónimo de SOCIOKAIROS Research (línea Profesional).
 *
 * No sustituye al formulario de registro (nombre/institución/email vía
 * Formspree): esto es un ping sin datos personales, un id de dispositivo
 * generado al azar y guardado en localStorage, para poder contar cuántos
 * dispositivos activos hay sin depender de límites de envíos de Formspree.
 *
 * Rutas:
 *   POST /ping   { device_id, app_version?, platform? } -> 201
 *   GET  /count  -> { total, dispositivos_unicos } (requiere ?key=ADMIN_KEY)
 */

function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return resp;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    if (request.method === "POST" && url.pathname === "/ping") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return cors(new Response("JSON inválido", { status: 400 }));
      }
      const deviceId = String(body.device_id || "").slice(0, 100);
      if (!deviceId) {
        return cors(new Response("Falta device_id", { status: 400 }));
      }
      const appVersion = String(body.app_version || "").slice(0, 40);
      const platform = String(body.platform || "").slice(0, 40);

      await env.DB.prepare(
        "INSERT INTO pings (device_id, app_version, platform) VALUES (?, ?, ?)"
      ).bind(deviceId, appVersion, platform).run();

      return cors(new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }));
    }

    if (request.method === "GET" && url.pathname === "/count") {
      if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) {
        return cors(new Response("No autorizado", { status: 401 }));
      }
      const totalRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM pings").first();
      const uniqueRow = await env.DB.prepare("SELECT COUNT(DISTINCT device_id) AS n FROM pings").first();
      return cors(new Response(JSON.stringify({
        total_pings: totalRow.n,
        dispositivos_unicos: uniqueRow.n,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    return cors(new Response("Not found", { status: 404 }));
  },
};
