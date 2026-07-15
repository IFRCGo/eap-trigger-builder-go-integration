import {
    lazy,
    startTransition,
    Suspense,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    Button,
    Checkbox,
    Chip,
    Container,
    Description,
    DropdownMenu,
    ExpandableContainer,
    Heading,
    InfoPopup,
    InlineLayout,
    InputSection,
    ListView,
    Message,
    Modal,
    MultiSelectInput,
    NumberInput,
    PageContainer,
    PageHeader,
    ProgressBar,
    SearchSelectInput,
    SelectInput,
    Switch,
    Tab,
    TabList,
    Tabs,
    TextArea,
    TextInput,
} from '@ifrc-go/ui';

import {
    SocialFacebookIcon,
    SocialMediumIcon,
    SocialYoutubeIcon,
    SearchLineIcon,
} from '@ifrc-go/icons';

import goLogo from './go-logo-2020.svg';

import styles from './App.module.css';
import {
    loadPilotExamples,
    toPilotExampleOptions,
} from './data/loadPilotExamples';
import { loadUiSchema } from './data/loadUiSchema';
import {
    isRecord,
    toStringValue,
    toStringArray,
    parseStatement,
    parsePilotStatements,
} from './data/parsePilotStatements';
import type { PrototypeOption } from './data/types';
import type {
    MetadataState,
    StatementDraftState,
    ContextDraft,
    PersistedDraft,
    WorkspaceNotice,
    ExportOptionsState,
    ReviewOutput,
    ReviewState,
    AiReviewApproval,
    GeographySelection,
} from './types/app';
import {
    formatTokenLabel,
    formatHazardSummary,
    formatSavedTime,
    downloadTextBlob,
    buildBlankMetadataSeed,
    buildMetadataSeed,
    buildDefaultStatementSeed,
    buildTitle,
    buildStructuralPreview,
    buildOriginalStatementsPreview,
    buildExportBundle,
    buildDeterministicDraft,
    applySimulatedAiPolish,
    getWorkspaceReadiness,
} from './utils/builder';
import CountrySelector from './components/CountrySelector';
import StatusPill from './components/StatusPill';
import {
    callRegenerate,
    getApiBaseUrl,
    getPrototypeAccessCode,
    PrototypeAccessError,
    setPrototypeAccessCode,
} from './api/triggerBuilderApi';
import {
    getCountryBoundingBox,
    getCountryCentroid,
    type GoCountry,
} from './api/countries';

const GeographySelector = lazy(() => import('./components/GeographySelector'));

const numberFormatter = new Intl.NumberFormat('en-US');
const localDraftStorageKey = 'trigger-builder-prototype.stage3-draft';
const defaultReviewerGuidance = 'Keep the final trigger statement concise, humanitarian in tone, and faithful to the structured logic entered on this page.';

const phases = [
    { key: 'pre_activation', label: 'Pre-activation Phase' },
    { key: 'activation', label: 'Activation Phase' },
    { key: 'stop', label: 'Stop Mechanism Phase' },
];

const comparisonPhaseDefinitions = [
    { key: 'preActivation', label: 'Pre-activation', statementPhase: 'pre_activation' },
    { key: 'activation', label: 'Activation', statementPhase: 'activation' },
    { key: 'stop', label: 'Stop', statementPhase: 'stop' },
] as const;

type WorkflowStep =
    | 'overview'
    | 'riskAnalysis'
    | 'triggerModel'
    | 'selectionOfActions'
    | 'eapActivationProcess';

type StartMode = 'pilot' | 'blank';
type MetadataTextField =
    | 'countryOrOperationName'
    | 'operationTitle'
    | 'eapName'
    | 'eapVariant'
    | 'versionLabel'
    | 'displayTitleOverride'
    | 'interPhasePreToAct'
    | 'interPhaseActToStop';
type StatementTextField =
    | 'phase'
    | 'canonicalVariable'
    | 'subcategory'
    | 'operator'
    | 'thresholdValue'
    | 'thresholdUnit'
    | 'timeframeUnit'
    | 'geographyType'
    | 'geographyLabel'
    | 'notes'
    | 'withinConnector'
    | 'crossConnector'
    | 'sourceAuthority'
    | 'leadTimeValue'
    | 'freeTextStatement';
type StatementNumberField = 'probabilityValue';
type BlockKey = 'threshold' | 'geography' | 'source' | 'leadTime' | 'notes';
type BlockVisEntry = Partial<Record<BlockKey, boolean>>;
type ExportOptionName = keyof ExportOptionsState;
type ComparisonPhaseKey = typeof comparisonPhaseDefinitions[number]['key'];

const defaultExportOptions: ExportOptionsState = {
    includeStructuredJson: true,
    includeNarrativeDraft: true,
    includeReviewerNotes: true,
    includeAiPolished: false,
};

const defaultAiReviewApproval: AiReviewApproval = {
    status: 'approvalReset',
    manuallyEdited: false,
    modelId: 'gemini-3.5-flash',
    promptVersion: 'phase1-v1',
};

function parsePersistedCoordinates(value: unknown): { longitude: number; latitude: number } | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const longitude = typeof value.longitude === 'number' ? value.longitude : undefined;
    const latitude = typeof value.latitude === 'number' ? value.latitude : undefined;
    if (longitude === undefined || latitude === undefined) {
        return undefined;
    }
    return { longitude, latitude };
}

function parsePersistedBoundingBox(value: unknown): [number, number, number, number] | undefined {
    if (
        !Array.isArray(value)
        || value.length !== 4
        || !value.every((item) => typeof item === 'number')
    ) {
        return undefined;
    }
    return value as [number, number, number, number];
}

function keySelector(option: PrototypeOption) {
    return option.key;
}

function labelSelector(option: PrototypeOption) {
    return option.label;
}

function descriptionSelector(option: PrototypeOption) {
    return option.description ?? '';
}

function readPersistedDraft(): PersistedDraft | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const rawDraft = window.localStorage.getItem(localDraftStorageKey);
    if (!rawDraft) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(rawDraft);

        if (!isRecord(parsed) || !isRecord(parsed.metadata)) {
            return undefined;
        }

        let statements: StatementDraftState[] = [];
        if (Array.isArray(parsed.statements)) {
            statements = (parsed.statements as unknown[])
                .filter(isRecord)
                .map((s, idx) => parseStatement(s, `persisted-${idx}`));
        } else if (isRecord(parsed.statementDraft)) {
            statements = [parseStatement(parsed.statementDraft, 'persisted-seed')];
        } else {
            return undefined;
        }

        return {
            startMode: parsed.startMode === 'blank' ? 'blank' : 'pilot',
            selectedExampleId: typeof parsed.selectedExampleId === 'string'
                ? parsed.selectedExampleId
                : undefined,
            metadata: {
                countryOrOperationName: toStringValue(parsed.metadata.countryOrOperationName),
                countryId: typeof parsed.metadata.countryId === 'number'
                    ? parsed.metadata.countryId
                    : undefined,
                countryIso: toStringValue(parsed.metadata.countryIso) || undefined,
                countryIso3: toStringValue(parsed.metadata.countryIso3) || undefined,
                countryName: toStringValue(parsed.metadata.countryName) || undefined,
                countryCentroid: parsePersistedCoordinates(parsed.metadata.countryCentroid),
                countryBoundingBox: parsePersistedBoundingBox(parsed.metadata.countryBoundingBox),
                operationTitle: toStringValue(parsed.metadata.operationTitle),
                hazardTypes: (() => {
                    const nextHazardTypes = toStringArray(parsed.metadata.hazardTypes);
                    if (nextHazardTypes.length > 0) {
                        return nextHazardTypes;
                    }

                    const legacyHazardType = toStringValue(parsed.metadata.hazardType);
                    return legacyHazardType ? [legacyHazardType] : [];
                })(),
                eapName: toStringValue(parsed.metadata.eapName),
                eapVariant: toStringValue(parsed.metadata.eapVariant),
                versionLabel: toStringValue(parsed.metadata.versionLabel),
                displayTitleOverrideEnabled: parsed.metadata.displayTitleOverrideEnabled === true,
                displayTitleOverride: toStringValue(parsed.metadata.displayTitleOverride),
                interPhasePreToAct: parsed.metadata.interPhasePreToAct ? toStringValue(parsed.metadata.interPhasePreToAct) : 'PRECEDES',
                interPhaseActToStop: parsed.metadata.interPhaseActToStop ? toStringValue(parsed.metadata.interPhaseActToStop) : 'ENABLES',
            },
            statements,
            reviewerGuidance: toStringValue(parsed.reviewerGuidance) || defaultReviewerGuidance,
            savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined,
        };
    } catch {
        return undefined;
    }
}

function clearPersistedDraft() {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem(localDraftStorageKey);
}

function buildSimulatedOutput(
    metadata: MetadataState,
    stmts: StatementDraftState[],
    reviewerGuidance: string,
    genCount: number,
): ReviewOutput {
    const draft = buildDeterministicDraft(metadata, stmts);
    return applySimulatedAiPolish(draft, metadata, reviewerGuidance, genCount);
}

function App() {
    const {
        lookups,
        schema,
    } = useMemo(() => loadUiSchema(), []);

    const [searchString, setSearchString] = useState('');
    const pilotExamples = useMemo(() => loadPilotExamples(), []);
    const exampleOptions = useMemo(
        () => toPilotExampleOptions(pilotExamples),
        [pilotExamples],
    );
    const persistedDraft = useMemo(
        () => readPersistedDraft(),
        [],
    );
    const defaultExampleId = exampleOptions[0]?.key;
    const initialSelectedExample = useMemo(
        () => {
            const persistedExampleId = persistedDraft?.selectedExampleId;
            const exampleId = persistedExampleId ?? defaultExampleId;
            return pilotExamples.find((example) => example.document_id === exampleId);
        },
        [defaultExampleId, persistedDraft, pilotExamples],
    );

    const [filteredExampleOptions, setFilteredExampleOptions] = useState(exampleOptions);
    const [startMode, setStartMode] = useState<StartMode>(persistedDraft?.startMode ?? 'blank');
    const [selectedExampleId, setSelectedExampleId] = useState<string | undefined>(
        persistedDraft?.selectedExampleId
    );
    const selectedExample = useMemo(
        () => pilotExamples.find((example) => example.document_id === selectedExampleId),
        [pilotExamples, selectedExampleId],
    );

    const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('triggerModel');
    const [metadata, setMetadata] = useState<MetadataState>(() => {
        if (persistedDraft?.metadata) {
            return persistedDraft.metadata;
        }

        const mode = persistedDraft?.startMode ?? 'blank';
        if (mode === 'blank') {
            return buildBlankMetadataSeed(lookups.hazardTypes);
        }

        return buildMetadataSeed(
            initialSelectedExample,
            lookups.hazardTypes,
        );
    });
    const [statements, setStatements] = useState<StatementDraftState[]>(() => {
        if (persistedDraft?.statements && persistedDraft.statements.length > 0) {
            return persistedDraft.statements;
        }
        if (persistedDraft?.statementDraft) {
            return [{ ...persistedDraft.statementDraft, id: 'persisted-seed' }];
        }

        const mode = persistedDraft?.startMode ?? 'blank';
        if (mode === 'pilot' && initialSelectedExample) {
            const parsed = parsePilotStatements(initialSelectedExample.document_id);
            if (parsed.length > 0) {
                return parsed;
            }
        }

        return [
            buildDefaultStatementSeed(
                'seed-1',
                lookups.primaryVariables,
                lookups.subcategoriesByVariable,
                lookups.unitsByVariable,
                lookups.operatorsByVariable,
                lookups.timeframeUnits,
                lookups.geographyTypes,
            ),
        ];
    });
    const [originalStatements, setOriginalStatements] = useState<StatementDraftState[] | null>(() => {
        const mode = persistedDraft?.startMode ?? 'blank';
        if (mode !== 'pilot' || !initialSelectedExample) {
            return null;
        }

        const parsed = parsePilotStatements(initialSelectedExample.document_id);
        return parsed.length > 0 ? parsed : null;
    });
    const [reviewerGuidance, setReviewerGuidance] = useState(
        persistedDraft?.reviewerGuidance ?? defaultReviewerGuidance,
    );
    const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(
        persistedDraft?.savedAt,
    );
    const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice>(() => {
        if (persistedDraft) {
            return {
                title: 'Draft restored',
                description: 'Your last saved draft has been loaded. Continue editing your trigger model below.',
            };
        }

        return {
            title: 'Start with a blank form',
            description: 'No example is pre-loaded. Enter the EAP metadata below and add trigger statements to build your trigger model from scratch.',
        };
    });
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportOptions, setExportOptions] = useState<ExportOptionsState>(defaultExportOptions);
    const [isGenerating, setIsGenerating] = useState(false);
    const [reviewOutput, setReviewOutput] = useState<ReviewOutput | null>(null);
    const [reviewApproval, setReviewApproval] = useState<AiReviewApproval>(defaultAiReviewApproval);
    const [generationCount, setGenerationCount] = useState(0);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [backendWarnings, setBackendWarnings] = useState<string[]>([]);
    const [showRedirectModal, setShowRedirectModal] = useState(false);
    const [blockVis, setBlockVis] = useState<Record<string, BlockVisEntry>>({});
    const [pendingFreeTextId, setPendingFreeTextId] = useState<string | null>(null);
    const [activeComparisonPhase, setActiveComparisonPhase] = useState<ComparisonPhaseKey | undefined>(undefined);
    const [activeGeographyStatementId, setActiveGeographyStatementId] = useState<string | null>(null);
    const [isAccessCodeModalOpen, setIsAccessCodeModalOpen] = useState(false);
    const [prototypeAccessCodeInput, setPrototypeAccessCodeInput] = useState('');
    const [contextDrafts, setContextDrafts] = useState<Record<string, ContextDraft>>(() => {
        if (persistedDraft) {
            const key = persistedDraft.startMode === 'blank' ? 'blank' : (persistedDraft.selectedExampleId ?? 'unknown');
            const draftStatements = persistedDraft.statements && persistedDraft.statements.length > 0
                ? persistedDraft.statements
                : (persistedDraft.statementDraft ? [{ ...persistedDraft.statementDraft, id: 'persisted-seed' }] : []);
            return {
                [key]: {
                    metadata: persistedDraft.metadata,
                    statements: draftStatements,
                    reviewOutput: null,
                    lastSavedAt: persistedDraft.savedAt,
                }
            };
        }
        return {};
    });

    const masterOperators = useMemo(() => {
        const all = new Set<string>();
        Object.values(lookups.operatorsByVariable).forEach((arr) => {
            arr.forEach((opt) => all.add(opt.key));
        });
        ['>=', '<=', '==', '>', '<', 'reduction'].forEach(op => all.add(op));
        return Array.from(all).map(op => ({ key: op, label: op }));
    }, [lookups.operatorsByVariable]);

    const masterUnits = useMemo(() => {
        const all = new Set<string>();
        Object.values(lookups.unitsByVariable).forEach((arr) => {
            arr.forEach((opt) => all.add(opt.key));
        });
        return Array.from(all).map(unit => ({ key: unit, label: unit }));
    }, [lookups.unitsByVariable]);

    const hazardSummary = useMemo(
        () => formatHazardSummary(metadata.hazardTypes),
        [metadata.hazardTypes],
    );

    const computedTitle = useMemo(
        () => buildTitle(metadata),
        [metadata],
    );
    const deferredTitle = useDeferredValue(computedTitle);
    const structuralPreview = useMemo(
        () => buildStructuralPreview(metadata, statements),
        [metadata, statements],
    );
    const originalStatementsPreview = useMemo(
        () => buildOriginalStatementsPreview(metadata, originalStatements),
        [metadata, originalStatements],
    );
    const workspaceReadiness = useMemo(
        () => getWorkspaceReadiness(metadata, statements, false),
        [metadata, statements],
    );
    const exportBundle = useMemo(
        () => buildExportBundle(
            metadata,
            statements,
            reviewerGuidance,
            exportOptions.includeReviewerNotes,
            exportOptions.includeAiPolished && reviewApproval.status === 'approved'
                ? reviewOutput
                : null,
            originalStatements,
            reviewApproval,
        ),
        [
            exportOptions.includeReviewerNotes,
            exportOptions.includeAiPolished,
            metadata,
            originalStatements,
            reviewerGuidance,
            reviewApproval,
            statements,
            reviewOutput,
        ],
    );

    const reviewState = useMemo((): ReviewState => {
        if (isGenerating && generationCount === 0) return 'generating';
        if (isGenerating) return 'regenerating';
        if (reviewOutput !== null && lastSavedAt !== undefined) return 'export_ready';
        if (reviewOutput !== null && generationCount > 1) return 'regenerated';
        if (reviewOutput !== null) return 'generated';
        if (lastSavedAt !== undefined) return 'saved_draft';
        if (workspaceReadiness.metadataComplete && workspaceReadiness.statementReady) return 'draft_ready';
        if (
            workspaceReadiness.metadataComplete
            || statements.some((s) => s.isFreeText
                ? (s.freeTextStatement?.length ?? 0) > 0
                : s.thresholdValue.length > 0)
        ) {
            return 'partially_complete';
        }
        return 'untouched';
    }, [
        isGenerating,
        generationCount,
        reviewOutput,
        lastSavedAt,
        workspaceReadiness,
        statements,
    ]);
    const comparisonPhases = useMemo(
        () => {
            if (!reviewOutput || !originalStatementsPreview) {
                return [];
            }

            return comparisonPhaseDefinitions.filter(({ key, statementPhase }) => (
                (originalStatements ?? []).some((statement) => statement.phase === statementPhase)
                && Boolean(originalStatementsPreview[key] && reviewOutput[key])
            ));
        },
        [originalStatements, originalStatementsPreview, reviewOutput],
    );
    const activeComparisonEntry = comparisonPhases.find(
        (phase) => phase.key === activeComparisonPhase,
    ) ?? comparisonPhases[0];
    const activeOriginalComparisonText = activeComparisonEntry && originalStatementsPreview
        ? originalStatementsPreview[activeComparisonEntry.key] ?? ''
        : '';
    const activeGeneratedComparisonText = activeComparisonEntry && reviewOutput
        ? reviewOutput[activeComparisonEntry.key] ?? ''
        : '';
    const showComparisonView = startMode === 'pilot'
        && (originalStatements?.length ?? 0) > 0
        && (
            reviewState === 'generated'
            || reviewState === 'regenerated'
            || reviewState === 'export_ready'
        )
        && comparisonPhases.length > 0;

    useEffect(() => {
        document.title = `${deferredTitle} | Trigger Builder Prototype`;
    }, [deferredTitle]);

    useEffect(() => {
        const firstPhase = comparisonPhases[0];
        if (!firstPhase) {
            setActiveComparisonPhase(undefined);
            return;
        }

        if (!comparisonPhases.some((phase) => phase.key === activeComparisonPhase)) {
            setActiveComparisonPhase(firstPhase.key);
        }
    }, [activeComparisonPhase, comparisonPhases]);

    const handleExampleSearch = useCallback((searchText: string | undefined) => {
        if (!searchText) {
            setFilteredExampleOptions(exampleOptions);
            return;
        }

        const lowered = searchText.toLowerCase();
        setFilteredExampleOptions(
            exampleOptions.filter((option) => (
                option.label.toLowerCase().includes(lowered)
                || option.description?.toLowerCase().includes(lowered)
            )),
        );
    }, [exampleOptions]);

    const applyPilotSeed = useCallback((exampleId: string | undefined) => {
        const nextExample = pilotExamples.find((example) => example.document_id === exampleId);

        // Build updated context cache synchronously so the incoming key read is not stale
        const outgoingKey = startMode === 'blank' ? 'blank' : (selectedExampleId ?? 'unknown');
        const updatedContextDrafts = {
            ...contextDrafts,
            [outgoingKey]: {
                metadata,
                statements,
                reviewOutput,
                lastSavedAt,
            },
        };
        setContextDrafts(updatedContextDrafts);

        // Restore or initialize incoming context
        const incomingKey = exampleId ?? 'unknown';
        const nextSeedMetadata = buildMetadataSeed(nextExample, lookups.hazardTypes);
        const nextSeedStatements = exampleId ? parsePilotStatements(exampleId) : [];
        const nextOriginalStatements = nextSeedStatements.length > 0 ? nextSeedStatements : null;
        const fallbackStatement = buildDefaultStatementSeed(
            'seed-1',
            lookups.primaryVariables,
            lookups.subcategoriesByVariable,
            lookups.unitsByVariable,
            lookups.operatorsByVariable,
            lookups.timeframeUnits,
            lookups.geographyTypes,
        );

        const cached = updatedContextDrafts[incomingKey];
        const nextDraft = cached || {
            metadata: nextSeedMetadata,
            statements: nextSeedStatements.length > 0 ? nextSeedStatements : [fallbackStatement],
            reviewOutput: null,
            lastSavedAt: undefined,
        };

        startTransition(() => {
            setStartMode('pilot');
            setSelectedExampleId(exampleId);
            setValidationError(null);

            setMetadata(nextDraft.metadata);
            setStatements(nextDraft.statements);
            setOriginalStatements(nextOriginalStatements);
            setReviewOutput(nextDraft.reviewOutput);
            setReviewApproval(nextDraft.reviewOutput ? {
                ...defaultAiReviewApproval,
                status: 'generated',
            } : defaultAiReviewApproval);
            setGenerationCount(nextDraft.reviewOutput !== null ? 1 : 0);
            setLastSavedAt(nextDraft.lastSavedAt);
            setWorkspaceNotice({
                title: updatedContextDrafts[incomingKey] ? 'Previous edits restored' : 'Pilot example loaded',
                description: updatedContextDrafts[incomingKey]
                    ? 'Your earlier edits for this pilot example have been restored. Review and update the fields below as needed.'
                    : 'The pilot example has been loaded into the form. Review and edit any field to adapt it for your EAP.',
            });
        });
    }, [
        startMode,
        selectedExampleId,
        metadata,
        statements,
        reviewOutput,
        lastSavedAt,
        contextDrafts,
        pilotExamples,
        lookups,
    ]);

    const handleExampleChange = useCallback((
        newValue: string | undefined,
        _name: string,
    ) => {
        applyPilotSeed(newValue);
    }, [applyPilotSeed]);

    const handleStartBlank = useCallback(() => {
        // Save current context to cache first
        const outgoingKey = startMode === 'blank' ? 'blank' : (selectedExampleId ?? 'unknown');
        setContextDrafts((prev) => ({
            ...prev,
            [outgoingKey]: {
                metadata,
                statements,
                reviewOutput,
                lastSavedAt,
            },
        }));

        // Restore or initialize incoming context
        const incomingKey = 'blank';
        const nextSeedMetadata = buildBlankMetadataSeed(lookups.hazardTypes);
        const nextSeedStatement = buildDefaultStatementSeed(
            'seed-1',
            lookups.primaryVariables,
            lookups.subcategoriesByVariable,
            lookups.unitsByVariable,
            lookups.operatorsByVariable,
            lookups.timeframeUnits,
            lookups.geographyTypes,
        );

        const cached = contextDrafts[incomingKey];
        const nextDraft = cached || {
            metadata: nextSeedMetadata,
            statements: [nextSeedStatement],
            reviewOutput: null,
            lastSavedAt: undefined,
        };

        startTransition(() => {
            setStartMode('blank');
            setValidationError(null);

            setMetadata(nextDraft.metadata);
            setStatements(nextDraft.statements);
            setOriginalStatements(null);
            setReviewOutput(nextDraft.reviewOutput);
            setReviewApproval(nextDraft.reviewOutput ? {
                ...defaultAiReviewApproval,
                status: 'generated',
            } : defaultAiReviewApproval);
            setGenerationCount(nextDraft.reviewOutput !== null ? 1 : 0);
            setLastSavedAt(nextDraft.lastSavedAt);
            setWorkspaceNotice({
                title: contextDrafts[incomingKey] ? 'Blank draft restored' : 'Blank form ready',
                description: contextDrafts[incomingKey]
                    ? 'Your previous edits for the blank workspace have been restored.'
                    : 'The form has been reset to defaults. Fill in the metadata and add trigger statements below.',
            });
        });
    }, [
        startMode,
        selectedExampleId,
        metadata,
        statements,
        reviewOutput,
        lastSavedAt,
        contextDrafts,
        lookups,
    ]);

    const handleRestorePilotSeed = useCallback(() => {
        applyPilotSeed(defaultExampleId);
    }, [applyPilotSeed, defaultExampleId]);

    const handleMetadataFieldChange = useCallback((
        value: string | undefined,
        field: MetadataTextField,
    ) => {
        setMetadata((prevValue) => ({
            ...prevValue,
            [field]: value ?? '',
        }));
    }, []);

    const handleCountryChange = useCallback((country: GoCountry | undefined) => {
        const countryCentroid = country ? getCountryCentroid(country) : undefined;
        const countryBoundingBox = country ? getCountryBoundingBox(country) : undefined;
        setMetadata((prevValue) => ({
            ...prevValue,
            countryOrOperationName: country?.name ?? '',
            countryId: country?.id,
            countryIso: country?.iso,
            countryIso3: country?.iso3,
            countryName: country?.name,
            countryCentroid,
            countryBoundingBox,
        }));
        setStatements((prevStatements) => prevStatements.map((statement) => {
            if (statement.geographyType === 'national') {
                return {
                    ...statement,
                    geographyFeatureId: country ? `country:${country.id}` : undefined,
                    geographyLabel: country?.name ?? '',
                    geographyCoordinates: countryCentroid,
                    geographySource: undefined,
                    geographyConfirmed: Boolean(country),
                };
            }
            return {
                ...statement,
                geographyFeatureId: undefined,
                geographyLabel: '',
                geographyCoordinates: undefined,
                geographySource: undefined,
                geographyConfirmed: false,
            };
        }));
        setActiveGeographyStatementId(null);
    }, []);

    const handleHazardTypesChange = useCallback((
        value: string[] | undefined,
        field: 'hazardTypes',
    ) => {
        setMetadata((prevValue) => ({
            ...prevValue,
            [field]: value ?? [],
        }));
    }, []);

    const handleMetadataToggleChange = useCallback((
        value: boolean,
        field: 'displayTitleOverrideEnabled',
    ) => {
        setMetadata((prevValue) => ({
            ...prevValue,
            [field]: value,
            displayTitleOverride: value ? prevValue.displayTitleOverride : '',
        }));
    }, []);

    const getBlockVisible = useCallback((
        sid: string,
        block: BlockKey,
        s: StatementDraftState,
    ): boolean => {
        const override = blockVis[sid]?.[block];
        if (override !== undefined) return override;
        switch (block) {
            case 'threshold':
                return s.phase === 'activation' || !!s.thresholdValue || !!s.operator;
            case 'geography':
                return s.geographyType !== 'national' || !!s.geographyLabel;
            case 'source':
                return !!(s.sourceAuthority);
            case 'leadTime':
                return s.leadTimeValue !== undefined && s.leadTimeValue !== '';
            case 'notes':
                return !!(s.notes);
        }
    }, [blockVis]);

    const handleBlockVisChange = useCallback((sid: string, block: BlockKey, visible: boolean) => {
        setBlockVis((prev) => ({
            ...prev,
            [sid]: { ...prev[sid], [block]: visible },
        }));
    }, []);

    const handleFreeTextToggle = useCallback((id: string, currentlyFreeText: boolean) => {
        if (currentlyFreeText) {
            setStatements((prev) => prev.map((s) => s.id === id ? { ...s, isFreeText: false } : s));
        } else {
            setPendingFreeTextId(id);
        }
    }, []);

    const handleFreeTextConfirm = useCallback(() => {
        if (pendingFreeTextId) {
            setStatements((prev) =>
                prev.map((s) => s.id === pendingFreeTextId ? { ...s, isFreeText: true } : s)
            );
        }
        setPendingFreeTextId(null);
    }, [pendingFreeTextId]);

    const handleStatementFieldChange = useCallback((
        id: string,
        value: string | undefined,
        field: StatementTextField,
    ) => {
        setStatements((prev) => prev.map((s) => {
            if (s.id !== id) {
                return s;
            }
            if (field === 'geographyType') {
                const geographyType = value ?? '';
                if (geographyType === 'national') {
                    return {
                        ...s,
                        geographyType,
                        geographyFeatureId: metadata.countryId
                            ? `country:${metadata.countryId}`
                            : undefined,
                        geographyLabel: metadata.countryName ?? '',
                        geographyCoordinates: metadata.countryCentroid,
                        geographySource: undefined,
                        geographyConfirmed: Boolean(metadata.countryId),
                    };
                }
                return {
                    ...s,
                    geographyType,
                    geographyFeatureId: undefined,
                    geographyLabel: '',
                    geographyCoordinates: undefined,
                    geographySource: undefined,
                    geographyConfirmed: false,
                };
            }
            return { ...s, [field]: value ?? '' };
        }));
    }, [
        metadata.countryCentroid,
        metadata.countryId,
        metadata.countryName,
    ]);

    const handleGeographySelectionChange = useCallback((
        statementId: string,
        selection: GeographySelection,
    ) => {
        setStatements((prev) => prev.map((statement) => (
            statement.id === statementId
                ? { ...statement, ...selection }
                : statement
        )));
    }, []);

    const handleStatementNumberFieldChange = useCallback((
        id: string,
        value: number | undefined,
        field: StatementNumberField,
    ) => {
        setStatements((prev) =>
            prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
        );
    }, []);

    const handleReviewerGuidanceChange = useCallback((value: string | undefined) => {
        setReviewerGuidance(value ?? '');
    }, []);

    const handleReviewOutputChange = useCallback((
        value: string | undefined,
        field: 'preActivation' | 'activation' | 'stop' | 'combined',
    ) => {
        setReviewOutput((previous) => previous ? {
            ...previous,
            [field]: value ?? '',
        } : previous);
        setReviewApproval((previous) => ({
            ...previous,
            status: 'edited',
            approvedAt: undefined,
            manuallyEdited: true,
        }));
        setExportOptions((previous) => ({ ...previous, includeAiPolished: false }));
    }, []);

    const handleApproveAiVersion = useCallback(() => {
        if (!reviewOutput) {
            return;
        }
        setReviewApproval((previous) => ({
            ...previous,
            status: 'approved',
            approvedAt: new Date().toISOString(),
            modelId: reviewOutput.modelId ?? previous.modelId,
            promptVersion: reviewOutput.promptVersion ?? previous.promptVersion,
        }));
        setExportOptions((previous) => ({ ...previous, includeAiPolished: true }));
    }, [reviewOutput]);

    const handleExportOptionChange = useCallback((
        value: boolean,
        name: ExportOptionName,
    ) => {
        setExportOptions((prevValue) => ({
            ...prevValue,
            [name]: value,
        }));
    }, []);

    const handleCanonicalVariableChange = useCallback((
        id: string,
        newValue: string | undefined,
        _name: string,
    ) => {
        if (!newValue) {
            return;
        }

        if (newValue === 'custom') {
            startTransition(() => {
                setStatements((prev) =>
                    prev.map((s) =>
                        s.id === id
                            ? {
                                  ...s,
                                  canonicalVariable: 'custom',
                                  subcategory: '',
                                  operator: '',
                                  thresholdUnit: '',
                              }
                            : s
                    )
                );
            });
            return;
        }

        const nextSubcategory = lookups.subcategoriesByVariable[newValue]?.[0]?.key ?? '';
        const nextOperator = lookups.operatorsByVariable[newValue]?.[0]?.key ?? '';
        const nextUnit = lookups.unitsByVariable[newValue]?.[0]?.key ?? '';

        startTransition(() => {
            setStatements((prev) =>
                prev.map((s) =>
                    s.id === id
                        ? {
                              ...s,
                              canonicalVariable: newValue,
                              subcategory: nextSubcategory,
                              operator: nextOperator,
                              thresholdUnit: nextUnit,
                          }
                        : s
                )
            );
        });
    }, [
        lookups.operatorsByVariable,
        lookups.subcategoriesByVariable,
        lookups.unitsByVariable,
    ]);

    const handleAddStatement = useCallback((phase: string) => {
        const newId = `statement-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newStatement = buildDefaultStatementSeed(
            newId,
            lookups.primaryVariables,
            lookups.subcategoriesByVariable,
            lookups.unitsByVariable,
            lookups.operatorsByVariable,
            lookups.timeframeUnits,
            lookups.geographyTypes,
        );
        newStatement.phase = phase;
        setStatements((prev) => [...prev, newStatement]);
    }, [lookups]);

    const handleRemoveStatement = useCallback((id: string) => {
        setStatements((prev) => {
            const filtered = prev.filter((s) => s.id !== id);
            if (filtered.length === 0) {
                return [
                    buildDefaultStatementSeed(
                        'seed-1',
                        lookups.primaryVariables,
                        lookups.subcategoriesByVariable,
                        lookups.unitsByVariable,
                        lookups.operatorsByVariable,
                        lookups.timeframeUnits,
                        lookups.geographyTypes,
                    )
                ];
            }
            return filtered;
        });
        setBlockVis((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, [lookups]);

    const handleMoveStatement = useCallback((id: string, direction: 'up' | 'down') => {
        setStatements((prev) => {
            const index = prev.findIndex((s) => s.id === id);
            if (index === -1) {
                return prev;
            }
            const statement = prev[index];
            if (!statement) {
                return prev;
            }
            const phase = statement.phase;
            const phaseIndices = prev
                .map((s, idx) => (s.phase === phase ? idx : -1))
                .filter((idx) => idx !== -1);

            const relativeIndex = phaseIndices.indexOf(index);
            if (direction === 'up' && relativeIndex > 0) {
                const targetIndex = phaseIndices[relativeIndex - 1];
                if (targetIndex !== undefined) {
                    const next = [...prev];
                    const temp = next[index];
                    const targetVal = next[targetIndex];
                    if (temp && targetVal) {
                        next[index] = targetVal;
                        next[targetIndex] = temp;
                    }
                    return next;
                }
            }
            if (direction === 'down' && relativeIndex < phaseIndices.length - 1) {
                const targetIndex = phaseIndices[relativeIndex + 1];
                if (targetIndex !== undefined) {
                    const next = [...prev];
                    const temp = next[index];
                    const targetVal = next[targetIndex];
                    if (temp && targetVal) {
                        next[index] = targetVal;
                        next[targetIndex] = temp;
                    }
                    return next;
                }
            }
            return prev;
        });
    }, []);

    const handleSaveDraft = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const savedAt = new Date().toISOString();
        const draftToPersist: PersistedDraft = {
            startMode,
            selectedExampleId,
            metadata,
            statements,
            reviewerGuidance,
            savedAt,
        };

        window.localStorage.setItem(
            localDraftStorageKey,
            JSON.stringify(draftToPersist),
        );
        setLastSavedAt(savedAt);
        setWorkspaceNotice({
            title: 'Draft saved',
            description: `Your trigger model has been saved. It will be restored automatically when you return to this page. Last saved: ${formatSavedTime(savedAt)}.`,
        });
    }, [
        metadata,
        reviewerGuidance,
        selectedExampleId,
        startMode,
        statements,
    ]);

    const handleCancel = useCallback(() => {
        if (
            typeof window !== 'undefined'
            && !window.confirm('Discard all current changes and reset workspace?')
        ) {
            return;
        }

        clearPersistedDraft();
        setBlockVis({});
        setPendingFreeTextId(null);
        setReviewerGuidance(defaultReviewerGuidance);
        setValidationError(null);
        setReviewOutput(null);
        setReviewApproval(defaultAiReviewApproval);
        setGenerationCount(0);
        setLastSavedAt(undefined);

        const key = startMode === 'blank' ? 'blank' : (selectedExampleId ?? 'unknown');
        setContextDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

        if (startMode === 'blank') {
            const blankSeed = buildDefaultStatementSeed(
                'seed-1',
                lookups.primaryVariables,
                lookups.subcategoriesByVariable,
                lookups.unitsByVariable,
                lookups.operatorsByVariable,
                lookups.timeframeUnits,
                lookups.geographyTypes,
            );
            setMetadata(buildBlankMetadataSeed(lookups.hazardTypes));
            setStatements([blankSeed]);
            setOriginalStatements(null);
            setWorkspaceNotice({
                title: 'Form reset',
                description: 'All fields have been reset to defaults and any unsaved changes have been discarded.',
            });
        } else {
            const nextExample = pilotExamples.find((example) => example.document_id === (selectedExampleId ?? defaultExampleId));
            const nextSeedStatements = selectedExampleId ? parsePilotStatements(selectedExampleId) : [];
            const fallbackStatement = buildDefaultStatementSeed(
                'seed-1',
                lookups.primaryVariables,
                lookups.subcategoriesByVariable,
                lookups.unitsByVariable,
                lookups.operatorsByVariable,
                lookups.timeframeUnits,
                lookups.geographyTypes,
            );
            setMetadata(buildMetadataSeed(nextExample, lookups.hazardTypes));
            setStatements(nextSeedStatements.length > 0 ? nextSeedStatements : [fallbackStatement]);
            setOriginalStatements(nextSeedStatements.length > 0 ? nextSeedStatements : null);
            setWorkspaceNotice({
                title: 'Example reloaded',
                description: 'The pilot example has been reloaded and all unsaved edits have been discarded.',
            });
        }
    }, [
        startMode,
        selectedExampleId,
        defaultExampleId,
        pilotExamples,
        lookups,
    ]);

    const handleSaveAndClose = useCallback(() => {
        handleSaveDraft();
        setShowRedirectModal(true);
    }, [handleSaveDraft]);

    const handleGenerate = useCallback(async () => {
        if (!workspaceReadiness.metadataComplete) {
            setValidationError('Metadata is incomplete. Please ensure Country, EAP name, Variant, and Version are specified.');
            return;
        }
        if (!workspaceReadiness.statementReady) {
            setValidationError('Threshold clauses are incomplete. Every non-national geography must be selected and confirmed through Mapbox.');
            return;
        }

        const apiUrl = getApiBaseUrl();
        if (apiUrl && !getPrototypeAccessCode()) {
            setIsAccessCodeModalOpen(true);
            return;
        }

        setValidationError(null);
        setBackendWarnings([]);
        setIsGenerating(true);
        setReviewApproval((previous) => ({
            ...previous,
            status: 'approvalReset',
            approvedAt: undefined,
            manuallyEdited: false,
        }));
        setExportOptions((previous) => ({ ...previous, includeAiPolished: false }));

        const nextGenCount = generationCount + 1;

        try {
            let output;
            if (apiUrl) {
                // Always use regenerate — it accepts reviewerNotes on every call,
                // including the first, so users can supply framing notes upfront.
                const result = await callRegenerate(metadata, statements, reviewerGuidance, nextGenCount);
                output = result.reviewOutput;
                if (result.warnings.length > 0) {
                    setBackendWarnings(result.warnings);
                }
            } else {
                output = await new Promise<ReviewOutput>((resolve) => {
                    setTimeout(() => {
                        resolve(buildSimulatedOutput(metadata, statements, reviewerGuidance, nextGenCount));
                    }, 1500);
                });
            }
            setReviewOutput(output);
            setReviewApproval({
                status: 'generated',
                manuallyEdited: false,
                modelId: output.modelId ?? 'gemini-3.5-flash',
                promptVersion: output.promptVersion ?? 'phase1-v1',
            });
            setGenerationCount(nextGenCount);
            document.getElementById('review-workspace')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        } catch (err) {
            if (err instanceof PrototypeAccessError) {
                setPrototypeAccessCodeInput('');
                setIsAccessCodeModalOpen(true);
            }
            setValidationError(
                `Generation failed: ${err instanceof Error ? err.message : 'Unknown error. Please try again.'}`,
            );
        } finally {
            setIsGenerating(false);
        }
    }, [
        workspaceReadiness.metadataComplete,
        workspaceReadiness.statementReady,
        generationCount,
        metadata,
        statements,
        reviewerGuidance,
    ]);

    const handleAccessCodeSubmit = useCallback(() => {
        if (!prototypeAccessCodeInput.trim()) {
            return;
        }
        setPrototypeAccessCode(prototypeAccessCodeInput);
        setPrototypeAccessCodeInput('');
        setIsAccessCodeModalOpen(false);
        void handleGenerate();
    }, [handleGenerate, prototypeAccessCodeInput]);

    const handleOpenExportModal = useCallback(() => {
        setIsExportModalOpen(true);
    }, []);

    const handleCloseExportModal = useCallback(() => {
        setIsExportModalOpen(false);
    }, []);

    const handleDownloadStructuredJson = useCallback(() => {
        downloadTextBlob(
            `${exportBundle.fileBaseName}.json`,
            exportBundle.structuredJson,
            'application/json;charset=utf-8',
        );
    }, [exportBundle.fileBaseName, exportBundle.structuredJson]);

    const handleDownloadNarrativeText = useCallback(() => {
        downloadTextBlob(
            `${exportBundle.fileBaseName}.txt`,
            exportBundle.narrativeText,
            'text/plain;charset=utf-8',
        );
    }, [exportBundle.fileBaseName, exportBundle.narrativeText]);

    const shellStatusLabel = lastSavedAt
        ? formatSavedTime(lastSavedAt)
        : 'Local draft not yet saved';
    const titlePreviewEyebrow = metadata.displayTitleOverrideEnabled
        ? 'Display title override active'
        : 'Computed title preview';
    const titlePreviewDescription = metadata.displayTitleOverrideEnabled
        ? 'A manual display title is currently steering the GO shell while the underlying metadata remains available for export and later validation.'
        : 'The page title stays live, so the workflow shell and the builder remain synchronized as metadata changes.';
    const startPointAction = startMode === 'blank'
        ? (
            <Button
                name={undefined}
                styleVariant="outline"
                onClick={handleRestorePilotSeed}
                disabled={!defaultExampleId}
            >
                Load first pilot seed
            </Button>
        )
        : (
            <Button
                name={undefined}
                styleVariant="outline"
                onClick={handleStartBlank}
            >
                Start blank form
            </Button>
        );

    return (
        <div className={styles.page}>
            {/* Global Header */}
            <nav className={styles.navbar}>
                <PageContainer
                    className={styles.top}
                    contentClassName={styles.topContent}
                >
                    <div
                        className={styles.brand}
                        onClick={() => setWorkflowStep('overview')}
                        style={{ cursor: 'pointer' }}
                    >
                        <img
                            className={styles.goIcon}
                            src={goLogo}
                            alt="IFRC GO logo"
                        />
                    </div>
                    <div className={styles.topRightActions}>
                        <DropdownMenu
                            label="English"
                            labelStyleVariant="action"
                            persistent
                            labelSpacing="sm"
                            labelColorVariant="text"
                        >
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>English</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Français</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Español</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>العربية</Button>
                        </DropdownMenu>

                        <DropdownMenu
                            label="Arun Gandhi"
                            labelStyleVariant="action"
                            persistent
                            labelSpacing="sm"
                            labelColorVariant="text"
                        >
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>My Profile</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Account Settings</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Log Out</Button>
                        </DropdownMenu>

                        <DropdownMenu
                            label="Create a Report"
                            labelStyleVariant="action"
                            labelColorVariant="primary"
                            labelSpacing="lg"
                        >
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>New Field Report</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>New 3W Activity</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>New DREF Application</Button>
                            <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>New Flash Update</Button>
                        </DropdownMenu>
                    </div>
                </PageContainer>
                <PageContainer contentClassName={styles.bottomContent}>
                    <div className={styles.navLinks}>
                            <Button
                                name={undefined}
                                styleVariant="transparent"
                                colorVariant="text"
                                onClick={() => setWorkflowStep('overview')}
                            >
                                Home
                            </Button>
                            <DropdownMenu
                                label="Countries"
                                labelStyleVariant="action"
                                labelColorVariant="text"
                                labelSpacing="sm"
                            >
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Countries Overview</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Africa Region</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Americas Region</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Asia Pacific Region</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Europe Region</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Middle East & North Africa</Button>
                            </DropdownMenu>

                            <DropdownMenu
                                label="Prepare"
                                labelStyleVariant="action"
                                labelColorVariant="text"
                                labelSpacing="sm"
                            >
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Preparedness Overview</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>EAP / Trigger Builder</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>PER (Preparedness for Effective Response)</Button>
                            </DropdownMenu>

                            <DropdownMenu
                                label="Respond"
                                labelStyleVariant="action"
                                labelColorVariant="text"
                                labelSpacing="sm"
                            >
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Operations Overview</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Appeals & DREFs</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Emergency Appeals</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Field Reports</Button>
                            </DropdownMenu>

                            <DropdownMenu
                                label="Learn"
                                labelStyleVariant="action"
                                labelColorVariant="text"
                                labelSpacing="sm"
                            >
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Info & Graphics</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Evaluations & Reviews</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>Training & Learning</Button>
                                <Button name={undefined} styleVariant="transparent" colorVariant="text" onClick={() => {}} withFullWidth>GO Wiki</Button>
                            </DropdownMenu>
                        </div>
                        <TextInput
                            name="header-search"
                            className={styles.searchContainer}
                            placeholder="Search"
                            icons={<SearchLineIcon />}
                            value={searchString}
                            onChange={(val) => setSearchString(val ?? '')}
                        />
                </PageContainer>
            </nav>

            <Tabs
                value={workflowStep}
                onChange={setWorkflowStep}
                styleVariant="step"
            >
                <PageHeader
                    className={styles.pageHeader}
                    heading={deferredTitle}
                    description="Draft the trigger model, inspect the structural clause, and keep the review workflow visible without leaving this GO step."
                    actions={(
                        <div className={styles.headerActionCluster}>
                            <Button
                                name={undefined}
                                styleVariant="outline"
                                onClick={handleOpenExportModal}
                            >
                                Export
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="outline"
                                onClick={handleCancel}
                            >
                                Cancel
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="outline"
                                onClick={handleSaveDraft}
                            >
                                Save
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="outline"
                                onClick={handleSaveAndClose}
                            >
                                Save & Close
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                disabled={isGenerating}
                                onClick={handleGenerate}
                            >
                                {isGenerating
                                    ? (generationCount > 0 ? 'Regenerating...' : 'Generating...')
                                    : reviewOutput
                                        ? 'Regenerate'
                                        : 'Generate'}
                            </Button>
                        </div>
                    )}
                    info={(
                        <div className={styles.workflowHeaderInfo}>
                            <TabList>
                                <Tab
                                    name="overview"
                                    step={1}
                                    disabled
                                >
                                    Overview
                                </Tab>
                                <Tab
                                    name="riskAnalysis"
                                    step={2}
                                    disabled
                                >
                                    Risk analysis
                                </Tab>
                                <Tab
                                    name="triggerModel"
                                    step={3}
                                >
                                    Trigger model
                                </Tab>
                                <Tab
                                    name="selectionOfActions"
                                    step={4}
                                    disabled
                                >
                                    Selection of actions
                                </Tab>
                                <Tab
                                    name="eapActivationProcess"
                                    step={5}
                                    disabled
                                >
                                    EAP activation process
                                </Tab>
                            </TabList>
                            <div className={styles.headerStatusRow}>
                                <StatusPill
                                    label={workspaceReadiness.metadataLabel}
                                    tone={workspaceReadiness.metadataComplete ? 'ready' : 'attention'}
                                />
                                <StatusPill
                                    label={workspaceReadiness.statementLabel}
                                    tone={workspaceReadiness.statementReady ? 'ready' : 'attention'}
                                />
                                <StatusPill
                                    label={shellStatusLabel}
                                    tone={lastSavedAt ? 'ready' : 'neutral'}
                                />
                            </div>
                        </div>
                    )}
                />
            </Tabs>

            <PageContainer contentClassName={styles.pageContent}>
                <div className={styles.contentStack}>
                    {validationError && (
                        <Message
                            className={styles.validationMessage}
                            title="Validation warning"
                            description={validationError}
                            actions={(
                                <Button
                                    name={undefined}
                                    styleVariant="outline"
                                    onClick={() => setValidationError(null)}
                                >
                                    Dismiss
                                </Button>
                            )}
                        />
                    )}
                    <div className={styles.formStack}>
                        <Message
                            className={styles.stageMessage}
                            title={workspaceNotice.title}
                            description={workspaceNotice.description}
                            actions={(
                                <a
                                    href="#quality-criteria"
                                    className={styles.messageLink}
                                >
                                    What makes a good trigger statement?
                                </a>
                            )}
                        />
                            <Container
                                id="start-point"
                                className={styles.sectionCard}
                                heading="Start point"
                                headerDescription="Choose a pilot example or keep the form blank. The helper text and active example context stay inside this same shell so the page behaves like a GO form, not a separate landing screen."
                                headerActions={startPointAction}
                                variant="form"
                                withBackground
                                withShadow
                                withPadding
                            >
                                <InputSection
                                    title="Pilot example library"
                                    description="Search the pilot set and seed this same form with a realistic document context whenever you need a grounded starting point."
                                    numPreferredColumns={1}
                                >
                                    <SearchSelectInput
                                        name="pilot-example"
                                        label="Example"
                                        value={selectedExampleId}
                                        options={exampleOptions}
                                        searchOptions={filteredExampleOptions}
                                        keySelector={keySelector}
                                        labelSelector={labelSelector}
                                        descriptionSelector={descriptionSelector}
                                        onChange={handleExampleChange}
                                        onSearchValueChange={handleExampleSearch}
                                        selectedOnTop
                                        placeholder="Select a pilot EAP example"
                                    />
                                </InputSection>

                                {startMode === 'pilot' && selectedExample && (
                                    <div className={styles.exampleContextCard}>
                                        <p className={styles.cardEyebrow}>
                                            Active pilot context
                                        </p>
                                        <Heading level={4}>
                                            {selectedExample.document_name}
                                        </Heading>
                                        <p className={styles.contextFilename}>
                                            Source File: <code>{selectedExample.file}</code>
                                        </p>

                                        <div className={styles.contextDetailsGrid}>
                                            <div className={styles.contextDetailItem}>
                                                <span className={styles.detailLabel}>Selection Bucket</span>
                                                <span className={styles.detailValue}>
                                                    {formatTokenLabel(selectedExample.selection_bucket)}
                                                </span>
                                            </div>
                                            <div className={styles.contextDetailItem}>
                                                <span className={styles.detailLabel}>Connector Method</span>
                                                <span className={styles.detailValue}>
                                                    {formatTokenLabel(selectedExample.connector_method)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles.progressBarWrapper}>
                                            <ProgressBar
                                                value={selectedExample.hard_case_score}
                                                totalValue={30}
                                                title={`Complexity Score: ${selectedExample.hard_case_score} / 30`}
                                                colorVariant={selectedExample.hard_case_score > 15 ? 'danger' : 'success'}
                                            />
                                        </div>

                                        {selectedExample.hard_case_flags.length > 0 && (
                                            <div className={styles.flagsSection}>
                                                <p className={styles.flagsLabel}>Complexity & Data Risks</p>
                                                <div className={styles.chipRow}>
                                                    {selectedExample.hard_case_flags.map((flag) => (
                                                        <Chip
                                                            key={flag}
                                                            name={flag}
                                                            label={formatTokenLabel(flag)}
                                                            variant="tertiary"
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Container>

                            <Container
                                id="document-context"
                                className={styles.sectionCard}
                                heading="Context"
                                headerDescription="Keep the core document context in one GO-style card. The title-driving metadata, helper copy, and title preview stay together so the form remains easy to scan."
                                variant="form"
                                withBackground
                                withShadow
                                withPadding
                            >
                                <InputSection
                                    title="Metadata"
                                    description="Fill in the document context that drives the shell title and the structured trigger statement. These fields stay compact and update live."
                                    numPreferredColumns={2}
                                >
                                    <CountrySelector
                                        legacyName={metadata.countryOrOperationName}
                                        value={metadata.countryId}
                                        onChange={handleCountryChange}
                                    />
                                    <TextInput
                                        name="operationTitle"
                                        label="Operation title (optional)"
                                        value={metadata.operationTitle}
                                        onChange={handleMetadataFieldChange}
                                        hint="A separate working title for the operation. Country selection remains structured."
                                    />
                                    <MultiSelectInput
                                        name="hazardTypes"
                                        label="Hazard types"
                                        value={metadata.hazardTypes}
                                        options={lookups.hazardTypes}
                                        keySelector={keySelector}
                                        labelSelector={labelSelector}
                                        onChange={handleHazardTypesChange}
                                    />
                                    <TextInput
                                        name="eapName"
                                        label="EAP name"
                                        value={metadata.eapName}
                                        onChange={handleMetadataFieldChange}
                                        hint="The primary hazard trigger document name."
                                    />
                                    <TextInput
                                        name="eapVariant"
                                        label="EAP variant"
                                        value={metadata.eapVariant}
                                        onChange={handleMetadataFieldChange}
                                        hint="EAP structure variant (e.g. Single Stage, Multi Stage, Dual Trigger)."
                                    />
                                    <TextInput
                                        name="versionLabel"
                                        label="Version label"
                                        value={metadata.versionLabel}
                                        onChange={handleMetadataFieldChange}
                                        hint="Version control label for tracking draft revisions."
                                    />
                                    <Switch
                                        name="displayTitleOverrideEnabled"
                                        label="Use display title override"
                                        description="Switch on a manual shell title when the generated metadata title is not publication-ready yet."
                                        value={metadata.displayTitleOverrideEnabled}
                                        onChange={handleMetadataToggleChange}
                                    />
                                    {metadata.displayTitleOverrideEnabled && (
                                        <TextInput
                                            name="displayTitleOverride"
                                            label="Display title override"
                                            value={metadata.displayTitleOverride}
                                            onChange={handleMetadataFieldChange}
                                            placeholder="Enter the exact title to display in the shell"
                                            hint="Provide an exact manual override for the shell title when publication-ready."
                                        />
                                    )}
                                </InputSection>

                                <div className={styles.titlePreviewCard}>
                                    <Description className={styles.cardEyebrow} textSize="xs">
                                        {titlePreviewEyebrow}
                                    </Description>
                                    <h3 className={styles.titlePreview}>
                                        {computedTitle}
                                    </h3>
                                    <Description className={styles.titlePreviewNote}>
                                        {titlePreviewDescription}
                                    </Description>
                                    {metadata.hazardTypes.length > 0 && (
                                        <ListView className={styles.hazardChipList} withWrap spacing="xs">
                                            {metadata.hazardTypes.map((hazardType) => (
                                                <Chip
                                                    key={hazardType}
                                                    name={hazardType}
                                                    label={hazardType}
                                                    variant="secondary"
                                                />
                                            ))}
                                        </ListView>
                                    )}
                                    <div className={styles.previewMetaList}>
                                        <InlineLayout
                                            className={styles.previewMetaRow}
                                            contentAlignment="start"
                                        >
                                            <span className={styles.previewMetaLabel}>Operation</span>
                                            <span className={styles.previewMetaValue}>
                                                {metadata.countryOrOperationName || 'Pending'}
                                            </span>
                                        </InlineLayout>
                                        <InlineLayout
                                            className={styles.previewMetaRow}
                                            contentAlignment="start"
                                        >
                                            <span className={styles.previewMetaLabel}>Hazards</span>
                                            <span className={styles.previewMetaValue}>
                                                {metadata.hazardTypes.length > 0 ? hazardSummary : 'Pending'}
                                            </span>
                                        </InlineLayout>
                                        <InlineLayout
                                            className={styles.previewMetaRow}
                                            contentAlignment="start"
                                        >
                                            <span className={styles.previewMetaLabel}>Variant</span>
                                            <span className={styles.previewMetaValue}>
                                                {metadata.eapVariant || 'Pending'}
                                            </span>
                                        </InlineLayout>
                                    </div>
                                    <div className={styles.schemaMetadataSummary}>
                                        <span className={styles.schemaMetaItem}>
                                            <strong>{numberFormatter.format(schema.metadata?.total_documents ?? 0)}</strong> documents reference matrix
                                        </span>
                                        <span className={styles.schemaMetaItem}>
                                            <strong>{numberFormatter.format(schema.metadata?.total_statements ?? 0)}</strong> statements parsed
                                        </span>
                                        <span className={styles.schemaMetaItem}>
                                            <strong>{numberFormatter.format(schema.metadata?.total_thresholds ?? 0)}</strong> valid thresholds
                                        </span>
                                    </div>
                                </div>
                            </Container>

                            <Container
                                id="statement-builder"
                                className={styles.sectionCard}
                                heading="Statement builder"
                                headerDescription="Draft early action triggers. You can add multiple statements for each phase (Pre-activation, Activation, Stop) and reorder them. The taxonomy suggestions are suggestive and allow custom text overrides."
                                variant="form"
                                withBackground
                                withShadow
                                withPadding
                            >
                                <div className={styles.phaseGrid}>
                                    <div className={styles.phaseStatusCard}>
                                        <p className={styles.phaseStatusLabel}>Current readiness</p>
                                        <p className={styles.phaseStatusValue}>
                                            {workspaceReadiness.statementLabel}
                                        </p>
                                        <p className={styles.phaseStatusHint}>
                                            The deterministic draft updates inline as statements are added, deleted, or updated.
                                        </p>
                                    </div>
                                </div>

                                {phases.map((phase) => {
                                    const phaseStatements = statements.filter((s) => s.phase === phase.key);
                                    const showInterPhase = phase.key !== 'stop';
                                    const isPreToAct = phase.key === 'pre_activation';
                                    const interPhaseVal = isPreToAct ? (metadata.interPhasePreToAct || 'PRECEDES') : (metadata.interPhaseActToStop || 'ENABLES');
                                    const isCustomInterPhase = !['PRECEDES', 'ENABLES', 'OPTIONAL_PRECURSOR'].includes(interPhaseVal);
                                    const interPhaseSelectValue = isCustomInterPhase ? 'custom' : interPhaseVal;

                                    return (
                                        <div key={phase.key} style={{ display: 'contents' }}>
                                            <div className={styles.phaseGroup}>
                                            <div className={styles.phaseGroupHeader}>
                                                <Heading level={4} className={styles.phaseGroupTitle}>
                                                    {phase.label} ({phaseStatements.length} statement{phaseStatements.length !== 1 ? 's' : ''})
                                                </Heading>
                                                <Button
                                                    name={undefined}
                                                    styleVariant="outline"
                                                    className={styles.addStatementBtn}
                                                    onClick={() => handleAddStatement(phase.key)}
                                                >
                                                    + Add Statement
                                                </Button>
                                            </div>

                                            {phaseStatements.length === 0 ? (
                                                <div className={styles.noStatementsMessage}>
                                                    No statements in this phase. Click "+ Add Statement" above to add one.
                                                </div>
                                            ) : (
                                                phaseStatements.map((s, idx) => {
                                                    const isVarStandard = lookups.primaryVariables.some(opt => opt.key === s.canonicalVariable);
                                                    const varSelectValue = s.canonicalVariable ? (isVarStandard ? s.canonicalVariable : 'custom') : '';

                                                    const standardSubcats = lookups.subcategoriesByVariable[s.canonicalVariable] ?? [];
                                                    const isSubcatStandard = standardSubcats.some(opt => opt.key === s.subcategory);
                                                    const subcatSelectValue = s.subcategory ? (isSubcatStandard ? s.subcategory : 'custom') : '';

                                                    const isOpStandard = masterOperators.some(opt => opt.key === s.operator);
                                                    const opSelectValue = s.operator ? (isOpStandard ? s.operator : 'custom') : '';

                                                    const isUnitStandard = masterUnits.some(opt => opt.key === s.thresholdUnit);
                                                    const unitSelectValue = s.thresholdUnit ? (isUnitStandard ? s.thresholdUnit : 'custom') : '';

                                                    const isGeogLabelReq = s.geographyType !== 'national';
                                                    const statementGeogHelperText = isGeogLabelReq
                                                        ? 'Select and confirm the geography through Mapbox. Free-text geography is not accepted.'
                                                        : `National scope follows the selected GO country${metadata.countryName ? ` (${metadata.countryName})` : ''}.`;

                                                    const currentSubcategoryOptions = lookups.subcategoriesByVariable[s.canonicalVariable] ?? [];

                                                    const connectorValue = s.withinConnector || s.crossConnector || '';
                                                    const isCustomConnector = connectorValue !== '' && !['AND', 'OR', 'THEN', 'IF_THEN', 'INDEPENDENT', 'MIN_N_OF_M'].includes(connectorValue);
                                                    const selectValue = connectorValue === '' ? '' : (isCustomConnector ? 'custom' : connectorValue);

                                                    return (
                                                        <div key={s.id} style={{ display: 'contents' }}>
                                                            <div className={styles.statementCard}>
                                                            <div className={styles.statementCardHeader}>
                                                                <Heading level={5} className={styles.statementCardTitle}>
                                                                    Statement #{idx + 1}
                                                                </Heading>
                                                                <div className={styles.statementCardActions}>
                                                                    <Button
                                                                        name={undefined}
                                                                        styleVariant="transparent"
                                                                        className={styles.freeTextToggleBtn}
                                                                        onClick={() => handleFreeTextToggle(s.id, !!s.isFreeText)}
                                                                    >
                                                                        {s.isFreeText ? 'Use structured fields' : 'Write as text'}
                                                                    </Button>
                                                                    <Button
                                                                        name={undefined}
                                                                        styleVariant="outline"
                                                                        disabled={idx === 0}
                                                                        onClick={() => handleMoveStatement(s.id, 'up')}
                                                                        title="Move Up"
                                                                        aria-label={`Move statement ${idx + 1} up`}
                                                                        className={styles.reorderBtn}
                                                                    >
                                                                        ▲
                                                                    </Button>
                                                                    <Button
                                                                        name={undefined}
                                                                        styleVariant="outline"
                                                                        disabled={idx === phaseStatements.length - 1}
                                                                        onClick={() => handleMoveStatement(s.id, 'down')}
                                                                        title="Move Down"
                                                                        aria-label={`Move statement ${idx + 1} down`}
                                                                        className={styles.reorderBtn}
                                                                    >
                                                                        ▼
                                                                    </Button>
                                                                    <Button
                                                                        name={undefined}
                                                                        styleVariant="outline"
                                                                        onClick={() => handleRemoveStatement(s.id)}
                                                                        title="Remove statement"
                                                                    >
                                                                        Remove
                                                                    </Button>
                                                                </div>
                                                            </div>

                                                            <div className={styles.statementCardBody}>
                                                                {s.isFreeText ? (
                                                                    /* Free-text mode */
                                                                    <InputSection numPreferredColumns={1}>
                                                                        <TextArea
                                                                            name="freeTextStatement"
                                                                            label="Write trigger statement as text"
                                                                            value={s.freeTextStatement ?? ''}
                                                                            onChange={(val) => handleStatementFieldChange(s.id, val, 'freeTextStatement')}
                                                                            placeholder="Describe the trigger condition in plain language..."
                                                                        />
                                                                    </InputSection>
                                                                ) : (
                                                                    /* Structured mode */
                                                                    <>
                                                                        {/* Threshold clause block */}
                                                                        {getBlockVisible(s.id, 'threshold', s) ? (
                                                                            <ExpandableContainer
                                                                                heading="Threshold clause"
                                                                                headerDescription="Select canonical variable, subcategory, operator, value, and unit. Choose 'Custom / Other...' to type custom text."
                                                                                withBackground
                                                                                initiallyExpanded
                                                                                withPadding
                                                                                headerActions={(
                                                                                    <Button
                                                                                        name={undefined}
                                                                                        styleVariant="transparent"
                                                                                        onClick={() => handleBlockVisChange(s.id, 'threshold', false)}
                                                                                        title="Collapse threshold clause"
                                                                                        aria-label="Collapse threshold clause"
                                                                                    >
                                                                                        ×
                                                                                    </Button>
                                                                                )}
                                                                            >
                                                                                <InputSection numPreferredColumns={2}>
                                                                                    <div className={styles.suggestiveInputWrapper}>
                                                                                        <SelectInput
                                                                                            name="canonicalVariable"
                                                                                            label="Canonical variable"
                                                                                            value={varSelectValue}
                                                                                            options={[...lookups.primaryVariables, { key: 'custom', label: 'Custom / Other...' }]}
                                                                                            keySelector={keySelector}
                                                                                            labelSelector={labelSelector}
                                                                                            onChange={(val) => handleCanonicalVariableChange(s.id, val, 'canonicalVariable')}
                                                                                        />
                                                                                        {(s.canonicalVariable === 'custom' || (!isVarStandard && s.canonicalVariable !== '')) && (
                                                                                            <TextInput
                                                                                                name="canonicalVariableCustom"
                                                                                                label="Custom variable name"
                                                                                                value={s.canonicalVariable === 'custom' ? '' : s.canonicalVariable}
                                                                                                onChange={(val) => handleStatementFieldChange(s.id, val, 'canonicalVariable')}
                                                                                                placeholder="Type custom variable..."
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                </InputSection>

                                                                                <InputSection numPreferredColumns={2}>
                                                                                    <div className={styles.suggestiveInputWrapper}>
                                                                                        <SelectInput
                                                                                            name="subcategory"
                                                                                            label="Subcategory"
                                                                                            value={subcatSelectValue}
                                                                                            options={[...currentSubcategoryOptions, { key: 'custom', label: 'Custom / Other...' }]}
                                                                                            keySelector={keySelector}
                                                                                            labelSelector={labelSelector}
                                                                                            onChange={(val) => handleStatementFieldChange(s.id, val, 'subcategory')}
                                                                                        />
                                                                                        {(s.subcategory === 'custom' || (!isSubcatStandard && s.subcategory !== '')) && (
                                                                                            <TextInput
                                                                                                name="subcategoryCustom"
                                                                                                label="Custom subcategory"
                                                                                                value={s.subcategory === 'custom' ? '' : s.subcategory}
                                                                                                onChange={(val) => handleStatementFieldChange(s.id, val, 'subcategory')}
                                                                                                placeholder="Type custom subcategory..."
                                                                                            />
                                                                                        )}
                                                                                    </div>

                                                                                    <div className={styles.suggestiveInputWrapper}>
                                                                                        <SelectInput
                                                                                            name="operator"
                                                                                            label="Operator"
                                                                                            value={opSelectValue}
                                                                                            options={[...masterOperators, { key: 'custom', label: 'Custom / Other...' }]}
                                                                                            keySelector={keySelector}
                                                                                            labelSelector={labelSelector}
                                                                                            onChange={(val) => handleStatementFieldChange(s.id, val, 'operator')}
                                                                                        />
                                                                                        {(s.operator === 'custom' || (!isOpStandard && s.operator !== '')) && (
                                                                                            <TextInput
                                                                                                name="operatorCustom"
                                                                                                label="Custom operator"
                                                                                                value={s.operator === 'custom' ? '' : s.operator}
                                                                                                onChange={(val) => handleStatementFieldChange(s.id, val, 'operator')}
                                                                                                placeholder="Type custom operator..."
                                                                                            />
                                                                                        )}
                                                                                    </div>

                                                                                    <TextInput
                                                                                        name="thresholdValue"
                                                                                        label="Threshold value"
                                                                                        value={s.thresholdValue}
                                                                                        onChange={(val) => handleStatementFieldChange(s.id, val, 'thresholdValue')}
                                                                                        placeholder="e.g. 400"
                                                                                    />

                                                                                    <div className={styles.suggestiveInputWrapper}>
                                                                                        <SelectInput
                                                                                            name="thresholdUnit"
                                                                                            label="Threshold unit"
                                                                                            value={unitSelectValue}
                                                                                            options={[...masterUnits, { key: 'custom', label: 'Custom / Other...' }]}
                                                                                            keySelector={keySelector}
                                                                                            labelSelector={labelSelector}
                                                                                            onChange={(val) => handleStatementFieldChange(s.id, val, 'thresholdUnit')}
                                                                                        />
                                                                                        {(s.thresholdUnit === 'custom' || (!isUnitStandard && s.thresholdUnit !== '')) && (
                                                                                            <TextInput
                                                                                                name="thresholdUnitCustom"
                                                                                                label="Custom unit"
                                                                                                value={s.thresholdUnit === 'custom' ? '' : s.thresholdUnit}
                                                                                                onChange={(val) => handleStatementFieldChange(s.id, val, 'thresholdUnit')}
                                                                                                placeholder="Type custom unit..."
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                </InputSection>
                                                                            </ExpandableContainer>
                                                                        ) : (
                                                                            <div className={styles.addBlockRow}>
                                                                                <Button
                                                                                    name={undefined}
                                                                                    styleVariant="transparent"
                                                                                    onClick={() => handleBlockVisChange(s.id, 'threshold', true)}
                                                                                >
                                                                                    + Add threshold clause
                                                                                </Button>
                                                                            </div>
                                                                        )}

                                                                        {/* Lead Time / Probability block */}
                                                                        {getBlockVisible(s.id, 'leadTime', s) ? (
                                                                            <ExpandableContainer
                                                                                heading="Lead time &amp; probability"
                                                                                withBackground
                                                                                initiallyExpanded
                                                                                withPadding
                                                                                headerActions={(
                                                                                    <Button
                                                                                        name={undefined}
                                                                                        styleVariant="transparent"
                                                                                        onClick={() => handleBlockVisChange(s.id, 'leadTime', false)}
                                                                                        title="Collapse lead time block"
                                                                                        aria-label="Collapse lead time block"
                                                                                    >
                                                                                        ×
                                                                                    </Button>
                                                                                )}
                                                                            >
                                                                                <InputSection numPreferredColumns={2}>
                                                                                    <TextInput
                                                                                        name="leadTimeValue"
                                                                                        label="Lead time (e.g. '3-5' or 'seasonal')"
                                                                                        value={s.leadTimeValue !== undefined ? String(s.leadTimeValue) : ''}
                                                                                        onChange={(val) => handleStatementFieldChange(s.id, val, 'leadTimeValue')}
                                                                                        placeholder="e.g. 5 or 3-5"
                                                                                    />
                                                                                    <div className={styles.suggestiveInputWrapper}>
                                                                                        <SelectInput
                                                                                            name="timeframeUnit"
                                                                                            label="Timeframe unit"
                                                                                            value={s.timeframeUnit}
                                                                                            options={lookups.timeframeUnits}
                                                                                            keySelector={keySelector}
                                                                                            labelSelector={labelSelector}
                                                                                            onChange={(val) => handleStatementFieldChange(s.id, val, 'timeframeUnit')}
                                                                                        />
                                                                                    </div>
                                                                                    <NumberInput
                                                                                        name="probabilityValue"
                                                                                        label="Probability (%)"
                                                                                        value={s.probabilityValue}
                                                                                        onChange={(val) => handleStatementNumberFieldChange(s.id, val, 'probabilityValue')}
                                                                                    />
                                                                                </InputSection>
                                                                            </ExpandableContainer>
                                                                        ) : (
                                                                            <div className={styles.addBlockRow}>
                                                                                <Button
                                                                                    name={undefined}
                                                                                    styleVariant="transparent"
                                                                                    onClick={() => handleBlockVisChange(s.id, 'leadTime', true)}
                                                                                >
                                                                                    + Add Lead Time / Probability
                                                                                </Button>
                                                                            </div>
                                                                        )}

                                                                        {/* Geography block */}
                                                                        {getBlockVisible(s.id, 'geography', s) ? (
                                                                            <ExpandableContainer
                                                                                heading="Geography"
                                                                                withBackground
                                                                                initiallyExpanded
                                                                                withPadding
                                                                                headerActions={(
                                                                                    <Button
                                                                                        name={undefined}
                                                                                        styleVariant="transparent"
                                                                                        onClick={() => handleBlockVisChange(s.id, 'geography', false)}
                                                                                        title="Collapse geography block"
                                                                                        aria-label="Collapse geography block"
                                                                                    >
                                                                                        ×
                                                                                    </Button>
                                                                                )}
                                                                            >
                                                                                <InputSection numPreferredColumns={2}>
                                                                                    <div className={styles.suggestiveInputWrapper}>
                                                                                        <SelectInput
                                                                                            name="geographyType"
                                                                                            label="Geography type"
                                                                                            value={s.geographyType}
                                                                                            options={lookups.geographyTypes.filter((option) => (
                                                                                                option.key === 'national'
                                                                                                || option.key === 'regional'
                                                                                                || option.key === 'administrative_unit'
                                                                                                || option.key === 'station_gauge'
                                                                                                || option.key === 'watershed_basin'
                                                                                            ))}
                                                                                            keySelector={keySelector}
                                                                                            labelSelector={labelSelector}
                                                                                            onChange={(val) => handleStatementFieldChange(s.id, val, 'geographyType')}
                                                                                        />
                                                                                    </div>
                                                                                    <TextInput
                                                                                        name="geographyLabel"
                                                                                        label="Confirmed geography"
                                                                                        value={s.geographyLabel}
                                                                                        onChange={() => undefined}
                                                                                        readOnly
                                                                                        placeholder="No confirmed geography"
                                                                                    />
                                                                                    <Button
                                                                                        name={undefined}
                                                                                        styleVariant="outline"
                                                                                        disabled={!metadata.countryId}
                                                                                        onClick={() => setActiveGeographyStatementId((current) => (
                                                                                            current === s.id ? null : s.id
                                                                                        ))}
                                                                                    >
                                                                                        {activeGeographyStatementId === s.id
                                                                                            ? 'Close map selector'
                                                                                            : 'Open map selector'}
                                                                                    </Button>
                                                                                </InputSection>
                                                                                {activeGeographyStatementId === s.id && (
                                                                                    <Suspense fallback={(
                                                                                        <Message
                                                                                            compact
                                                                                            title="Loading geography tools"
                                                                                            description="Mapbox and Search are loaded only while this selector is open."
                                                                                        />
                                                                                    )}>
                                                                                        <GeographySelector
                                                                                            country={metadata}
                                                                                            statement={s}
                                                                                            onChange={(selection) => handleGeographySelectionChange(s.id, selection)}
                                                                                        />
                                                                                    </Suspense>
                                                                                )}
                                                                                <Message
                                                                                    compact
                                                                                    className={styles.helperMessage}
                                                                                    title={s.geographyConfirmed ? 'Geography confirmed' : 'Geography confirmation required'}
                                                                                    description={statementGeogHelperText}
                                                                                />
                                                                            </ExpandableContainer>
                                                                        ) : (
                                                                            <div className={styles.addBlockRow}>
                                                                                <Button
                                                                                    name={undefined}
                                                                                    styleVariant="transparent"
                                                                                    onClick={() => handleBlockVisChange(s.id, 'geography', true)}
                                                                                >
                                                                                    + Add Geography
                                                                                </Button>
                                                                            </div>
                                                                        )}

                                                                        {/* Source Authority block */}
                                                                        {getBlockVisible(s.id, 'source', s) ? (
                                                                            <ExpandableContainer
                                                                                heading="Source authority"
                                                                                withBackground
                                                                                initiallyExpanded
                                                                                withPadding
                                                                                headerActions={(
                                                                                    <Button
                                                                                        name={undefined}
                                                                                        styleVariant="transparent"
                                                                                        onClick={() => handleBlockVisChange(s.id, 'source', false)}
                                                                                        title="Collapse source authority block"
                                                                                        aria-label="Collapse source authority block"
                                                                                    >
                                                                                        ×
                                                                                    </Button>
                                                                                )}
                                                                            >
                                                                                <InputSection numPreferredColumns={1}>
                                                                                    <TextInput
                                                                                        name="sourceAuthority"
                                                                                        label="Source authority"
                                                                                        value={s.sourceAuthority ?? ''}
                                                                                        onChange={(val) => handleStatementFieldChange(s.id, val, 'sourceAuthority')}
                                                                                        placeholder="Specify forecasting or data source authority"
                                                                                    />
                                                                                </InputSection>
                                                                            </ExpandableContainer>
                                                                        ) : (
                                                                            <div className={styles.addBlockRow}>
                                                                                <Button
                                                                                    name={undefined}
                                                                                    styleVariant="transparent"
                                                                                    onClick={() => handleBlockVisChange(s.id, 'source', true)}
                                                                                >
                                                                                    + Add Source Authority
                                                                                </Button>
                                                                            </div>
                                                                        )}

                                                                        {/* Notes block */}
                                                                        {getBlockVisible(s.id, 'notes', s) ? (
                                                                            <ExpandableContainer
                                                                                heading="Analyst notes"
                                                                                withBackground
                                                                                initiallyExpanded
                                                                                withPadding
                                                                                headerActions={(
                                                                                    <Button
                                                                                        name={undefined}
                                                                                        styleVariant="transparent"
                                                                                        onClick={() => handleBlockVisChange(s.id, 'notes', false)}
                                                                                        title="Collapse notes block"
                                                                                        aria-label="Collapse notes block"
                                                                                    >
                                                                                        ×
                                                                                    </Button>
                                                                                )}
                                                                            >
                                                                                <InputSection numPreferredColumns={1}>
                                                                                    <TextArea
                                                                                        name="notes"
                                                                                        label="Analyst notes"
                                                                                        value={s.notes}
                                                                                        onChange={(val) => handleStatementFieldChange(s.id, val, 'notes')}
                                                                                        placeholder="Optional implementation notes, source reminders, or caveats."
                                                                                    />
                                                                                </InputSection>
                                                                            </ExpandableContainer>
                                                                        ) : (
                                                                            <div className={styles.addBlockRow}>
                                                                                <Button
                                                                                    name={undefined}
                                                                                    styleVariant="transparent"
                                                                                    onClick={() => handleBlockVisChange(s.id, 'notes', true)}
                                                                                >
                                                                                    + Add Notes
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                            </div>
                                                            {idx < phaseStatements.length - 1 && (
                                                                <div className={styles.inlineConnectorRow}>
                                                                    <span className={styles.inlineConnectorLabel}>
                                                                        Logic connector
                                                                        <InfoPopup
                                                                            infoLabel="Connector help"
                                                                            title="Cross-statement connectors"
                                                                            description={(
                                                                                <ul className={styles.tooltipList}>
                                                                                    <li><strong>AND</strong> — both conditions must be met simultaneously.</li>
                                                                                    <li><strong>OR</strong> — either condition alone is sufficient.</li>
                                                                                    <li><strong>THEN</strong> — second condition must follow the first sequentially.</li>
                                                                                    <li><strong>IF_THEN</strong> — second condition is triggered only when the first is met.</li>
                                                                                    <li><strong>INDEPENDENT</strong> — conditions are assessed separately with no dependency.</li>
                                                                                    <li><strong>MIN_N_OF_M</strong> — at least N of M conditions must be met.</li>
                                                                                </ul>
                                                                            )}
                                                                        />
                                                                        :
                                                                    </span>
                                                                    <div className={styles.inlineConnectorSelectWrapper}>
                                                                        <SelectInput
                                                                            name="withinConnector"
                                                                            label={undefined}
                                                                            placeholder="Select logic connection"
                                                                            value={selectValue}
                                                                            options={[
                                                                                { key: 'AND', label: 'AND (Both must meet)' },
                                                                                { key: 'OR', label: 'OR (Either can meet)' },
                                                                                { key: 'THEN', label: 'THEN (Sequential)' },
                                                                                { key: 'IF_THEN', label: 'IF_THEN (Conditional)' },
                                                                                { key: 'INDEPENDENT', label: 'INDEPENDENT' },
                                                                                { key: 'MIN_N_OF_M', label: 'MIN_N_OF_M' },
                                                                                { key: 'custom', label: 'Custom / Other...' }
                                                                            ]}
                                                                            keySelector={keySelector}
                                                                            labelSelector={labelSelector}
                                                                            onChange={(val) => {
                                                                                if (val === 'custom') {
                                                                                    handleStatementFieldChange(s.id, 'custom-logic', 'withinConnector');
                                                                                    handleStatementFieldChange(s.id, undefined, 'crossConnector');
                                                                                } else {
                                                                                    handleStatementFieldChange(s.id, val, 'withinConnector');
                                                                                    handleStatementFieldChange(s.id, undefined, 'crossConnector');
                                                                                }
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    {(selectValue === 'custom' || isCustomConnector) && (
                                                                        <div className={styles.inlineConnectorCustomInput}>
                                                                            <TextInput
                                                                                name="customConnectorValue"
                                                                                label={undefined}
                                                                                value={s.withinConnector === 'custom-logic' ? '' : (s.withinConnector || '')}
                                                                                onChange={(val) => {
                                                                                    handleStatementFieldChange(s.id, val, 'withinConnector');
                                                                                }}
                                                                                placeholder="Type custom logic..."
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {showInterPhase && (
                                            <div className={styles.interPhaseFlowConnector}>
                                                <span className={styles.interPhaseFlowLabel}>
                                                    Phase Transition ({isPreToAct ? 'Pre-Activation ➔ Activation' : 'Activation ➔ Stop'})
                                                    <InfoPopup
                                                        infoLabel="Transition help"
                                                        title="Inter-phase connectors"
                                                        description={(
                                                            <ul className={styles.tooltipList}>
                                                                <li><strong>PRECEDES</strong> — pre-activation must be observed before activation is valid.</li>
                                                                <li><strong>ENABLES</strong> — pre-activation makes activation possible but is not required.</li>
                                                                <li><strong>OPTIONAL_PRECURSOR</strong> — pre-activation is advisory only and does not gate activation.</li>
                                                            </ul>
                                                        )}
                                                    />
                                                    :
                                                </span>
                                                <div className={styles.interPhaseFlowControls}>
                                                    <SelectInput
                                                        name={isPreToAct ? 'interPhasePreToAct' : 'interPhaseActToStop'}
                                                        label={undefined}
                                                        value={interPhaseSelectValue}
                                                        options={[
                                                            { key: 'PRECEDES', label: 'PRECEDES (Required sequence)' },
                                                            { key: 'ENABLES', label: 'ENABLES (Prerequisite)' },
                                                            { key: 'OPTIONAL_PRECURSOR', label: 'OPTIONAL_PRECURSOR' },
                                                            { key: 'custom', label: 'Custom transition...' }
                                                        ]}
                                                        keySelector={keySelector}
                                                        labelSelector={labelSelector}
                                                        onChange={(val) => {
                                                            const field = isPreToAct ? 'interPhasePreToAct' : 'interPhaseActToStop';
                                                            if (val === 'custom') {
                                                                handleMetadataFieldChange('custom-transition', field);
                                                            } else {
                                                                handleMetadataFieldChange(val, field);
                                                            }
                                                        }}
                                                    />
                                                    {(interPhaseSelectValue === 'custom' || isCustomInterPhase) && (
                                                        <div className={styles.inlineConnectorCustomInput}>
                                                            <TextInput
                                                                name={isPreToAct ? 'interPhasePreToActCustom' : 'interPhaseActToStopCustom'}
                                                                label={undefined}
                                                                value={interPhaseVal === 'custom-transition' ? '' : interPhaseVal}
                                                                onChange={(val) => {
                                                                    const field = isPreToAct ? 'interPhasePreToAct' : 'interPhaseActToStop';
                                                                    handleMetadataFieldChange(val, field);
                                                                }}
                                                                placeholder="Type custom relationship..."
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}

                                <p className={styles.inlineNote}>
                                    Probability, lead time, timeframe, and notes remain optional so the prototype can still represent sparse pilot logic while keeping the main clause readable.
                                </p>
                            </Container>

                            {/* Connector vocabulary card removed — definitions are now surfaced as
                                inline InfoPopup tooltips next to each connector selector (Stage 10c). */}
                            <Container
                                id="review-workspace"
                                className={styles.sectionCard}
                                heading="Review workspace"
                                headerDescription="Deterministic structural draft, AI-polished trigger statements, and reviewer notes — all on the same screen. Generate to produce the first draft; edit guidance and Regenerate to refine."
                                variant="form"
                                withBackground
                                withShadow
                                withPadding
                            >
                                {/* State banner */}
                                {(reviewState === 'untouched' || reviewState === 'partially_complete') && (
                                    <Message
                                        compact
                                        className={styles.reviewStateBanner}
                                        title={reviewState === 'untouched' ? 'Not started yet' : 'Form partially complete'}
                                        description={reviewState === 'untouched'
                                            ? 'Fill in the EAP metadata and add trigger statements above to enable generation.'
                                            : 'Complete the required fields — metadata and threshold values — to enable statement generation.'}
                                    />
                                )}
                                {reviewState === 'draft_ready' && (
                                    <Message
                                        compact
                                        className={styles.reviewStateBanner}
                                        title="Ready to generate"
                                        description="Your trigger model is complete. Click Generate below (or in the page header) to create the AI-polished trigger statement."
                                    />
                                )}
                                {reviewState === 'saved_draft' && (
                                    <Message
                                        compact
                                        className={styles.reviewStateBannerSaved}
                                        title="Draft saved"
                                        description={
                                            workspaceReadiness.reviewReady
                                                ? 'Your trigger model has been saved locally and is ready to generate. Click Generate to compile the deterministic draft and apply AI polish.'
                                                : 'Your draft has been saved locally. Complete the metadata and threshold clauses above to enable generation.'
                                        }
                                    />
                                )}
                                {(reviewState === 'generated') && (
                                    <Message
                                        compact
                                        className={styles.reviewStateBannerSuccess}
                                        title="Trigger statement generated"
                                        description="Review the segmented outputs below. Edit reviewer guidance and click Regenerate to refine the output."
                                    />
                                )}
                                {reviewState === 'regenerated' && (
                                    <Message
                                        compact
                                        className={styles.reviewStateBannerSuccess}
                                        title="Trigger statement regenerated"
                                        description="Updated output is below. Save the draft when you are satisfied with the result."
                                    />
                                )}
                                {reviewState === 'export_ready' && (
                                    <Message
                                        compact
                                        className={styles.reviewStateBannerSuccess}
                                        title="Export ready"
                                        description="Trigger model saved and statement generated. Use the Export button in the page header to download the bundle."
                                    />
                                )}

                                {/* Deterministic structural preview */}
                                <ExpandableContainer
                                    heading="Deterministic structural preview"
                                    headerDescription="Compiled directly from your form inputs. All custom-typed variables, operators, units, and geography labels are preserved verbatim."
                                    withBackground
                                    initiallyExpanded={reviewOutput === null}
                                    withPadding
                                >
                                    <pre className={styles.structuralPreviewText}>{structuralPreview}</pre>
                                    <div className={styles.previewStatusRow}>
                                        <StatusPill
                                            label={workspaceReadiness.reviewLabel}
                                            tone={workspaceReadiness.reviewReady ? 'ready' : 'attention'}
                                        />
                                    </div>
                                </ExpandableContainer>

                                {/* Generating spinner */}
                                {isGenerating && (
                                    <Message
                                        compact
                                        className={styles.generatingBanner}
                                        title={generationCount > 0 ? 'Regenerating...' : 'Generating...'}
                                        description="Compiling trigger clauses and applying AI polish to the structured draft. This takes a moment."
                                    />
                                )}

                                {/* Backend warnings (non-blocking issues flagged by Gemini) */}
                                {backendWarnings.length > 0 && !isGenerating && (
                                    <Message
                                        compact
                                        title="Review notes from AI analysis"
                                        description={backendWarnings.join(' ')}
                                        actions={(
                                            <Button
                                                name={undefined}
                                                styleVariant="outline"
                                                onClick={() => setBackendWarnings([])}
                                            >
                                                Dismiss
                                            </Button>
                                        )}
                                    />
                                )}

                                {/* Segmented + combined AI outputs */}
                                {reviewOutput !== null && !isGenerating && (
                                    <div className={styles.reviewOutputStack}>
                                        {reviewOutput.preActivation && (
                                            <div className={styles.reviewSegmentPanel}>
                                                <div className={styles.reviewSegmentHeader}>
                                                    <span className={styles.reviewSegmentLabel}>Pre-activation trigger</span>
                                                    <Description textSize="xs" className={styles.reviewSegmentMeta}>
                                                        {getApiBaseUrl() ? 'Deterministic draft assembled · AI-polished by Gemini' : 'Deterministic draft assembled · AI polish simulated'}
                                                    </Description>
                                                </div>
                                                <TextArea
                                                    name="aiPreActivation"
                                                    label="Editable AI-polished pre-activation text"
                                                    aria-label="Editable AI-polished pre-activation text"
                                                    value={reviewOutput.preActivation}
                                                    onChange={(value) => handleReviewOutputChange(value, 'preActivation')}
                                                    rows={5}
                                                />
                                            </div>
                                        )}
                                        {reviewOutput.activation && (
                                            <div className={styles.reviewSegmentPanel}>
                                                <div className={styles.reviewSegmentHeader}>
                                                    <span className={styles.reviewSegmentLabel}>Activation trigger</span>
                                                    <Description textSize="xs" className={styles.reviewSegmentMeta}>
                                                        {getApiBaseUrl() ? 'Deterministic draft assembled · AI-polished by Gemini' : 'Deterministic draft assembled · AI polish simulated'}
                                                    </Description>
                                                </div>
                                                <TextArea
                                                    name="aiActivation"
                                                    label="Editable AI-polished activation text"
                                                    aria-label="Editable AI-polished activation text"
                                                    value={reviewOutput.activation}
                                                    onChange={(value) => handleReviewOutputChange(value, 'activation')}
                                                    rows={5}
                                                />
                                            </div>
                                        )}
                                        {reviewOutput.stop && (
                                            <div className={styles.reviewSegmentPanel}>
                                                <div className={styles.reviewSegmentHeader}>
                                                    <span className={styles.reviewSegmentLabel}>Stop mechanism</span>
                                                    <Description textSize="xs" className={styles.reviewSegmentMeta}>
                                                        {getApiBaseUrl() ? 'Deterministic draft assembled · AI-polished by Gemini' : 'Deterministic draft assembled · AI polish simulated'}
                                                    </Description>
                                                </div>
                                                <TextArea
                                                    name="aiStop"
                                                    label="Editable AI-polished stop text"
                                                    aria-label="Editable AI-polished stop text"
                                                    value={reviewOutput.stop}
                                                    onChange={(value) => handleReviewOutputChange(value, 'stop')}
                                                    rows={5}
                                                />
                                            </div>
                                        )}
                                        <div className={styles.reviewCombinedPanel}>
                                            <div className={styles.reviewSegmentHeader}>
                                                <span className={styles.reviewSegmentLabel}>Combined trigger statement</span>
                                                <Description textSize="xs" className={styles.reviewSegmentMeta}>
                                                    {formatSavedTime(reviewOutput.generatedAt)} · Generation #{reviewOutput.generationIndex}
                                                </Description>
                                            </div>
                                            <TextArea
                                                name="aiCombined"
                                                label="Editable AI-polished combined statement"
                                                aria-label="Editable AI-polished combined statement"
                                                value={reviewOutput.combined}
                                                onChange={(value) => handleReviewOutputChange(value, 'combined')}
                                                rows={8}
                                            />
                                        </div>
                                        <Message
                                            compact
                                            title={reviewApproval.status === 'approved'
                                                ? 'AI version approved for export'
                                                : reviewApproval.status === 'edited'
                                                    ? 'Edited AI version requires approval'
                                                    : 'AI version requires approval'}
                                            description={reviewApproval.status === 'approved' && reviewApproval.approvedAt
                                                ? `Approved ${formatSavedTime(reviewApproval.approvedAt)}. Editing or regenerating will reset approval.`
                                                : 'The deterministic output remains exportable. Approve this editable AI version before including it in an export.'}
                                            actions={reviewApproval.status !== 'approved' ? (
                                                <Button
                                                    name={undefined}
                                                    styleVariant="filled"
                                                    onClick={handleApproveAiVersion}
                                                >
                                                    Approve AI version for export
                                                </Button>
                                            ) : undefined}
                                        />
                                    </div>
                                )}
                                {showComparisonView && activeComparisonEntry && reviewOutput !== null && originalStatementsPreview && (
                                    <ExpandableContainer
                                        heading="Compare with Original Pilot Statements"
                                        headerDescription="Compare the raw pilot clauses with the generated phase output without leaving the review workflow."
                                        withBackground
                                        initiallyExpanded
                                        withPadding
                                    >
                                        <Tabs
                                            value={activeComparisonEntry.key}
                                            onChange={setActiveComparisonPhase}
                                        >
                                            <div className={styles.comparisonTabStack}>
                                                <TabList>
                                                    {comparisonPhases.map((phase) => (
                                                        <Tab
                                                            key={phase.key}
                                                            name={phase.key}
                                                        >
                                                            {phase.label}
                                                        </Tab>
                                                    ))}
                                                </TabList>
                                            </div>
                                        </Tabs>
                                        <div className={styles.comparisonGrid}>
                                            <div className={styles.comparisonPanel}>
                                                <div className={styles.comparisonPanelHeader}>
                                                    <Chip
                                                        name={`${activeComparisonEntry.key}-original`}
                                                        label="Original"
                                                        variant="secondary"
                                                    />
                                                    <span className={styles.comparisonPanelTitle}>
                                                        Original pilot statement
                                                    </span>
                                                </div>
                                                <TextArea
                                                    name={`${activeComparisonEntry.key}-original-preview`}
                                                    label={undefined}
                                                    value={activeOriginalComparisonText}
                                                    readOnly
                                                    rows={10}
                                                    onChange={() => undefined}
                                                    inputClassName={styles.comparisonTextAreaInput}
                                                />
                                            </div>
                                            <div className={styles.comparisonPanel}>
                                                <div className={styles.comparisonPanelHeader}>
                                                    <Chip
                                                        name={`${activeComparisonEntry.key}-generated`}
                                                        label="Generated"
                                                        variant="primary"
                                                    />
                                                    <span className={styles.comparisonPanelTitle}>
                                                        Generated statement
                                                    </span>
                                                </div>
                                                <TextArea
                                                    name={`${activeComparisonEntry.key}-generated-preview`}
                                                    label={undefined}
                                                    value={activeGeneratedComparisonText}
                                                    readOnly
                                                    rows={10}
                                                    onChange={() => undefined}
                                                    inputClassName={styles.comparisonTextAreaInput}
                                                />
                                                <Description
                                                    textSize="xs"
                                                    className={styles.comparisonPanelHint}
                                                >
                                                    Update reviewer guidance below and regenerate if you want to refine this phase.
                                                </Description>
                                            </div>
                                        </div>
                                    </ExpandableContainer>
                                )}

                                {/* Reviewer notes */}
                                <InputSection
                                    title="Reviewer guidance"
                                    description={
                                        reviewOutput !== null
                                            ? 'Edit the guidance below and click Regenerate to refine the output. Keep it scoped — this is a review note, not a chat box.'
                                            : 'Add guidance for the AI before generating. This shapes the tone and emphasis of the polished output.'
                                    }
                                    numPreferredColumns={1}
                                    withFullWidthContent
                                >
                                    <TextArea
                                        name="reviewerGuidance"
                                        label="Guidance notes"
                                        aria-label="Guidance notes"
                                        value={reviewerGuidance}
                                        onChange={handleReviewerGuidanceChange}
                                    />
                                </InputSection>

                                {/* Inline generate / regenerate button */}
                                <div className={styles.reviewActionRow}>
                                    <Button
                                        name={undefined}
                                        styleVariant="filled"
                                        disabled={isGenerating || !workspaceReadiness.reviewReady}
                                        onClick={handleGenerate}
                                    >
                                        {isGenerating
                                            ? (generationCount > 0 ? 'Regenerating...' : 'Generating...')
                                            : reviewOutput ? 'Regenerate' : 'Generate'}
                                    </Button>
                                    {!workspaceReadiness.reviewReady && (
                                        <Description textSize="xs" className={styles.reviewActionHint}>
                                            Complete the metadata and threshold clauses above to enable generation.
                                        </Description>
                                    )}
                                </div>
                            </Container>

                    </div>
                </div>
            </PageContainer>

            {isExportModalOpen && (
                <Modal
                    heading="Export bundle"
                    onClose={handleCloseExportModal}
                    size="xl"
                    className={styles.exportModal}
                >
                    <ListView layout="block" spacing="lg">
                        <Message
                            compact
                            title="Export-ready prototype bundle"
                            description="Stage 4 keeps export preparation on the same GO screen: choose the artifacts to include, inspect them inline, and download what you need."
                        />

                        <ListView
                            className={styles.exportOptionGrid}
                            layout="grid"
                            numPreferredGridColumns={4}
                            minGridColumnSize="14rem"
                            spacing="sm"
                        >
                            <Checkbox
                                name="includeNarrativeDraft"
                                label="Narrative text bundle"
                                description="Download the resolved title, deterministic structural draft, and optional reviewer guidance as plain text."
                                value={exportOptions.includeNarrativeDraft}
                                onChange={handleExportOptionChange}
                                withBackground
                            />
                            <Checkbox
                                name="includeStructuredJson"
                                label="Structured JSON bundle"
                                description="Download the current document context, clause inputs, and generated deterministic preview as JSON."
                                value={exportOptions.includeStructuredJson}
                                onChange={handleExportOptionChange}
                                withBackground
                            />
                            <Checkbox
                                name="includeReviewerNotes"
                                label="Include reviewer guidance"
                                description="Keep reviewer notes in the narrative bundle and structured JSON export."
                                value={exportOptions.includeReviewerNotes}
                                onChange={handleExportOptionChange}
                                withBackground
                            />
                            <Checkbox
                                name="includeAiPolished"
                                label="AI-polished version"
                                description={reviewApproval.status === 'approved'
                                    ? 'Include the approved AI-polished text and approval metadata.'
                                    : 'Approve the AI-polished version in Review before it can be exported.'}
                                value={exportOptions.includeAiPolished}
                                onChange={handleExportOptionChange}
                                disabled={reviewApproval.status !== 'approved'}
                                withBackground
                            />
                        </ListView>

                        {!exportOptions.includeNarrativeDraft && !exportOptions.includeStructuredJson && (
                            <Message
                                compact
                                title="Select at least one export artifact"
                                description="The export workspace is ready, but at least one bundle needs to stay enabled before a download can happen."
                            />
                        )}

                        <ListView className={styles.exportPreviewStack} layout="block" spacing="md">
                            {exportOptions.includeNarrativeDraft && (
                                <div className={styles.exportPreviewCard}>
                                    <Description className={styles.exportPreviewLabel} textSize="xs">
                                        Narrative text bundle
                                    </Description>
                                    <pre className={styles.exportCodeBlock}>{exportBundle.narrativeText}</pre>
                                </div>
                            )}

                            {exportOptions.includeStructuredJson && (
                                <div className={styles.exportPreviewCard}>
                                    <Description className={styles.exportPreviewLabel} textSize="xs">
                                        Structured JSON bundle
                                    </Description>
                                    <pre className={styles.exportCodeBlock}>{exportBundle.structuredJson}</pre>
                                </div>
                            )}
                        </ListView>

                        <ListView withWrap spacing="sm" className={styles.exportActionRow}>
                            {exportOptions.includeNarrativeDraft && (
                                <Button
                                    name={undefined}
                                    styleVariant="outline"
                                    onClick={handleDownloadNarrativeText}
                                >
                                    Download text bundle
                                </Button>
                            )}
                            {exportOptions.includeStructuredJson && (
                                <Button
                                    name={undefined}
                                    styleVariant="filled"
                                    onClick={handleDownloadStructuredJson}
                                >
                                    Download JSON bundle
                                </Button>
                            )}
                        </ListView>
                    </ListView>
                </Modal>
            )}

            {isAccessCodeModalOpen && (
                <Modal
                    heading="Prototype access code"
                    onClose={() => {
                        setPrototypeAccessCodeInput('');
                        setIsAccessCodeModalOpen(false);
                    }}
                    size="sm"
                    footerActions={(
                        <Button
                            name={undefined}
                            styleVariant="filled"
                            disabled={!prototypeAccessCodeInput.trim()}
                            onClick={handleAccessCodeSubmit}
                        >
                            Continue generation
                        </Button>
                    )}
                >
                    <ListView layout="block" spacing="md">
                        <Message
                            compact
                            title="Internal prototype"
                            description="Enter the temporary access code to use the billable AI generation endpoint. It is kept only for this browser session."
                        />
                        <TextInput
                            name="prototypeAccessCode"
                            type="password"
                            label="Access code"
                            aria-label="Access code"
                            value={prototypeAccessCodeInput}
                            onChange={(value) => setPrototypeAccessCodeInput(value ?? '')}
                            autoFocus
                        />
                    </ListView>
                </Modal>
            )}

            {showRedirectModal && (
                <Modal
                    heading="Saving Workspace"
                    onClose={() => setShowRedirectModal(false)}
                    size="md"
                >
                    <div className={styles.saveRedirectModalBody}>
                        <div className={styles.saveRedirectModalTitleWrap}>
                            <Heading level={3}>
                                Workspace Saved
                            </Heading>
                        </div>
                        <p className={styles.saveRedirectModalText}>
                            Your trigger model draft has been persisted locally. Returning to EAP Overview dashboard...
                        </p>
                        <div className={styles.saveRedirectModalActions}>
                            <Button
                                name={undefined}
                                styleVariant="outline"
                                onClick={() => setShowRedirectModal(false)}
                            >
                                Keep editing
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                onClick={() => {
                                    setShowRedirectModal(false);
                                    setWorkspaceNotice({
                                        title: 'Draft saved',
                                        description: 'Your trigger model has been saved. In the live platform, you would be returned to the EAP overview.',
                                    });
                                }}
                            >
                                OK
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Free-text mode confirmation Modal */}
            {pendingFreeTextId !== null && (
                <Modal
                    heading="Switch to free-text mode?"
                    onClose={() => setPendingFreeTextId(null)}
                    size="sm"
                    footerActions={(
                        <>
                            <Button
                                name={undefined}
                                styleVariant="outline"
                                onClick={() => setPendingFreeTextId(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                onClick={handleFreeTextConfirm}
                            >
                                Switch to free-text
                            </Button>
                        </>
                    )}
                >
                    <p>
                        Structured field data will be hidden but not deleted. You can switch back to structured fields at any time to restore the values.
                    </p>
                </Modal>
            )}

            {/* Global Footer */}
            <PageContainer
                className={styles.footer}
                containerAs="footer"
            >
                <ListView
                    layout="grid"
                    numPreferredGridColumns={5}
                    spacing="xl"
                    minGridColumnSize="14rem"
                >
                    <Container
                        heading="About GO"
                        spacing="lg"
                    >
                        <ListView
                            layout="block"
                            withSpacingOpticalCorrection
                        >
                            <div className={styles.footerAboutText}>
                                IFRC GO is a Red Cross Red Crescent platform to connect information on emergency needs with the right response.
                            </div>
                            <div className={styles.footerCopyright}>
                                <a
                                    href="https://go.ifrc.org"
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.footerCopyrightLink}
                                >
                                    © IFRC 2026 v7.26.0
                                </a>
                            </div>
                        </ListView>
                    </Container>

                    <Container
                        heading="Find out more"
                        spacing="lg"
                    >
                        <ListView
                            layout="block"
                            withSpacingOpticalCorrection
                        >
                            <a href="https://www.ifrc.org" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                ifrc.org
                            </a>
                            <a href="https://www.rcrcsims.org" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                rcrcsims.org
                            </a>
                            <a href="https://data.ifrc.org" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                data.ifrc.org
                            </a>
                        </ListView>
                    </Container>

                    <Container
                        heading="Policies"
                        spacing="lg"
                    >
                        <ListView
                            layout="block"
                            withSpacingOpticalCorrection
                        >
                            <a href="https://go.ifrc.org/cookie-policy" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                Cookie Policy
                            </a>
                            <a href="https://go.ifrc.org/terms-and-conditions" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                Terms and Conditions
                            </a>
                        </ListView>
                    </Container>

                    <Container
                        heading="Helpful links"
                        spacing="lg"
                    >
                        <ListView
                            layout="block"
                            withSpacingOpticalCorrection
                        >
                            <a href="https://github.com/ifrcgo/go-web-app" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                Open Source Code
                            </a>
                            <a href="https://go.ifrc.org/api-docs" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                API Documentation
                            </a>
                            <a href="https://go.ifrc.org/other-resources" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                Other Resources
                            </a>
                            <a href="https://go.ifrc.org/wiki" target="_blank" rel="noreferrer" className={styles.footerLink}>
                                GO Wiki
                            </a>
                        </ListView>
                    </Container>

                    <Container
                        heading="Contact us"
                        spacing="lg"
                    >
                        <ListView
                            layout="block"
                            withSpacingOpticalCorrection
                        >
                            <a
                                href="mailto:im@ifrc.org"
                                className={styles.footerContactBtn}
                            >
                                im@ifrc.org
                            </a>
                            <ListView spacing="sm" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
                                <a
                                    className={styles.footerSocialIcon}
                                    href="https://medium.com/@IFRC_Go"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <SocialMediumIcon />
                                </a>
                                <a
                                    className={styles.footerSocialIcon}
                                    href="https://www.facebook.com/IFRC"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <SocialFacebookIcon />
                                </a>
                                <a
                                    className={styles.footerSocialIcon}
                                    href="https://www.youtube.com/user/ifrc"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <SocialYoutubeIcon />
                                </a>
                            </ListView>
                        </ListView>
                    </Container>
                </ListView>
            </PageContainer>
        </div>
    );
}

export default App;
