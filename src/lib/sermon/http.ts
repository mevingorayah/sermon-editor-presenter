import { NextResponse } from "next/server";
import { ZodError } from "zod";

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
  if (err instanceof ZodError) {
    return jsonError("Validation failed", 400, err.issues);
  }
  console.error(err);
  return jsonError("Internal server error", 500);
}
