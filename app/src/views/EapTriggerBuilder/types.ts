export interface Option {
    key: string;
    label: string;
}

export interface TriggerBuilderSchema {
    primaryVariables: Option[];
    hazardTypes: Option[];
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

export interface GeographyCoordinates {
    longitude: number;
    latitude: number;
}

export type GeographySource =
    | 'go_admin1'
    | 'go_admin2'
    | 'mapbox_search'
    | 'mapbox_pin'
    | 'pilot_geocoded';

export interface GeographySelection {
    geographyFeatureId?: string;
    geographyLabel: string;
    geographyCoordinates?: GeographyCoordinates;
    geographySource?: GeographySource;
    geographyConfirmed: boolean;
}

export interface DraftCountry {
    id: number;
    iso: string;
    iso3: string;
    name: string;
    centroid: GeographyCoordinates | undefined;
    boundingBox: [number, number, number, number] | undefined;
}

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
    geographyFeatureId: string | undefined;
    geographyCoordinates: GeographyCoordinates | undefined;
    geographySource: GeographySource | undefined;
    geographyConfirmed: boolean;
    sources: ForecastSource[];
    connectorToNext: TriggerConnector | undefined;
}

export interface TriggerGenerationErrors {
    canonicalVariable?: boolean;
    subcategory?: boolean;
    operator?: boolean;
    thresholdValue?: boolean;
    thresholdUnit?: boolean;
    geography?: boolean;
}

export interface TriggerBuilderDraft {
    selectedPilotId: string | undefined;
    selectedPilotName: string | undefined;
    country: DraftCountry | undefined;
    triggers: TriggerDraft[];
    importedConnectorWarning: boolean;
    aiStatement: string | undefined;
    aiGeneratedAt?: string;
}

export interface ConfirmedGeographyPayload extends GeographySelection {
    geographyType: string;
    geographyConfirmed: true;
}
