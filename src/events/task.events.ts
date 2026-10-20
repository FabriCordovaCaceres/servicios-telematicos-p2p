import { EventEmitter } from "node:events";
import type { Task } from "../models/task";

// Eventos que genera el servicio de tareas cuando el cambio es LOCAL
// (hecho por un usuario en este nodo). El módulo P2P se suscribe a estos
// eventos para propagarlos a los demás nodos. Los cambios que llegan
// desde otros nodos NO generan eventos, así se evitan bucles infinitos.
export type TaskEvent =
  | { tipo: "tarea:creada"; tarea: Task }
  | { tipo: "tarea:actualizada"; tarea: Task }
  | {
      tipo: "tarea:eliminada";
      id: string;
      version: number;
      updatedAt: number;
      updatedBy: string;
    };

const emisor = new EventEmitter();

export function emitTaskEvent(evento: TaskEvent): void {
  emisor.emit("evento", evento);
}

export function onTaskEvent(listener: (evento: TaskEvent) => void): void {
  emisor.on("evento", listener);
}
