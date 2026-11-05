/* T4.6 / RQ14 - Tolerancia a fallos. Node.js 22+.
   DETENCION Y REINICIO SON MANUALES: el script NO detiene procesos.
   Ejecutar con los servidores en terminales separadas. */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
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
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const registrar = (prueba, estado, esperado, observado, detalle = '') => {
  pruebas.push({ prueba, estado, esperado, observado, detalle });
  console.log(`[${estado}] ${prueba}: ${observado}${detalle ? ' | ' + detalle : ''}`);
};
async function pedir(url, metodo = 'GET', cuerpo) {
  try {
    const opciones = { method: metodo, signal: AbortSignal.timeout(2500) };
    if (cuerpo !== undefined) { opciones.headers = { 'Content-Type': 'application/json' }; opciones.body = JSON.stringify(cuerpo); }
    const r = await fetch(url, opciones);
    const texto = await r.text();
    let datos = texto;
    try { datos = JSON.parse(texto); } catch { /* respuesta no JSON */ }
    return { codigo: r.status, datos };
  } catch (error) { return { codigo: null, error: String(error?.cause?.code ?? error?.message ?? error) }; }
}
function comprobar(nombre, resultado, esperados, detalle = '') {
  const ok = resultado.codigo !== null && esperados.includes(resultado.codigo);
  registrar(nombre, ok ? 'OK' : resultado.codigo === null ? 'ERROR' : 'HALLAZGO',
    esperados.join('/'), resultado.codigo ?? resultado.error, detalle);
  return ok;
}
async function hasta(url, disponible, maxMs = 20000) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    const r = await pedir(url);
    if (disponible ? r.codigo === 200 : r.codigo === null) return true;
    await esperar(400);
  }
  return false;
}
async function pedirAccion(texto) { console.log(`\n${texto}`); await rl.question('Cuando completes la accion, presiona ENTER aqui... '); }
async function asegurar(nombre, url) {
  const r = await pedir(url);
  if (r.codigo !== 200) throw new Error(`${nombre} no esta listo: ${r.codigo ?? r.error}. Inicia los servicios y repite.`);
  registrar(`${nombre} antes del fallo`, 'OK', '200', r.codigo);
}
async function verificarDetencion(nombre, url) {
  const detenido = await hasta(url, false, 6500);
  registrar(`${nombre} detenido`, detenido ? 'OK' : 'ERROR', 'sin conexion', detenido ? 'sin conexion' : 'todavia responde');
  if (!detenido) throw new Error(`No se confirmo la detencion de ${nombre}; revisa la terminal correcta.`);
}
async function verificarReinicio(nombre, url) {
  const reiniciado = await hasta(url, true, 20000);
  registrar(`${nombre} reiniciado`, reiniciado ? 'OK' : 'ERROR', '200', reiniciado ? '200' : 'no disponible');
  if (!reiniciado) throw new Error(`No se confirmo el reinicio de ${nombre}; verifica su terminal.`);
}
async function ejecutarCS() {
  const base = `${URL_CS}/tasks`;
  await asegurar('Cliente-Servidor 3000', base);
  await pedirAccion('ACCION MANUAL 1: Deten SOLO el servidor del puerto 3000 (Ctrl+C en su terminal; en la VM1: docker stop tele-cs).');
  await verificarDetencion('Cliente-Servidor 3000', base);
  await pedirAccion('ACCION MANUAL 2: Reinicia el servidor 3000 (npm run dev en su terminal; en la VM1: docker start tele-cs).');
  await verificarReinicio('Cliente-Servidor 3000', base);
  registrar('Disponibilidad durante el fallo', 'OBSERVADO', 'evaluacion', 'servicio no disponible',
    'No hay alta disponibilidad automatica demostrada; recuperacion manual comprobada');
}
async function ejecutarP2P() {
  const n1 = URL_N1;
  const n2 = URL_N2;
  await asegurar('P2P nodo 4001', n1 + '/tasks');
  await asegurar('P2P nodo 4002', n2 + '/tasks');
  await pedirAccion('ACCION MANUAL 1: Deten SOLO el nodo P2P 4002 (Ctrl+C; en la VM2: docker stop tele-p2p-2). NO detengas el 4001.');
  await verificarDetencion('P2P nodo 4002', n2 + '/tasks');
  comprobar('Nodo 4001 continua operativo', await pedir(n1 + '/tasks'), [200]);
  const creada = await pedir(n1 + '/tasks', 'POST', { titulo: `T4.6-P2P-FALLO-${ID}`, descripcion: 'Tarea creada mientras 4002 estaba desconectado' });
  const id = creada.datos?.id;
  comprobar('Crear tarea con nodo 4002 caido', creada, [201]);
  await pedirAccion('ACCION MANUAL 2: Reinicia SOLO el nodo 4002 con PORT=4002, NODE_ID=nodo-2, PEERS=http://localhost:4001 y npm run dev (en la VM2: docker start tele-p2p-2).');
  await verificarReinicio('P2P nodo 4002', n2 + '/tasks');
  if (id) {
    const sincronizada = await hasta(`${n2}/tasks/${encodeURIComponent(id)}`, true, 20000);
    registrar('Sincronizacion tras reconexion', sincronizada ? 'OK' : 'HALLAZGO', 'tarea presente en 4002',
      sincronizada ? 'tarea recuperada' : 'tarea no visible en 4002');
    comprobar('Limpieza tarea temporal', await pedir(`${n1}/tasks/${encodeURIComponent(id)}`, 'DELETE'), [204]);
    const fin = Date.now() + 10000;
    let eliminada = false;
    while (Date.now() < fin) {
      if ((await pedir(`${n2}/tasks/${encodeURIComponent(id)}`)).codigo === 404) { eliminada = true; break; }
      await esperar(400);
    }
    registrar('Propagacion de limpieza', eliminada ? 'OK' : 'HALLAZGO', '404 en 4002', eliminada ? '404' : 'no confirmada');
  } else {
    registrar('Sincronizacion tras reconexion', 'ERROR', 'ID de tarea', 'sin ID', 'Revisar manualmente tarea T4.6-P2P-FALLO-' + ID);
  }
}
async function ejecutarMicro() {
  const gateway = URL_GATEWAY;
  const tareas = `${URL_TAREAS}/health`;
  const notificaciones = `${URL_NOTIF}/health`;
  await asegurar('Gateway 6001', gateway + '/health');
  await asegurar('Tareas 5001', tareas);
  await asegurar('Notificaciones 5002', notificaciones);
  await asegurar('Gateway tareas', gateway + '/api/tareas');
  await asegurar('Gateway notificaciones', gateway + '/api/notificaciones/health');
  await pedirAccion('ACCION MANUAL 1: Deten SOLO el servicio TAREAS 5001 (Ctrl+C; en la VM2: docker stop tele-micro-tareas); deja 5002 y 6001 activos.');
  await verificarDetencion('Tareas 5001', tareas);
  comprobar('Gateway sigue vivo sin tareas', await pedir(gateway + '/health'), [200]);
  comprobar('Gateway responde a fallo de tareas', await pedir(gateway + '/api/tareas'), [502, 504]);
  comprobar('Notificaciones siguen disponibles', await pedir(gateway + '/api/notificaciones/health'), [200]);
  await pedirAccion('ACCION MANUAL 2: Reinicia SOLO TAREAS 5001 (el comando que usabas antes; en la VM2: docker start tele-micro-tareas).');
  await verificarReinicio('Tareas 5001', tareas);
  comprobar('Gateway recupera tareas', await pedir(gateway + '/api/tareas'), [200]);
  await pedirAccion('ACCION MANUAL 3: Deten SOLO NOTIFICACIONES 5002 (Ctrl+C; en la VM2: docker stop tele-micro-notificaciones); deja 5001 y 6001 activos.');
  await verificarDetencion('Notificaciones 5002', notificaciones);
  comprobar('Gateway responde a fallo de notificaciones', await pedir(gateway + '/api/notificaciones/health'), [502, 504]);
  comprobar('Tareas siguen disponibles', await pedir(gateway + '/api/tareas'), [200]);
  await pedirAccion('ACCION MANUAL 4: Reinicia SOLO NOTIFICACIONES 5002 (el comando que usabas antes; en la VM2: docker start tele-micro-notificaciones).');
  await verificarReinicio('Notificaciones 5002', notificaciones);
  comprobar('Gateway recupera notificaciones', await pedir(gateway + '/api/notificaciones/health'), [200]);
}
function crearInforme(fallosArchivo) {
  const seguridad = fs.readdirSync(evidencias).filter(f => f.startsWith(`${PREFIJO}seguridad-${CONFIG.arquitectura}-`) && f.endsWith('.json'))
    .map(f => ({ f, m: fs.statSync(path.join(evidencias, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0];
  let seguridadDatos = null;
  if (seguridad) seguridadDatos = JSON.parse(fs.readFileSync(path.join(evidencias, seguridad.f), 'utf8'));
  const falloDatos = JSON.parse(fs.readFileSync(fallosArchivo, 'utf8'));
  const limpiar = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').slice(0, 200);
  const filas = (ps) => ps.map(p => `| ${limpiar(p.prueba)} | ${limpiar(p.estado)} | ${limpiar(p.observado)} |`).join('\n');
  const md = [
    `# T4.6 - Seguridad y tolerancia a fallos: ${CONFIG.nombre}`,
    '', 'Requisito: RQ14', '',
    '## Objetivo',
    'Comprobar validacion de entradas, puertos, TLS verificado y recuperacion tras interrupciones controladas.',
    '', '## Alcance y limitaciones',
    `- Entorno ${ENTORNO}. No son una auditoria de seguridad externa.`,
    '- Los procesos se detuvieron y reiniciaron manualmente; no se ha demostrado alta disponibilidad automatica.',
    '- Una conexion TLS local no verificada no demuestra ausencia de HTTPS en un despliegue con proxy inverso.',
    '- Los resultados HALLAZGO y OBSERVADO documentan limitaciones y no se ocultan.',
    '', '## Seguridad',
    seguridadDatos ? `Evidencia: evidencias/${seguridad.f}` : 'PENDIENTE: ejecutar seguridad-t4.6.mjs.',
    '', '| Prueba | Estado | Resultado observado |', '|---|---|---|',
    seguridadDatos ? filas(seguridadDatos.pruebas) : '| Pendiente | PENDIENTE | Sin ejecucion |',
    '', '## Tolerancia a fallos',
    `Evidencia: evidencias/${path.basename(fallosArchivo)}`,
    '', '| Prueba | Estado | Resultado observado |', '|---|---|---|', filas(falloDatos.pruebas),
    '', '## Conclusion',
    `Los resultados muestran el comportamiento observado en el entorno ${ENTORNO}. Las debilidades detectadas deben documentarse como mejoras pendientes y no como controles implementados.`,
    '',
  ].join('\n');
  const destino = path.join(carpeta, ES_VM ? 'RESULTADOS-VM.md' : 'RESULTADOS.md');
  fs.writeFileSync(destino, md, 'utf8');
  console.log(`INFORME: ${destino}`);
}
console.log(`\nT4.6 Fallos / ${CONFIG.nombre} / ${ID} / entorno ${ENTORNO}`);
try {
  if (CONFIG.arquitectura === 'cs') await ejecutarCS();
  else if (CONFIG.arquitectura === 'p2p') await ejecutarP2P();
  else await ejecutarMicro();
} catch (error) {
  registrar('Ejecucion interrumpida', 'ERROR', 'prueba completa', String(error?.message ?? error),
    'Si un servicio sigue detenido, reinicialo manualmente antes de repetir.');
} finally {
  rl.close();
  fs.mkdirSync(evidencias, { recursive: true });
  const archivo = path.join(evidencias, `${PREFIJO}fallos-${CONFIG.arquitectura}-${ID}.json`);
  const resumen = Object.fromEntries(['OK', 'HALLAZGO', 'ERROR', 'OBSERVADO'].map(e => [e, pruebas.filter(p => p.estado === e).length]));
  fs.writeFileSync(archivo, JSON.stringify({ tarea: 'T4.6', requisito: 'RQ14', arquitectura: CONFIG.arquitectura,
    fecha: new Date().toISOString(), ejecucion: ID, entorno: ENTORNO, endpoints: CONFIG.endpoints, resumen, pruebas }, null, 2), 'utf8');
  console.log(`\nRESUMEN: ${JSON.stringify(resumen)}\nEVIDENCIA: ${archivo}`);
  crearInforme(archivo);
}
