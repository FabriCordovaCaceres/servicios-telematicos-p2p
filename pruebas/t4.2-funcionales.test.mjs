/* global fetch, console */
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as esperarTiempo } from "node:timers/promises";

const NODO1 = "http://127.0.0.1:4001";
const NODO2 = "http://127.0.0.1:4002";

async function solicitar(base, ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, opciones);
  const texto = await respuesta.text();

  let datos = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = texto;
    }
  }

  return { codigo: respuesta.status, datos };
}

function json(metodo, datos) {
  return {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  };
}

async function esperarTarea(base, id, condicion) {
  for (let intento = 0; intento < 30; intento++) {
    const resultado = await solicitar(base, `/tasks/${id}`);

    if (condicion(resultado)) {
      return resultado;
    }

    await esperarTiempo(200);
  }

  throw new Error(`Sincronizacion no completada: ${base}, tarea ${id}`);
}

test("T4.2 - Pruebas funcionales P2P RQ13", async () => {
  let aprobadas = 0;
  const tareasCreadas = [];

  function comprobar(nombre, condicion) {
    assert.ok(condicion, nombre);
    aprobadas++;
    console.log(`OK ${String(aprobadas).padStart(2, "0")} - ${nombre}`);
  }

  try {
    // 1. Estado de ambos nodos
    const salud1 = await solicitar(NODO1, "/");
    comprobar("Nodo 1 activo", salud1.codigo === 200 && salud1.datos.nodo === "nodo-1");

    const salud2 = await solicitar(NODO2, "/");
    comprobar("Nodo 2 activo", salud2.codigo === 200 && salud2.datos.nodo === "nodo-2");

    // 2. Conexion P2P
    const pares1 = await solicitar(NODO1, "/peers");
    comprobar("Nodo 1 conectado al Nodo 2",
      pares1.codigo === 200 &&
      pares1.datos.pares.some(p => p.estado === "conectado" && p.url.includes(":4002/p2p"))
    );

    const pares2 = await solicitar(NODO2, "/peers");
    comprobar("Nodo 2 conectado al Nodo 1",
      pares2.codigo === 200 &&
      pares2.datos.pares.some(p => p.estado === "conectado" && p.url.includes(":4001/p2p"))
    );

    // 3. Consultar tareas
    const lista1 = await solicitar(NODO1, "/tasks");
    comprobar("GET tareas Nodo 1", lista1.codigo === 200 && Array.isArray(lista1.datos));

    const lista2 = await solicitar(NODO2, "/tasks");
    comprobar("GET tareas Nodo 2", lista2.codigo === 200 && Array.isArray(lista2.datos));

    // 4. Validaciones
    const vacio = await solicitar(NODO1, "/tasks", json("POST", { titulo: "" }));
    comprobar("Rechazar titulo vacio - 400", vacio.codigo === 400);

    const numerico = await solicitar(NODO1, "/tasks", json("POST", { titulo: 12345 }));
    comprobar("Rechazar titulo numerico - 400", numerico.codigo === 400);

    const idInexistente = "00000000-0000-4000-8000-000000000000";

    const invalido = await solicitar(NODO2, `/tasks/${idInexistente}`, json("PUT", { estado: "desconocido" }));
    comprobar("Rechazar estado invalido - 400", invalido.codigo === 400);

    const noExiste = await solicitar(NODO1, `/tasks/${idInexistente}`);
    comprobar("GET tarea inexistente - 404", noExiste.codigo === 404);

    const noEliminar = await solicitar(NODO2, `/tasks/${idInexistente}`, { method: "DELETE" });
    comprobar("DELETE tarea inexistente - 404", noEliminar.codigo === 404);

    // 5. Crear en Nodo 1
    const creacion = await solicitar(NODO1, "/tasks", json("POST", {
      titulo: "Prueba automatizada T4.2",
      descripcion: "Creacion desde Nodo 1"
    }));

    comprobar("Crear tarea en Nodo 1 - 201",
      creacion.codigo === 201 &&
      typeof creacion.datos?.id === "string" &&
      creacion.datos.version === 1
    );

    const id = creacion.datos.id;
    tareasCreadas.push(id);

    // 6. Verificar propagacion al Nodo 2
    const recibida2 = await esperarTarea(NODO2, id, r =>
      r.codigo === 200 && r.datos.version === 1
    );

    comprobar("Creacion sincronizada al Nodo 2",
      recibida2.datos.id === id &&
      recibida2.datos.titulo === creacion.datos.titulo &&
      recibida2.datos.updatedBy === "nodo-1"
    );

    // 7. Actualizar desde Nodo 2
    const actualizacion = await solicitar(NODO2, `/tasks/${id}`, json("PUT", {
      estado: "en_progreso"
    }));

    comprobar("Actualizar desde Nodo 2",
      actualizacion.codigo === 200 &&
      actualizacion.datos.estado === "en_progreso" &&
      actualizacion.datos.version === 2
    );

    // 8. Verificar actualizacion en Nodo 1
    const actualizada1 = await esperarTarea(NODO1, id, r =>
      r.codigo === 200 &&
      r.datos.version === 2 &&
      r.datos.estado === "en_progreso"
    );

    comprobar("Actualizacion sincronizada al Nodo 1",
      actualizada1.datos.updatedBy === "nodo-2"
    );

    // 9. Eliminar desde Nodo 1
    const eliminacion = await solicitar(NODO1, `/tasks/${id}`, { method: "DELETE" });
    comprobar("Eliminar desde Nodo 1 - 204", eliminacion.codigo === 204);

    await esperarTarea(NODO2, id, r => r.codigo === 404);
    comprobar("Eliminacion sincronizada al Nodo 2", true);

    // 10. Crear en Nodo 2
    const inversa = await solicitar(NODO2, "/tasks", json("POST", {
      titulo: "Prueba inversa automatizada T4.2",
      descripcion: "Creacion desde Nodo 2"
    }));

    comprobar("Crear tarea desde Nodo 2 - 201",
      inversa.codigo === 201 &&
      typeof inversa.datos?.id === "string"
    );

    const idInverso = inversa.datos.id;
    tareasCreadas.push(idInverso);

    // 11. Verificar propagacion inversa
    const recibida1 = await esperarTarea(NODO1, idInverso, r =>
      r.codigo === 200 && r.datos.updatedBy === "nodo-2"
    );

    comprobar("Creacion inversa sincronizada",
      recibida1.datos.id === idInverso &&
      recibida1.datos.titulo === inversa.datos.titulo
    );

    // 12. Eliminar desde Nodo 2
    const eliminacionInversa = await solicitar(NODO2, `/tasks/${idInverso}`, { method: "DELETE" });
    comprobar("Eliminar desde Nodo 2 - 204", eliminacionInversa.codigo === 204);

    await esperarTarea(NODO1, idInverso, r => r.codigo === 404);
    comprobar("Eliminacion inversa sincronizada", true);

    console.log(`\nRESULTADO: ${aprobadas} COMPROBACIONES P2P APROBADAS`);
  } finally {
    // Limpiar las tareas creadas por esta prueba.
    for (const id of tareasCreadas) {
      for (const nodo of [NODO1, NODO2]) {
        try {
          await solicitar(nodo, `/tasks/${id}`, { method: "DELETE" });
        } catch {
          // Continuar con la limpieza restante.
        }
      }
    }
  }
});
