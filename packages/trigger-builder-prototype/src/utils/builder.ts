import type { PrototypeOption, PilotExample } from '../data/types';
import type {
    MetadataState,
    StatementDraftState,
    ContextDraft,
    WorkspaceReadiness,
    ExportBundle,
    ReviewOutput,
    AiReviewApproval,
    OriginalStatementsPreview,
    DeterministicDraft,
} from '../types/app';

const CONNECTOR_SENTINELS = new Set(['custom-logic', 'custom-transition']);

const phaseOptions: PrototypeOption[] = [
    { key: 'pre_activation', label: 'Pre-activation' },
    { key: 'activation', label: 'Activation' },
    { key: 'stop', label: 'Stop mechanism' },
];

const originalStatementPhaseMap = [
    { phase: 'pre_activation', key: 'preActivation' },
    { phase: 'activation', key: 'activation' },
    { phase: 'stop', key: 'stop' },
] as const;

const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
});

export function formatTokenLabel(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
}

export function formatHazardSummary(hazardTypes: string[]): string {
    if (hazardTypes.length === 0) {
        return 'Hazard';
    }

    if (hazardTypes.length <= 2) {
        return hazardTypes.join(' / ');
    }

    return `${hazardTypes[0]} + ${hazardTypes.length - 1} more`;
}

export function formatSavedTime(value: string | undefined): string {
    if (!value) {
        return 'Not yet saved';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return 'Saved locally';
    }

    return `Saved at ${timeFormatter.format(parsed)}`;
}

function toFileSafeSegment(value: string): string {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'trigger-builder-prototype';
}

export function downloadTextBlob(
    fileName: string,
    content: string,
    mimeType: string,
): void {
    if (typeof window === 'undefined') {
        return;
    }

    const blob = new Blob([content], { type: mimeType });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();

    window.URL.revokeObjectURL(objectUrl);
}

export function buildBlankMetadataSeed(hazardOptions: PrototypeOption[]): MetadataState {
    return {
        countryOrOperationName: '',
        operationTitle: '',
        hazardTypes: hazardOptions[0]?.key ? [hazardOptions[0].key] : ['Flood'],
        eapName: 'Trigger Model Working Draft',
        eapVariant: 'Draft workspace',
        versionLabel: 'Prototype v1',
        displayTitleOverrideEnabled: false,
        displayTitleOverride: '',
        interPhasePreToAct: 'PRECEDES',
        interPhaseActToStop: 'ENABLES',
    };
}

export function buildMetadataSeed(
    example: PilotExample | undefined,
    hazardOptions: PrototypeOption[],
): MetadataState {
    const safeName = example?.document_name ?? 'Prototype EAP';
    const [countryOrOperationName = 'Operation', ...remainderParts] = safeName.split(' - ');
    const matchingHazards = hazardOptions
        .filter((option) => safeName.includes(option.label))
        .map((option) => option.key);
    const remainder = remainderParts.join(' - ') || 'Trigger Model Prototype';

    return {
        countryOrOperationName,
        operationTitle: '',
        hazardTypes: matchingHazards.length > 0
            ? matchingHazards
            : (hazardOptions[0]?.key ? [hazardOptions[0].key] : ['Flood']),
        eapName: remainder,
        eapVariant: example?.activation_type
            ? formatTokenLabel(example.activation_type)
            : 'Single screen',
        versionLabel: 'Prototype v1',
        displayTitleOverrideEnabled: false,
        displayTitleOverride: '',
        interPhasePreToAct: example?.inter_phase_connector ?? 'PRECEDES',
        interPhaseActToStop: 'ENABLES',
    };
}

function buildStatementDraftSeed(
    primaryVariables: PrototypeOption[],
    subcategoriesByVariable: Record<string, PrototypeOption[]>,
    unitsByVariable: Record<string, PrototypeOption[]>,
    operatorsByVariable: Record<string, PrototypeOption[]>,
    timeframeUnits: PrototypeOption[],
    geographyTypes: PrototypeOption[],
): StatementDraftState {
    const canonicalVariable = primaryVariables[0]?.key ?? 'Precipitation';
    const subcategory = subcategoriesByVariable[canonicalVariable]?.[0]?.key ?? '';
    const operator = operatorsByVariable[canonicalVariable]?.[0]?.key ?? '>=';
    const thresholdUnit = unitsByVariable[canonicalVariable]?.[0]?.key ?? '';

    return {
        id: 'seed-draft',
        phase: 'activation',
        canonicalVariable,
        subcategory,
        operator,
        thresholdValue: '',
        thresholdUnit,
        probabilityValue: undefined,
        leadTimeValue: undefined,
        timeframeUnit: timeframeUnits[0]?.key ?? 'days',
        geographyType: geographyTypes[0]?.key ?? 'national',
        geographyLabel: '',
        geographyConfirmed: true,
        notes: '',
    };
}

export function buildDefaultStatementSeed(
    id: string,
    primaryVariables: PrototypeOption[],
    subcategoriesByVariable: Record<string, PrototypeOption[]>,
    unitsByVariable: Record<string, PrototypeOption[]>,
    operatorsByVariable: Record<string, PrototypeOption[]>,
    timeframeUnits: PrototypeOption[],
    geographyTypes: PrototypeOption[],
): StatementDraftState {
    const seed = buildStatementDraftSeed(
        primaryVariables,
        subcategoriesByVariable,
        unitsByVariable,
        operatorsByVariable,
        timeframeUnits,
        geographyTypes,
    );
    return { ...seed, id };
}

export function buildTitle(metadata: MetadataState): string {
    if (metadata.displayTitleOverrideEnabled && metadata.displayTitleOverride.trim().length > 0) {
        return metadata.displayTitleOverride.trim();
    }

    return [
        `${metadata.operationTitle || metadata.countryName || metadata.countryOrOperationName || 'Operation'}:`,
        formatHazardSummary(metadata.hazardTypes),
        '-',
        metadata.eapVariant || 'Variant',
        '-',
        metadata.versionLabel || 'Draft',
    ].join(' ');
}

export function buildStructuralPreview(
    metadata: MetadataState,
    statementsInput: StatementDraftState[] | StatementDraftState,
): string {
    const isSingle = !Array.isArray(statementsInput);
    const statements = Array.isArray(statementsInput) ? statementsInput : [statementsInput];

    if (isSingle) {
        const statementDraft = statements[0];
        if (!statementDraft) {
            return '';
        }
        if (statementDraft.isFreeText) {
            const phaseLabel = phaseOptions.find((opt) => opt.key === statementDraft.phase)?.label ?? 'Activation';
            return [
                `${metadata.operationTitle || metadata.countryName || metadata.countryOrOperationName || 'Operation'}:`,
                `During ${phaseLabel.toLowerCase()},`,
                statementDraft.freeTextStatement || '[free-text statement]',
            ].join(' ');
        }
        const varLabel = (!statementDraft.canonicalVariable || statementDraft.canonicalVariable === 'custom')
            ? '[custom variable]'
            : statementDraft.canonicalVariable.toLowerCase();
        const unitLabel = (!statementDraft.thresholdUnit || statementDraft.thresholdUnit === 'custom')
            ? '[unit]'
            : statementDraft.thresholdUnit;
        const geographySummary = statementDraft.geographyType === 'national'
            ? 'at national scope'
            : [
                'for',
                formatTokenLabel(statementDraft.geographyType),
                statementDraft.geographyLabel ? `(${statementDraft.geographyLabel})` : '',
            ].filter(Boolean).join(' ');
        const probabilitySummary = statementDraft.probabilityValue !== undefined
            ? `with ${statementDraft.probabilityValue}% probability`
            : '';
        const leadTimeSummary = statementDraft.leadTimeValue !== undefined && statementDraft.leadTimeValue !== ''
            ? `within ${statementDraft.leadTimeValue} ${statementDraft.timeframeUnit}`
            : '';
        const qualifiers = [probabilitySummary, leadTimeSummary].filter(Boolean).join(' and ');
        const trailingText = qualifiers
            ? `${qualifiers}${statementDraft.sourceAuthority ? ` [per ${statementDraft.sourceAuthority}].` : '.'}`
            : statementDraft.sourceAuthority
                ? `[per ${statementDraft.sourceAuthority}].`
                : '.';
        const phaseLabel = phaseOptions.find((option) => option.key === statementDraft.phase)?.label.toLowerCase()
            ?? 'activation';

        return [
            `${metadata.operationTitle || metadata.countryName || metadata.countryOrOperationName || 'Operation'}:`,
            `During ${phaseLabel},`,
            `monitor ${varLabel}`,
            statementDraft.subcategory ? `(${statementDraft.subcategory.toLowerCase()})` : '',
            `${statementDraft.operator} ${statementDraft.thresholdValue || '[threshold]'}`,
            unitLabel,
            geographySummary,
            trailingText,
        ].filter(Boolean).join(' ');
    }

    const phasesList = ['pre_activation', 'activation', 'stop'];
    const phaseLabels: Record<string, string> = {
        pre_activation: 'Pre-activation',
        activation: 'Activation',
        stop: 'Stop mechanism',
    };

    const phaseSections = phasesList.map((phaseKey) => {
        const phaseStatements = statements.filter((s) => s.phase === phaseKey);
        if (phaseStatements.length === 0) {
            return '';
        }

        const statementPreviews = phaseStatements.map((s, idx) => {
            let clause: string;
            if (s.isFreeText) {
                clause = s.freeTextStatement || '[free-text statement]';
            } else {
                const varLabel = (!s.canonicalVariable || s.canonicalVariable === 'custom')
                    ? '[custom variable]'
                    : s.canonicalVariable.toLowerCase();
                const unitLabel = (!s.thresholdUnit || s.thresholdUnit === 'custom')
                    ? '[unit]'
                    : s.thresholdUnit;
                const geographySummary = s.geographyType === 'national'
                    ? 'at national scope'
                    : [
                        'for',
                        formatTokenLabel(s.geographyType),
                        s.geographyLabel ? `(${s.geographyLabel})` : '',
                    ].filter(Boolean).join(' ');

                const probabilitySummary = s.probabilityValue !== undefined
                    ? `with ${s.probabilityValue}% probability`
                    : '';

                const leadTimeSummary = s.leadTimeValue !== undefined && s.leadTimeValue !== ''
                    ? `within ${s.leadTimeValue} ${s.timeframeUnit}`
                    : '';

                const qualifiers = [probabilitySummary, leadTimeSummary].filter(Boolean).join(' and ');

                clause = [
                    `monitor ${varLabel}`,
                    s.subcategory ? `(${s.subcategory.toLowerCase()})` : '',
                    s.operator,
                    s.thresholdValue || '[threshold]',
                    unitLabel,
                    geographySummary,
                    qualifiers ? `${qualifiers}` : '',
                    s.sourceAuthority ? `[per ${s.sourceAuthority}]` : '',
                ].filter(Boolean).join(' ');
            }

            let connectorPart = '';
            if (idx < phaseStatements.length - 1) {
                const conn = s.withinConnector || s.crossConnector || 'AND';
                connectorPart = ` [${conn}]`;
            }

            return `- ${clause}${connectorPart}`;
        }).join('\n');

        const phaseName = phaseLabels[phaseKey] || phaseKey;
        return `During ${phaseName.toLowerCase()}:\n${statementPreviews}`;
    });

    const [preText, actText, stopText] = phaseSections;

    const parts: string[] = [];
    if (preText) {
        parts.push(preText);
    }
    if (preText && actText) {
        parts.push(`  ➔  [${metadata.interPhasePreToAct || 'PRECEDES'}]  ➔  `);
    }
    if (actText) {
        parts.push(actText);
    }
    if (actText && stopText) {
        parts.push(`  ➔  [${metadata.interPhaseActToStop || 'ENABLES'}]  ➔  `);
    }
    if (stopText) {
        parts.push(stopText);
    }

    return [
        `${metadata.operationTitle || metadata.countryName || metadata.countryOrOperationName || 'Operation'}:`,
        parts.join('\n\n'),
    ].filter(Boolean).join('\n\n');
}

// ─── Stage 11: deterministic draft construction ──────────────────────────────

function describeOperator(op: string): string {
    if (op === '>=') return 'reaches or exceeds';
    if (op === '>') return 'exceeds';
    if (op === '<=') return 'falls to or below';
    if (op === '<') return 'falls below';
    if (op === '==') return 'equals';
    if (op === 'reduction') return 'shows a reduction to';
    return op;
}

function assembleClause(s: StatementDraftState): string {
    if (s.isFreeText) {
        return s.freeTextStatement?.trim() || '[free-text statement]';
    }

    const varPart = (!s.canonicalVariable || s.canonicalVariable === 'custom')
        ? '[custom variable]'
        : s.canonicalVariable;

    const subcatPart = s.subcategory && s.subcategory !== 'custom'
        ? `(${s.subcategory})`
        : s.subcategory === 'custom'
            ? '([custom subcategory])'
            : '';

    const opPart = describeOperator(s.operator || '>=');
    const valuePart = s.thresholdValue || '[threshold]';
    const unitPart = (!s.thresholdUnit || s.thresholdUnit === 'custom')
        ? '[unit]'
        : s.thresholdUnit;

    const thresholdClause = [varPart, subcatPart, opPart, valuePart, unitPart]
        .filter(Boolean).join(' ');

    const geoPart = s.geographyType === 'national'
        ? 'at national scope'
        : `for ${formatTokenLabel(s.geographyType)}${s.geographyLabel ? ` (${s.geographyLabel})` : ''}`;

    const leadTimePart = s.leadTimeValue !== undefined && s.leadTimeValue !== ''
        ? `within ${s.leadTimeValue} ${s.timeframeUnit}`
        : '';

    const probPart = s.probabilityValue !== undefined
        ? `with ${s.probabilityValue}% probability`
        : '';

    const sourcePart = s.sourceAuthority
        ? `as monitored by ${s.sourceAuthority}`
        : '';

    const notesPart = s.notes?.trim()
        ? `[note: ${s.notes.trim()}]`
        : '';

    return [thresholdClause, geoPart, leadTimePart, probPart, sourcePart, notesPart]
        .filter(Boolean).join(', ');
}

function joinPhaseStatements(phaseStmts: StatementDraftState[]): string {
    return phaseStmts.map((s, idx) => {
        const clause = assembleClause(s);
        if (idx < phaseStmts.length - 1) {
            const raw = (s.withinConnector && !CONNECTOR_SENTINELS.has(s.withinConnector))
                ? s.withinConnector
                : (s.crossConnector && !CONNECTOR_SENTINELS.has(s.crossConnector))
                    ? s.crossConnector
                    : 'AND';
            const display = raw === raw.toUpperCase() ? `[${raw}]` : raw;
            return `${clause} ${display}`;
        }
        return clause;
    }).join(' ');
}

export function buildDeterministicDraft(
    metadata: MetadataState,
    statementsInput: StatementDraftState[] | StatementDraftState,
): DeterministicDraft {
    const statements = Array.isArray(statementsInput) ? statementsInput : [statementsInput];

    // Sort by canonical phase order; preserve original array order within each phase
    const phaseOrder = ['pre_activation', 'activation', 'stop'];
    const sorted = [...statements].sort((a, b) => {
        const ai = phaseOrder.indexOf(a.phase);
        const bi = phaseOrder.indexOf(b.phase);
        return ai - bi;
    });

    const preActStmts = sorted.filter((s) => s.phase === 'pre_activation');
    const actStmts = sorted.filter((s) => s.phase === 'activation');
    const stopStmts = sorted.filter((s) => s.phase === 'stop');

    const preActivation = preActStmts.length > 0 ? joinPhaseStatements(preActStmts) : '';
    const activation = actStmts.length > 0 ? joinPhaseStatements(actStmts) : '';
    const stop = stopStmts.length > 0 ? joinPhaseStatements(stopStmts) : '';

    const interPreToAct = (metadata.interPhasePreToAct && !CONNECTOR_SENTINELS.has(metadata.interPhasePreToAct))
        ? metadata.interPhasePreToAct : 'PRECEDES';
    const interActToStop = (metadata.interPhaseActToStop && !CONNECTOR_SENTINELS.has(metadata.interPhaseActToStop))
        ? metadata.interPhaseActToStop : 'ENABLES';

    const combinedParts: string[] = [];
    if (preActivation) {
        combinedParts.push(`[Pre-activation] ${preActivation}`);
    }
    if (preActivation && activation) {
        combinedParts.push(`[${interPreToAct}]`);
    }
    if (activation) {
        combinedParts.push(`[Activation] ${activation}`);
    }
    if (activation && stop) {
        combinedParts.push(`[${interActToStop}]`);
    }
    if (stop) {
        combinedParts.push(`[Stop mechanism] ${stop}`);
    }

    return {
        preActivation,
        activation,
        stop,
        combined: combinedParts.join(' ') || '[No trigger conditions entered]',
    };
}

// Simulated AI polish layer — wraps the deterministic draft in humanitarian framing.
// Stage 12 replaces this with a real Gemini call using the same DeterministicDraft input.
export function applySimulatedAiPolish(
    draft: DeterministicDraft,
    metadata: MetadataState,
    reviewerGuidance: string,
    genCount: number,
): ReviewOutput {
    const country = metadata.countryName || metadata.countryOrOperationName || 'the affected country';
    const hazard = formatHazardSummary(metadata.hazardTypes);

    const interPreToAct = (metadata.interPhasePreToAct && !CONNECTOR_SENTINELS.has(metadata.interPhasePreToAct))
        ? metadata.interPhasePreToAct : 'PRECEDES';
    const interActToStop = (metadata.interPhaseActToStop && !CONNECTOR_SENTINELS.has(metadata.interPhaseActToStop))
        ? metadata.interPhaseActToStop : 'ENABLES';

    const preActivation = draft.preActivation
        ? `The ${hazard} EAP for ${country} enters pre-activation watch when ${draft.preActivation}. At this stage, the National Society should heighten monitoring and prepare community early warning communications.`
        : '';

    const activation = draft.activation
        ? `Activation of early action funding is triggered when ${draft.activation} is confirmed by authorised monitoring sources. Upon reaching this threshold, the National Society should initiate response activities and release allocated early action resources.`
        : '';

    const stop = draft.stop
        ? `Early action is stood down when ${draft.stop}. The National Society should transition to recovery coordination and document lessons learned from the activation.`
        : '';

    const combinedParts: string[] = [];
    if (preActivation) {
        combinedParts.push(preActivation);
        if (activation) {
            combinedParts.push(`Following pre-activation monitoring [${interPreToAct}],`);
        }
    }
    if (activation) {
        combinedParts.push(activation);
    }
    if (stop) {
        if (activation) {
            combinedParts.push(`[${interActToStop}]`);
        }
        combinedParts.push(stop);
    }

    const refinedNote = genCount > 1 && reviewerGuidance.trim()
        ? `\n\nRefined per guidance: "${reviewerGuidance.trim().substring(0, 120)}${reviewerGuidance.length > 120 ? '...' : ''}"`
        : '';

    return {
        preActivation,
        activation,
        stop,
        combined: (combinedParts.join(' ') || `${hazard} EAP trigger model for ${country}.`) + refinedNote,
        generatedAt: new Date().toISOString(),
        generationIndex: genCount,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

export function getWorkspaceReadiness(
    metadata: MetadataState,
    statementsInput: StatementDraftState[] | StatementDraftState,
    _requiresGeographyLabel: boolean,
): WorkspaceReadiness {
    const statements = Array.isArray(statementsInput) ? statementsInput : [statementsInput];
    const metadataFields = [
        metadata.countryId === undefined ? '' : String(metadata.countryId),
        metadata.countryIso3 ?? '',
        metadata.countryName ?? '',
        metadata.eapName,
        metadata.eapVariant,
        metadata.versionLabel,
    ];
    const metadataComplete = metadata.hazardTypes.length > 0
        && metadataFields.every((field) => field.trim().length > 0)
        && (!metadata.displayTitleOverrideEnabled || metadata.displayTitleOverride.trim().length > 0);

    const statementReady = statements.length > 0 && statements.every((s) => {
        if (s.isFreeText) {
            return s.phase.trim().length > 0 && (s.freeTextStatement ?? '').trim().length > 0;
        }
        const isLabelReq = s.geographyType !== 'national';
        const hasThresholdValue = s.thresholdValue.trim().length > 0;
        // A qualitative threshold has a descriptive thresholdValue but no operator/unit — valid.
        const isQualitative = s.operator.trim().length === 0 && hasThresholdValue;
        const thresholdClauseOk = isQualitative
            || ([s.operator, s.thresholdUnit].every((f) => f.trim().length > 0) && hasThresholdValue);
        return [s.phase, s.canonicalVariable].every((field) => field.trim().length > 0)
            && thresholdClauseOk
            && (!isLabelReq || (
                s.geographyLabel.trim().length > 0
                && s.geographyConfirmed
            ));
    });

    const reviewReady = metadataComplete && statementReady;

    return {
        metadataComplete,
        statementReady,
        reviewReady,
        metadataLabel: metadataComplete ? 'Metadata complete' : 'Metadata in progress',
        statementLabel: statementReady ? 'Threshold clauses ready' : 'Threshold clauses need values',
        reviewLabel: reviewReady ? 'Preview ready for review' : 'Live preview updating',
    };
}

export function getIncomingContextDraft(
    incomingKey: string,
    contextDrafts: Record<string, ContextDraft>,
    defaultMetadata: MetadataState,
    defaultStatementDraft: StatementDraftState,
): ContextDraft {
    const cached = contextDrafts[incomingKey];
    if (cached) {
        const statements = cached.statements ?? (cached.statementDraft ? [cached.statementDraft] : []);
        const statementDraft = cached.statementDraft ?? (statements[0] ?? defaultStatementDraft);
        return { ...cached, statements, statementDraft };
    }
    return {
        metadata: defaultMetadata,
        statements: [defaultStatementDraft],
        statementDraft: defaultStatementDraft,
        reviewOutput: null,
        lastSavedAt: undefined,
    };
}

export function buildOriginalStatementsPreview(
    metadata: MetadataState,
    originalStatements: StatementDraftState[] | null | undefined,
): OriginalStatementsPreview | undefined {
    if (!originalStatements || originalStatements.length === 0) {
        return undefined;
    }

    const preview = originalStatementPhaseMap.reduce<OriginalStatementsPreview>(
        (acc, { phase, key }) => {
            const phaseStatements = originalStatements.filter(
                (statement) => statement.phase === phase,
            );

            if (phaseStatements.length > 0) {
                acc[key] = buildStructuralPreview(metadata, phaseStatements);
            }

            return acc;
        },
        {},
    );

    return Object.values(preview).some((value) => value?.trim())
        ? preview
        : undefined;
}

export function buildExportBundle(
    metadata: MetadataState,
    statementsInput: StatementDraftState[] | StatementDraftState,
    reviewerGuidance: string,
    includeReviewerNotes: boolean,
    reviewOutput?: ReviewOutput | null,
    originalStatements?: StatementDraftState[] | null,
    reviewApproval?: AiReviewApproval,
): ExportBundle {
    const statements = Array.isArray(statementsInput) ? statementsInput : [statementsInput];
    const includeApprovedAi = Boolean(
        reviewOutput && reviewApproval?.status === 'approved',
    );
    const exportStatements = statements.map((statement) => {
        const exportableWithin = statement.withinConnector && !CONNECTOR_SENTINELS.has(statement.withinConnector)
            ? statement.withinConnector : undefined;
        const exportableCross = statement.crossConnector && !CONNECTOR_SENTINELS.has(statement.crossConnector)
            ? statement.crossConnector : undefined;

        if (statement.isFreeText) {
            return {
                id: statement.id,
                phase: statement.phase,
                isFreeText: true,
                freeTextStatement: statement.freeTextStatement ?? '',
                ...(exportableWithin ? { withinConnector: exportableWithin } : {}),
                ...(exportableCross ? { crossConnector: exportableCross } : {}),
            };
        }

        return {
            id: statement.id,
            phase: statement.phase,
            canonicalVariable: statement.canonicalVariable,
            subcategory: statement.subcategory,
            operator: statement.operator,
            thresholdValue: statement.thresholdValue,
            thresholdUnit: statement.thresholdUnit,
            ...(statement.probabilityValue !== undefined ? { probabilityValue: statement.probabilityValue } : {}),
            ...(statement.leadTimeValue !== undefined ? { leadTimeValue: statement.leadTimeValue } : {}),
            timeframeUnit: statement.timeframeUnit,
            geographyType: statement.geographyType,
            geographyLabel: statement.geographyLabel,
            ...(statement.geographyFeatureId ? { geographyFeatureId: statement.geographyFeatureId } : {}),
            ...(statement.geographyCoordinates ? { geographyCoordinates: statement.geographyCoordinates } : {}),
            ...(statement.geographySource ? { geographySource: statement.geographySource } : {}),
            geographyConfirmed: statement.geographyConfirmed,
            ...(statement.notes ? { notes: statement.notes } : {}),
            ...(exportableWithin ? { withinConnector: exportableWithin } : {}),
            ...(exportableCross ? { crossConnector: exportableCross } : {}),
            ...(statement.sourceAuthority ? { sourceAuthority: statement.sourceAuthority } : {}),
        };
    });
    const resolvedTitle = buildTitle(metadata);
    const structuralPreview = buildStructuralPreview(metadata, statements);
    const deterministicDraftPayload = buildDeterministicDraft(metadata, statements);
    const originalStatementsPreview = buildOriginalStatementsPreview(metadata, originalStatements);
    const fileBaseName = toFileSafeSegment(resolvedTitle);
    const documentContext: MetadataState = {
        ...metadata,
        interPhasePreToAct: metadata.interPhasePreToAct && !CONNECTOR_SENTINELS.has(metadata.interPhasePreToAct)
            ? metadata.interPhasePreToAct : undefined,
        interPhaseActToStop: metadata.interPhaseActToStop && !CONNECTOR_SENTINELS.has(metadata.interPhaseActToStop)
            ? metadata.interPhaseActToStop : undefined,
    };
    const structuredPayload = {
        title: resolvedTitle,
        documentContext,
        statements: exportStatements,
        deterministicPreview: structuralPreview,
        deterministicDraft: {
            preActivation: deterministicDraftPayload.preActivation,
            activation: deterministicDraftPayload.activation,
            stop: deterministicDraftPayload.stop,
            combined: deterministicDraftPayload.combined,
        },
        reviewerGuidance: includeReviewerNotes ? reviewerGuidance : undefined,
        generatedOutput: includeApprovedAi
            ? reviewOutput
            : undefined,
        aiReview: reviewOutput ? {
            generatedAt: reviewOutput.generatedAt,
            approvedAt: reviewApproval?.approvedAt,
            manuallyEdited: reviewApproval?.manuallyEdited ?? false,
            modelId: reviewApproval?.modelId ?? reviewOutput.modelId,
            promptVersion: reviewApproval?.promptVersion ?? reviewOutput.promptVersion,
            status: reviewApproval?.status ?? 'generated',
        } : undefined,
        originalStatements: originalStatementsPreview ?? undefined,
    };
    const narrativeSections = [
        resolvedTitle,
        '',
        'Structural draft',
        structuralPreview,
        '',
        'Statement phases represented',
        Array.from(new Set(statements.map((s) => formatTokenLabel(s.phase)))).join(', '),
        '',
        'Hazard summary',
        formatHazardSummary(metadata.hazardTypes),
    ];

    if (originalStatementsPreview) {
        narrativeSections.push(
            '',
            'Original pilot statements',
            '',
            ...(originalStatementsPreview.preActivation
                ? ['Pre-activation', originalStatementsPreview.preActivation, '']
                : []),
            ...(originalStatementsPreview.activation
                ? ['Activation', originalStatementsPreview.activation, '']
                : []),
            ...(originalStatementsPreview.stop
                ? ['Stop mechanism', originalStatementsPreview.stop, '']
                : []),
        );
    }

    if (reviewOutput && includeApprovedAi) {
        narrativeSections.push(
            '',
            'AI-polished trigger statements',
            '',
            ...(reviewOutput.preActivation ? ['Pre-activation', reviewOutput.preActivation, ''] : []),
            ...(reviewOutput.activation ? ['Activation', reviewOutput.activation, ''] : []),
            ...(reviewOutput.stop ? ['Stop mechanism', reviewOutput.stop, ''] : []),
            'Combined statement',
            reviewOutput.combined,
        );
    }

    if (includeReviewerNotes) {
        narrativeSections.push(
            '',
            'Reviewer guidance',
            reviewerGuidance || 'No reviewer guidance entered.',
        );
    }

    return {
        fileBaseName,
        narrativeText: narrativeSections.join('\n'),
        structuredJson: JSON.stringify(structuredPayload, null, 2),
    };
}
