import { downloadFile } from '#utils/common';

import type {
    DraftCountry,
    ForecastSource,
    GeographyCoordinates,
    GeographySource,
    TriggerBuilderDraft,
    TriggerConnector,
    TriggerDraft,
} from './types';

export const DRAFT_STORAGE_KEY = 'ifrc-go.eap-trigger-builder.v1.draft';

interface DraftDocumentV1 extends TriggerBuilderDraft {
    version: 1;
    savedAt: string;
}

type DraftLoadResult =
    | { status: 'empty' }
    | { status: 'loaded'; draft: TriggerBuilderDraft }
    | { status: 'invalid' | 'unsupported' | 'unavailable' };

type DraftShareResult =
    | 'web-share'
    | 'clipboard'
    | 'download'
    | 'cancelled'
    | 'unavailable';

const connectors = new Set<TriggerConnector>(['THEN', 'OR', 'AND']);
const geographySources = new Set<GeographySource>([
    'go_admin1',
    'go_admin2',
    'mapbox_search',
    'mapbox_pin',
    'pilot_geocoded',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
    return value === undefined || isFiniteNumber(value);
}

function isCoordinates(value: unknown): value is GeographyCoordinates {
    return isRecord(value)
        && isFiniteNumber(value.longitude)
        && isFiniteNumber(value.latitude);
}

function isOptionalCoordinates(
    value: unknown,
): value is GeographyCoordinates | undefined {
    return value === undefined || isCoordinates(value);
}

function isBoundingBox(value: unknown): value is [number, number, number, number] {
    return Array.isArray(value)
        && value.length === 4
        && value.every(isFiniteNumber);
}

function isCountry(value: unknown): value is DraftCountry {
    return isRecord(value)
        && isFiniteNumber(value.id)
        && isString(value.iso)
        && isString(value.iso3)
        && isString(value.name)
        && isOptionalCoordinates(value.centroid)
        && (value.boundingBox === undefined || isBoundingBox(value.boundingBox));
}

function isSource(value: unknown): value is ForecastSource {
    return isRecord(value)
        && isString(value.id)
        && isString(value.name)
        && isString(value.link);
}

function isTrigger(value: unknown): value is TriggerDraft {
    return isRecord(value)
        && isString(value.id)
        && isString(value.canonicalVariable)
        && isString(value.subcategory)
        && isString(value.operator)
        && isString(value.thresholdValue)
        && isString(value.thresholdUnit)
        && isOptionalFiniteNumber(value.probabilityValue)
        && isOptionalFiniteNumber(value.leadTimeValue)
        && isString(value.timeframeUnit)
        && isString(value.geographyType)
        && isString(value.geographyLabel)
        && isOptionalString(value.geographyFeatureId)
        && isOptionalCoordinates(value.geographyCoordinates)
        && (
            value.geographySource === undefined
            || geographySources.has(value.geographySource as GeographySource)
        )
        && typeof value.geographyConfirmed === 'boolean'
        && Array.isArray(value.sources)
        && value.sources.length > 0
        && value.sources.every(isSource)
        && (
            value.connectorToNext === undefined
            || connectors.has(value.connectorToNext as TriggerConnector)
        );
}

function isDraft(value: unknown): value is TriggerBuilderDraft {
    return isRecord(value)
        && isOptionalString(value.selectedPilotId)
        && isOptionalString(value.selectedPilotName)
        && (value.country === undefined || isCountry(value.country))
        && Array.isArray(value.triggers)
        && value.triggers.length > 0
        && value.triggers.every(isTrigger)
        && typeof value.importedConnectorWarning === 'boolean'
        && isOptionalString(value.aiStatement)
        && isOptionalString(value.aiGeneratedAt);
}

function copyCoordinates(
    value: GeographyCoordinates | undefined,
): GeographyCoordinates | undefined {
    return value ? { ...value } : undefined;
}

function copyCountry(country: DraftCountry | undefined): DraftCountry | undefined {
    return country ? {
        ...country,
        centroid: copyCoordinates(country.centroid),
        boundingBox: country.boundingBox
            ? [...country.boundingBox] as [number, number, number, number]
            : undefined,
    } : undefined;
}

function copyDraft(draft: TriggerBuilderDraft): TriggerBuilderDraft {
    return {
        selectedPilotId: draft.selectedPilotId,
        selectedPilotName: draft.selectedPilotName,
        country: copyCountry(draft.country),
        triggers: draft.triggers.map((trigger) => ({
            id: trigger.id,
            canonicalVariable: trigger.canonicalVariable,
            subcategory: trigger.subcategory,
            operator: trigger.operator,
            thresholdValue: trigger.thresholdValue,
            thresholdUnit: trigger.thresholdUnit,
            probabilityValue: trigger.probabilityValue,
            leadTimeValue: trigger.leadTimeValue,
            timeframeUnit: trigger.timeframeUnit,
            geographyType: trigger.geographyType,
            geographyLabel: trigger.geographyLabel,
            geographyFeatureId: trigger.geographyFeatureId,
            geographyCoordinates: copyCoordinates(trigger.geographyCoordinates),
            geographySource: trigger.geographySource,
            geographyConfirmed: trigger.geographyConfirmed,
            sources: trigger.sources.map((source) => ({ ...source })),
            connectorToNext: trigger.connectorToNext,
        })),
        importedConnectorWarning: draft.importedConnectorWarning,
        aiStatement: draft.aiStatement,
        aiGeneratedAt: draft.aiGeneratedAt,
    };
}

function createDraftDocument(draft: TriggerBuilderDraft): DraftDocumentV1 {
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        ...copyDraft(draft),
    };
}

function discardStoredDraft() {
    try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
        // Storage may be unavailable. The invalid value is ignored for this page load.
    }
}

export function loadTriggerBuilderDraft(): DraftLoadResult {
    let serializedDraft: string | null;
    try {
        serializedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    } catch {
        return { status: 'unavailable' };
    }

    if (serializedDraft === null) {
        return { status: 'empty' };
    }

    let parsedDraft: unknown;
    try {
        parsedDraft = JSON.parse(serializedDraft);
    } catch {
        discardStoredDraft();
        return { status: 'invalid' };
    }

    if (!isRecord(parsedDraft)) {
        discardStoredDraft();
        return { status: 'invalid' };
    }
    if (parsedDraft.version !== 1) {
        discardStoredDraft();
        return { status: 'unsupported' };
    }
    if (!isString(parsedDraft.savedAt) || !isDraft(parsedDraft)) {
        discardStoredDraft();
        return { status: 'invalid' };
    }

    return {
        status: 'loaded',
        draft: copyDraft(parsedDraft),
    };
}

export function saveTriggerBuilderDraft(draft: TriggerBuilderDraft) {
    const safeDraft = copyDraft(draft);
    try {
        localStorage.setItem(
            DRAFT_STORAGE_KEY,
            JSON.stringify(createDraftDocument(safeDraft)),
        );
        return { status: 'saved' as const, draft: safeDraft };
    } catch {
        return { status: 'unavailable' as const };
    }
}

export async function shareTriggerBuilderDraft(
    draft: TriggerBuilderDraft,
    title: string,
): Promise<DraftShareResult> {
    const json = JSON.stringify(createDraftDocument(draft), null, 2);
    const filename = 'eap-trigger-builder-draft.json';

    try {
        const file = new File([json], filename, { type: 'application/json' });
        const shareData: ShareData = { files: [file], title };
        if (navigator.share && navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData);
                return 'web-share';
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return 'cancelled';
                }
            }
        }
    } catch {
        // Continue to the clipboard and download fallbacks.
    }

    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(json);
            return 'clipboard';
        }
    } catch {
        // Continue to the download fallback.
    }

    try {
        downloadFile(
            new Blob([json], { type: 'application/json' }),
            'eap-trigger-builder-draft',
            'json',
        );
        return 'download';
    } catch {
        return 'unavailable';
    }
}
