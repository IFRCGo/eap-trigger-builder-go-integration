import {
    Fragment,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    AddLineIcon,
    CheckboxMultipleBlankFillIcon,
    ShareFillIcon,
} from '@ifrc-go/icons';
import {
    Button,
    ConfirmButton,
    Container,
    InputSection,
    ListView,
    Message,
    Modal,
    PasswordInput,
    SelectInput,
    Tab,
    TabList,
    Tabs,
    TextArea,
} from '@ifrc-go/ui';
import { useTranslation } from '@ifrc-go/ui/hooks';

import CountrySelectInput from '#components/domain/CountrySelectInput';
import Page from '#components/Page';
import useCountry, { type Country } from '#hooks/domain/useCountry';
import useAlert from '#hooks/useAlert';
import useRouting from '#hooks/useRouting';

import getReferenceData, {
    clearPrototypeAccessCode,
    generateTriggerStatement,
    getPrototypeAccessCode,
    IncompleteGenerationError,
    PrototypeAccessError,
    setPrototypeAccessCode,
} from './api';
import {
    createBlankDraft,
    createBlankSource,
    createBlankTrigger,
    createPilotDraft,
    findPilotCountry,
    getDraftFingerprint,
    getGenerationValidationErrors,
    hasCompleteConnectors,
    removeSource,
    removeTrigger,
    resetTriggerGeographyForCountry,
    toDraftCountry,
} from './model';
import {
    loadTriggerBuilderDraft,
    saveTriggerBuilderDraft,
    shareTriggerBuilderDraft,
} from './persistence';
import TriggerCard from './TriggerCard';
import type {
    ForecastSource,
    PilotExample,
    ReferenceData,
    TriggerBuilderDraft,
    TriggerConnector,
    TriggerDraft,
} from './types';

import i18n from './i18n.json';

type ReferenceDataState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; data: ReferenceData };

const pilotKeySelector = (option: PilotExample) => option.documentId;
const pilotLabelSelector = (option: PilotExample) => option.documentName;
const connectorKeySelector = (option: { key: TriggerConnector; label: string }) => option.key;
const connectorLabelSelector = (option: { key: TriggerConnector; label: string }) => option.label;

function keepTriggerModelActive() {
    // The other Full EAP sections are orientation-only in this release.
}

// eslint-disable-next-line import/prefer-default-export
export function Component() {
    const strings = useTranslation(i18n);
    const alert = useAlert();
    const { navigate } = useRouting();
    const countries = useCountry();
    const [draftLoadResult] = useState(loadTriggerBuilderDraft);
    const [draft, setDraft] = useState<TriggerBuilderDraft>(() => (
        draftLoadResult.status === 'loaded'
            ? draftLoadResult.draft
            : createBlankDraft()
    ));
    const [savedDraft, setSavedDraft] = useState<TriggerBuilderDraft | undefined>(
        draftLoadResult.status === 'loaded' ? draftLoadResult.draft : undefined,
    );
    const [savedFingerprint, setSavedFingerprint] = useState(
        () => getDraftFingerprint(draft),
    );
    const [sharing, setSharing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generationFailed, setGenerationFailed] = useState(false);
    const [generationIncomplete, setGenerationIncomplete] = useState(false);
    const [validationAttempted, setValidationAttempted] = useState(false);
    const [accessCodePromptOpen, setAccessCodePromptOpen] = useState(false);
    const [accessCodeInput, setAccessCodeInput] = useState('');
    const generationControllerRef = useRef<AbortController | undefined>(undefined);
    const [activeGeographyTriggerId, setActiveGeographyTriggerId] = useState<
        string | undefined
    >();
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [referenceData, setReferenceData] = useState<ReferenceDataState>({ status: 'loading' });
    const isDirty = getDraftFingerprint(draft) !== savedFingerprint;
    const generationErrors = validationAttempted
        ? getGenerationValidationErrors(draft)
        : undefined;

    useEffect(() => {
        if (
            draftLoadResult.status === 'invalid'
            || draftLoadResult.status === 'unsupported'
        ) {
            alert.show(strings.savedDraftInvalidMessage, {
                name: 'eap-trigger-builder-draft-load',
                variant: 'danger',
            });
        } else if (draftLoadResult.status === 'unavailable') {
            alert.show(strings.storageUnavailableMessage, {
                name: 'eap-trigger-builder-draft-load',
                variant: 'danger',
            });
        }
    }, [
        alert,
        draftLoadResult.status,
        strings.savedDraftInvalidMessage,
        strings.storageUnavailableMessage,
    ]);

    useEffect(() => {
        if (!isDirty) {
            return undefined;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            // eslint-disable-next-line no-param-reassign
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    useEffect(() => {
        const controller = new AbortController();

        getReferenceData(controller.signal)
            .then((data) => setReferenceData({ status: 'ready', data }))
            .catch(() => {
                if (!controller.signal.aborted) {
                    setReferenceData({ status: 'error' });
                }
            });

        return () => controller.abort();
    }, [loadAttempt]);

    useEffect(() => () => {
        generationControllerRef.current?.abort();
        generationControllerRef.current = undefined;
    }, []);

    const connectorOptions = [
        { key: 'THEN' as const, label: strings.sequentialConnectorLabel },
        { key: 'OR' as const, label: strings.eitherConnectorLabel },
        { key: 'AND' as const, label: strings.bothConnectorLabel },
    ];
    const triggerCardStrings = {
        triggerCardHeading: strings.triggerCardHeading,
        removeTriggerButtonLabel: strings.removeTriggerButtonLabel,
        triggerLogicTitle: strings.triggerLogicTitle,
        triggerLogicDescription: strings.triggerLogicDescription,
        thresholdTypeLabel: strings.thresholdTypeLabel,
        thresholdTypePlaceholder: strings.thresholdTypePlaceholder,
        measureLabel: strings.measureLabel,
        measurePlaceholder: strings.measurePlaceholder,
        operatorLabel: strings.operatorLabel,
        operatorPlaceholder: strings.operatorPlaceholder,
        valueLabel: strings.valueLabel,
        unitLabel: strings.unitLabel,
        unitPlaceholder: strings.unitPlaceholder,
        leadTimeLabel: strings.leadTimeLabel,
        timeframeLabel: strings.timeframeLabel,
        timeframePlaceholder: strings.timeframePlaceholder,
        probabilityLabel: strings.probabilityLabel,
        generationNotesLabel: strings.generationNotesLabel,
        generationNotesPlaceholder: strings.generationNotesPlaceholder,
        geographyTitle: strings.geographyTitle,
        geographyDescription: strings.geographyDescription,
        geographyTypeLabel: strings.geographyTypeLabel,
        geographyLabel: strings.geographyLabel,
        geographyPlaceholder: strings.geographyPlaceholder,
        geographyConfirmedTitle: strings.geographyConfirmedTitle,
        geographyConfirmedDescription: strings.geographyConfirmedDescription,
        geographyUnverifiedTitle: strings.geographyUnverifiedTitle,
        geographyUnverifiedDescription: strings.geographyUnverifiedDescription,
        geographySelectButtonLabel: strings.geographySelectButtonLabel,
        geographyChangeButtonLabel: strings.geographyChangeButtonLabel,
        geographyReferencePinButtonLabel: strings.geographyReferencePinButtonLabel,
        geographyChangeReferencePinButtonLabel:
            strings.geographyChangeReferencePinButtonLabel,
        geographyCloseButtonLabel: strings.geographyCloseButtonLabel,
        geographyTextConfirmButtonLabel: strings.geographyTextConfirmButtonLabel,
        geographyDocumentConfirmedTitle: strings.geographyDocumentConfirmedTitle,
        geographyDocumentConfirmedDescription:
            strings.geographyDocumentConfirmedDescription,
        geographySelectorLoadingTitle: strings.geographySelectorLoadingTitle,
        geographySelectorLoadingDescription: strings.geographySelectorLoadingDescription,
        forecastSourcesTitle: strings.forecastSourcesTitle,
        forecastSourcesDescription: strings.forecastSourcesDescription,
        sourceNameLabel: strings.sourceNameLabel,
        sourceLinkLabel: strings.sourceLinkLabel,
        sourceLinkPlaceholder: strings.sourceLinkPlaceholder,
        removeSourceButtonLabel: strings.removeSourceButtonLabel,
        addSourceButtonLabel: strings.addSourceButtonLabel,
        requiredFieldError: strings.requiredFieldError,
    };
    const schema = referenceData.status === 'ready'
        ? referenceData.data.schema
        : undefined;

    const handleRetry = () => {
        setReferenceData({ status: 'loading' });
        setLoadAttempt((attempt) => attempt + 1);
    };

    const handlePilotChange = (pilotId: string | undefined) => {
        generationControllerRef.current?.abort();
        generationControllerRef.current = undefined;
        setGenerating(false);
        setGenerationFailed(false);
        setGenerationIncomplete(false);
        setValidationAttempted(false);
        if (referenceData.status !== 'ready' || !pilotId) {
            setDraft((currentDraft) => createBlankDraft(currentDraft.country));
            setActiveGeographyTriggerId(undefined);
            return;
        }

        const pilot = referenceData.data.examples.find(
            (example) => example.documentId === pilotId,
        );
        const pilotCountry = pilot
            ? findPilotCountry(pilot.documentName, countries)
            : undefined;
        setDraft(pilot
            ? createPilotDraft(pilot, pilotCountry)
            : createBlankDraft());
        setActiveGeographyTriggerId(undefined);
    };

    const handleCountryChange = (
        _: number | undefined,
        __: undefined,
        country: Country | undefined,
    ) => {
        const nextCountry = country ? toDraftCountry(country) : undefined;
        setDraft((currentDraft) => ({
            ...currentDraft,
            country: nextCountry,
            triggers: currentDraft.triggers.map((trigger) => (
                resetTriggerGeographyForCountry(trigger, nextCountry)
            )),
        }));
        setActiveGeographyTriggerId(undefined);
    };

    const handleTriggerChange = (triggerId: string, value: Partial<TriggerDraft>) => {
        if (value.geographyType === 'national') {
            setActiveGeographyTriggerId((activeId) => (
                activeId === triggerId ? undefined : activeId
            ));
        }
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: currentDraft.triggers.map((trigger) => (
                trigger.id === triggerId ? { ...trigger, ...value } : trigger
            )),
        }));
    };

    const handleConnectorChange = (
        triggerId: string,
        connector: TriggerConnector | undefined,
    ) => {
        setDraft((currentDraft) => {
            const triggers = currentDraft.triggers.map((trigger) => (
                trigger.id === triggerId
                    ? { ...trigger, connectorToNext: connector }
                    : trigger
            ));
            return {
                ...currentDraft,
                triggers,
                importedConnectorWarning: currentDraft.importedConnectorWarning
                    && !hasCompleteConnectors(triggers),
            };
        });
    };

    const handleSourceChange = (
        triggerId: string,
        sourceId: string,
        value: Partial<ForecastSource>,
    ) => {
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: currentDraft.triggers.map((trigger) => (
                trigger.id === triggerId
                    ? {
                        ...trigger,
                        sources: trigger.sources.map((source) => (
                            source.id === sourceId ? { ...source, ...value } : source
                        )),
                    }
                    : trigger
            )),
        }));
    };

    const handleSourceAdd = (triggerId: string) => {
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: currentDraft.triggers.map((trigger) => (
                trigger.id === triggerId
                    ? { ...trigger, sources: [...trigger.sources, createBlankSource()] }
                    : trigger
            )),
        }));
    };

    const handleSourceRemove = (triggerId: string, sourceId: string) => {
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: currentDraft.triggers.map((trigger) => (
                trigger.id === triggerId
                    ? { ...trigger, sources: removeSource(trigger.sources, sourceId) }
                    : trigger
            )),
        }));
    };

    const handleTriggerAdd = () => {
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: [...currentDraft.triggers, createBlankTrigger(currentDraft.country)],
        }));
    };

    const handleTriggerRemove = (triggerId: string) => {
        setActiveGeographyTriggerId((activeId) => (
            activeId === triggerId ? undefined : activeId
        ));
        setDraft((currentDraft) => {
            const triggers = removeTrigger(currentDraft.triggers, triggerId);
            return {
                ...currentDraft,
                triggers,
                importedConnectorWarning: currentDraft.importedConnectorWarning
                    && !hasCompleteConnectors(triggers),
            };
        });
    };

    const handleCancel = () => {
        generationControllerRef.current?.abort();
        generationControllerRef.current = undefined;
        setGenerating(false);
        setGenerationFailed(false);
        setGenerationIncomplete(false);
        setValidationAttempted(false);
        const restoredDraft = savedDraft ?? createBlankDraft();
        setDraft(restoredDraft);
        setSavedFingerprint(getDraftFingerprint(restoredDraft));
        setActiveGeographyTriggerId(undefined);
        if (isDirty) {
            alert.show(strings.cancelSuccessMessage, { variant: 'success' });
        }
    };

    const handleSaveAndClose = () => {
        const result = saveTriggerBuilderDraft(draft);
        if (result.status !== 'saved') {
            alert.show(strings.draftSaveErrorMessage, { variant: 'danger' });
            return;
        }

        setSavedDraft(result.draft);
        setSavedFingerprint(getDraftFingerprint(result.draft));
        alert.show(strings.draftSaveSuccessMessage, { variant: 'success' });
        navigate('home');
    };

    const handleShare = async () => {
        setSharing(true);
        try {
            const result = await shareTriggerBuilderDraft(draft, strings.shareDocumentTitle);

            if (result === 'web-share') {
                alert.show(strings.shareWebSuccessMessage, { variant: 'success' });
            } else if (result === 'clipboard') {
                alert.show(strings.shareClipboardSuccessMessage, { variant: 'success' });
            } else if (result === 'download') {
                alert.show(strings.shareDownloadSuccessMessage, { variant: 'success' });
            } else if (result === 'unavailable') {
                alert.show(strings.shareErrorMessage, { variant: 'danger' });
            }
        } catch {
            alert.show(strings.shareErrorMessage, { variant: 'danger' });
        } finally {
            setSharing(false);
        }
    };

    const requestGeneration = async (
        draftToGenerate: TriggerBuilderDraft,
        accessCode: string,
    ) => {
        if (generationControllerRef.current) {
            return;
        }

        const requestFingerprint = getDraftFingerprint(draftToGenerate);
        const controller = new AbortController();
        generationControllerRef.current = controller;
        setGenerating(true);
        setGenerationFailed(false);
        setGenerationIncomplete(false);

        try {
            const pilotName = draftToGenerate.selectedPilotName?.toLocaleLowerCase() ?? '';
            const hazardTypes = (schema?.hazardTypes ?? [])
                .filter((option) => pilotName.includes(option.label.toLocaleLowerCase()))
                .map((option) => option.key);
            const statement = await generateTriggerStatement(
                draftToGenerate,
                hazardTypes,
                accessCode,
                controller.signal,
            );
            if (generationControllerRef.current !== controller) {
                return;
            }
            setDraft((currentDraft) => (
                getDraftFingerprint(currentDraft) === requestFingerprint
                    ? {
                        ...currentDraft,
                        aiStatement: statement,
                        aiGeneratedAt: new Date().toISOString(),
                    }
                    : currentDraft
            ));
            setValidationAttempted(false);
        } catch (error) {
            if (generationControllerRef.current !== controller) {
                return;
            }
            setGenerationFailed(true);
            setGenerationIncomplete(error instanceof IncompleteGenerationError);
            if (error instanceof PrototypeAccessError) {
                clearPrototypeAccessCode();
                setAccessCodeInput('');
                setAccessCodePromptOpen(true);
            }
        } finally {
            if (generationControllerRef.current === controller) {
                generationControllerRef.current = undefined;
                setGenerating(false);
            }
        }
    };

    const startGeneration = (accessCode: string) => {
        setValidationAttempted(true);
        setGenerationFailed(false);
        setGenerationIncomplete(false);
        if (getGenerationValidationErrors(draft)) {
            return;
        }

        requestGeneration(draft, accessCode).catch(() => undefined);
    };

    const handleGenerate = () => {
        if (generationControllerRef.current) {
            return;
        }

        const accessCode = getPrototypeAccessCode();
        if (!accessCode) {
            setValidationAttempted(true);
            setGenerationFailed(false);
            setGenerationIncomplete(false);
            if (!getGenerationValidationErrors(draft)) {
                setAccessCodePromptOpen(true);
            }
            return;
        }

        startGeneration(accessCode);
    };

    const handleAccessCodePromptClose = () => {
        setAccessCodeInput('');
        setAccessCodePromptOpen(false);
    };

    const handleAccessCodeSubmit = () => {
        const accessCode = accessCodeInput.trim();
        if (!accessCode) {
            return;
        }

        setPrototypeAccessCode(accessCode);
        setAccessCodeInput('');
        setAccessCodePromptOpen(false);
        startGeneration(accessCode);
    };

    return (
        <>
            <Tabs
                value="triggerModel"
                onChange={keepTriggerModelActive}
                styleVariant="step"
            >
                <Page
                    title={strings.pageTitle}
                    heading={draft.selectedPilotName ?? strings.pageHeading}
                    description={strings.pageDescription}
                    withBackgroundColorInMainSection
                    actions={(
                        <>
                            {isDirty ? (
                                <ConfirmButton
                                    name={undefined}
                                    confirmMessage={strings.cancelConfirmMessage}
                                    onConfirm={handleCancel}
                                >
                                    {strings.cancelButtonLabel}
                                </ConfirmButton>
                            ) : (
                                <Button
                                    name={undefined}
                                    onClick={handleCancel}
                                >
                                    {strings.cancelButtonLabel}
                                </Button>
                            )}
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                onClick={handleSaveAndClose}
                            >
                                {strings.saveAndCloseButtonLabel}
                            </Button>
                            <Button
                                name={undefined}
                                before={<ShareFillIcon />}
                                onClick={handleShare}
                                disabled={sharing}
                            >
                                {strings.shareButtonLabel}
                            </Button>
                        </>
                    )}
                    info={(
                        <TabList>
                            <Tab name="overview" step={1} disabled>
                                {strings.overviewStepLabel}
                            </Tab>
                            <Tab name="riskAnalysis" step={2} disabled>
                                {strings.riskAnalysisStepLabel}
                            </Tab>
                            <Tab name="triggerModel" step={3}>
                                {strings.triggerModelStepLabel}
                            </Tab>
                            <Tab name="selectionActions" step={4} disabled>
                                {strings.selectionActionsStepLabel}
                            </Tab>
                            <Tab name="eapActivation" step={5} disabled>
                                {strings.activationProcessStepLabel}
                            </Tab>
                            <Tab name="meal" step={6} disabled>
                                {strings.mealStepLabel}
                            </Tab>
                            <Tab name="nationalSocietyCapacity" step={7} disabled>
                                {strings.nationalSocietyCapacityStepLabel}
                            </Tab>
                            <Tab name="financeLogistics" step={8} disabled>
                                {strings.financeLogisticsStepLabel}
                            </Tab>
                        </TabList>
                    )}
                >
                    <Container
                        heading={strings.triggerModelHeading}
                        headingLevel={2}
                        variant="form"
                        withBackground
                        withPadding
                        headerActions={(
                            <Button
                                name={undefined}
                                before={<CheckboxMultipleBlankFillIcon />}
                                disabled
                            >
                                {strings.sectionQualityCriteriaLabel}
                            </Button>
                        )}
                    >
                        <ListView
                            layout="block"
                            spacing="lg"
                        >
                            <InputSection
                                title={strings.pilotSelectionTitle}
                                description={strings.pilotSelectionDescription}
                                withFullWidthContent
                            >
                                {referenceData.status === 'loading' && (
                                    <Message
                                        pending
                                        title={strings.pilotLoadingTitle}
                                        description={strings.pilotLoadingDescription}
                                    />
                                )}
                                {referenceData.status === 'error' && (
                                    <Message
                                        variant="error"
                                        title={strings.pilotLoadErrorTitle}
                                        description={strings.pilotLoadErrorDescription}
                                        actions={(
                                            <Button
                                                name={undefined}
                                                onClick={handleRetry}
                                            >
                                                {strings.retryButtonLabel}
                                            </Button>
                                        )}
                                    />
                                )}
                                {referenceData.status === 'ready'
                                && referenceData.data.examples.length === 0 && (
                                    <Message
                                        title={strings.pilotEmptyTitle}
                                        description={strings.pilotEmptyDescription}
                                    />
                                )}
                                {referenceData.status === 'ready'
                                && referenceData.data.examples.length > 0 && (
                                    <SelectInput
                                        name={undefined}
                                        label={strings.pilotSelectLabel}
                                        placeholder={strings.pilotSelectPlaceholder}
                                        value={draft.selectedPilotId}
                                        options={referenceData.data.examples}
                                        keySelector={pilotKeySelector}
                                        labelSelector={pilotLabelSelector}
                                        onChange={handlePilotChange}
                                    />
                                )}
                            </InputSection>
                            <InputSection
                                title={strings.countrySelectLabel}
                                description={strings.countrySelectionDescription}
                                withFullWidthContent
                            >
                                <CountrySelectInput
                                    name={undefined}
                                    label={strings.countrySelectLabel}
                                    placeholder={strings.countrySelectPlaceholder}
                                    value={draft.country?.id}
                                    onChange={handleCountryChange}
                                    error={generationErrors?.country
                                        ? strings.requiredFieldError
                                        : undefined}
                                    required
                                />
                            </InputSection>
                            {draft.importedConnectorWarning && (
                                <Message
                                    title={strings.importedConnectorWarningTitle}
                                    description={strings.importedConnectorWarningDescription}
                                />
                            )}
                            {draft.triggers.map((trigger, index) => (
                                <Fragment key={trigger.id}>
                                    <TriggerCard
                                        strings={triggerCardStrings}
                                        index={index}
                                        trigger={trigger}
                                        country={draft.country}
                                        schema={schema}
                                        canRemove={index > 0}
                                        geographyOpen={activeGeographyTriggerId === trigger.id}
                                        errors={generationErrors?.triggers[trigger.id]}
                                        onChange={(value) => handleTriggerChange(trigger.id, value)}
                                        onRemove={() => handleTriggerRemove(trigger.id)}
                                        onToggleGeography={() => setActiveGeographyTriggerId(
                                            (activeId) => (
                                                activeId === trigger.id ? undefined : trigger.id
                                            ),
                                        )}
                                        onSourceChange={(sourceId, value) => (
                                            handleSourceChange(trigger.id, sourceId, value)
                                        )}
                                        onSourceAdd={() => handleSourceAdd(trigger.id)}
                                        onSourceRemove={(sourceId) => (
                                            handleSourceRemove(trigger.id, sourceId)
                                        )}
                                    />
                                    {index < draft.triggers.length - 1 && (
                                        <InputSection
                                            title={strings.connectorTitle}
                                            description={strings.connectorDescription}
                                            withFullWidthContent
                                        >
                                            <SelectInput
                                                name={undefined}
                                                label={strings.connectorLabel}
                                                placeholder={strings.connectorPlaceholder}
                                                value={trigger.connectorToNext}
                                                error={generationErrors?.connectors.has(trigger.id)
                                                    ? strings.connectorRequiredError
                                                    : undefined}
                                                required
                                                options={connectorOptions}
                                                keySelector={connectorKeySelector}
                                                labelSelector={connectorLabelSelector}
                                                onChange={(value) => (
                                                    handleConnectorChange(trigger.id, value)
                                                )}
                                            />
                                        </InputSection>
                                    )}
                                </Fragment>
                            ))}
                            <Button
                                name={undefined}
                                before={<AddLineIcon />}
                                onClick={handleTriggerAdd}
                            >
                                {strings.addTriggerButtonLabel}
                            </Button>
                            <InputSection
                                title={strings.triggerStatementTitle}
                                description={strings.triggerStatementDescription}
                                withFullWidthContent
                            >
                                <ListView
                                    layout="block"
                                    spacing="md"
                                >
                                    <TextArea
                                        name={undefined}
                                        label={strings.triggerStatementLabel}
                                        placeholder={strings.triggerStatementPlaceholder}
                                        rows={7}
                                        value={draft.aiStatement ?? ''}
                                        disabled={generating || draft.aiStatement === undefined}
                                        onChange={(value) => setDraft((currentDraft) => ({
                                            ...currentDraft,
                                            aiStatement: value ?? '',
                                        }))}
                                    />
                                    {generationErrors && (
                                        <Message
                                            compact
                                            variant="error"
                                            description={strings.generationValidationErrorMessage}
                                        />
                                    )}
                                    {generationFailed && (
                                        <Message
                                            compact
                                            variant="error"
                                            description={generationIncomplete
                                                ? strings.generationIncompleteMessage
                                                : strings.generationRetryMessage}
                                        />
                                    )}
                                    {generating && (
                                        <Message
                                            compact
                                            pending
                                            description={strings.generationProcessingMessage}
                                        />
                                    )}
                                    <Button
                                        name={undefined}
                                        styleVariant="filled"
                                        disabled={generating}
                                        onClick={handleGenerate}
                                    >
                                        {strings.generateButtonLabel}
                                    </Button>
                                </ListView>
                            </InputSection>
                        </ListView>
                    </Container>
                </Page>
            </Tabs>
            {accessCodePromptOpen && (
                <Modal
                    heading={strings.accessCodeModalHeading}
                    headerDescription={strings.accessCodeDescription}
                    onClose={handleAccessCodePromptClose}
                    size="sm"
                    footerActions={(
                        <ListView spacing="sm">
                            <Button
                                name={undefined}
                                onClick={handleAccessCodePromptClose}
                            >
                                {strings.cancelButtonLabel}
                            </Button>
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                disabled={!accessCodeInput.trim()}
                                onClick={handleAccessCodeSubmit}
                            >
                                {strings.accessCodeContinueButtonLabel}
                            </Button>
                        </ListView>
                    )}
                    withHeaderBorder
                    withFooterBorder
                >
                    <PasswordInput
                        name={undefined}
                        label={strings.accessCodeInputLabel}
                        value={accessCodeInput}
                        onChange={(value) => setAccessCodeInput(value ?? '')}
                        autoFocus
                        required
                    />
                </Modal>
            )}
        </>
    );
}

Component.displayName = 'EapTriggerBuilder';
