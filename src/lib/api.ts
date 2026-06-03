import { publicApiUrl } from "./publicEnv";

const API_URL = publicApiUrl;

export class ApiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNetworkError";
  }
}

class ApiClient {
  private getBearerToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
  }

  private async request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };
    const bearer = this.getBearerToken();
    if (bearer && !headers.Authorization) {
      headers.Authorization = `Bearer ${bearer}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    } catch {
      throw new ApiNetworkError(
        `API unavailable at ${API_URL}. Is the backend running? (e.g. \`cd backend && php artisan serve\`)`
      );
    }

    if (res.status === 204) return undefined as T;

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || `Request failed: ${res.status}`);
    }
    return data;
  }

  // Public endpoints
  async getAdmin(slug: string) {
    return this.request<{ data: unknown }>(`/public/${slug}`);
  }

  async getCatalog(
    slug: string,
    subMode?: string | string[],
    includeLibrary = false,
  ) {
    const params = new URLSearchParams();
    if (subMode !== undefined && subMode !== "") {
      if (Array.isArray(subMode)) {
        const uniq = [...new Set(subMode.filter((s) => s && typeof s === "string"))];
        if (uniq.length === 1) {
          params.set("sub_mode", uniq[0]!);
        } else if (uniq.length > 1) {
          params.set("sub_modes", uniq.join(","));
        }
      } else {
        params.set("sub_mode", subMode);
      }
    }
    if (includeLibrary) params.set("include_library", "1");
    const query = params.toString() ? `?${params}` : "";
    return this.request<{ data: unknown[] }>(`/public/${slug}/catalog${query}`);
  }

  async getMaterials(slug: string) {
    return this.request<{ data: unknown[] }>(`/public/${slug}/materials`);
  }

  /** Global decor templates — used when the public admin has not imported any materials. */
  async getPublicMaterialTemplates() {
    return this.request<{ data: unknown[] }>("/public/material-templates");
  }

  async getModules(slug: string) {
    return this.request<{ data: unknown[] }>(`/public/${slug}/modules`);
  }

  async submitPlannerInquiry(
    slug: string,
    body: {
      customer_name: string;
      customer_email: string;
      planner_type: string;
      planner_label?: string;
      notes?: string;
      design: Record<string, unknown>;
    },
  ) {
    return this.request<{ ok: boolean }>(`/public/${encodeURIComponent(slug)}/planner-inquiry`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async submitOrder(slug: string, order: {
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    customer_address: string;
    type: string;
    total_price: number;
    notes?: string;
    items: {
      item_type: "catalog" | "module" | "custom";
      item_id?: string;
      name: string;
      quantity: number;
      price: number;
      custom_data?: Record<string, unknown>;
    }[];
  }) {
    return this.request<{ data: unknown }>(`/public/${slug}/orders`, {
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  async uploadPlannerSurfaceImage(slug: string, file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("image", file);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/public/${encodeURIComponent(slug)}/planner-surface-image`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: form,
      });
    } catch {
      throw new ApiNetworkError(
        `API unavailable at ${API_URL}. Is the backend running?`
      );
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Upload failed: ${res.status}`);
    }
    return data as { url: string };
  }

  async saveCustomDesign(body: { design: Record<string, unknown> }) {
    return this.request<{ data: unknown }>("/planners/custom-design/save", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async loadCustomDesign() {
    return this.request<{ data: { design: Record<string, unknown> | null } }>("/planners/custom-design/load");
  }

  async submitCustomDesign(body: {
    design: Record<string, unknown>;
    snapshot?: string;
    notes?: string;
    room_name?: string;
  }) {
    return this.request<{ data: unknown }>("/planners/custom-design/submit", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async submitCustomDesignPublic(slug: string, body: {
    design: Record<string, unknown>;
    snapshot?: string;
    notes?: string;
    room_name?: string;
  }) {
    return this.request<{ data: unknown }>(`/public/${encodeURIComponent(slug)}/planners/custom-design/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

export const api = new ApiClient();
