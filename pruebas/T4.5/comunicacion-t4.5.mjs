/* global process, URL, setTimeout, clearTimeout, console, fetch, AbortSignal, WebSocket */
/* T4.5 / RQ14 - P2P: duplicacion, interrupcion y reconexion entre nodos.
   Requiere Node.js 22+ (WebSocket global) y dos terminales para detener/reiniciar SOLO el nodo 4002.
   No detiene procesos automaticamente ni cambia codigo del servidor. */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const N1 = process.env.P2P_NODO1 ?? 'http://localhost:4001';
const N2 = process.env.P2P_NODO2 ?? 'http://localhost:4002';
const WS2 = new URL('/p2p', N2.replace(/^http/, 'ws')).toString();
const ID = randomUUID().slice(0, 8);
const resultados = [];
const creadas = [];
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function anotar(prueba, resultado, detalle) {
  resultados.push({ prueba, resultado, detalle });
  console.log(`[${resultado}] ${prueba}: ${detalle}`);
}
function exigir(condicion, mensaje) { if (!condicion) throw new Error(mensaje); }
async function pedir(base, metodo, ruta, cuerpo, timeout = 2500) {
  const respuesta = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const texto = await respuesta.text();
  let datos = null;
  if (texto) { try { datos = JSON.parse(texto); } catch { datos = texto; } }
  return { codigo: respuesta.status, datos };
}
async function intentar(base, metodo, ruta) {
  try { return await pedir(base, metodo, ruta); } catch { return null; }
}
async function hasta(condicion, maxMs = 12000) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    if (await condicion()) return true;
    await esperar(250);
  }
  return false;
}
function enviarDuplicado(tarea) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS2);
    const temporizador = setTimeout(() => { ws.close(); reject(new Error('No se conecto a /p2p para inyectar duplicado.')); }, 6000);
    ws.addEventListener('open', () => {
      clearTimeout(temporizador);
      const mensaje = JSON.stringify({ tipo: 'cambio', origen: `prueba-t4.5-${ID}`, tarea, enviadoEn: Date.now() });
      ws.send(mensaje);
      ws.send(mensaje);
      setTimeout(() => { ws.close(); resolve(); }, 400);
    }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(temporizador); reject(new Error('Error en WebSocket /p2p.')); }, { once: true });
  });
}
function guardar() {
  const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'resultados');
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `p2p-${ID}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ requisito: 'RQ14', tarea: 'T4.5', arquitectura: 'p2p', fecha: new Date().toISOString(), ejecucion: ID, resultados }, null, 2));
  console.log(`\nEvidencia: ${archivo}`);
}
async function main() {
  exigir(typeof WebSocket === 'function', 'Se requiere Node.js 22+ para WebSocket global.');
  console.log(`\nT4.5 P2P | ${N1} <-> ${N2} | ejecucion ${ID}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const base of [N1, N2]) {
      const pares = await pedir(base, 'GET', '/peers');
      exigir(pares.codigo === 200 && pares.datos?.pares?.some((p) => p.estado === 'conectado'), `Nodo sin par conectado: ${base}. Revisar PEERS.`);
    }
    anotar('Conexion inicial', 'OK', 'Ambos nodos tienen al menos un par conectado.');

    const creada = await pedir(N1, 'POST', '/tasks', { titulo: `T4.5-P2P-DUP-${ID}`, descripcion: 'Prueba de mensaje repetido' });
    exigir(creada.codigo === 201 && creada.datos?.id, 'No se pudo crear tarea en nodo 4001.');
    creadas.push(creada.datos.id);
    exigir(await hasta(async () => (await intentar(N2, 'GET', `/tasks/${creada.datos.id}`))?.codigo === 200), 'No se replico la tarea inicial al nodo 4002.');
    await enviarDuplicado(creada.datos);
    await esperar(400);
    const lista2 = await pedir(N2, 'GET', '/tasks');
    exigir(Array.isArray(lista2.datos), 'GET /tasks del nodo 4002 no devuelve arreglo.');
    const copias = lista2.datos.filter((t) => t.id === creada.datos.id).length;
    exigir(copias === 1, `Se encontraron ${copias} copias de una tarea en el nodo 4002.`);
    anotar('Mensajes duplicados', 'MITIGADO', 'Se envio dos veces el mismo mensaje P2P con igual version; existe una sola tarea por ID.');

    console.log('\nACCION MANUAL 1: Deten SOLO el nodo P2P que atiende el puerto 4002, en SU terminal (Ctrl+C).');
    console.log('NO detengas 4001, 3000, 5001, 5002 ni 6001.');
    await rl.question('Cuando el nodo 4002 este detenido, presiona ENTER aqui... ');
    exigir(await hasta(async () => (await intentar(N2, 'GET', '/')) === null, 12000), 'El puerto 4002 sigue respondiendo. No se confirmo la interrupcion.');
    anotar('Interrupcion de nodo', 'OBSERVADO', 'El nodo 4002 no responde a HTTP; se simula perdida de comunicacion entre pares, no paquetes fisicos.');

    const offline = await pedir(N1, 'POST', '/tasks', { titulo: `T4.5-P2P-OFFLINE-${ID}`, descripcion: 'Creada mientras nodo 4002 esta fuera' });
    exigir(offline.codigo === 201 && offline.datos?.id, 'Nodo 4001 no pudo crear tarea durante interrupcion.');
    creadas.push(offline.datos.id);
    anotar('Operacion durante interrupcion', 'OK', 'El nodo 4001 siguio aceptando tareas mientras 4002 estaba caido.');

    console.log('\nACCION MANUAL 2: Reinicia SOLO el nodo 4002 con el MISMO comando y variables PORT/NODE_ID/PEERS que usabas antes.');
    await rl.question('Cuando el nodo 4002 haya iniciado, presiona ENTER aqui... ');
    const convergio = await hasta(async () => {
      const tarea = await intentar(N2, 'GET', `/tasks/${offline.datos.id}`);
      const pares = await intentar(N1, 'GET', '/peers');
      return tarea?.codigo === 200 && pares?.datos?.pares?.some((p) => p.estado === 'conectado');
    }, 45000);
    exigir(convergio, 'No se recupero sincronizacion dentro de 45 segundos; revisar logs de ambos nodos.');
    anotar('Reconexion y sincronizacion', 'RECUPERADO', 'Tras reiniciar 4002, el enlace vuelve y la tarea creada offline aparece en ambos nodos.');
  } finally {
    rl.close();
    for (const id of creadas) {
      try {
        const r = await pedir(N1, 'DELETE', `/tasks/${id}`);
        console.log(`Limpieza ${id}: HTTP ${r.codigo}`);
        if (r.codigo === 204) {
          const limpio = await hasta(async () => (await intentar(N2, 'GET', `/tasks/${id}`))?.codigo === 404, 10000);
          console.log(`Eliminacion propagada a 4002: ${limpio ? 'SI' : 'NO / nodo no disponible'}`);
        }
      } catch (error) { console.warn(`No se pudo limpiar ${id}: ${error.message}`); }
    }
    guardar();
  }
}
main().catch((error) => { anotar('Ejecucion', 'ERROR', error.message); guardar(); process.exitCode = 1; });
