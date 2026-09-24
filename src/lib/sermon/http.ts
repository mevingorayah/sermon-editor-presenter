import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { StoreError } from "./store";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details !== undefined ? { details } : {}) },
    { status },
  );
}

export function handleRouteError(err: unknown) {
  if (err instanceof StoreError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof ZodError) {
    return jsonError("Validation failed", 400, err.issues);
  }
  console.error(err);
  return jsonError("Internal server error", 500);
}
