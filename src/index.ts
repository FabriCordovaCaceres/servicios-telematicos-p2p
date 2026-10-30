import express from "express";
import taskRoutes from "./routes/task.routes";
import { iniciarP2P } from "./p2p/sincronizacion";
import { cors } from "./http/cors";

const app = express();

const PORT = Number(process.env.PORT ?? 4001);
const NODE_ID = process.env.NODE_ID ?? "nodo-1";

// Direcciones de los otros nodos, separadas por coma. Ejemplo:
// PEERS=http://192.168.56.12:4002,http://192.168.56.13:4003
const PARES = (process.env.PEERS ?? "")
  .split(",")
  .map((par) => par.trim())
  .filter((par) => par !== "");

app.use(cors);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    arquitectura: "P2P",
    nodo: NODE_ID,
    puerto: PORT,
    estado: "activo",
  });
});

app.use("/tasks", taskRoutes);

const server = app.listen(PORT, () => {
  console.log(
    `Nodo P2P ${NODE_ID} iniciado en http://localhost:${PORT}`,
  );
});

// Sprint 2: sincronización entre nodos (canal WebSocket en /p2p)
const p2p = iniciarP2P(server, NODE_ID, PARES);

// Estado de las conexiones con los otros nodos
app.get("/peers", (_req, res) => {
  res.json({
    nodo: NODE_ID,
    pares: p2p.estadoPares(),
  });
});
