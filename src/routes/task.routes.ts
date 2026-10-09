import { Router, type Request, type Response } from "express";
import type { TaskStatus } from "../models/task";
import {
  createTask,
  deleteTask,
  getTaskById,
  getTasks,
  updateTask,
} from "../services/task.service";

const router = Router();

const estadosValidos: TaskStatus[] = [
  "pendiente",
  "en_progreso",
  "finalizada",
];

router.get("/", (_req: Request, res: Response) => {
  return res.json(getTasks());
});

router.get("/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({
      mensaje: "ID de tarea inválido",
    });
  }

  const task = getTaskById(id);

  if (!task) {
    return res.status(404).json({
      mensaje: "Tarea no encontrada",
    });
  }

  return res.json(task);
});

router.post("/", (req: Request, res: Response) => {
  const {
    titulo,
    descripcion = "",
  } = req.body;

  if (!titulo || typeof titulo !== "string") {
    return res.status(400).json({
      mensaje: "El título es obligatorio",
    });
  }

  const nodeId = process.env.NODE_ID ?? "nodo-p2p";

  const task = createTask(
    titulo,
    descripcion,
    nodeId,
  );

  return res.status(201).json(task);
});

router.put("/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({
      mensaje: "ID de tarea inválido",
    });
  }

  const {
    titulo,
    descripcion,
    estado,
  } = req.body;

  if (
    estado !== undefined &&
    !estadosValidos.includes(estado)
  ) {
    return res.status(400).json({
      mensaje: "Estado inválido",
    });
  }

  const nodeId = process.env.NODE_ID ?? "nodo-p2p";

  const task = updateTask(id, {
    titulo,
    descripcion,
    estado,
    updatedBy: nodeId,
  });

  if (!task) {
    return res.status(404).json({
      mensaje: "Tarea no encontrada",
    });
  }

  return res.json(task);
});

router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({
      mensaje: "ID de tarea inválido",
    });
  }

  const deleted = deleteTask(id);

  if (!deleted) {
    return res.status(404).json({
      mensaje: "Tarea no encontrada",
    });
  }

  return res.status(204).send();
});

export default router;
