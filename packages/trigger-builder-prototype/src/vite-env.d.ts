/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_MAPBOX_TOKEN: string;
    /** Backend API base URL for local dev (e.g. http://localhost:8000). At runtime, window.__apiBaseUrl takes precedence. */
    readonly VITE_API_BASE_URL: string;
    /** GO API base URL for the country selector. At runtime, window.__goApiBaseUrl takes precedence. */
    readonly VITE_GO_API_BASE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
