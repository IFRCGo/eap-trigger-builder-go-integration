import { getRuntimeGoApiBaseUrl } from '../config/runtime';

type CountryBoundingBox = [number, number, number, number];

interface GeoJsonPoint {
    type: 'Point';
    coordinates: [number, number];
}
interface GeoJsonPolygon {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: unknown;
}

export interface GoCountry {
    id: number;
    name: string;
    iso: string;
    iso3: string;
    record_type: number;
    record_type_display: string;
    bbox: GeoJsonPolygon | null;
    centroid: GeoJsonPoint | null;
}

interface GoCountryListResponse {
    next: string | null;
    results: GoCountry[];
}

function collectCoordinates(value: unknown, output: number[][]): void {
    if (!Array.isArray(value)) {
        return;
    }
    if (
        value.length >= 2
        && typeof value[0] === 'number'
        && typeof value[1] === 'number'
    ) {
        output.push([value[0], value[1]]);
        return;
    }
    value.forEach((item) => collectCoordinates(item, output));
}

export function getCountryBoundingBox(country: Pick<GoCountry, 'bbox'>): CountryBoundingBox | undefined {
    if (!country.bbox) {
        return undefined;
    }
    const coordinates: number[][] = [];
    collectCoordinates(country.bbox.coordinates, coordinates);
    if (coordinates.length === 0) {
        return undefined;
    }
    const longitudes = coordinates.map(([longitude]) => longitude).filter((value): value is number => value !== undefined);
    const latitudes = coordinates.map(([, latitude]) => latitude).filter((value): value is number => value !== undefined);
    return [
        Math.min(...longitudes),
        Math.min(...latitudes),
        Math.max(...longitudes),
        Math.max(...latitudes),
    ];
}

export function getCountryCentroid(country: Pick<GoCountry, 'centroid'>): { longitude: number; latitude: number } | undefined {
    const [longitude, latitude] = country.centroid?.coordinates ?? [];
    if (longitude === undefined || latitude === undefined) {
        return undefined;
    }
    return { longitude, latitude };
}

export async function fetchGoCountries(signal?: AbortSignal): Promise<GoCountry[]> {
    const baseUrl = getRuntimeGoApiBaseUrl().replace(/\/$/, '');
    let nextUrl: string | null = `${baseUrl}/country/?limit=1000&record_type=1`;
    const countries: GoCountry[] = [];

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            headers: { Accept: 'application/json' },
            signal,
        });
        if (!response.ok) {
            throw new Error(`GO country service returned ${response.status}.`);
        }
        const page = await response.json() as GoCountryListResponse;
        countries.push(...page.results.filter((country) => (
            country.record_type === 1
            && Boolean(country.iso)
            && Boolean(country.iso3)
        )));
        nextUrl = page.next;
    }

    return countries.sort((a, b) => a.name.localeCompare(b.name));
}

export function findCountryByLegacyName(countries: GoCountry[], name: string): GoCountry | undefined {
    const normalized = name.trim().toLocaleLowerCase();
    if (!normalized) {
        return undefined;
    }
    return countries.find((country) => country.name.toLocaleLowerCase() === normalized)
        ?? countries.find((country) => normalized.startsWith(country.name.toLocaleLowerCase()));
}
