import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import type { Task } from "../models/task";
import { onTaskEvent } from "../events/task.events";
import {
  aplicarEliminacionRemota,
  aplicarTareaRemota,
  getEliminadas,
  getTasks,
} from "../services/task.service";
import type { Tombstone } from "../services/task.service";

const INTERVALO_LATIDO_MS = 15_000;
const ESPERA_MAXIMA_MS = 10_000;

// Mensajes que se intercambian los nodos por el canal /p2p
type MensajeP2P =
  | { tipo: "cambio"; origen: string; tarea: Task; enviadoEn: number }
  | { tipo: "eliminacion"; origen: string; lapida: Tombstone; enviadoEn: number }
  | {
      tipo: "estado";
      origen: string;
      tareas: Task[];
      eliminadas: Tombstone[];
      enviadoEn: number;
    };

export interface EstadoPar {
  url: string;
  estado: "conectado" | "desconectado";
}

// ------------------------- validación de mensajes -------------------------

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function esTarea(valor: unknown): valor is Task {
  return (
    esObjeto(valor) &&
    typeof valor.id === "string" &&
    typeof valor.titulo === "string" &&
    typeof valor.descripcion === "string" &&
    (valor.estado === "pendiente" ||
      valor.estado === "en_progreso" ||
      valor.estado === "finalizada") &&
    typeof valor.createdAt === "number" &&
    typeof valor.updatedAt === "number" &&
    typeof valor.version === "number" &&
    typeof valor.updatedBy === "string"
  );
}

function esLapida(valor: unknown): valor is Tombstone {
  return (
    esObjeto(valor) &&
    typeof valor.id === "string" &&
    typeof valor.version === "number" &&
    typeof valor.updatedAt === "number" &&
    typeof valor.updatedBy === "string"
  );
}

function leerMensaje(datos: RawData): MensajeP2P | undefined {
  let contenido: unknown;

  try {
    contenido = JSON.parse(datos.toString());
  } catch {
    return undefined;
  }

  if (!esObjeto(contenido) || typeof contenido.origen !== "string") {
    return undefined;
  }

  const origen = contenido.origen;
  const enviadoEn =
    typeof contenido.enviadoEn === "number" ? contenido.enviadoEn : Date.now();

  if (contenido.tipo === "cambio" && esTarea(contenido.tarea)) {
    return { tipo: "cambio", origen, tarea: contenido.tarea, enviadoEn };
  }

  if (contenido.tipo === "eliminacion" && esLapida(contenido.lapida)) {
    return { tipo: "eliminacion", origen, lapida: contenido.lapida, enviadoEn };
  }

  if (
    contenido.tipo === "estado" &&
    Array.isArray(contenido.tareas) &&
    contenido.tareas.every(esTarea) &&
    Array.isArray(contenido.eliminadas) &&
    contenido.eliminadas.every(esLapida)
  ) {
    return {
      tipo: "estado",
      origen,
      tareas: contenido.tareas,
      eliminadas: contenido.eliminadas,
      enviadoEn,
    };
  }

  return undefined;
}

// --------------------------- conversión de URL ---------------------------

// "http://192.168.56.12:4002" -> "ws://192.168.56.12:4002/p2p"
export function aUrlP2P(par: string): string | undefined {
  try {
    const url = new URL(par);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/p2p";
    return url.toString();
  } catch {
    return undefined;
  }
}

// ------------------------------ nodo P2P ------------------------------

export function iniciarP2P(
  server: Server,
  nodeId: string,
  pares: string[],
): { estadoPares: () => EstadoPar[] } {
  // ---- Mensajes entrantes (de otros nodos hacia este) ----
  function procesar(datos: RawData): void {
    const mensaje = leerMensaje(datos);

    if (!mensaje) {
      console.warn("Mensaje P2P inválido descartado");
      return;
    }

    if (mensaje.tipo === "cambio") {
      const resultado = aplicarTareaRemota(mensaje.tarea);
      console.log(
        `[${nodeId}] cambio de ${mensaje.origen} sobre "${mensaje.tarea.titulo}" (v${mensaje.tarea.version}): ${resultado}`,
      );
      return;
    }

    if (mensaje.tipo === "eliminacion") {
      const resultado = aplicarEliminacionRemota(mensaje.lapida);
      console.log(
        `[${nodeId}] eliminación de ${mensaje.origen} sobre ${mensaje.lapida.id}: ${resultado}`,
      );
      return;
    }

    let aplicadas = 0;

    for (const lapida of mensaje.eliminadas) {
      if (aplicarEliminacionRemota(lapida) === "aplicada") aplicadas += 1;
    }

    for (const tarea of mensaje.tareas) {
      if (aplicarTareaRemota(tarea) === "aplicada") aplicadas += 1;
    }

    console.log(
      `[${nodeId}] estado completo de ${mensaje.origen}: ${aplicadas} cambios aplicados`,
    );
  }

  // ---- Servidor: acepta conexiones de otros nodos en /p2p ----
  const wss = new WebSocketServer({ server, path: "/p2p" });
  const vivosEntrantes = new WeakSet<WebSocket>();

  wss.on("connection", (socket) => {
    vivosEntrantes.add(socket);
    socket.on("pong", () => vivosEntrantes.add(socket));
    socket.on("message", procesar);
    socket.on("error", (error) => {
      console.error(`[${nodeId}] error en conexión entrante: ${error.message}`);
    });
    console.log(`[${nodeId}] otro nodo se conectó. Entrantes: ${wss.clients.size}`);
  });

  // ---- Cliente: este nodo se conecta a cada par para enviarle cambios ----
  interface Enlace {
    url: string;
    socket: WebSocket | undefined;
    vivo: boolean;
    intentos: number;
  }

  const enlaces: Enlace[] = [];

  function mensajeEstado(): MensajeP2P {
    return {
      tipo: "estado",
      origen: nodeId,
      tareas: getTasks(),
      eliminadas: getEliminadas(),
      enviadoEn: Date.now(),
    };
  }

  function conectar(enlace: Enlace): void {
    const socket = new WebSocket(enlace.url);
    enlace.socket = socket;

    socket.on("open", () => {
      enlace.intentos = 0;
      enlace.vivo = true;
      console.log(`[${nodeId}] conectado al par ${enlace.url}`);
      // Al (re)conectar se envía el estado completo: así un nodo que estuvo
      // caído se pone al día y los dos nodos convergen.
      socket.send(JSON.stringify(mensajeEstado()));
    });

    socket.on("message", procesar);
    socket.on("pong", () => {
      enlace.vivo = true;
    });

    socket.on("error", (error) => {
      console.warn(`[${nodeId}] no se pudo hablar con ${enlace.url}: ${error.message}`);
    });

    socket.on("close", () => {
      enlace.socket = undefined;
      const espera = Math.min(1000 * 2 ** enlace.intentos, ESPERA_MAXIMA_MS);
      enlace.intentos += 1;
      setTimeout(() => conectar(enlace), espera);
    });
  }

  for (const par of pares) {
    const url = aUrlP2P(par);

    if (!url) {
      console.warn(`[${nodeId}] dirección de par inválida, se omite: ${par}`);
      continue;
    }

    const enlace: Enlace = { url, socket: undefined, vivo: true, intentos: 0 };
    enlaces.push(enlace);
    conectar(enlace);
  }

  function difundir(mensaje: MensajeP2P): void {
    const texto = JSON.stringify(mensaje);

    for (const enlace of enlaces) {
      if (enlace.socket && enlace.socket.readyState === WebSocket.OPEN) {
        enlace.socket.send(texto);
      }
    }
  }

  // ---- Cada cambio LOCAL se propaga a los demás nodos ----
  onTaskEvent((evento) => {
    if (evento.tipo === "tarea:eliminada") {
      difundir({
        tipo: "eliminacion",
        origen: nodeId,
        lapida: {
          id: evento.id,
          version: evento.version,
          updatedAt: evento.updatedAt,
          updatedBy: evento.updatedBy,
        },
        enviadoEn: Date.now(),
      });
      return;
    }

    difundir({
      tipo: "cambio",
      origen: nodeId,
      tarea: evento.tarea,
      enviadoEn: Date.now(),
    });
  });

  // ---- Latido: detecta conexiones muertas (por ejemplo, VM sin red) ----
  setInterval(() => {
    for (const socket of wss.clients) {
      if (!vivosEntrantes.has(socket)) {
        socket.terminate();
        continue;
      }
      vivosEntrantes.delete(socket);
      socket.ping();
    }

    for (const enlace of enlaces) {
      if (enlace.socket && enlace.socket.readyState === WebSocket.OPEN) {
        if (!enlace.vivo) {
          enlace.socket.terminate();
          continue;
        }
        enlace.vivo = false;
        enlace.socket.ping();
      }
    }
  }, INTERVALO_LATIDO_MS);

  return {
    estadoPares: () =>
      enlaces.map((enlace) => ({
        url: enlace.url,
        estado:
          enlace.socket && enlace.socket.readyState === WebSocket.OPEN
            ? "conectado"
            : "desconectado",
      })),
  };
}
