import { getGeoJsonBounds } from '#utils/geo';

import type {
    ConfirmedGeographyPayload,
    DraftCountry,
    ForecastSource,
    GeographyCoordinates,
    Option,
    PilotExample,
    TriggerBuilderDraft,
    TriggerConnector,
    TriggerDraft,
} from './types';

const supportedConnectors = new Set<TriggerConnector>(['THEN', 'OR', 'AND']);

const operatorLabels: Record<string, string> = {
    '>=': 'greater than or equal to',
    '>': 'greater than',
    '<=': 'less than or equal to',
    '<': 'less than',
    '==': 'equal to',
    reduction: 'reduced to',
};

function createId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
}

export function createBlankSource(): ForecastSource {
    return {
        id: createId('source'),
        name: '',
        link: '',
    };
}

function getNationalGeography(country: DraftCountry | undefined) {
    return {
        geographyLabel: country?.name ?? '',
        geographyFeatureId: country ? `country:${country.id}` : undefined,
        geographyCoordinates: country?.centroid,
        geographySource: undefined,
        geographyConfirmed: Boolean(country),
    };
}

export function createBlankTrigger(country?: DraftCountry): TriggerDraft {
    return {
        id: createId('trigger'),
        canonicalVariable: '',
        subcategory: '',
        operator: '',
        thresholdValue: '',
        thresholdUnit: '',
        probabilityValue: undefined,
        leadTimeValue: undefined,
        timeframeUnit: '',
        geographyType: 'national',
        ...getNationalGeography(country),
        sources: [createBlankSource()],
        connectorToNext: undefined,
    };
}

export function createBlankDraft(country?: DraftCountry): TriggerBuilderDraft {
    return {
        selectedPilotId: undefined,
        selectedPilotName: undefined,
        country,
        triggers: [createBlankTrigger(country)],
        importedConnectorWarning: false,
        aiStatement: undefined,
    };
}

function toSupportedConnector(value: string): TriggerConnector | undefined {
    return supportedConnectors.has(value as TriggerConnector)
        ? value as TriggerConnector
        : undefined;
}

export function createPilotDraft(
    example: PilotExample,
    country?: DraftCountry,
): TriggerBuilderDraft {
    const activationStatements = example.statements.filter(
        (statement) => statement.phase === 'activation',
    );
    const importedConnectorWarning = activationStatements.some((statement, index) => (
        index < activationStatements.length - 1
        && !toSupportedConnector(statement.withinConnector || statement.crossConnector)
    ));
    const triggers = activationStatements.map((statement, index): TriggerDraft => {
        const geographyType = statement.geographyType || 'national';

        const nationalGeography = geographyType === 'national'
            ? getNationalGeography(country)
            : undefined;

        return {
            id: createId('trigger'),
            canonicalVariable: statement.canonicalVariable,
            subcategory: statement.subcategory,
            operator: statement.operator,
            thresholdValue: statement.thresholdValue,
            thresholdUnit: statement.thresholdUnit,
            probabilityValue: statement.probabilityValue,
            leadTimeValue: statement.leadTimeValue,
            timeframeUnit: statement.timeframeUnit,
            geographyType,
            geographyLabel: nationalGeography?.geographyLabel ?? statement.geographyLabel,
            geographyFeatureId: nationalGeography?.geographyFeatureId,
            geographyCoordinates: nationalGeography?.geographyCoordinates,
            geographySource: geographyType === 'national' ? undefined : 'pilot_geocoded',
            geographyConfirmed: nationalGeography?.geographyConfirmed ?? false,
            sources: [{
                ...createBlankSource(),
                name: statement.sourceAuthority,
            }],
            connectorToNext: index < activationStatements.length - 1
                ? toSupportedConnector(statement.withinConnector || statement.crossConnector)
                : undefined,
        };
    });

    return {
        selectedPilotId: example.documentId,
        selectedPilotName: example.documentName,
        country,
        triggers: triggers.length > 0 ? triggers : [createBlankTrigger(country)],
        importedConnectorWarning,
        aiStatement: undefined,
    };
}

interface CountryCandidate {
    id: number;
    iso: string;
    iso3: string;
    name: string;
    bbox?: Record<string, unknown> | null;
    centroid?: Record<string, unknown> | null;
}

function getCentroid(
    value: Record<string, unknown> | null | undefined,
): GeographyCoordinates | undefined {
    const coordinates = value?.coordinates;
    if (
        !Array.isArray(coordinates)
        || typeof coordinates[0] !== 'number'
        || typeof coordinates[1] !== 'number'
    ) {
        return undefined;
    }

    return {
        longitude: coordinates[0],
        latitude: coordinates[1],
    };
}

function getBoundingBox(
    value: Record<string, unknown> | null | undefined,
): [number, number, number, number] | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const bounds = getGeoJsonBounds(value);
        return bounds.every(Number.isFinite) ? bounds : undefined;
    } catch {
        return undefined;
    }
}

export function toDraftCountry(country: CountryCandidate): DraftCountry {
    return {
        id: country.id,
        iso: country.iso,
        iso3: country.iso3,
        name: country.name,
        centroid: getCentroid(country.centroid),
        boundingBox: getBoundingBox(country.bbox),
    };
}

export function findPilotCountry(
    pilotName: string,
    countries: CountryCandidate[],
): DraftCountry | undefined {
    const normalizedPilotName = pilotName.trim().toLocaleLowerCase();
    if (!normalizedPilotName) {
        return undefined;
    }

    const country = countries.find(
        (candidate) => candidate.name.toLocaleLowerCase() === normalizedPilotName,
    ) ?? countries.find(
        (candidate) => normalizedPilotName.startsWith(candidate.name.toLocaleLowerCase()),
    );

    return country ? toDraftCountry(country) : undefined;
}

export function changeGeographyType(
    geographyType: string,
    country: DraftCountry | undefined,
): Pick<
    TriggerDraft,
    | 'geographyType'
    | 'geographyLabel'
    | 'geographyFeatureId'
    | 'geographyCoordinates'
    | 'geographySource'
    | 'geographyConfirmed'
> {
    if (geographyType === 'national') {
        return {
            geographyType,
            ...getNationalGeography(country),
        };
    }

    return {
        geographyType,
        geographyLabel: '',
        geographyFeatureId: undefined,
        geographyCoordinates: undefined,
        geographySource: undefined,
        geographyConfirmed: false,
    };
}

export function resetTriggerGeographyForCountry(
    trigger: TriggerDraft,
    country: DraftCountry | undefined,
): TriggerDraft {
    return {
        ...trigger,
        ...changeGeographyType(trigger.geographyType, country),
    };
}

export function getConfirmedGeographyPayload(
    trigger: TriggerDraft,
    country: DraftCountry | undefined,
): ConfirmedGeographyPayload | undefined {
    if (
        !country
        || !trigger.geographyConfirmed
        || (trigger.geographyType !== 'national'
            && (!trigger.geographyLabel || !trigger.geographyCoordinates))
    ) {
        return undefined;
    }

    return {
        geographyType: trigger.geographyType,
        geographyLabel: trigger.geographyLabel,
        geographyFeatureId: trigger.geographyFeatureId,
        geographyCoordinates: trigger.geographyCoordinates,
        geographySource: trigger.geographySource,
        geographyConfirmed: true,
    };
}

export function includeCurrentOption(options: Option[], currentValue: string): Option[] {
    if (!currentValue || options.some((option) => option.key === currentValue)) {
        return options;
    }

    return [...options, { key: currentValue, label: currentValue }];
}

export function removeTrigger(
    triggers: TriggerDraft[],
    triggerId: string,
): TriggerDraft[] {
    if (triggers.length === 1) {
        return triggers;
    }

    const nextTriggers = triggers.filter((trigger) => trigger.id !== triggerId);
    const lastTrigger = nextTriggers.at(-1);
    return nextTriggers.map((trigger) => (
        trigger === lastTrigger
            ? { ...trigger, connectorToNext: undefined }
            : trigger
    ));
}

export function removeSource(
    sources: ForecastSource[],
    sourceId: string,
): ForecastSource[] {
    return sources.length === 1
        ? sources
        : sources.filter((source) => source.id !== sourceId);
}

export function hasCompleteConnectors(triggers: TriggerDraft[]): boolean {
    return triggers.every((trigger, index) => (
        index === triggers.length - 1 || trigger.connectorToNext !== undefined
    ));
}

function describeOperator(operator: string): string {
    return operatorLabels[operator] ?? operator.replace(/[_-]+/g, ' ');
}

export function formatTriggerClause(trigger: TriggerDraft): string {
    const thresholdType = trigger.canonicalVariable.trim();
    const measure = trigger.subcategory.trim();
    const operator = trigger.operator.trim();
    const value = trigger.thresholdValue.trim();
    const unit = trigger.thresholdUnit.trim();
    const timeframe = trigger.timeframeUnit.trim();
    const probability = Number.isFinite(trigger.probabilityValue)
        ? trigger.probabilityValue
        : undefined;
    const leadTime = Number.isFinite(trigger.leadTimeValue)
        ? trigger.leadTimeValue
        : undefined;

    const subject = measure
        ? `${measure}${thresholdType ? ` (${thresholdType})` : ''}`
        : thresholdType;
    const comparison = [
        operator ? describeOperator(operator) : '',
        value,
        (operator || value) ? unit : '',
    ].filter(Boolean).join(' ');
    const condition = subject && comparison
        ? `${subject} is ${comparison}`
        : subject || comparison;

    if (!condition && probability === undefined && leadTime === undefined) {
        return '';
    }

    const geography = trigger.geographyConfirmed
        ? trigger.geographyLabel.trim()
        : '';
    let clause = `Trigger an alert${geography ? ` for ${geography}` : ''}`;

    if (condition) {
        clause += ` when ${condition}`;
    }
    if (probability !== undefined) {
        clause += `${condition ? ',' : ''} with a probability of ${probability}% or higher`;
    }
    if (leadTime !== undefined) {
        const separator = condition || probability !== undefined ? ', and' : ' with';
        clause += `${separator} a lead time of ${leadTime}${timeframe ? ` ${timeframe}` : ''}`;
    }

    return clause;
}

export function formatDeterministicStatement(triggers: TriggerDraft[]): string {
    let statement = '';
    let previousTriggerIndex: number | undefined;

    triggers.forEach((trigger, index) => {
        const clause = formatTriggerClause(trigger);
        if (!clause) {
            return;
        }

        if (!statement) {
            statement = clause;
            previousTriggerIndex = index;
            return;
        }

        const connector = previousTriggerIndex === index - 1
            ? triggers[previousTriggerIndex]?.connectorToNext
            : undefined;
        const continuedClause = clause.replace(/^Trigger/, 'trigger');

        if (connector === 'THEN') {
            statement += `. Then ${continuedClause}`;
        } else if (connector === 'OR') {
            statement += `, or ${continuedClause}`;
        } else if (connector === 'AND') {
            statement += `, and ${continuedClause}`;
        } else {
            statement += `. ${clause}`;
        }
        previousTriggerIndex = index;
    });

    return statement ? `${statement}.` : '';
}

export function getDraftFingerprint(draft: TriggerBuilderDraft): string {
    return JSON.stringify({
        selectedPilotId: draft.selectedPilotId ?? null,
        selectedPilotName: draft.selectedPilotName ?? null,
        country: draft.country ? {
            id: draft.country.id,
            iso: draft.country.iso,
            iso3: draft.country.iso3,
            name: draft.country.name,
            centroid: draft.country.centroid ?? null,
            boundingBox: draft.country.boundingBox ?? null,
        } : null,
        triggers: draft.triggers.map((trigger) => ({
            canonicalVariable: trigger.canonicalVariable,
            subcategory: trigger.subcategory,
            operator: trigger.operator,
            thresholdValue: trigger.thresholdValue,
            thresholdUnit: trigger.thresholdUnit,
            probabilityValue: trigger.probabilityValue ?? null,
            leadTimeValue: trigger.leadTimeValue ?? null,
            timeframeUnit: trigger.timeframeUnit,
            geographyType: trigger.geographyType,
            geographyLabel: trigger.geographyLabel,
            geographyFeatureId: trigger.geographyFeatureId ?? null,
            geographyCoordinates: trigger.geographyCoordinates ?? null,
            geographySource: trigger.geographySource ?? null,
            geographyConfirmed: trigger.geographyConfirmed,
            sources: trigger.sources.map((source) => ({
                name: source.name,
                link: source.link,
            })),
            connectorToNext: trigger.connectorToNext ?? null,
        })),
    });
}
