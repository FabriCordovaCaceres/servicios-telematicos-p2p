import express from "express";
import taskRoutes from "./routes/task.routes";

const app = express();

const PORT = Number(process.env.PORT ?? 4001);
const NODE_ID = process.env.NODE_ID ?? "nodo-1";

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

app.listen(PORT, () => {
  console.log(
    `Nodo P2P ${NODE_ID} iniciado en http://localhost:${PORT}`,
  );
});
