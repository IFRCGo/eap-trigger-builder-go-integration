import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { createBlankDraft } from './model';
import {
    DRAFT_STORAGE_KEY,
    loadTriggerBuilderDraft,
    saveTriggerBuilderDraft,
    shareTriggerBuilderDraft,
} from './persistence';
import type { TriggerBuilderDraft } from './types';

const mocks = vi.hoisted(() => ({
    downloadFile: vi.fn(),
}));

vi.mock('#utils/common', () => ({
    downloadFile: mocks.downloadFile,
}));

function createDraft(): TriggerBuilderDraft {
    const draft = createBlankDraft({
        id: 123,
        iso: 'MW',
        iso3: 'MWI',
        name: 'Malawi',
        centroid: { longitude: 34.3, latitude: -13.2 },
        boundingBox: [32.6, -17.1, 35.9, -9.3],
    });
    return {
        ...draft,
        triggers: draft.triggers.map((trigger) => ({
            ...trigger,
            geographyType: 'watershed_basin',
            geographyLabel: 'Five document-defined catchments',
            geographySource: 'pilot_document',
            geographyConfirmed: true,
            generationNotes: 'Lake Chilwa Basin: 150 mm',
        })),
        aiStatement: 'Editable AI statement',
        aiGeneratedAt: '2026-07-21T12:00:00.000Z',
    };
}

describe('EAP Trigger Builder persistence', () => {
    beforeEach(() => {
        localStorage.clear();
        mocks.downloadFile.mockReset();
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: undefined,
        });
        Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            value: undefined,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test('saves and restores the editable AI statement without unknown secrets', () => {
        const unsafeDraft = {
            ...createDraft(),
            prototypeAccessCode: 'must-not-be-saved',
        } as TriggerBuilderDraft;

        const saveResult = saveTriggerBuilderDraft(unsafeDraft);
        expect(saveResult.status).toBe('saved');

        const serialized = localStorage.getItem(DRAFT_STORAGE_KEY);
        expect(serialized).toContain('Editable AI statement');
        expect(serialized).toContain('2026-07-21T12:00:00.000Z');
        expect(serialized).toContain('Lake Chilwa Basin: 150 mm');
        expect(serialized).not.toContain('must-not-be-saved');

        const loadResult = loadTriggerBuilderDraft();
        expect(loadResult).toMatchObject({
            status: 'loaded',
            draft: {
                aiStatement: 'Editable AI statement',
                aiGeneratedAt: '2026-07-21T12:00:00.000Z',
                triggers: [{
                    geographySource: 'pilot_document',
                    geographyConfirmed: true,
                    generationNotes: 'Lake Chilwa Basin: 150 mm',
                }],
            },
        });
    });

    test('discards corrupt and unsupported stored drafts safely', () => {
        localStorage.setItem(DRAFT_STORAGE_KEY, '{not-json');
        expect(loadTriggerBuilderDraft()).toEqual({ status: 'invalid' });
        expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();

        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 2 }));
        expect(loadTriggerBuilderDraft()).toEqual({ status: 'unsupported' });
        expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    });

    test('reports unavailable storage without losing the open draft', () => {
        vi.stubGlobal('localStorage', {
            setItem: vi.fn(() => {
                throw new DOMException('Quota exceeded', 'QuotaExceededError');
            }),
        });

        expect(saveTriggerBuilderDraft(createDraft())).toEqual({ status: 'unavailable' });
    });

    test('shares through clipboard and falls back to download', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });

        await expect(shareTriggerBuilderDraft(createDraft(), 'EAP draft'))
            .resolves.toBe('clipboard');
        expect(writeText).toHaveBeenCalledOnce();
        expect(writeText.mock.calls[0]?.[0]).not.toContain('accessCode');

        writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
        await expect(shareTriggerBuilderDraft(createDraft(), 'EAP draft'))
            .resolves.toBe('download');
        expect(mocks.downloadFile).toHaveBeenCalledOnce();
    });
});
