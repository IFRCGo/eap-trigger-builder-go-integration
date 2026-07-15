export interface Option {
    key: string;
    label: string;
}

export interface TriggerBuilderSchema {
    primaryVariables: Option[];
    subcategoriesByVariable: Record<string, Option[]>;
    unitsByVariable: Record<string, Option[]>;
    operatorsByVariable: Record<string, Option[]>;
    timeframeUnits: Option[];
    geographyTypes: Option[];
}

export interface PilotStatement {
    phase: string;
    canonicalVariable: string;
    subcategory: string;
    operator: string;
    thresholdValue: string;
    thresholdUnit: string;
    probabilityValue: number | undefined;
    leadTimeValue: number | undefined;
    timeframeUnit: string;
    geographyType: string;
    geographyLabel: string;
    withinConnector: string;
    crossConnector: string;
    sourceAuthority: string;
}

export interface PilotExample {
    documentId: string;
    documentName: string;
    statements: PilotStatement[];
}

export interface ReferenceData {
    schema: TriggerBuilderSchema;
    examples: PilotExample[];
}

export interface ForecastSource {
    id: string;
    name: string;
    link: string;
}

export type TriggerConnector = 'THEN' | 'OR' | 'AND';

export interface TriggerDraft {
    id: string;
    canonicalVariable: string;
    subcategory: string;
    operator: string;
    thresholdValue: string;
    thresholdUnit: string;
    probabilityValue: number | undefined;
    leadTimeValue: number | undefined;
    timeframeUnit: string;
    geographyType: string;
    geographyLabel: string;
    geographyConfirmed: boolean;
    sources: ForecastSource[];
    connectorToNext: TriggerConnector | undefined;
}

export interface TriggerBuilderDraft {
    selectedPilotId: string | undefined;
    selectedPilotName: string | undefined;
    triggers: TriggerDraft[];
    importedConnectorWarning: boolean;
    aiStatement: string | undefined;
}
