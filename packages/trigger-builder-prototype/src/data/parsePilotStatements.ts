import type { StatementDraftState } from '../types/app';
import pilotEapStatementsFile from './generated/pilot_eap_statements.json';

export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function toStringValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
    return '';
}

export function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
}

export function toOptionalNumberValue(value: unknown): number | undefined {
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

function toCoordinates(value: unknown): { longitude: number; latitude: number } | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const longitude = toOptionalNumberValue(value.longitude);
    const latitude = toOptionalNumberValue(value.latitude);
    if (longitude === undefined || latitude === undefined) {
        return undefined;
    }
    return { longitude, latitude };
}

export function parseStatement(obj: Record<string, unknown>, defaultId: string): StatementDraftState {
    const isFreeText = typeof obj.isFreeText === 'boolean' ? obj.isFreeText : undefined;
    const freeTextStatement = typeof obj.freeTextStatement === 'string' ? obj.freeTextStatement : undefined;
    return {
        id: typeof obj.id === 'string' ? obj.id : defaultId,
        phase: toStringValue(obj.phase),
        canonicalVariable: toStringValue(obj.canonicalVariable),
        subcategory: toStringValue(obj.subcategory),
        operator: toStringValue(obj.operator),
        thresholdValue: toStringValue(obj.thresholdValue),
        thresholdUnit: toStringValue(obj.thresholdUnit),
        probabilityValue: toOptionalNumberValue(obj.probabilityValue),
        leadTimeValue: obj.leadTimeValue != null ? String(obj.leadTimeValue) : undefined,
        timeframeUnit: toStringValue(obj.timeframeUnit),
        geographyType: toStringValue(obj.geographyType),
        geographyLabel: toStringValue(obj.geographyLabel),
        geographyFeatureId: obj.geographyFeatureId !== undefined
            ? toStringValue(obj.geographyFeatureId)
            : undefined,
        geographyCoordinates: toCoordinates(obj.geographyCoordinates),
        geographySource: (
            obj.geographySource === 'go_admin1'
            || obj.geographySource === 'go_admin2'
            || obj.geographySource === 'mapbox_search'
            || obj.geographySource === 'mapbox_pin'
            || obj.geographySource === 'pilot_geocoded'
        ) ? obj.geographySource : undefined,
        geographyConfirmed: obj.geographyConfirmed === true,
        notes: toStringValue(obj.notes),
        withinConnector: obj.withinConnector !== undefined ? toStringValue(obj.withinConnector) : undefined,
        crossConnector: obj.crossConnector !== undefined ? toStringValue(obj.crossConnector) : undefined,
        sourceAuthority: obj.sourceAuthority !== undefined ? toStringValue(obj.sourceAuthority) : undefined,
        ...(isFreeText !== undefined ? { isFreeText } : {}),
        ...(freeTextStatement !== undefined ? { freeTextStatement } : {}),
    };
}

export function isPilotStatementProseOnly(stmt: StatementDraftState): boolean {
    return stmt.canonicalVariable === '' && stmt.operator === '';
}

export function parsePilotStatements(documentId: string): StatementDraftState[] {
    const rawList = (pilotEapStatementsFile as Record<string, Record<string, unknown>[]>)[documentId];
    if (!rawList || !Array.isArray(rawList)) {
        return [];
    }
    return (rawList as unknown[])
        .filter(isRecord)
        .map((item, index) => {
            // Always generate a fresh unique ID — never reuse raw data IDs, which can be
            // duplicated in edge-case pilot EAPs (e.g. two stop statements share the same id).
            const freshId = `${documentId}-${index}-${Math.random().toString(36).substring(2, 9)}`;
            const parsed = parseStatement(item, freshId);
            const base: StatementDraftState = {
                ...parsed,
                id: freshId,
                phase: parsed.phase || 'activation',
                geographyType: parsed.geographyType || 'national',
                geographySource: parsed.geographyType && parsed.geographyType !== 'national'
                    ? (parsed.geographySource ?? 'pilot_geocoded')
                    : parsed.geographySource,
                geographyConfirmed: parsed.geographyType === 'national',
            };
            // Auto-detect prose-only entries: both variable and operator are empty.
            // Switch them to free-text mode using the notes field as the statement text.
            if (isPilotStatementProseOnly(base)) {
                return {
                    ...base,
                    isFreeText: true,
                    freeTextStatement: base.notes || '',
                };
            }
            return base;
        });
}
