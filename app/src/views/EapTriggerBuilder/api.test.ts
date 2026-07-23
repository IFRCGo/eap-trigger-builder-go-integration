import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import getReferenceData, { generateTriggerStatement } from './api';
import {
    createBlankDraft,
    createBlankSource,
    createBlankTrigger,
} from './model';
import type {
    DraftCountry,
    TriggerBuilderDraft,
} from './types';

vi.mock('#config', () => ({
    triggerBuilderApi: 'https://backend.example/',
}));

const country: DraftCountry = {
    id: 123,
    iso: 'MW',
    iso3: 'MWI',
    name: 'Malawi',
    centroid: { longitude: 34.3, latitude: -13.2 },
    boundingBox: [32.6, -17.1, 35.9, -9.3],
};

function createCompleteDraft(): TriggerBuilderDraft {
    const draft = createBlankDraft(country);
    const firstTrigger = {
        ...draft.triggers[0]!,
        canonicalVariable: 'Temperature',
        subcategory: 'Heat index',
        operator: '>=',
        thresholdValue: '40',
        thresholdUnit: 'C',
        probabilityValue: 70,
        leadTimeValue: 3,
        timeframeUnit: 'days',
        sources: [
            { ...createBlankSource(), name: 'National weather service' },
            { ...createBlankSource(), name: 'Regional forecast centre' },
        ],
        connectorToNext: 'THEN' as const,
    };
    const secondTrigger = {
        ...createBlankTrigger(country),
        canonicalVariable: 'Temperature',
        subcategory: 'Minimum temperature',
        operator: '>=',
        thresholdValue: '35',
        thresholdUnit: 'C',
    };

    return {
        ...draft,
        selectedPilotId: '16633',
        selectedPilotName: 'Burkina Faso - Heatwave sEAP (MDRBF020)',
        triggers: [firstTrigger, secondTrigger],
        aiStatement: 'A manually edited statement that must not be sent.',
        aiGeneratedAt: '2026-07-21T12:00:00.000Z',
    };
}

describe('EAP Trigger Builder API', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        sessionStorage.clear();
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('loads only opt-in generation notes from pilot examples', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    lookups: {
                        primaryVariables: [{ key: 'Precipitation', label: 'Precipitation' }],
                        hazardTypes: [],
                        subcategoriesByVariable: {},
                        unitsByVariable: {},
                        operatorsByVariable: {},
                        timeframeUnits: [],
                        geographyTypes: [],
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    examples: [{
                        document_id: 16399,
                        document_name: 'Malawi - Pluvial Floods sEAP (MDRMW023)',
                        statements: [{
                            phase: 'activation',
                            notes: 'Legacy extraction note that must remain ignored.',
                            generationNotes: 'Lake Chilwa Basin: 150 mm',
                        }],
                    }],
                }),
            });

        const result = await getReferenceData(new AbortController().signal);

        expect(result.examples[0]?.statements[0]).toMatchObject({
            generationNotes: 'Lake Chilwa Basin: 150 mm',
        });
        expect(result.examples[0]?.statements[0]).not.toHaveProperty('notes');
    });

    test('maps current structured fields into initial and repeated Generate requests', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                reviewOutput: {
                    activation: 'Generated activation statement.',
                    combined: 'Combined statement.',
                },
            }),
        });
        const draft = createCompleteDraft();

        await expect(generateTriggerStatement(
            draft,
            ['Heatwave'],
            new AbortController().signal,
        )).resolves.toBe('Generated activation statement.');

        const firstRequest = fetchMock.mock.calls[0];
        expect(String(firstRequest?.[0])).toBe(
            'https://backend.example/api/trigger-builder/generate',
        );
        const firstInit = firstRequest?.[1] as RequestInit;
        expect(firstInit.headers).toMatchObject({
            'Content-Type': 'application/json',
        });
        expect(firstInit.headers).not.toHaveProperty('X-Prototype-Access-Code');
        const firstBody = JSON.parse(String(firstInit.body)) as Record<string, unknown>;
        expect(firstBody).toMatchObject({
            documentContext: {
                countryId: 123,
                countryIso3: 'MWI',
                hazardTypes: ['Heatwave'],
            },
            statements: [
                {
                    phase: 'activation',
                    thresholdValue: '40',
                    sourceAuthority: 'National weather service; Regional forecast centre',
                    notes: '',
                    withinConnector: 'THEN',
                },
                {
                    phase: 'activation',
                    thresholdValue: '35',
                },
            ],
        });
        expect(JSON.stringify(firstBody)).not.toContain('manually edited');
        expect(JSON.stringify(firstBody)).not.toContain('reviewerNotes');

        const updatedDraft = {
            ...draft,
            triggers: draft.triggers.map((trigger, index) => (
                index === 0 ? { ...trigger, thresholdValue: '42' } : trigger
            )),
        };
        await generateTriggerStatement(
            updatedDraft,
            ['Heatwave'],
            new AbortController().signal,
        );
        const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
        const secondBody = JSON.parse(String(secondInit.body)) as {
            statements: Array<{ thresholdValue: string }>;
        };
        expect(secondBody.statements[0]?.thresholdValue).toBe('42');
    });

    test('sends optional generation facts without rejecting rewritten wording', async () => {
        const requiredFacts = [
            'Rainfall accumulation window: 72 hours',
            'Shire River Basin (Mwanza Gauging Station): 100 mm',
            'Lake Chilwa Basin: 150 mm',
        ].join('\n');
        const draft = createCompleteDraft();
        const draftWithFacts = {
            ...draft,
            triggers: draft.triggers.map((trigger, index) => (
                index === 0 ? { ...trigger, generationNotes: requiredFacts } : trigger
            )),
        };
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                reviewOutput: {
                    activation: 'The rainfall accumulation window is 72 hours, with 100 mm at Shire River Basin (Mwanza Gauging Station) and 150 mm at Lake Chilwa Basin.',
                    combined: '',
                },
            }),
        });

        await expect(generateTriggerStatement(
            draftWithFacts,
            ['Flood'],
            new AbortController().signal,
        )).resolves.toContain('Lake Chilwa Basin');

        const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const firstBody = JSON.parse(String(firstInit.body)) as {
            statements: Array<{ notes: string }>;
        };
        expect(firstBody.statements[0]?.notes).toBe(requiredFacts);

        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                reviewOutput: {
                    activation: 'The rainfall accumulation window is 72 hours, with 100 mm at Shire River Basin (Mwanza Gauging Station).',
                    combined: '',
                },
            }),
        });

        await expect(generateTriggerStatement(
            draftWithFacts,
            ['Flood'],
            new AbortController().signal,
        )).resolves.toContain('Shire River Basin');
    });
});
