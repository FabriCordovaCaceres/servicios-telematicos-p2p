import type { NextFunction, Request, Response } from "express";

const ORIGEN_PERMITIDO = process.env.CORS_ORIGIN ?? "*";

export function cors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", ORIGEN_PERMITIDO);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
