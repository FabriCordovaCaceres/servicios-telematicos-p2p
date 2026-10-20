import { randomUUID } from "node:crypto";
import type { Task, TaskStatus } from "../models/task";
import { emitTaskEvent } from "../events/task.events";

const tasks: Task[] = [];

// "Lápida": registro de una tarea eliminada. Se conserva para que una
// actualización atrasada, que llegue desde otro nodo, no "resucite" una
// tarea que ya fue eliminada.
export interface Tombstone {
  id: string;
  version: number;
  updatedAt: number;
  updatedBy: string;
}

const eliminadas = new Map<string, Tombstone>();

function nodoLocal(): string {
  return process.env.NODE_ID ?? "nodo-p2p";
}

export function getTasks(): Task[] {
  return tasks;
}

export function getTaskById(id: string): Task | undefined {
  return tasks.find((task) => task.id === id);
}

export function createTask(
  titulo: string,
  descripcion: string,
  updatedBy: string,
): Task {
  const now = Date.now();

  const task: Task = {
    id: randomUUID(),
    titulo,
    descripcion,
    estado: "pendiente",
    createdAt: now,
    updatedAt: now,
    version: 1,
    updatedBy,
  };

  tasks.push(task);

  emitTaskEvent({ tipo: "tarea:creada", tarea: task });

  return task;
}

export function updateTask(
  id: string,
  data: {
    titulo?: string;
    descripcion?: string;
    estado?: TaskStatus;
    updatedBy: string;
  },
): Task | undefined {
  const task = getTaskById(id);

  if (!task) {
    return undefined;
  }

  if (data.titulo !== undefined) {
    task.titulo = data.titulo;
  }

  if (data.descripcion !== undefined) {
    task.descripcion = data.descripcion;
  }

  if (data.estado !== undefined) {
    task.estado = data.estado;
  }

  task.updatedAt = Date.now();
  task.updatedBy = data.updatedBy;
  task.version += 1;

  emitTaskEvent({ tipo: "tarea:actualizada", tarea: task });

  return task;
}

export function deleteTask(id: string): boolean {
  const index = tasks.findIndex((task) => task.id === id);
  const task = tasks[index];

  if (!task) {
    return false;
  }

  tasks.splice(index, 1);

  const lapida: Tombstone = {
    id,
    version: task.version + 1,
    updatedAt: Date.now(),
    updatedBy: nodoLocal(),
  };

  eliminadas.set(id, lapida);

  emitTaskEvent({ tipo: "tarea:eliminada", ...lapida });

  return true;
}

// ---------------------------------------------------------------------
// Sprint 2 (RQ6): sincronización entre nodos con marca de versión
// ---------------------------------------------------------------------

export type ResultadoRemoto = "aplicada" | "ignorada";

interface Marca {
  version: number;
  updatedAt: number;
  updatedBy: string;
}

// Regla de resolución de conflictos ("el último que escribe gana"):
// 1) gana la mayor versión; 2) si empatan, la modificación más reciente;
// 3) si todavía empatan, el identificador de nodo mayor (así TODOS los
// nodos eligen el mismo ganador y convergen al mismo estado).
function esMasNuevo(a: Marca, b: Marca): boolean {
  if (a.version !== b.version) {
    return a.version > b.version;
  }
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt;
  }
  return a.updatedBy > b.updatedBy;
}

// Aplica una tarea que llegó desde otro nodo (creada o modificada)
export function aplicarTareaRemota(remota: Task): ResultadoRemoto {
  const lapida = eliminadas.get(remota.id);

  if (lapida && !esMasNuevo(remota, lapida)) {
    return "ignorada";
  }

  const index = tasks.findIndex((task) => task.id === remota.id);
  const local = tasks[index];

  if (local && !esMasNuevo(remota, local)) {
    return "ignorada";
  }

  if (lapida) {
    eliminadas.delete(remota.id);
  }

  if (local) {
    tasks[index] = { ...remota };
  } else {
    tasks.push({ ...remota });
  }

  return "aplicada";
}

// Aplica una eliminación que llegó desde otro nodo
export function aplicarEliminacionRemota(lapida: Tombstone): ResultadoRemoto {
  const existente = eliminadas.get(lapida.id);

  if (existente && !esMasNuevo(lapida, existente)) {
    return "ignorada";
  }

  const index = tasks.findIndex((task) => task.id === lapida.id);
  const local = tasks[index];

  if (local && !esMasNuevo(lapida, local)) {
    return "ignorada";
  }

  if (local) {
    tasks.splice(index, 1);
  }

  eliminadas.set(lapida.id, { ...lapida });

  return "aplicada";
}

export function getEliminadas(): Tombstone[] {
  return [...eliminadas.values()];
}
