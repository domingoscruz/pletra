import axios, { AxiosInstance } from "axios";

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

if (!CLIENT_ID) {
  console.warn("Trakt Client ID is missing. Please check your .env.local file.");
}
