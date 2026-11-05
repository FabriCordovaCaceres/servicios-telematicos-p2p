/* T4.6 / RQ14 - Pruebas de validacion, puertos y TLS (local o VMs por variables de entorno).
   Node.js 22+. No requiere dependencias. Solo crea tareas de prueba y procura eliminarlas.
   No modifica el codigo del servidor ni detiene procesos. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Sprint 4: direcciones configurables por variables de entorno para ejecutar
// las pruebas contra las VMs. Si no se definen, se usa localhost como antes.
const VARIABLES_URL = ['CS_URL', 'P2P_NODO1', 'P2P_NODO2', 'GATEWAY_URL', 'TAREAS_URL', 'NOTIFICACIONES_URL'];
const sinBarra = (u) => u.replace(/\/+$/, '');
const URL_CS = sinBarra(process.env.CS_URL ?? 'http://localhost:3000');
const URL_N1 = sinBarra(process.env.P2P_NODO1 ?? 'http://localhost:4001');
const URL_N2 = sinBarra(process.env.P2P_NODO2 ?? 'http://localhost:4002');
const URL_GATEWAY = sinBarra(process.env.GATEWAY_URL ?? 'http://localhost:6001');
const URL_TAREAS = sinBarra(process.env.TAREAS_URL ?? 'http://localhost:5001');
const URL_NOTIF = sinBarra(process.env.NOTIFICACIONES_URL ?? 'http://localhost:5002');
const ES_VM = VARIABLES_URL.some((v) => process.env[v]);
const ENTORNO = ES_VM ? 'virtualizado (direcciones por variables de entorno)' : 'local (localhost)';
const PREFIJO = ES_VM ? 'vm-' : '';
function destino(url) {
  const u = new URL(url);
  return { host: u.hostname, puerto: Number(u.port || (u.protocol === 'https:' ? 443 : 80)) };
}
const CONFIG = { arquitectura: "p2p", nombre: "P2P", endpoints: [{ nombre: "P2P nodo 1", base: URL_N1, ruta: "/tasks" }, { nombre: "P2P nodo 2", base: URL_N2, ruta: "/tasks" }], puertos: [destino(URL_N1), destino(URL_N2)] };
const ID = randomUUID().slice(0, 8);
const carpeta = path.dirname(fileURLToPath(import.meta.url));
const evidencias = path.join(carpeta, 'evidencias');
const pruebas = [];
const registrar = (prueba, estado, esperado, observado, detalle = '') => {
  pruebas.push({ prueba, estado, esperado, observado, detalle });
  console.log(`[${estado}] ${prueba}: ${observado}${detalle ? ' | ' + detalle : ''}`);
};
async function pedir(base, metodo, ruta, cuerpo, tipo = 'json') {
  const opciones = { method: metodo, signal: AbortSignal.timeout(4500) };
  if (cuerpo !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = tipo === 'raw' ? cuerpo : JSON.stringify(cuerpo);
  }
  try {
    const r = await fetch(base + ruta, opciones);
    const texto = await r.text();
    let datos = texto;
    try { datos = JSON.parse(texto); } catch { /* respuesta no JSON */ }
    return { codigo: r.status, datos, cabeceras: Object.fromEntries(r.headers) };
  } catch (error) { return { codigo: null, error: String(error?.cause?.code ?? error?.message ?? error) }; }
}
function evaluar(nombre, resultado, esperados, detalle = '') {
  const coincide = resultado.codigo !== null && esperados.includes(resultado.codigo);
  registrar(nombre, coincide ? 'OK' : resultado.codigo === null ? 'ERROR' : 'HALLAZGO',
    esperados.join('/'), resultado.codigo ?? resultado.error, detalle);
  return coincide;
}
async function comprobarPuerto(host, puerto) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: puerto });
    const terminar = (estado) => { socket.destroy(); resolve(estado); };
    socket.setTimeout(1800, () => terminar('TIMEOUT'));
    socket.once('connect', () => terminar('ABIERTO'));
    socket.once('error', (e) => terminar(e.code ?? e.message));
  });
}
async function comprobarTls(host, puerto) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: puerto, ...(net.isIP(host) ? {} : { servername: host }), rejectUnauthorized: true });
    let listo = false;
    const terminar = (resultado) => { if (listo) return; listo = true; socket.destroy(); resolve(resultado); };
    socket.setTimeout(2200, () => terminar('TIMEOUT'));
    socket.once('secureConnect', () => terminar('TLS_VERIFICADO'));
    socket.once('error', (e) => terminar(e.code ?? e.message));
  });
}
async function comprobarEndpoint({ nombre, base, ruta }) {
  console.log(`\n--- ${nombre} (${base}${ruta}) ---`);
  const lista = await pedir(base, 'GET', ruta);
  if (!evaluar(`${nombre}: servicio disponible`, lista, [200])) return;
  registrar(`${nombre}: cabeceras HTTP`, 'OBSERVADO', 'revision',
    JSON.stringify({ 'x-powered-by': lista.cabeceras?.['x-powered-by'] ?? null,
      'x-content-type-options': lista.cabeceras?.['x-content-type-options'] ?? null,
      'strict-transport-security': lista.cabeceras?.['strict-transport-security'] ?? null }),
    'Ausencia de cabecera no prueba por si sola una vulnerabilidad');
  evaluar(`${nombre}: ID inexistente`, await pedir(base, 'GET', `${ruta}/t46-inexistente-${ID}`), [404]);
  evaluar(`${nombre}: POST sin titulo`, await pedir(base, 'POST', ruta, {}), [400]);
  evaluar(`${nombre}: POST titulo numerico`, await pedir(base, 'POST', ruta, { titulo: 123 }), [400]);
  evaluar(`${nombre}: POST titulo vacio`, await pedir(base, 'POST', ruta, { titulo: '' }), [400]);
  evaluar(`${nombre}: JSON malformado`, await pedir(base, 'POST', ruta, '{"titulo":', 'raw'), [400]);
  // Una sola tarea valida para verificar el PUT y borrado posterior.
  const creada = await pedir(base, 'POST', ruta, { titulo: `T4.6-SEGURIDAD-${ID}`, descripcion: 'Prueba temporal de validacion' });
  if (evaluar(`${nombre}: crear tarea temporal`, creada, [201]) && creada.datos?.id) {
    const id = encodeURIComponent(creada.datos.id);
    try {
      evaluar(`${nombre}: PUT titulo solo espacios`, await pedir(base, 'PUT', `${ruta}/${id}`, { titulo: '   ' }), [400]);
      evaluar(`${nombre}: PUT estado invalido`, await pedir(base, 'PUT', `${ruta}/${id}`, { estado: 'estado_no_valido' }), [400]);
    }
    finally { evaluar(`${nombre}: eliminar tarea temporal`, await pedir(base, 'DELETE', `${ruta}/${id}`), [204]); }
  } else if (creada.codigo === 201) {
    registrar(`${nombre}: limpieza pendiente`, 'ERROR', 'ID en respuesta', 'sin ID', 'Revisar tarea T4.6-SEGURIDAD-' + ID);
  }
  // Se comprueba una validacion insuficiente conocida, con limpieza si se acepta.
  const blancos = await pedir(base, 'POST', ruta, { titulo: '   ', descripcion: `T4.6-ESPACIOS-${ID}` });
  if (blancos.codigo === 400 || blancos.codigo === 422) {
    registrar(`${nombre}: titulo solo espacios`, 'OK', 'rechazo', blancos.codigo);
  } else if (blancos.codigo === 201) {
    registrar(`${nombre}: titulo solo espacios`, 'HALLAZGO', 'rechazo', 201, 'Acepta titulo compuesto solo de espacios');
    if (blancos.datos?.id) evaluar(`${nombre}: limpiar titulo en blanco`, await pedir(base, 'DELETE', `${ruta}/${encodeURIComponent(blancos.datos.id)}`), [204]);
    else registrar(`${nombre}: limpieza pendiente`, 'ERROR', 'ID en respuesta', 'sin ID', 'Revisar descripcion T4.6-ESPACIOS-' + ID);
  } else {
    registrar(`${nombre}: titulo solo espacios`, blancos.codigo === null ? 'ERROR' : 'OBSERVADO', 'rechazo', blancos.codigo ?? blancos.error);
  }
  if (CONFIG.arquitectura === 'micro' && nombre === 'Gateway') {
    evaluar('Gateway: metodo PATCH prohibido', await pedir(base, 'PATCH', ruta), [405]);
  }
}
async function main() {
  console.log(`\nT4.6 Seguridad / ${CONFIG.nombre} / ${ID} / entorno ${ENTORNO}`);
  for (const ep of CONFIG.endpoints) await comprobarEndpoint(ep);
  for (const { host, puerto } of CONFIG.puertos) {
    const abierto = await comprobarPuerto(host, puerto);
    registrar(ES_VM ? `Puerto ${puerto} en ${host}` : `Puerto local ${puerto}`, abierto === 'ABIERTO' ? 'OK' : 'ERROR', 'ABIERTO', abierto,
      ES_VM ? `Alcance: accesible desde el equipo de pruebas hacia ${host}`
        : 'Alcance: 127.0.0.1; revisar LocalAddress con PowerShell para exposicion externa');
    const tlsResultado = await comprobarTls(host, puerto);
    registrar(`TLS verificado ${puerto}`, tlsResultado === 'TLS_VERIFICADO' ? 'OK' : 'OBSERVADO',
      'TLS_VERIFICADO', tlsResultado,
      'Una prueba local negativa no descarta TLS en un proxy inverso externo');
  }
}
try { await main(); }
catch (error) { registrar('Ejecucion general', 'ERROR', 'sin excepciones', String(error?.message ?? error)); }
finally {
  fs.mkdirSync(evidencias, { recursive: true });
  const archivo = path.join(evidencias, `${PREFIJO}seguridad-${CONFIG.arquitectura}-${ID}.json`);
  const resumen = Object.fromEntries(['OK', 'HALLAZGO', 'ERROR', 'OBSERVADO'].map(e => [e, pruebas.filter(p => p.estado === e).length]));
  fs.writeFileSync(archivo, JSON.stringify({ tarea: 'T4.6', requisito: 'RQ14', arquitectura: CONFIG.arquitectura,
    fecha: new Date().toISOString(), ejecucion: ID, entorno: ENTORNO, endpoints: CONFIG.endpoints, resumen, pruebas }, null, 2), 'utf8');
  console.log(`\nRESUMEN: ${JSON.stringify(resumen)}\nEVIDENCIA: ${archivo}`);
}
