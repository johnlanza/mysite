'use client';

export const DEFAULT_SAVE_TIMEOUT_MS = 15000;

type JsonRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  timeoutMs?: number;
};

type JsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; data: unknown };

function getPayloadMessage(payload: unknown) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return '';
}

export function getRequestErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'The save request timed out. Please check your connection and try again.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export async function fetchJson<T = unknown>(url: string, options: JsonRequestOptions = {}): Promise<JsonResult<T>> {
  const { body, timeoutMs = DEFAULT_SAVE_TIMEOUT_MS, headers, ...requestOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...requestOptions,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: getPayloadMessage(data) || `Request failed with status ${response.status}.`,
        data
      };
    }

    return { ok: true, status: response.status, data: data as T };
  } finally {
    clearTimeout(timeout);
  }
}
