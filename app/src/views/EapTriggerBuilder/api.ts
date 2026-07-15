import { triggerBuilderApi } from '#config';

import type {
    Option,
    PilotExample,
    PilotStatement,
    ReferenceData,
    TriggerBuilderSchema,
} from './types';

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

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
    const baseUrl = triggerBuilderApi.endsWith('/')
        ? triggerBuilderApi
        : `${triggerBuilderApi}/`;
    const response = await fetch(new URL(path, baseUrl), { signal });

    if (!response.ok) {
        throw new Error(`Trigger Builder API returned ${response.status}.`);
    }

    return response.json() as Promise<unknown>;
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
