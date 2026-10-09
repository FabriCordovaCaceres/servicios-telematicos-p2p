import type { Task } from "./task";

export interface Board {
  id: string;
  nombre: string;
  tareas: Task[];
}
