import { publicApiUrl } from "./publicEnv";

const API_URL = publicApiUrl;

export class ApiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNetworkError";
  }
}

class ApiClient {
  private async request<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

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

  async getCatalog(slug: string, subMode?: string, includeLibrary = false) {
    const params = new URLSearchParams();
    if (subMode) params.set("sub_mode", subMode);
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
}

export const api = new ApiClient();
