// Supabase 클라이언트 (서버사이드용)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

class SupabaseClient {
  constructor(url, key) {
    this.url = url.trim();
    this.key = key.trim();
  }

  isReady() {
    return !!(this.url && this.key && this.key.length > 20);
  }

  async query(table, { select = "*", filters = {}, order, limit, offset } = {}) {
    if (!this.isReady()) throw new Error("Supabase not configured");

    let url = `${this.url}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    for (const [k, v] of Object.entries(filters)) {
      url += `&${k}=${encodeURIComponent(v)}`;
    }
    if (order) url += `&order=${encodeURIComponent(order)}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;

    const res = await fetch(url, {
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase query error: ${res.status} - ${err}`);
    }

    return res.json();
  }

  async insert(table, rows, { upsert = false, onConflict = "" } = {}) {
    if (!this.isReady()) throw new Error("Supabase not configured");

    let url = `${this.url}/rest/v1/${table}`;
    const headers = {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      Prefer: upsert ? "resolution=merge-duplicates" : "return=minimal",
    };
    if (upsert && onConflict) {
      url += `?on_conflict=${onConflict}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase insert error: ${res.status} - ${err}`);
    }
    return { ok: true };
  }

  async delete(table, filters = {}) {
    if (!this.isReady()) throw new Error("Supabase not configured");

    let url = `${this.url}/rest/v1/${table}?`;
    for (const [k, v] of Object.entries(filters)) {
      url += `${k}=${encodeURIComponent(v)}&`;
    }

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
    });
    return { ok: res.ok };
  }
}

export function getReadClient() {
  return new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export function getWriteClient() {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  return new SupabaseClient(SUPABASE_URL, key);
}
