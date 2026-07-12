const AUTH_REQUIRED_EVENT = "tenantguard:auth-required";

class ApiClientError extends Error {
  public readonly status: number;
  public readonly apiMessage: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.apiMessage = message;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : getDefaultErrorMessage(response.status);

    throw new ApiClientError(response.status, message);
  }

  return body as T;
}

function getDefaultErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Session expired. Please sign in again.";
    case 403:
      return "Insufficient permissions.";
    case 404:
      return "Resource not found or unavailable.";
    case 409:
      return "The requested operation conflicts with existing data.";
    case 422:
      return "Invalid data provided.";
    case 429:
      return "Too many requests. Please try again later.";
    default:
      return "An unexpected error occurred.";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  /*
   * Existing mutation handlers already process their own errors.
   * This event guarantees that expired sessions from GET queries are
   * also handled at the application level.
   */
  if (response.status === 401 && method === "GET") {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }

  return handleResponse<T>(response);
}

export {
  AUTH_REQUIRED_EVENT,
  ApiClientError,
  request,
  handleResponse,
};

export type { RequestOptions };
