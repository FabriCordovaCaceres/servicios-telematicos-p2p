/* global AbortSignal, console, fetch, performance, process, setTimeout */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Uso:
// node simulacion/concurrencia.mjs cs 2
// node simulacion/concurrencia.mjs p2p 3

const modo = process.argv[2];
const usuarios = Number(process.argv[3]);

if (!["cs", "p2p"].includes(modo) ||
    ![2, 3, 5].includes(usuarios)) {
  console.error(
    "Uso: node simulacion/concurrencia.mjs cs|p2p 2|3|5"
  );
  process.exit(1);
}

const servidores = modo === "cs"
  ? ["http://localhost:3000"]
  : ["http://localhost:4001", "http://localhost:4002"];

const ejecucion = randomUUID().slice(0, 8);
const resultados = [];
const tareas = [];

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function solicitar(base, metodo, ruta, datos) {
  const inicio = performance.now();

  try {
    const respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: datos
        ? { "Content-Type": "application/json" }
        : {},
      body: datos ? JSON.stringify(datos) : undefined,
      signal: AbortSignal.timeout(10000)
    });

    const texto = await respuesta.text();
    let contenido = null;

    if (texto) {
      try {
        contenido = JSON.parse(texto);
      } catch {
        contenido = texto;
      }
    }

    return {
      ok: respuesta.ok,
      codigo: respuesta.status,
      datos: contenido,
      ms: Math.round((performance.now() - inicio) * 100) / 100
    };

  } catch (error) {
    return {
      ok: false,
      codigo: 0,
      datos: null,
      ms: Math.round((performance.now() - inicio) * 100) / 100,
      error: error.message
    };
  }
}

function registrar(usuario, operacion, respuesta, valida) {
  const correcto = respuesta.ok && valida;

  resultados.push({
    usuario,
    operacion,
    codigo: respuesta.codigo,
    duracionMs: respuesta.ms,
    correcto,
    error: respuesta.error ?? null
  });

  console.log(
    `[${correcto ? "OK" : "ERROR"}] ` +
    `Usuario ${usuario} - ${operacion} ` +
    `HTTP ${respuesta.codigo} - ${respuesta.ms} ms`
  );

  return correcto;
}

// Esperar hasta que los nodos P2P converjan.
async function verificarP2P(id, condicion, etiqueta) {
  if (modo !== "p2p") return true;

  const limite = Date.now() + 8000;

  while (Date.now() < limite) {
    const respuestas = await Promise.all(
      servidores.map(url =>
        solicitar(url, "GET", `/tasks/${id}`)
      )
    );

    if (respuestas.every(condicion)) {
      console.log(`[OK] Sincronizacion ${etiqueta}: ${id}`);
      return true;
    }

    await esperar(200);
  }

  console.log(`[ERROR] Sincronizacion ${etiqueta}: ${id}`);

  resultados.push({
    usuario: "sistema",
    operacion: `sincronizacion_${etiqueta}`,
    codigo: null,
    duracionMs: null,
    correcto: false,
    error: `No convergio la tarea ${id}`
  });

  return false;
}

// Cada usuario virtual utiliza una URL.
// En P2P se alternan los nodos.
function servidorDe(usuario) {
  return servidores[(usuario - 1) % servidores.length];
}

async function crear(usuario) {
  const base = servidorDe(usuario);

  const respuesta = await solicitar(base, "POST", "/tasks", {
    titulo: `T3.3-${ejecucion}-Usuario-${usuario}`,
    descripcion: "Simulacion de concurrencia RQ11",
    updatedBy: `usuario-${usuario}`
  });

  const valida = respuesta.codigo === 201 &&
    typeof respuesta.datos?.id === "string";

  registrar(usuario, "CREATE", respuesta, valida);

  if (!valida) return;

  tareas.push({
    usuario,
    base,
    id: respuesta.datos.id
  });
}

async function leer(tarea) {
  const respuesta = await solicitar(
    tarea.base, "GET", `/tasks/${tarea.id}`
  );

  registrar(
    tarea.usuario,
    "READ",
    respuesta,
    respuesta.codigo === 200 &&
      respuesta.datos?.id === tarea.id
  );
}

async function actualizar(tarea) {
  const respuesta = await solicitar(
    tarea.base,
    "PUT",
    `/tasks/${tarea.id}`,
    {
      estado: "en_progreso",
      updatedBy: `usuario-${tarea.usuario}`
    }
  );

  registrar(
    tarea.usuario,
    "UPDATE",
    respuesta,
    respuesta.codigo === 200 &&
      respuesta.datos?.estado === "en_progreso"
  );
}

async function eliminar(tarea) {
  const respuesta = await solicitar(
    tarea.base, "DELETE", `/tasks/${tarea.id}`
  );

  registrar(
    tarea.usuario,
    "DELETE",
    respuesta,
    respuesta.codigo === 204
  );
}

// Ejecutar una fase con solicitudes concurrentes.
async function fase(nombre, elementos, accion) {
  console.log(`\n--- ${nombre} ---`);

  const inicio = performance.now();

  await Promise.all(elementos.map(accion));

  console.log(
    `Fase terminada en ${Math.round(performance.now() - inicio)} ms`
  );
}

async function main() {
  console.log(`\nSIMULACION DE CONCURRENCIA T3.3`);
  console.log(`Arquitectura: ${modo}`);
  console.log(`Usuarios virtuales: ${usuarios}`);
  console.log(`Ejecucion: ${ejecucion}`);

  const inicio = performance.now();
  const agentes = Array.from(
    { length: usuarios },
    (_, i) => i + 1
  );

  // Comprobar servidores antes de comenzar.
  for (const base of servidores) {
    const prueba = await solicitar(base, "GET", "/");

    if (!prueba.ok) {
      throw new Error(`Servidor no disponible: ${base}`);
    }
  }

  if (modo === "p2p") {
    for (const base of servidores) {
      const pares = await solicitar(base, "GET", "/peers");
      const lista = pares.datos?.pares;

      if (!pares.ok ||
          !Array.isArray(lista) ||
          !lista.some(p => p.estado === "conectado")) {
        throw new Error(`Nodo sin par conectado: ${base}`);
      }
    }
  }

  await fase("CREAR", agentes, crear);

  // Comprobar propagacion despues de crear.
  for (const tarea of tareas) {
    await verificarP2P(
      tarea.id,
      r => r.codigo === 200,
      "creacion"
    );
  }

  await fase("LEER", tareas, leer);
  await fase("ACTUALIZAR", tareas, actualizar);

  for (const tarea of tareas) {
    await verificarP2P(
      tarea.id,
      r => r.codigo === 200 &&
        r.datos?.estado === "en_progreso",
      "actualizacion"
    );
  }

  await fase("ELIMINAR", tareas, eliminar);

  for (const tarea of tareas) {
    await verificarP2P(
      tarea.id,
      r => r.codigo === 404,
      "eliminacion"
    );
  }

  const correctas = resultados.filter(r => r.correcto).length;
  const errores = resultados.length - correctas;
  const totalMs = Math.round(performance.now() - inicio);

  const resumen = {
    requisito: "RQ11",
    tarea: "T3.3",
    arquitectura: modo,
    usuarios,
    ejecucion,
    fecha: new Date().toISOString(),
    tareasCreadas: tareas.length,
    operacionesRegistradas: resultados.length,
    correctas,
    errores,
    tiempoTotalMs: totalMs,
    resultados
  };

  const carpeta = path.join(process.cwd(), "simulacion", "resultados");
  fs.mkdirSync(carpeta, { recursive: true });

  const archivo = path.join(
    carpeta,
    `${modo}-${usuarios}usuarios-${ejecucion}.json`
  );

  fs.writeFileSync(
    archivo,
    JSON.stringify(resumen, null, 2),
    "utf8"
  );

  console.log("\n========== RESULTADO FINAL ==========");
  console.log(`Correctas: ${correctas}`);
  console.log(`Errores: ${errores}`);
  console.log(`Tiempo total: ${totalMs} ms`);
  console.log(`Archivo: ${archivo}`);

  if (errores > 0 || tareas.length !== usuarios) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("[ERROR]", error.message);
  process.exitCode = 1;
});
