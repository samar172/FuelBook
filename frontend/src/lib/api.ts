import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("fb_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("fb_token");
      localStorage.removeItem("fb_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export type ApiUser = {
  id: string;
  name: string;
  phone: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  pumpId: string | null;
  pumpName?: string;
  permissions: Record<string, boolean> | null;
};

export const setAuth = (token: string, user: ApiUser) => {
  localStorage.setItem("fb_token", token);
  localStorage.setItem("fb_user", JSON.stringify(user));
};

export const getAuthUser = (): ApiUser | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("fb_user");
  return raw ? (JSON.parse(raw) as ApiUser) : null;
};

export const clearAuth = () => {
  localStorage.removeItem("fb_token");
  localStorage.removeItem("fb_user");
};

export const can = (perm: string): boolean => {
  const u = getAuthUser();
  if (!u) return false;
  if (u.role === "OWNER") return true;
  return Boolean(u.permissions?.[perm]);
};

// Trigger an authenticated file download from the API.
export const downloadFile = async (path: string, filename: string) => {
  const token = localStorage.getItem("fb_token");
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
