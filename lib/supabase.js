// Supabase 클라이언트 (서버사이드용)
// service_role 키로 쓰기 가능

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://madufsewxrbolvdkvinn.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// 간단한 REST 클라이언트 (supabase-js 없이)
class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
  }

  async query(table, { select = "*", filters = {}, order, limit, offset } = {}) {
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
    return res.json();
  }

  async insert(table, rows, { upsert = false, onConflict = "" } = {}) {
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

// 읽기용 (anon key)
export function getReadClient() {
  return new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 쓰기용 (service role key) - Cron Job에서 사용
export function getWriteClient() {
  return new SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}
