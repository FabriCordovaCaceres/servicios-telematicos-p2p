export type TaskStatus =
  | "pendiente"
  | "en_progreso"
  | "finalizada";

export interface Task {
  id: string;
  titulo: string;
  descripcion: string;
  estado: TaskStatus;

  createdAt: number;
  updatedAt: number;

  version: number;
  updatedBy: string;
}
