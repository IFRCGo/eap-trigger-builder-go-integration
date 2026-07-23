export interface MetadataState {
    countryOrOperationName: string;
    countryId?: number;
    countryIso?: string;
    countryIso3?: string;
    countryName?: string;
    countryCentroid?: {
        longitude: number;
        latitude: number;
    };
    countryBoundingBox?: [number, number, number, number];
    operationTitle: string;
    hazardTypes: string[];
    eapName: string;
    eapVariant: string;
    versionLabel: string;
    displayTitleOverrideEnabled: boolean;
    displayTitleOverride: string;
    interPhasePreToAct?: string;
    interPhaseActToStop?: string;
}

export interface StatementDraftState {
    id: string;
    phase: string;
    canonicalVariable: string;
    subcategory: string;
    operator: string;
    thresholdValue: string;
    thresholdUnit: string;
    probabilityValue: number | undefined;
    leadTimeValue: string | number | undefined;
    timeframeUnit: string;
    geographyType: string;
    geographyLabel: string;
    geographyFeatureId?: string;
    geographyCoordinates?: {
        longitude: number;
        latitude: number;
    };
    geographySource?: GeographySource;
    geographyConfirmed: boolean;
    notes: string;
    withinConnector?: string;
    crossConnector?: string;
    sourceAuthority?: string;
    isFreeText?: boolean;
    freeTextStatement?: string;
}

export interface OriginalStatementsPreview {
    preActivation?: string;
    activation?: string;
    stop?: string;
}

export interface ReviewOutput {
    preActivation: string;
    activation: string;
    stop: string;
    combined: string;
    generatedAt: string;
    generationIndex: number;
    modelId?: string;
    promptVersion?: string;
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
    geographyCoordinates?: {
        longitude: number;
        latitude: number;
    };
    geographySource?: GeographySource;
    geographyConfirmed: boolean;
}

export type AiReviewStatus = 'generated' | 'edited' | 'approved' | 'approvalReset';

export interface AiReviewApproval {
    status: AiReviewStatus;
    approvedAt?: string;
    manuallyEdited: boolean;
    modelId: string;
    promptVersion: string;
}

export type ReviewState =
    | 'untouched'
    | 'partially_complete'
    | 'draft_ready'
    | 'saved_draft'
    | 'generating'
    | 'generated'
    | 'regenerating'
    | 'regenerated'
    | 'export_ready';

export interface ContextDraft {
    metadata: MetadataState;
    statements: StatementDraftState[];
    statementDraft?: StatementDraftState;
    reviewOutput: ReviewOutput | null;
    lastSavedAt?: string;
}

export interface PersistedDraft {
    startMode: 'pilot' | 'blank';
    selectedExampleId?: string;
    metadata: MetadataState;
    statements: StatementDraftState[];
    statementDraft?: StatementDraftState;
    reviewerGuidance: string;
    savedAt?: string;
}

export interface WorkspaceReadiness {
    metadataComplete: boolean;
    statementReady: boolean;
    reviewReady: boolean;
    metadataLabel: string;
    statementLabel: string;
    reviewLabel: string;
}

export interface ExportOptionsState {
    includeStructuredJson: boolean;
    includeNarrativeDraft: boolean;
    includeReviewerNotes: boolean;
    includeAiPolished: boolean;
}

export interface DeterministicDraft {
    preActivation: string;
    activation: string;
    stop: string;
    combined: string;
}

export interface ExportBundle {
    fileBaseName: string;
    narrativeText: string;
    structuredJson: string;
}

export interface WorkspaceNotice {
    title: string;
    description: string;
}
