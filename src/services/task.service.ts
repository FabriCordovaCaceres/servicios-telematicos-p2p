import { randomUUID } from "node:crypto";
import type { Task, TaskStatus } from "../models/task";

const tasks: Task[] = [];

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

  return task;
}

export function deleteTask(id: string): boolean {
  const index = tasks.findIndex((task) => task.id === id);

  if (index === -1) {
    return false;
  }

  tasks.splice(index, 1);

  return true;
}
