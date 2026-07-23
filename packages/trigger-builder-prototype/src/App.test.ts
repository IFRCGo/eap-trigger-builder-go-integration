import { describe, expect, it } from 'vitest';

import {
    buildExportBundle,
    buildOriginalStatementsPreview,
    buildStructuralPreview,
    buildTitle,
    formatHazardSummary,
    getWorkspaceReadiness,
    getIncomingContextDraft,
    buildBlankMetadataSeed,
    buildMetadataSeed,
    buildDeterministicDraft,
    applySimulatedAiPolish,
} from './utils/builder';
import type {
    AiReviewApproval,
    DeterministicDraft,
    MetadataState,
    ReviewOutput,
    StatementDraftState,
} from './types/app';

const approvedAiReview: AiReviewApproval = {
    status: 'approved',
    approvedAt: '2026-06-01T00:05:00.000Z',
    manuallyEdited: false,
    modelId: 'gemini-3.5-flash',
    promptVersion: 'phase1-v1',
};

const baseMetadata: MetadataState = {
    countryOrOperationName: 'Malawi',
    countryId: 143,
    countryIso: 'MW',
    countryIso3: 'MWI',
    countryName: 'Malawi',
    operationTitle: '',
    hazardTypes: ['Flood'],
    eapName: 'Pluvial Floods',
    eapVariant: 'Multi Stage',
    versionLabel: 'Prototype v1',
    displayTitleOverrideEnabled: false,
    displayTitleOverride: '',
};

const baseStatementDraft: StatementDraftState = {
    id: 'test-seed-1',
    phase: 'activation',
    canonicalVariable: 'Agricultural Impact',
    subcategory: 'Fodder availability',
    operator: '>=',
    thresholdValue: '400',
    thresholdUnit: '% deficit',
    probabilityValue: 60,
    leadTimeValue: 5,
    timeframeUnit: 'days',
    geographyType: 'national',
    geographyLabel: '',
    geographyConfirmed: true,
    notes: '',
};

const originalPilotStatements: StatementDraftState[] = [
    {
        ...baseStatementDraft,
        id: 'orig-pre',
        phase: 'pre_activation',
        canonicalVariable: 'Forecast rainfall',
        subcategory: '5-day accumulation',
        thresholdValue: '80',
        thresholdUnit: 'mm',
        probabilityValue: undefined,
        leadTimeValue: undefined,
    },
    {
        ...baseStatementDraft,
        id: 'orig-act',
        phase: 'activation',
        canonicalVariable: 'River level',
        subcategory: 'Station gauge',
        thresholdValue: '4',
        thresholdUnit: 'm',
        probabilityValue: undefined,
        leadTimeValue: undefined,
        sourceAuthority: 'Hydro station',
    },
    {
        ...baseStatementDraft,
        id: 'orig-stop',
        phase: 'stop',
        canonicalVariable: '',
        subcategory: '',
        operator: '',
        thresholdValue: '',
        thresholdUnit: '',
        probabilityValue: undefined,
        leadTimeValue: undefined,
        isFreeText: true,
        freeTextStatement: 'Early action is stood down when water levels return to seasonal norms.',
    },
];

describe('formatHazardSummary', () => {
    it('joins one or two hazards directly for compact titles', () => {
        expect(formatHazardSummary(['Flood'])).toBe('Flood');
        expect(formatHazardSummary(['Flood', 'Drought'])).toBe('Flood / Drought');
    });
});

describe('Stage 10e - original pilot comparison', () => {
    const sampleReviewOutput: ReviewOutput = {
        preActivation: 'Pre-activation watch begins when forecast rainfall exceeds 80 mm.',
        activation: 'Activation starts when river level exceeds 4 m at the monitored station.',
        stop: 'Stand-down begins once water levels return to seasonal norms.',
        combined: 'Combined trigger statement for the pilot comparison flow.',
        generatedAt: '2026-06-01T00:00:00.000Z',
        generationIndex: 2,
    };

    it('builds phase-specific structural previews for original pilot statements', () => {
        const preview = buildOriginalStatementsPreview(baseMetadata, originalPilotStatements);

        expect(preview?.preActivation).toContain('During pre-activation');
        expect(preview?.activation).toContain('monitor river level');
        expect(preview?.stop).toContain('water levels return to seasonal norms');
    });

    it('includes originalStatements in the structured JSON when provided', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep the output tightly aligned with the pilot.',
            false,
            sampleReviewOutput,
            originalPilotStatements,
            approvedAiReview,
        );
        const parsed = JSON.parse(bundle.structuredJson) as {
            originalStatements?: {
                preActivation?: string;
                activation?: string;
                stop?: string;
            };
        };

        expect(parsed.originalStatements?.preActivation).toContain('During pre-activation');
        expect(parsed.originalStatements?.activation).toContain('monitor river level');
        expect(parsed.originalStatements?.stop).toContain('water levels return to seasonal norms');
    });

    it('adds the original pilot statements section ahead of AI-polished output in narrative export', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep the output tightly aligned with the pilot.',
            false,
            sampleReviewOutput,
            originalPilotStatements,
            approvedAiReview,
        );

        const originalIndex = bundle.narrativeText.indexOf('Original pilot statements');
        const aiIndex = bundle.narrativeText.indexOf('AI-polished trigger statements');

        expect(originalIndex).toBeGreaterThan(-1);
        expect(aiIndex).toBeGreaterThan(originalIndex);
        expect(bundle.narrativeText).toContain('Stop mechanism');
        expect(bundle.narrativeText).toContain('water levels return to seasonal norms');
    });

    it('keeps originalStatements out of export when no pilot snapshot is provided', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep the output tightly aligned with the pilot.',
            false,
            sampleReviewOutput,
        );
        const parsed = JSON.parse(bundle.structuredJson) as {
            originalStatements?: unknown;
        };

        expect(parsed.originalStatements).toBeUndefined();
        expect(bundle.narrativeText).not.toContain('Original pilot statements');
    });
});

describe('buildTitle', () => {
    it('uses metadata fields in the expected GO shell format', () => {
        expect(buildTitle(baseMetadata)).toBe(
            'Malawi: Flood - Multi Stage - Prototype v1',
        );
    });

    it('prefers a display title override when enabled', () => {
        expect(buildTitle({
            ...baseMetadata,
            displayTitleOverrideEnabled: true,
            displayTitleOverride: 'Malawi Flood Trigger Model',
        })).toBe('Malawi Flood Trigger Model');
    });

    it('falls back to generic placeholders when metadata is incomplete', () => {
        expect(buildTitle({
            countryOrOperationName: '',
            operationTitle: '',
            hazardTypes: [],
            eapName: '',
            eapVariant: '',
            versionLabel: '',
            displayTitleOverrideEnabled: false,
            displayTitleOverride: '',
        })).toBe('Operation: Hazard - Variant - Draft');
    });
});

describe('buildStructuralPreview', () => {
    it('renders optional probability and lead time details inline', () => {
        expect(buildStructuralPreview(baseMetadata, baseStatementDraft)).toContain(
            'with 60% probability and within 5 days.',
        );
    });

    it('keeps the geography summary compact for national scope', () => {
        expect(buildStructuralPreview(baseMetadata, baseStatementDraft)).toContain(
            'at national scope',
        );
    });

    it('renders multiple statements in the same phase with logic connectors', () => {
        const stmt1: StatementDraftState = {
            ...baseStatementDraft,
            id: 's1',
            phase: 'activation',
            canonicalVariable: 'Rainfall',
            subcategory: 'Cumulative',
            thresholdValue: '100',
            thresholdUnit: 'mm',
            withinConnector: 'AND',
        };
        const stmt2: StatementDraftState = {
            ...baseStatementDraft,
            id: 's2',
            phase: 'activation',
            canonicalVariable: 'River Level',
            subcategory: 'Station gauge',
            thresholdValue: '5',
            thresholdUnit: 'm',
            withinConnector: undefined,
        };

        const preview = buildStructuralPreview(baseMetadata, [stmt1, stmt2]);
        expect(preview).toContain('monitor rainfall (cumulative) >= 100 mm at national scope');
        expect(preview).toContain('[AND]');
        expect(preview).toContain('monitor river level (station gauge) >= 5 m at national scope');
    });

    it('renders inter-phase transitions in multi-statement flow', () => {
        const preStmt: StatementDraftState = {
            ...baseStatementDraft,
            id: 'pre',
            phase: 'pre_activation',
            canonicalVariable: 'SSPM',
            subcategory: 'Probability',
            thresholdValue: '50',
            thresholdUnit: '%',
        };
        const actStmt: StatementDraftState = {
            ...baseStatementDraft,
            id: 'act',
            phase: 'activation',
            canonicalVariable: 'Rainfall',
            subcategory: 'Cumulative',
            thresholdValue: '100',
            thresholdUnit: 'mm',
        };
        const stopStmt: StatementDraftState = {
            ...baseStatementDraft,
            id: 'stop',
            phase: 'stop',
            canonicalVariable: 'Rainfall',
            subcategory: 'Cumulative',
            thresholdValue: '10',
            thresholdUnit: 'mm',
        };

        const metadataWithTransitions: MetadataState = {
            ...baseMetadata,
            interPhasePreToAct: 'PRECEDES',
            interPhaseActToStop: 'ENABLES',
        };

        const preview = buildStructuralPreview(metadataWithTransitions, [preStmt, actStmt, stopStmt]);
        expect(preview).toContain('➔  [PRECEDES]  ➔');
        expect(preview).toContain('➔  [ENABLES]  ➔');
    });
});

describe('seed metadata structures', () => {
    const hazardOptions = [{ key: 'Flood', label: 'Flood' }];

    it('initializes blank metadata with default transition connectors', () => {
        const seed = buildBlankMetadataSeed(hazardOptions);
        expect(seed.interPhasePreToAct).toBe('PRECEDES');
        expect(seed.interPhaseActToStop).toBe('ENABLES');
    });

    it('initializes pilot metadata with custom or default transition connectors', () => {
        const pilotExample = {
            document_id: 'malawi-flood',
            document_name: 'Malawi - Flood - Early Action Protocol',
            inter_phase_connector: 'OPTIONAL_PRECURSOR',
            activation_type: 'single_stage',
            selection_bucket: 'standard',
            connector_method: 'simple',
            hard_case_score: 5,
            hard_case_flags: [],
            file: 'malawi_flood.json',
            trigger_count_openai: 1,
            stop_mechanism_present: true,
            pilot_order: 1,
        };
        const seed = buildMetadataSeed(pilotExample, hazardOptions);
        expect(seed.interPhasePreToAct).toBe('OPTIONAL_PRECURSOR');
        expect(seed.interPhaseActToStop).toBe('ENABLES');
    });
});

describe('buildExportBundle', () => {
    it('omits reviewer guidance from the export bundle when disabled', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep the draft concise.',
            false,
        );

        expect(bundle.fileBaseName).toBe('malawi-flood-multi-stage-prototype-v1');
        expect(bundle.narrativeText).not.toContain('Reviewer guidance');
        expect(bundle.structuredJson).not.toContain('Keep the draft concise.');
    });
});

describe('getWorkspaceReadiness', () => {
    it('marks the review state ready when required metadata and threshold fields are present', () => {
        expect(
            getWorkspaceReadiness(baseMetadata, baseStatementDraft, false),
        ).toEqual({
            metadataComplete: true,
            statementReady: true,
            reviewReady: true,
            metadataLabel: 'Metadata complete',
            statementLabel: 'Threshold clauses ready',
            reviewLabel: 'Preview ready for review',
        });
    });

    it('requires a geography label only when the selected geography type needs it', () => {
        expect(
            getWorkspaceReadiness(
                baseMetadata,
                {
                    ...baseStatementDraft,
                    geographyType: 'administrative_unit',
                    geographyLabel: '',
                },
                true,
            ).reviewReady,
        ).toBe(false);

        expect(
            getWorkspaceReadiness(
                baseMetadata,
                {
                    ...baseStatementDraft,
                    geographyType: 'regional',
                    geographyLabel: '',
                },
                true,
            ).reviewReady,
        ).toBe(false);

        expect(
            getWorkspaceReadiness(
                baseMetadata,
                {
                    ...baseStatementDraft,
                    geographyType: 'custom',
                    geographyLabel: '',
                },
                true,
            ).reviewReady,
        ).toBe(false);
    });
});

describe('getIncomingContextDraft', () => {
    it('restores cached drafts if available', () => {
        const cachedDraft = {
            metadata: { ...baseMetadata, countryOrOperationName: 'Cached Country' },
            statements: [{ ...baseStatementDraft, thresholdValue: '999' }],
            statementDraft: { ...baseStatementDraft, thresholdValue: '999' },
            reviewOutput: null,
            lastSavedAt: '2026-05-28T20:00:00.000Z',
        };
        const contextDrafts = {
            '16399': cachedDraft,
        };

        const result = getIncomingContextDraft(
            '16399',
            contextDrafts,
            baseMetadata,
            baseStatementDraft,
        );

        expect(result).toEqual(cachedDraft);
    });

    it('returns default seed drafts if no cache exists', () => {
        const result = getIncomingContextDraft(
            'unknown_key',
            {},
            baseMetadata,
            baseStatementDraft,
        );

        expect(result).toEqual({
            metadata: baseMetadata,
            statements: [baseStatementDraft],
            statementDraft: baseStatementDraft,
            reviewOutput: null,
            lastSavedAt: undefined,
        });
    });
});

describe('buildStructuralPreview — Stage 9 custom field handling', () => {
    it('shows [custom variable] placeholder when canonicalVariable is "custom"', () => {
        const preview = buildStructuralPreview(baseMetadata, {
            ...baseStatementDraft,
            canonicalVariable: 'custom',
        });
        expect(preview).toContain('[custom variable]');
        expect(preview).not.toContain('monitor custom ');
    });

    it('shows [custom variable] placeholder when canonicalVariable is empty', () => {
        const preview = buildStructuralPreview(baseMetadata, {
            ...baseStatementDraft,
            canonicalVariable: '',
        });
        expect(preview).toContain('[custom variable]');
    });

    it('shows [unit] placeholder when thresholdUnit is "custom"', () => {
        const preview = buildStructuralPreview(baseMetadata, {
            ...baseStatementDraft,
            thresholdUnit: 'custom',
        });
        expect(preview).toContain('[unit]');
        expect(preview).not.toContain('custom ');
    });

    it('includes source authority in the clause when present (single statement)', () => {
        const preview = buildStructuralPreview(baseMetadata, {
            ...baseStatementDraft,
            sourceAuthority: 'FEWS NET',
        });
        expect(preview).toContain('FEWS NET');
    });

    it('includes source authority in the clause when present (multi statement)', () => {
        const stmtWithSource: StatementDraftState = {
            ...baseStatementDraft,
            id: 'src-1',
            phase: 'activation',
            canonicalVariable: 'Rainfall',
            thresholdValue: '80',
            thresholdUnit: 'mm',
            sourceAuthority: 'CHIRPS',
        };
        const preview = buildStructuralPreview(baseMetadata, [stmtWithSource]);
        expect(preview).toContain('[per CHIRPS]');
    });

    it('passes custom operator text through verbatim in multi-statement preview', () => {
        const stmt: StatementDraftState = {
            ...baseStatementDraft,
            id: 'op-1',
            phase: 'activation',
            canonicalVariable: 'River discharge',
            operator: 'is above normal',
            thresholdValue: 'seasonal average',
            thresholdUnit: 'cumecs',
        };
        const preview = buildStructuralPreview(baseMetadata, [stmt]);
        expect(preview).toContain('is above normal');
        expect(preview).toContain('cumecs');
    });
});

describe('buildExportBundle — Stage 9 generated output', () => {
    const sampleReviewOutput: ReviewOutput = {
        preActivation: 'Pre-activation watch is triggered when rainfall exceeds 50mm.',
        activation: 'Activation is triggered when river level exceeds 3m.',
        stop: 'Early action is stood down when levels fall below 1m.',
        combined: 'The combined EAP trigger statement for Malawi Flood.',
        generatedAt: '2026-06-01T00:00:00.000Z',
        generationIndex: 1,
    };

    it('includes AI-polished output sections when reviewOutput is provided', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep it concise.',
            true,
            sampleReviewOutput,
            undefined,
            approvedAiReview,
        );
        expect(bundle.narrativeText).toContain('AI-polished trigger statements');
        expect(bundle.narrativeText).toContain('Activation is triggered when river level exceeds 3m.');
        expect(bundle.narrativeText).toContain('Pre-activation');
        expect(bundle.narrativeText).toContain('Combined statement');
        expect(bundle.narrativeText).toContain('The combined EAP trigger statement for Malawi Flood.');
    });

    it('includes generatedOutput in the structured JSON when reviewOutput is provided', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep it concise.',
            false,
            sampleReviewOutput,
            undefined,
            approvedAiReview,
        );
        const parsed = JSON.parse(bundle.structuredJson) as Record<string, unknown>;
        expect(parsed).toHaveProperty('generatedOutput');
        expect((parsed.generatedOutput as ReviewOutput).combined).toBe(
            'The combined EAP trigger statement for Malawi Flood.',
        );
    });

    it('omits generatedOutput from the structured JSON when no reviewOutput given', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            'Keep it concise.',
            false,
        );
        const parsed = JSON.parse(bundle.structuredJson) as Record<string, unknown>;
        expect(parsed.generatedOutput).toBeUndefined();
    });

    it('blocks unapproved AI text while keeping deterministic export available', () => {
        const bundle = buildExportBundle(
            baseMetadata,
            baseStatementDraft,
            '',
            false,
            sampleReviewOutput,
            undefined,
            {
                status: 'edited',
                manuallyEdited: true,
                modelId: 'gemini-3.5-flash',
                promptVersion: 'phase1-v1',
            },
        );
        const parsed = JSON.parse(bundle.structuredJson) as Record<string, unknown>;

        expect(parsed.generatedOutput).toBeUndefined();
        expect(parsed).toHaveProperty('deterministicDraft');
        expect(bundle.narrativeText).not.toContain('AI-polished trigger statements');
        expect(bundle.narrativeText).toContain('Structural draft');
    });
});

describe('Stage 10b — free-text mode', () => {
    const freeTextStatement: StatementDraftState = {
        ...baseStatementDraft,
        id: 'ft-1',
        phase: 'stop',
        isFreeText: true,
        freeTextStatement: 'Early action is stood down when the situation normalises.',
        canonicalVariable: '',
        operator: '',
    };

    describe('buildStructuralPreview — free-text mode', () => {
        it('renders freeTextStatement directly when isFreeText is true (single)', () => {
            const preview = buildStructuralPreview(baseMetadata, freeTextStatement);
            expect(preview).toContain('Early action is stood down when the situation normalises.');
            expect(preview).not.toContain('[custom variable]');
        });

        it('renders freeTextStatement directly in multi-statement preview', () => {
            const structured: StatementDraftState = {
                ...baseStatementDraft,
                id: 'act-1',
                phase: 'activation',
            };
            const preview = buildStructuralPreview(baseMetadata, [structured, freeTextStatement]);
            expect(preview).toContain('Early action is stood down when the situation normalises.');
            expect(preview).toContain('monitor agricultural impact');
        });

        it('falls back to [free-text statement] placeholder when freeTextStatement is empty', () => {
            const empty: StatementDraftState = { ...freeTextStatement, freeTextStatement: '' };
            const preview = buildStructuralPreview(baseMetadata, empty);
            expect(preview).toContain('[free-text statement]');
        });
    });

    describe('getWorkspaceReadiness — free-text mode', () => {
        it('accepts a free-text statement as ready when freeTextStatement is non-empty', () => {
            const readiness = getWorkspaceReadiness(baseMetadata, freeTextStatement, false);
            expect(readiness.statementReady).toBe(true);
        });

        it('marks statementReady false when isFreeText is true but freeTextStatement is empty', () => {
            const empty: StatementDraftState = { ...freeTextStatement, freeTextStatement: '' };
            const readiness = getWorkspaceReadiness(baseMetadata, empty, false);
            expect(readiness.statementReady).toBe(false);
        });
    });

    describe('buildExportBundle — free-text mode', () => {
        it('includes isFreeText and freeTextStatement in the structured JSON payload', () => {
            const bundle = buildExportBundle(baseMetadata, freeTextStatement, '', false);
            const parsed = JSON.parse(bundle.structuredJson) as {
                statements: Array<Record<string, unknown>>;
            };
            expect(parsed.statements[0]?.isFreeText).toBe(true);
            expect(parsed.statements[0]?.freeTextStatement).toBe(
                'Early action is stood down when the situation normalises.',
            );
        });

        it('omits structured clause fields from free-text export payloads', () => {
            const bundle = buildExportBundle(baseMetadata, freeTextStatement, '', false);
            const parsed = JSON.parse(bundle.structuredJson) as {
                statements: Array<Record<string, unknown>>;
            };
            const exported = parsed.statements[0];

            expect(exported?.canonicalVariable).toBeUndefined();
            expect(exported?.operator).toBeUndefined();
            expect(exported?.thresholdValue).toBeUndefined();
            expect(exported?.thresholdUnit).toBeUndefined();
            expect(exported?.geographyType).toBeUndefined();
            expect(exported?.sourceAuthority).toBeUndefined();
        });

        it('includes freeTextStatement text in the narrative preview', () => {
            const bundle = buildExportBundle(baseMetadata, freeTextStatement, '', false);
            expect(bundle.narrativeText).toContain(
                'Early action is stood down when the situation normalises.',
            );
        });
    });
});

// ─── Stage 11: deterministic draft construction ───────────────────────────────

describe('buildDeterministicDraft', () => {
    it('assembles a structured clause from required threshold fields', () => {
        const draft = buildDeterministicDraft(baseMetadata, baseStatementDraft);
        expect(draft.activation).toContain('Agricultural Impact');
        expect(draft.activation).toContain('reaches or exceeds');
        expect(draft.activation).toContain('400');
        expect(draft.activation).toContain('% deficit');
        expect(draft.activation).toContain('at national scope');
        expect(draft.preActivation).toBe('');
        expect(draft.stop).toBe('');
    });

    it('passes free-text statement through directly without structured assembly', () => {
        const freeText: StatementDraftState = {
            ...baseStatementDraft,
            phase: 'stop',
            isFreeText: true,
            freeTextStatement: 'Early action is stood down when water levels return to norms.',
            canonicalVariable: '',
            operator: '',
        };
        const draft = buildDeterministicDraft(baseMetadata, freeText);
        expect(draft.stop).toBe('Early action is stood down when water levels return to norms.');
        expect(draft.preActivation).toBe('');
        expect(draft.activation).toBe('');
    });

    it('falls back to [free-text statement] when freeTextStatement is empty', () => {
        const empty: StatementDraftState = {
            ...baseStatementDraft,
            phase: 'stop',
            isFreeText: true,
            freeTextStatement: '',
        };
        const draft = buildDeterministicDraft(baseMetadata, empty);
        expect(draft.stop).toBe('[free-text statement]');
    });

    it('joins multiple statements in the same phase with within-connector', () => {
        const stmts: StatementDraftState[] = [
            {
                ...baseStatementDraft,
                id: 's1',
                phase: 'activation',
                canonicalVariable: 'Rainfall',
                thresholdValue: '100',
                thresholdUnit: 'mm',
                withinConnector: 'AND',
            },
            {
                ...baseStatementDraft,
                id: 's2',
                phase: 'activation',
                canonicalVariable: 'River Level',
                thresholdValue: '3',
                thresholdUnit: 'm',
            },
        ];
        const draft = buildDeterministicDraft(baseMetadata, stmts);
        expect(draft.activation).toContain('[AND]');
        expect(draft.activation).toContain('Rainfall');
        expect(draft.activation).toContain('River Level');
    });

    it('preserves custom operator text verbatim', () => {
        const stmt: StatementDraftState = {
            ...baseStatementDraft,
            operator: 'is above normal',
            thresholdValue: 'seasonal average',
            thresholdUnit: 'cumecs',
        };
        const draft = buildDeterministicDraft(baseMetadata, stmt);
        expect(draft.activation).toContain('is above normal');
        expect(draft.activation).toContain('seasonal average');
        expect(draft.activation).toContain('cumecs');
    });

    it('uses [custom variable] placeholder when canonicalVariable is "custom" or empty', () => {
        const custom: StatementDraftState = { ...baseStatementDraft, canonicalVariable: 'custom' };
        const empty: StatementDraftState = { ...baseStatementDraft, canonicalVariable: '' };
        expect(buildDeterministicDraft(baseMetadata, custom).activation).toContain('[custom variable]');
        expect(buildDeterministicDraft(baseMetadata, empty).activation).toContain('[custom variable]');
    });

    it('uses [unit] placeholder when thresholdUnit is "custom" or empty', () => {
        const custom: StatementDraftState = { ...baseStatementDraft, thresholdUnit: 'custom' };
        const empty: StatementDraftState = { ...baseStatementDraft, thresholdUnit: '' };
        expect(buildDeterministicDraft(baseMetadata, custom).activation).toContain('[unit]');
        expect(buildDeterministicDraft(baseMetadata, empty).activation).toContain('[unit]');
    });

    it('includes probability, lead time, and source authority when present', () => {
        const stmt: StatementDraftState = {
            ...baseStatementDraft,
            probabilityValue: 70,
            leadTimeValue: '3',
            timeframeUnit: 'days',
            sourceAuthority: 'DCCMS',
        };
        const draft = buildDeterministicDraft(baseMetadata, stmt);
        expect(draft.activation).toContain('with 70% probability');
        expect(draft.activation).toContain('within 3 days');
        expect(draft.activation).toContain('as monitored by DCCMS');
    });

    it('includes geography label for non-national scope', () => {
        const stmt: StatementDraftState = {
            ...baseStatementDraft,
            geographyType: 'regional',
            geographyLabel: 'Southern Region',
        };
        const draft = buildDeterministicDraft(baseMetadata, stmt);
        expect(draft.activation).toContain('Regional');
        expect(draft.activation).toContain('Southern Region');
    });

    it('includes inter-phase connectors in the combined output', () => {
        const preStmt: StatementDraftState = { ...baseStatementDraft, id: 'pre', phase: 'pre_activation' };
        const actStmt: StatementDraftState = { ...baseStatementDraft, id: 'act', phase: 'activation' };
        const stopStmt: StatementDraftState = { ...baseStatementDraft, id: 'stp', phase: 'stop' };
        const meta: MetadataState = { ...baseMetadata, interPhasePreToAct: 'PRECEDES', interPhaseActToStop: 'ENABLES' };

        const draft = buildDeterministicDraft(meta, [preStmt, actStmt, stopStmt]);
        expect(draft.combined).toContain('[PRECEDES]');
        expect(draft.combined).toContain('[ENABLES]');
        expect(draft.combined).toContain('[Pre-activation]');
        expect(draft.combined).toContain('[Activation]');
        expect(draft.combined).toContain('[Stop mechanism]');
    });

    it('appends notes when present', () => {
        const stmt: StatementDraftState = { ...baseStatementDraft, notes: 'Use 3-day average' };
        const draft = buildDeterministicDraft(baseMetadata, stmt);
        expect(draft.activation).toContain('[note: Use 3-day average]');
    });

    it('sorts statements into canonical phase order regardless of input order', () => {
        const act: StatementDraftState = { ...baseStatementDraft, id: 'act', phase: 'activation', canonicalVariable: 'RainAct' };
        const pre: StatementDraftState = { ...baseStatementDraft, id: 'pre', phase: 'pre_activation', canonicalVariable: 'RainPre' };
        const draft = buildDeterministicDraft(baseMetadata, [act, pre]);
        expect(draft.combined.indexOf('[Pre-activation]')).toBeLessThan(draft.combined.indexOf('[Activation]'));
    });

    it('returns [No trigger conditions entered] for empty statements array', () => {
        const draft = buildDeterministicDraft(baseMetadata, []);
        expect(draft.preActivation).toBe('');
        expect(draft.activation).toBe('');
        expect(draft.stop).toBe('');
        expect(draft.combined).toBe('[No trigger conditions entered]');
    });
});

describe('applySimulatedAiPolish', () => {
    const sampleDraft: DeterministicDraft = {
        preActivation: 'Rainfall reaches or exceeds 50 mm, at national scope',
        activation: 'River Level reaches or exceeds 3 m, at national scope',
        stop: 'water levels fall to or below 1 m, at national scope',
        combined: '[Pre-activation] Rainfall... [PRECEDES] [Activation] River Level...',
    };

    it('wraps pre-activation draft in humanitarian watch framing', () => {
        const output = applySimulatedAiPolish(sampleDraft, baseMetadata, '', 1);
        expect(output.preActivation).toContain('pre-activation watch');
        expect(output.preActivation).toContain('National Society');
        expect(output.preActivation).toContain('Rainfall reaches or exceeds 50 mm');
    });

    it('wraps activation draft with funding trigger framing', () => {
        const output = applySimulatedAiPolish(sampleDraft, baseMetadata, '', 1);
        expect(output.activation).toContain('Activation of early action funding');
        expect(output.activation).toContain('River Level reaches or exceeds 3 m');
    });

    it('wraps stop draft with stand-down framing', () => {
        const output = applySimulatedAiPolish(sampleDraft, baseMetadata, '', 1);
        expect(output.stop).toContain('stood down');
        expect(output.stop).toContain('water levels fall');
    });

    it('produces empty string for missing phases', () => {
        const onlyAct: DeterministicDraft = { preActivation: '', activation: 'river level exceeds 3 m', stop: '', combined: '' };
        const output = applySimulatedAiPolish(onlyAct, baseMetadata, '', 1);
        expect(output.preActivation).toBe('');
        expect(output.stop).toBe('');
        expect(output.activation).toBeTruthy();
    });

    it('appends reviewer guidance note on second generation', () => {
        const output = applySimulatedAiPolish(sampleDraft, baseMetadata, 'Keep it brief.', 2);
        expect(output.combined).toContain('Refined per guidance');
        expect(output.combined).toContain('Keep it brief.');
    });

    it('does not append guidance note on first generation', () => {
        const output = applySimulatedAiPolish(sampleDraft, baseMetadata, 'Keep it brief.', 1);
        expect(output.combined).not.toContain('Refined per guidance');
    });

    it('sets generationIndex and generatedAt correctly', () => {
        const output = applySimulatedAiPolish(sampleDraft, baseMetadata, '', 3);
        expect(output.generationIndex).toBe(3);
        expect(new Date(output.generatedAt).getTime()).toBeGreaterThan(0);
    });
});

describe('buildExportBundle — Stage 11 deterministicDraft field', () => {
    it('includes deterministicDraft with per-phase strings in the structured JSON', () => {
        const bundle = buildExportBundle(baseMetadata, baseStatementDraft, '', false);
        const parsed = JSON.parse(bundle.structuredJson) as Record<string, unknown>;
        expect(parsed).toHaveProperty('deterministicDraft');
        const dd = parsed.deterministicDraft as Record<string, unknown>;
        expect(typeof dd.activation).toBe('string');
        expect(dd.activation as string).toContain('reaches or exceeds');
        expect(dd.activation as string).toContain('400');
    });

    it('deterministicDraft combined includes phase labels', () => {
        const bundle = buildExportBundle(baseMetadata, baseStatementDraft, '', false);
        const parsed = JSON.parse(bundle.structuredJson) as Record<string, unknown>;
        const dd = parsed.deterministicDraft as Record<string, unknown>;
        expect(dd.combined as string).toContain('[Activation]');
    });

    it('deterministicDraft is present even without reviewOutput', () => {
        const bundle = buildExportBundle(baseMetadata, baseStatementDraft, '', false);
        const parsed = JSON.parse(bundle.structuredJson) as Record<string, unknown>;
        expect(parsed.generatedOutput).toBeUndefined();
        expect(parsed.deterministicDraft).toBeDefined();
    });
});
