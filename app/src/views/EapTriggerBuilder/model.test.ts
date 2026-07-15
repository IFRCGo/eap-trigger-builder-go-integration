import {
    describe,
    expect,
    test,
} from 'vitest';

import {
    createBlankSource,
    createBlankTrigger,
    createPilotDraft,
    removeSource,
    removeTrigger,
} from './model';
import type {
    PilotExample,
    PilotStatement,
} from './types';

const baseStatement: PilotStatement = {
    phase: 'activation',
    canonicalVariable: 'Precipitation',
    subcategory: 'Total rainfall',
    operator: '>=',
    thresholdValue: '50',
    thresholdUnit: 'mm',
    probabilityValue: 70,
    leadTimeValue: 24,
    timeframeUnit: 'hours',
    geographyType: 'national',
    geographyLabel: '',
    withinConnector: '',
    crossConnector: '',
    sourceAuthority: 'National weather service',
};

describe('EAP Trigger Builder Stage 3 model', () => {
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
        expect(draft.triggers[0]?.sources[0]?.name).toBe('National weather service');
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
});
