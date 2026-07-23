import {
    describe,
    expect,
    test,
} from 'vitest';

import {
    changeGeographyType,
    createBlankDraft,
    createBlankSource,
    createBlankTrigger,
    createPilotDraft,
    findPilotCountry,
    getConfirmedGeographyPayload,
    getDraftFingerprint,
    getGenerationValidationErrors,
    removeSource,
    removeTrigger,
    toDraftCountry,
} from './model';
import type {
    DraftCountry,
    PilotExample,
    PilotStatement,
} from './types';

const malawiCountry: DraftCountry = {
    id: 123,
    iso: 'MW',
    iso3: 'MWI',
    name: 'Malawi',
    centroid: { longitude: 34.3, latitude: -13.2 },
    boundingBox: [32.6, -17.1, 35.9, -9.3],
};

const baseStatement: PilotStatement = {
    phase: 'activation',
    canonicalVariable: 'Precipitation',
    subcategory: 'Total rainfall',
    operator: '>=',
    thresholdValue: '50',
    thresholdUnit: 'mm',
    probabilityValue: 70,
    leadTimeValue: '3-5',
    timeframeUnit: 'hours',
    geographyType: 'national',
    geographyLabel: '',
    withinConnector: '',
    crossConnector: '',
    sourceAuthority: 'National weather service',
    generationNotes: 'Lake Chilwa Basin: 150 mm',
};

describe('EAP Trigger Builder model', () => {
    test('imports activation statements and supported connectors only', () => {
        const example: PilotExample = {
            documentId: 'pilot-1',
            documentName: 'Philippines: Typhoons - Full EAP',
            statements: [
                { ...baseStatement, phase: 'pre_activation' },
                { ...baseStatement, withinConnector: 'THEN' },
                {
                    ...baseStatement,
                    canonicalVariable: 'Wind',
                    geographyType: 'administrative_unit',
                    geographyLabel: 'Region V',
                    sourceAuthority: 'PAGASA',
                },
                { ...baseStatement, phase: 'stop' },
            ],
        };

        const draft = createPilotDraft(example);

        expect(draft.selectedPilotName).toBe(example.documentName);
        expect(draft.triggers).toHaveLength(2);
        expect(draft.triggers[0]?.connectorToNext).toBe('THEN');
        expect(draft.triggers[0]?.leadTimeValue).toBe('3-5');
        expect(draft.triggers[0]?.generationNotes).toBe('Lake Chilwa Basin: 150 mm');
        expect(draft.triggers[0]?.sources[0]?.name).toBe('National weather service');
        expect(draft.triggers[1]?.geographySource).toBe('pilot_document');
        expect(draft.triggers[1]?.geographyConfirmed).toBe(false);
        expect(draft.importedConnectorWarning).toBe(false);
    });

    test('warns and leaves unsupported imported connectors unselected', () => {
        const draft = createPilotDraft({
            documentId: 'pilot-2',
            documentName: 'Unsupported connector pilot',
            statements: [
                { ...baseStatement, crossConnector: 'IF_THEN' },
                { ...baseStatement },
            ],
        });

        expect(draft.triggers[0]?.connectorToNext).toBeUndefined();
        expect(draft.importedConnectorWarning).toBe(true);
    });

    test('keeps at least one trigger and one source', () => {
        const firstTrigger = createBlankTrigger();
        const secondTrigger = createBlankTrigger();
        const firstSource = createBlankSource();
        const secondSource = createBlankSource();

        expect(removeTrigger([firstTrigger], firstTrigger.id)).toEqual([firstTrigger]);
        expect(removeTrigger([firstTrigger, secondTrigger], secondTrigger.id)).toEqual([
            { ...firstTrigger, connectorToNext: undefined },
        ]);
        expect(removeSource([firstSource], firstSource.id)).toEqual([firstSource]);
        expect(removeSource([firstSource, secondSource], secondSource.id)).toEqual([firstSource]);
    });

    test('matches a pilot country and creates a confirmed national selection', () => {
        const country = findPilotCountry('Malawi - Floods - Full EAP', [{
            id: malawiCountry.id,
            iso: malawiCountry.iso,
            iso3: malawiCountry.iso3,
            name: malawiCountry.name,
            centroid: {
                type: 'Point',
                coordinates: [34.3, -13.2],
            },
            bbox: {
                type: 'Polygon',
                coordinates: [[
                    [32.6, -17.1],
                    [35.9, -17.1],
                    [35.9, -9.3],
                    [32.6, -9.3],
                    [32.6, -17.1],
                ]],
            },
        }]);

        expect(country).toEqual(malawiCountry);
        const draft = createPilotDraft({
            documentId: 'pilot-malawi',
            documentName: 'Malawi - Floods - Full EAP',
            statements: [baseStatement],
        }, country);
        expect(draft.country).toEqual(malawiCountry);
        expect(draft.triggers[0]).toMatchObject({
            geographyType: 'national',
            geographyLabel: 'Malawi',
            geographyFeatureId: 'country:123',
            geographyConfirmed: true,
        });
    });

    test('clears stale structured geography when its type changes', () => {
        const trigger = {
            ...createBlankTrigger(malawiCountry),
            ...changeGeographyType('station_gauge', malawiCountry),
            geographyLabel: 'Shire River gauge',
            geographyFeatureId: 'mapbox:shire',
            geographyCoordinates: { longitude: 34.9, latitude: -15.8 },
            geographySource: 'mapbox_search' as const,
            geographyConfirmed: true,
        };

        expect(changeGeographyType('administrative_unit', malawiCountry)).toEqual({
            geographyType: 'administrative_unit',
            geographyLabel: '',
            geographyFeatureId: undefined,
            geographyCoordinates: undefined,
            geographySource: undefined,
            geographyConfirmed: false,
        });
        expect({ ...trigger, ...changeGeographyType('national', malawiCountry) }).toMatchObject({
            geographyType: 'national',
            geographyLabel: 'Malawi',
            geographyFeatureId: 'country:123',
            geographyConfirmed: true,
        });
    });

    test('accepts explicitly confirmed document geography without requiring coordinates', () => {
        const trigger = {
            ...createBlankTrigger(malawiCountry),
            ...changeGeographyType('station_gauge', malawiCountry),
            geographyLabel: 'Typed but not selected',
            geographySource: 'pilot_document' as const,
        };

        expect(getConfirmedGeographyPayload(trigger, malawiCountry)).toBeUndefined();

        const confirmedDocumentTrigger = {
            ...trigger,
            geographyLabel: 'Five document-defined catchments',
            geographyConfirmed: true,
        };
        expect(getConfirmedGeographyPayload(confirmedDocumentTrigger, malawiCountry)).toEqual({
            geographyType: 'station_gauge',
            geographyLabel: 'Five document-defined catchments',
            geographyFeatureId: undefined,
            geographyCoordinates: undefined,
            geographySource: 'pilot_document',
            geographyConfirmed: true,
        });

        const confirmedTrigger = {
            ...trigger,
            geographyLabel: 'Shire River gauge',
            geographyFeatureId: 'mapbox:shire',
            geographyCoordinates: { longitude: 34.9, latitude: -15.8 },
            geographySource: 'mapbox_search' as const,
            geographyConfirmed: true,
        };
        expect(getConfirmedGeographyPayload(confirmedTrigger, malawiCountry)).toEqual({
            geographyType: 'station_gauge',
            geographyLabel: 'Shire River gauge',
            geographyFeatureId: 'mapbox:shire',
            geographyCoordinates: { longitude: 34.9, latitude: -15.8 },
            geographySource: 'mapbox_search',
            geographyConfirmed: true,
        });
    });

    test('keeps confirmed geography in a serializable draft round trip', () => {
        const trigger = {
            ...createBlankTrigger(malawiCountry),
            ...changeGeographyType('regional', malawiCountry),
            geographyLabel: 'Southern Region',
            geographyFeatureId: 'MW-S',
            geographyCoordinates: { longitude: 34.5, latitude: -15.5 },
            geographySource: 'go_admin1' as const,
            geographyConfirmed: true,
        };
        const draft = {
            selectedPilotId: undefined,
            selectedPilotName: undefined,
            country: toDraftCountry({
                id: malawiCountry.id,
                iso: malawiCountry.iso,
                iso3: malawiCountry.iso3,
                name: malawiCountry.name,
            }),
            triggers: [trigger],
            importedConnectorWarning: false,
            aiStatement: undefined,
        };

        const restored = JSON.parse(JSON.stringify(draft)) as typeof draft;
        expect(restored.triggers[0]?.geographyFeatureId).toBe('MW-S');
        expect(restored.triggers[0]?.geographyCoordinates).toEqual({
            longitude: 34.5,
            latitude: -15.5,
        });
        expect(restored.triggers[0]?.geographyConfirmed).toBe(true);
    });

    test('fingerprints meaningful draft data without random ids and includes AI output', () => {
        const firstDraft = createBlankDraft(malawiCountry);
        const sameDraftWithDifferentIds = createBlankDraft(malawiCountry);
        const draftWithAiStatement = {
            ...createBlankDraft(malawiCountry),
            aiStatement: 'An edited AI statement',
        };

        expect(getDraftFingerprint(firstDraft)).toBe(
            getDraftFingerprint(sameDraftWithDifferentIds),
        );
        expect(getDraftFingerprint(firstDraft)).not.toBe(
            getDraftFingerprint(draftWithAiStatement),
        );

        const changedDraft = {
            ...firstDraft,
            triggers: firstDraft.triggers.map((trigger, index) => (
                index === 0
                    ? {
                        ...trigger,
                        sources: trigger.sources.map((source, sourceIndex) => (
                            sourceIndex === 0
                                ? { ...source, name: 'New forecast source' }
                                : source
                        )),
                    }
                    : trigger
            )),
        };
        expect(getDraftFingerprint(firstDraft)).not.toBe(getDraftFingerprint(changedDraft));

        const draftWithGenerationNotes = {
            ...firstDraft,
            triggers: firstDraft.triggers.map((trigger, index) => (
                index === 0
                    ? { ...trigger, generationNotes: 'Lake Chilwa Basin: 150 mm' }
                    : trigger
            )),
        };
        expect(getDraftFingerprint(firstDraft)).not.toBe(
            getDraftFingerprint(draftWithGenerationNotes),
        );
    });

    test('validates required trigger fields, geography, country, and connectors', () => {
        const blankDraft = createBlankDraft();
        const blankErrors = getGenerationValidationErrors(blankDraft);
        expect(blankErrors?.country).toBe(true);
        expect(blankErrors?.triggers[blankDraft.triggers[0]!.id]).toMatchObject({
            canonicalVariable: true,
            subcategory: true,
            operator: true,
            thresholdValue: true,
        });

        const firstTrigger = {
            ...createBlankTrigger(malawiCountry),
            canonicalVariable: 'Precipitation',
            subcategory: 'Total rainfall',
            operator: '>=',
            thresholdValue: '50',
            thresholdUnit: 'mm',
        };
        const secondTrigger = {
            ...firstTrigger,
            id: 'second-trigger',
            geographyType: 'regional',
            geographyLabel: 'Southern Region',
            geographyConfirmed: false,
        };
        expect(getGenerationValidationErrors({
            ...createBlankDraft(malawiCountry),
            triggers: [{
                ...firstTrigger,
                subcategory: 'Alert-stage station count',
                thresholdValue: 'alert stage',
                thresholdUnit: '',
            }],
        })).toBeUndefined();

        const incompleteDraft = {
            ...createBlankDraft(malawiCountry),
            triggers: [firstTrigger, secondTrigger],
        };
        const incompleteErrors = getGenerationValidationErrors(incompleteDraft);
        expect(incompleteErrors?.connectors.has(firstTrigger.id)).toBe(true);
        expect(incompleteErrors?.triggers[secondTrigger.id]?.geography).toBe(true);

        expect(getGenerationValidationErrors({
            ...incompleteDraft,
            triggers: [
                { ...firstTrigger, connectorToNext: 'AND' },
                { ...secondTrigger, geographyConfirmed: true },
            ],
        })).toBeUndefined();
    });
});
