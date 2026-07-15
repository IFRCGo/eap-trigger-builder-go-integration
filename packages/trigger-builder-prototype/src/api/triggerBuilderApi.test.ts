import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type { MetadataState, StatementDraftState } from '../types/app';
import {
    callGenerate,
    clearPrototypeAccessCode,
    getPrototypeAccessCode,
    PrototypeAccessError,
    setPrototypeAccessCode,
} from './triggerBuilderApi';

const metadata: MetadataState = {
    countryOrOperationName: 'Pakistan',
    countryId: 131,
    countryIso: 'PK',
    countryIso3: 'PAK',
    countryName: 'Pakistan',
    operationTitle: 'Flood EAP',
    hazardTypes: ['Flood'],
    eapName: 'Flood EAP',
    eapVariant: 'Single stage',
    versionLabel: 'Phase 1',
    displayTitleOverrideEnabled: false,
    displayTitleOverride: '',
};

const statement: StatementDraftState = {
    id: 'statement-1',
    phase: 'activation',
    canonicalVariable: 'Rainfall',
    subcategory: '',
    operator: '>=',
    thresholdValue: '100',
    thresholdUnit: 'mm',
    probabilityValue: undefined,
    leadTimeValue: undefined,
    timeframeUnit: 'days',
    geographyType: 'national',
    geographyLabel: 'Pakistan',
    geographyConfirmed: true,
    notes: '',
};

const successBody = {
    deterministicDraft: {
        preActivation: '',
        activation: 'Deterministic activation',
        stop: '',
        combined: 'Deterministic activation',
    },
    reviewOutput: {
        preActivation: '',
        activation: 'Polished activation',
        stop: '',
        combined: 'Polished activation',
    },
    warnings: [],
    modelId: 'gemini-3.5-flash',
    promptVersion: 'phase1-v1',
};

afterEach(() => {
    clearPrototypeAccessCode();
    window.__apiBaseUrl = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('temporary generation access client', () => {
    it('keeps the access code in session storage and attaches it to generation only', async () => {
        window.__apiBaseUrl = 'https://backend.example/';
        setPrototypeAccessCode('session-code');
        const fetchMock = vi.fn().mockResolvedValue(new Response(
            JSON.stringify(successBody),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const result = await callGenerate(metadata, [statement], 4);

        expect(getPrototypeAccessCode()).toBe('session-code');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://backend.example/api/trigger-builder/generate',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'X-Prototype-Access-Code': 'session-code',
                }),
            }),
        );
        expect(result.reviewOutput.generationIndex).toBe(4);
        expect(result.reviewOutput.modelId).toBe('gemini-3.5-flash');
        expect(result.reviewOutput.promptVersion).toBe('phase1-v1');
    });

    it('clears a rejected code and returns the dedicated access error', async () => {
        window.__apiBaseUrl = 'https://backend.example';
        setPrototypeAccessCode('wrong-code');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 'PROTOTYPE_ACCESS_DENIED',
            error: 'Access denied.',
        }), { status: 403 })));

        await expect(callGenerate(metadata, [statement], 1)).rejects.toBeInstanceOf(
            PrototypeAccessError,
        );
        expect(getPrototypeAccessCode()).toBe('');
    });

    it('aborts a generation request after the 160-second browser deadline', async () => {
        vi.useFakeTimers();
        window.__apiBaseUrl = 'https://backend.example';
        vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => (
            new Promise((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            })
        )));

        const request = callGenerate(metadata, [statement], 1);
        const rejection = expect(request).rejects.toThrow(
            'Generation timed out after 160 seconds',
        );
        await vi.advanceTimersByTimeAsync(160_000);

        await rejection;
    });
});
