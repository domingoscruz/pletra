/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRAKT_CLIENT_ID: string;
  // Adicione outras variáveis de ambiente se houver
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
