import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import {
    fetchGoCountries,
    findCountryByLegacyName,
    getCountryBoundingBox,
    getCountryCentroid,
    type GoCountry,
} from './countries';

function country(overrides: Partial<GoCountry>): GoCountry {
    return {
        id: 1,
        name: 'Pakistan',
        iso: 'PK',
        iso3: 'PAK',
        record_type: 1,
        record_type_display: 'Country',
        bbox: {
            type: 'Polygon',
            coordinates: [[
                [60, 37],
                [78, 37],
                [78, 23],
                [60, 23],
                [60, 37],
            ]],
        },
        centroid: { type: 'Point', coordinates: [69, 30] },
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    window.__goApiBaseUrl = undefined;
});
describe('GO country adapter', () => {
    it('paginates, filters non-country records, and sorts the structured list', async () => {
        window.__goApiBaseUrl = 'https://go.example/api/v2/';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                next: 'https://go.example/api/v2/country/?page=2',
                results: [
                    country({ id: 2, name: 'Zimbabwe', iso: 'ZW', iso3: 'ZWE' }),
                    country({ id: 99, name: 'Region record', record_type: 2 }),
                ],
            })))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                next: null,
                results: [country({ id: 3, name: 'Albania', iso: 'AL', iso3: 'ALB' })],
            })));
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchGoCountries();

        expect(result.map(({ name }) => name)).toEqual(['Albania', 'Zimbabwe']);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://go.example/api/v2/country/?limit=1000&record_type=1',
            expect.objectContaining({ headers: { Accept: 'application/json' } }),
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('derives the country bounds and centroid used to constrain Mapbox', () => {
        const pakistan = country({});

        expect(getCountryBoundingBox(pakistan)).toEqual([60, 23, 78, 37]);
        expect(getCountryCentroid(pakistan)).toEqual({ longitude: 69, latitude: 30 });
    });

    it('migrates only an exact or country-prefixed legacy operation name', () => {
        const countries = [
            country({}),
            country({ id: 2, name: 'Malawi', iso: 'MW', iso3: 'MWI' }),
        ];

        expect(findCountryByLegacyName(countries, 'Pakistan')?.iso3).toBe('PAK');
        expect(findCountryByLegacyName(countries, 'Malawi Flood EAP')?.iso3).toBe('MWI');
        expect(findCountryByLegacyName(countries, 'Flood response')).toBeUndefined();
    });
});
