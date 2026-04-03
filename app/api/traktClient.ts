import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from "axios";

const TRAKT_API_URL = "https://api.trakt.tv";
const CLIENT_ID = import.meta.env.VITE_TRAKT_CLIENT_ID || "";

export const traktApi: AxiosInstance = axios.create({
  baseURL: TRAKT_API_URL,
  headers: {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": CLIENT_ID,
  },
});

traktApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = localStorage.getItem("trakt_access_token");

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

traktApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      console.error("[Trakt API] Unauthorized access. Token expired or invalid.");

      localStorage.removeItem("trakt_access_token");
      localStorage.removeItem("trakt_refresh_token");

      window.dispatchEvent(new Event("trakt_unauthorized"));
    }

    return Promise.reject(error);
  },
);

if (!CLIENT_ID) {
  console.warn("[Trakt API] Client ID is missing. Check your environment variables.");
}
