declare global {
    interface Window {
        __apiBaseUrl?: string;
        __goApiBaseUrl?: string;
        __mapboxToken?: string;
    }
}
function runtimeValue(value: string | undefined): string {
    return value?.trim() ?? '';
}

export function getRuntimeMapboxToken(): string {
    return runtimeValue(
        (typeof window !== 'undefined' ? window.__mapboxToken : undefined)
        || import.meta.env.VITE_MAPBOX_TOKEN,
    );
}

export function getRuntimeApiBaseUrl(): string {
    return runtimeValue(
        (typeof window !== 'undefined' ? window.__apiBaseUrl : undefined)
        || import.meta.env.VITE_API_BASE_URL,
    );
}

export function getRuntimeGoApiBaseUrl(): string {
    return runtimeValue(
        (typeof window !== 'undefined' ? window.__goApiBaseUrl : undefined)
        || import.meta.env.VITE_GO_API_BASE_URL,
    ) || 'https://goadmin.ifrc.org/api/v2';
}
