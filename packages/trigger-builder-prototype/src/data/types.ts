export interface PrototypeOption {
    key: string;
    label: string;
    description?: string;
}

export interface ConnectorVocabulary {
    within_statement: string[];
    cross_statement: string[];
    inter_phase: string[];
}

export interface UiSchema {
    metadata?: {
        total_documents?: number;
        total_statements?: number;
        total_thresholds?: number;
        out_of_matrix_records?: number;
    };
    dropdown_masters?: {
        primary_dropdown_top10?: string[];
        secondary_subcategory_dropdown?: Record<string, string[]>;
        canonical_to_units?: Record<string, string[]>;
        canonical_to_operators?: Record<string, string[]>;
        hazard_types?: string[];
        timeframe_units?: string[];
    };
    geographic_scope_contract?: {
        enum_values?: string[];
        label_required_for?: string[];
        default?: string;
        ui_note?: string;
    };
    connector_vocabulary?: ConnectorVocabulary;
}

export interface LoadedUiSchema {
    schema: UiSchema;
    diagnostics: {
        nanTokenCount: number;
        sanitized: boolean;
    };
    lookups: {
        primaryVariables: PrototypeOption[];
        hazardTypes: PrototypeOption[];
        timeframeUnits: PrototypeOption[];
        geographyTypes: PrototypeOption[];
        labelRequiredFor: string[];
        subcategoriesByVariable: Record<string, PrototypeOption[]>;
        unitsByVariable: Record<string, PrototypeOption[]>;
        operatorsByVariable: Record<string, PrototypeOption[]>;
        connectorVocabulary: ConnectorVocabulary;
    };
}

export interface PilotExample {
    document_id: string;
    document_name: string;
    file: string;
    activation_type: string;
    trigger_count_openai: number;
    hard_case_score: number;
    hard_case_flags: string[];
    stop_mechanism_present: boolean;
    inter_phase_connector: string | null;
    connector_method: string;
    selection_bucket: string;
    pilot_order: number;
}

export interface PilotExamplesFile {
    generated_at: string;
    selected: PilotExample[];
}
