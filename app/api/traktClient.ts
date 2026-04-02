import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

const TRAKT_API_URL: string = "https://api.trakt.tv";
const CLIENT_ID: string = import.meta.env.VITE_TRAKT_CLIENT_ID || "";

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
  (error) => {
    return Promise.reject(error);
  },
);

traktApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("[Trakt API] Unauthorized access. Token might be expired or invalid.");
    }
    return Promise.reject(error);
  },
);

if (!CLIENT_ID) {
  console.warn("Trakt Client ID is missing. Please check your .env.local file.");
}
