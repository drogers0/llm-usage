import type { ProviderId } from "./types.js";

export type FetchStatus = {
  ok: boolean;
  at: string;
  started_at: string;
  services: string[];
  request_id?: string;
  errors?: Record<string, string>;
};

/**
 * The envelope published by the fetch page via the URL hash fragment (#result=...).
 * Consumed by ingest_extension_result.ts in the CLI.
 */
export type FetchEnvelope = {
  ok: boolean;
  error?: string;
  services?: string[];
  request_id?: string;
  results?: Partial<Record<ProviderId, unknown>>;
  status?: FetchStatus;
};

/**
 * The message sent from the fetch page to the background worker.
 */
export type FetchUsageMessage = {
  action: "fetch_usage";
  services: string[];
  request_id?: string;
  deadline_ms?: number;
};

/**
 * The response returned from the background worker to the fetch page.
 */
export type FetchUsageResponse = {
  results: Record<string, unknown>;
  status: FetchStatus;
  error?: string;
};

/**
 * Maximum post-encodeURIComponent size for the #result= fragment payload.
 * Constraint: deadline_ms is an absolute wall-clock timestamp. This is safe
 * because the shell and browser run on the same machine, but it cannot survive
 * serialization across machines.
 */
export const MAX_FRAGMENT_BYTES = 2000;

export function buildFetchStatus(
  services: string[],
  errors: Record<string, string>,
  startedAt: string,
  completedAt: string,
  requestId?: string,
): FetchStatus {
  return {
    ok: Object.keys(errors).length === 0,
    at: completedAt,
    started_at: startedAt,
    services,
    ...(requestId ? { request_id: requestId } : {}),
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };
}

export function validateEnvelope(raw: unknown): FetchEnvelope {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("envelope is not an object");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.ok !== "boolean") {
    throw new Error("envelope missing boolean 'ok' field");
  }
  if (obj.services !== undefined && !Array.isArray(obj.services)) {
    throw new Error("envelope 'services' must be an array");
  }
  if (obj.results !== undefined && (typeof obj.results !== "object" || obj.results === null)) {
    throw new Error("envelope 'results' must be an object");
  }
  return raw as FetchEnvelope;
}

/**
 * Build a fetch envelope for transport via URL fragment.
 * Derives `ok` from the worker status rather than hardcoding it.
 */
export function buildFetchEnvelope(
  response: FetchUsageResponse | undefined,
  requestId?: string,
  services?: string[],
): FetchEnvelope {
  const ok = response?.status?.ok ?? false;
  return {
    ok,
    ...(response ? { results: response.results, status: response.status } : {}),
    ...(services ? { services } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  };
}

/**
 * Encode an envelope for URL fragment transport.
 * Throws if the encoded payload exceeds MAX_FRAGMENT_BYTES.
 */
export function encodeEnvelopeForFragment(envelope: FetchEnvelope): string {
  const encoded = encodeURIComponent(JSON.stringify(envelope));
  if (encoded.length > MAX_FRAGMENT_BYTES) {
    throw new Error(`encoded payload ${encoded.length} bytes exceeds ${MAX_FRAGMENT_BYTES} byte limit`);
  }
  return encoded;
}
