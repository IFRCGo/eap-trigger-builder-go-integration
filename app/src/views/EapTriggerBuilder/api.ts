import { triggerBuilderApi } from '#config';

import type {
    Option,
    PilotExample,
    PilotStatement,
    ReferenceData,
    TriggerBuilderDraft,
    TriggerBuilderSchema,
} from './types';

const prototypeAccessStorageKey = 'trigger-builder-prototype.access-code';
const generationTimeoutMs = 160_000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function toNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptions(value: unknown): Option[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        if (!isRecord(item)) {
            return [];
        }

        const key = toString(item.key);
        const label = toString(item.label);
        return key && label ? [{ key, label }] : [];
    });
}

function toOptionRecord(value: unknown): Record<string, Option[]> {
    if (!isRecord(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, options]) => [key, toOptions(options)]),
    );
}

function parseSchema(value: unknown): TriggerBuilderSchema {
    if (!isRecord(value) || !isRecord(value.lookups)) {
        throw new Error('Invalid Trigger Builder schema response.');
    }

    const schema = {
        primaryVariables: toOptions(value.lookups.primaryVariables),
        hazardTypes: toOptions(value.lookups.hazardTypes),
        subcategoriesByVariable: toOptionRecord(value.lookups.subcategoriesByVariable),
        unitsByVariable: toOptionRecord(value.lookups.unitsByVariable),
        operatorsByVariable: toOptionRecord(value.lookups.operatorsByVariable),
        timeframeUnits: toOptions(value.lookups.timeframeUnits),
        geographyTypes: toOptions(value.lookups.geographyTypes),
    };

    if (schema.primaryVariables.length === 0) {
        throw new Error('Trigger Builder schema contains no threshold types.');
    }

    return schema;
}

function parseStatement(value: unknown): PilotStatement | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return {
        phase: toString(value.phase),
        canonicalVariable: toString(value.canonicalVariable),
        subcategory: toString(value.subcategory),
        operator: toString(value.operator),
        thresholdValue: toString(value.thresholdValue),
        thresholdUnit: toString(value.thresholdUnit),
        probabilityValue: toNumber(value.probabilityValue),
        leadTimeValue: toNumber(value.leadTimeValue),
        timeframeUnit: toString(value.timeframeUnit),
        geographyType: toString(value.geographyType),
        geographyLabel: toString(value.geographyLabel),
        withinConnector: toString(value.withinConnector),
        crossConnector: toString(value.crossConnector),
        sourceAuthority: toString(value.sourceAuthority),
    };
}

function parseExamples(value: unknown): PilotExample[] {
    if (!isRecord(value) || !Array.isArray(value.examples)) {
        throw new Error('Invalid Trigger Builder examples response.');
    }

    return value.examples.flatMap((item) => {
        if (!isRecord(item)) {
            return [];
        }

        const documentId = typeof item.document_id === 'number'
            ? String(item.document_id)
            : toString(item.document_id);
        const documentName = toString(item.document_name);
        if (!documentId || !documentName) {
            return [];
        }

        const statements = Array.isArray(item.statements)
            ? item.statements.flatMap((statement) => parseStatement(statement) ?? [])
            : [];

        return [{ documentId, documentName, statements }];
    });
}

function getBaseUrl(): string {
    return triggerBuilderApi.endsWith('/')
        ? triggerBuilderApi
        : `${triggerBuilderApi}/`;
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(new URL(path, getBaseUrl()), { signal });

    if (!response.ok) {
        throw new Error(`Trigger Builder API returned ${response.status}.`);
    }

    return response.json() as Promise<unknown>;
}

export class PrototypeAccessError extends Error {
    constructor() {
        super('The prototype access code was rejected.');
        this.name = 'PrototypeAccessError';
    }
}

export function getPrototypeAccessCode(): string {
    try {
        return sessionStorage.getItem(prototypeAccessStorageKey)?.trim() ?? '';
    } catch {
        return '';
    }
}

export function setPrototypeAccessCode(value: string): void {
    try {
        if (value.trim()) {
            sessionStorage.setItem(prototypeAccessStorageKey, value.trim());
        } else {
            sessionStorage.removeItem(prototypeAccessStorageKey);
        }
    } catch {
        // The code is still used for the current request if session storage is unavailable.
    }
}

export function clearPrototypeAccessCode(): void {
    setPrototypeAccessCode('');
}

function buildGeneratePayload(draft: TriggerBuilderDraft, hazardTypes: string[]) {
    const countryName = draft.country?.name ?? '';
    const eapName = draft.selectedPilotName?.trim()
        || (countryName ? `${countryName} Full EAP` : 'Full EAP');

    return {
        documentContext: {
            countryOrOperationName: countryName,
            countryId: draft.country?.id,
            countryIso: draft.country?.iso,
            countryIso3: draft.country?.iso3,
            countryName,
            countryCentroid: draft.country?.centroid,
            countryBoundingBox: draft.country?.boundingBox,
            operationTitle: eapName,
            hazardTypes,
            eapName,
            eapVariant: 'Full EAP',
            versionLabel: 'Trigger Builder',
            displayTitleOverrideEnabled: false,
            displayTitleOverride: '',
            interPhasePreToAct: 'PRECEDES',
            interPhaseActToStop: 'ENABLES',
        },
        statements: draft.triggers.map((trigger) => ({
            id: trigger.id,
            phase: 'activation',
            isFreeText: false,
            freeTextStatement: '',
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
            geographyCoordinates: trigger.geographyCoordinates,
            geographySource: trigger.geographySource,
            geographyConfirmed: trigger.geographyConfirmed,
            sourceAuthority: trigger.sources
                .map((source) => source.name.trim())
                .filter(Boolean)
                .join('; '),
            notes: '',
            withinConnector: trigger.connectorToNext ?? '',
            crossConnector: '',
        })),
    };
}

async function postGeneration(
    draft: TriggerBuilderDraft,
    hazardTypes: string[],
    accessCode: string,
    signal: AbortSignal,
): Promise<unknown> {
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    if (signal.aborted) {
        requestController.abort();
    } else {
        signal.addEventListener('abort', abortRequest, { once: true });
    }
    const timeout = window.setTimeout(abortRequest, generationTimeoutMs);

    let response: Response;
    try {
        response = await fetch(new URL('api/trigger-builder/generate', getBaseUrl()), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Prototype-Access-Code': accessCode,
            },
            body: JSON.stringify(buildGeneratePayload(draft, hazardTypes)),
            signal: requestController.signal,
        });
    } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', abortRequest);
    }

    if (response.status === 401 || response.status === 403) {
        throw new PrototypeAccessError();
    }
    if (!response.ok) {
        throw new Error(`Trigger Builder API returned ${response.status}.`);
    }

    return response.json() as Promise<unknown>;
}

export async function generateTriggerStatement(
    draft: TriggerBuilderDraft,
    hazardTypes: string[],
    accessCode: string,
    signal: AbortSignal,
): Promise<string> {
    const response = await postGeneration(draft, hazardTypes, accessCode, signal);
    if (!isRecord(response) || !isRecord(response.reviewOutput)) {
        throw new Error('Invalid Trigger Builder generation response.');
    }

    const activation = toString(response.reviewOutput.activation).trim();
    const combined = toString(response.reviewOutput.combined).trim();
    const statement = activation || combined;
    if (!statement) {
        throw new Error('Trigger Builder generation returned no activation statement.');
    }

    return statement;
}

export default async function getReferenceData(signal: AbortSignal): Promise<ReferenceData> {
    const [schema, examples] = await Promise.all([
        getJson('api/trigger-builder/schema', signal),
        getJson('api/trigger-builder/examples', signal),
    ]);

    return {
        schema: parseSchema(schema),
        examples: parseExamples(examples),
    };
}
