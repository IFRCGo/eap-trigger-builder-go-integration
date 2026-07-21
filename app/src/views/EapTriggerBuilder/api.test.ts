import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import {
    clearPrototypeAccessCode,
    generateTriggerStatement,
    getPrototypeAccessCode,
    PrototypeAccessError,
    setPrototypeAccessCode,
} from './api';
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
            'session-code',
            new AbortController().signal,
        )).resolves.toBe('Generated activation statement.');

        const firstRequest = fetchMock.mock.calls[0];
        expect(String(firstRequest?.[0])).toBe(
            'https://backend.example/api/trigger-builder/generate',
        );
        const firstInit = firstRequest?.[1] as RequestInit;
        expect(firstInit.headers).toMatchObject({
            'Content-Type': 'application/json',
            'X-Prototype-Access-Code': 'session-code',
        });
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
            'session-code',
            new AbortController().signal,
        );
        const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
        const secondBody = JSON.parse(String(secondInit.body)) as {
            statements: Array<{ thresholdValue: string }>;
        };
        expect(secondBody.statements[0]?.thresholdValue).toBe('42');
    });

    test('keeps the access code in session storage only', () => {
        setPrototypeAccessCode(' session-code ');
        expect(getPrototypeAccessCode()).toBe('session-code');
        expect(localStorage.length).toBe(0);

        clearPrototypeAccessCode();
        expect(getPrototypeAccessCode()).toBe('');
    });

    test('surfaces rejected access codes without exposing backend details', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 403,
        });

        await expect(generateTriggerStatement(
            createCompleteDraft(),
            ['Heatwave'],
            'wrong-code',
            new AbortController().signal,
        )).rejects.toBeInstanceOf(PrototypeAccessError);
    });
});
