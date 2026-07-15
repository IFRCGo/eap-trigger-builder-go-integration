import {
    Fragment,
    useEffect,
    useState,
} from 'react';
import {
    AddLineIcon,
    CheckboxMultipleBlankFillIcon,
    ShareFillIcon,
} from '@ifrc-go/icons';
import {
    Button,
    Container,
    InputSection,
    ListView,
    Message,
    SelectInput,
    Tab,
    TabList,
    Tabs,
} from '@ifrc-go/ui';
import { useTranslation } from '@ifrc-go/ui/hooks';

import Page from '#components/Page';

import getReferenceData from './api';
import {
    createBlankDraft,
    createBlankSource,
    createBlankTrigger,
    createPilotDraft,
    hasCompleteConnectors,
    removeSource,
    removeTrigger,
} from './model';
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
    const [draft, setDraft] = useState<TriggerBuilderDraft>(createBlankDraft);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [referenceData, setReferenceData] = useState<ReferenceDataState>({ status: 'loading' });

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
        geographyTitle: strings.geographyTitle,
        geographyDescription: strings.geographyDescription,
        geographyTypeLabel: strings.geographyTypeLabel,
        geographyLabel: strings.geographyLabel,
        geographyPlaceholder: strings.geographyPlaceholder,
        geographyUnverifiedTitle: strings.geographyUnverifiedTitle,
        geographyUnverifiedDescription: strings.geographyUnverifiedDescription,
        forecastSourcesTitle: strings.forecastSourcesTitle,
        forecastSourcesDescription: strings.forecastSourcesDescription,
        sourceNameLabel: strings.sourceNameLabel,
        sourceLinkLabel: strings.sourceLinkLabel,
        sourceLinkPlaceholder: strings.sourceLinkPlaceholder,
        removeSourceButtonLabel: strings.removeSourceButtonLabel,
        addSourceButtonLabel: strings.addSourceButtonLabel,
    };
    const schema = referenceData.status === 'ready'
        ? referenceData.data.schema
        : undefined;

    const handleRetry = () => {
        setReferenceData({ status: 'loading' });
        setLoadAttempt((attempt) => attempt + 1);
    };

    const handlePilotChange = (pilotId: string | undefined) => {
        if (referenceData.status !== 'ready' || !pilotId) {
            setDraft(createBlankDraft());
            return;
        }

        const pilot = referenceData.data.examples.find(
            (example) => example.documentId === pilotId,
        );
        setDraft(pilot ? createPilotDraft(pilot) : createBlankDraft());
    };

    const handleTriggerChange = (triggerId: string, value: Partial<TriggerDraft>) => {
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: currentDraft.triggers.map((trigger) => (
                trigger.id === triggerId ? { ...trigger, ...value } : trigger
            )),
            aiStatement: undefined,
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
                aiStatement: undefined,
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
            aiStatement: undefined,
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
            aiStatement: undefined,
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
            aiStatement: undefined,
        }));
    };

    const handleTriggerAdd = () => {
        setDraft((currentDraft) => ({
            ...currentDraft,
            triggers: [...currentDraft.triggers, createBlankTrigger()],
            aiStatement: undefined,
        }));
    };

    const handleTriggerRemove = (triggerId: string) => {
        setDraft((currentDraft) => {
            const triggers = removeTrigger(currentDraft.triggers, triggerId);
            return {
                ...currentDraft,
                triggers,
                importedConnectorWarning: currentDraft.importedConnectorWarning
                    && !hasCompleteConnectors(triggers),
                aiStatement: undefined,
            };
        });
    };

    return (
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
                        <Button
                            name={undefined}
                            disabled
                        >
                            {strings.cancelButtonLabel}
                        </Button>
                        <Button
                            name={undefined}
                            styleVariant="filled"
                            disabled
                        >
                            {strings.saveAndCloseButtonLabel}
                        </Button>
                        <Button
                            name={undefined}
                            before={<ShareFillIcon />}
                            disabled
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
                                    schema={schema}
                                    canRemove={index > 0}
                                    onChange={(value) => handleTriggerChange(trigger.id, value)}
                                    onRemove={() => handleTriggerRemove(trigger.id)}
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
                    </ListView>
                </Container>
            </Page>
        </Tabs>
    );
}

Component.displayName = 'EapTriggerBuilder';
