import type {
    ForecastSource,
    Option,
    PilotExample,
    TriggerBuilderDraft,
    TriggerConnector,
    TriggerDraft,
} from './types';

const supportedConnectors = new Set<TriggerConnector>(['THEN', 'OR', 'AND']);

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

export function createBlankTrigger(): TriggerDraft {
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
        geographyLabel: '',
        geographyConfirmed: true,
        sources: [createBlankSource()],
        connectorToNext: undefined,
    };
}

export function createBlankDraft(): TriggerBuilderDraft {
    return {
        selectedPilotId: undefined,
        selectedPilotName: undefined,
        triggers: [createBlankTrigger()],
        importedConnectorWarning: false,
        aiStatement: undefined,
    };
}

function toSupportedConnector(value: string): TriggerConnector | undefined {
    return supportedConnectors.has(value as TriggerConnector)
        ? value as TriggerConnector
        : undefined;
}

export function createPilotDraft(example: PilotExample): TriggerBuilderDraft {
    const activationStatements = example.statements.filter(
        (statement) => statement.phase === 'activation',
    );
    const importedConnectorWarning = activationStatements.some((statement, index) => (
        index < activationStatements.length - 1
        && !toSupportedConnector(statement.withinConnector || statement.crossConnector)
    ));
    const triggers = activationStatements.map((statement, index): TriggerDraft => {
        const geographyType = statement.geographyType || 'national';

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
            geographyLabel: statement.geographyLabel,
            geographyConfirmed: geographyType === 'national',
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
        triggers: triggers.length > 0 ? triggers : [createBlankTrigger()],
        importedConnectorWarning,
        aiStatement: undefined,
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
