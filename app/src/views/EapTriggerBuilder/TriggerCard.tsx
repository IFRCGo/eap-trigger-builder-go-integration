import {
    Fragment,
    lazy,
    Suspense,
} from 'react';
import {
    AddLineIcon,
    DeleteBinLineIcon,
} from '@ifrc-go/icons';
import {
    Button,
    Container,
    InputSection,
    ListView,
    Message,
    NumberInput,
    SelectInput,
    TextArea,
    TextInput,
} from '@ifrc-go/ui';

import {
    changeGeographyType,
    includeCurrentOption,
} from './model';
import type {
    DraftCountry,
    ForecastSource,
    Option,
    TriggerBuilderSchema,
    TriggerDraft,
    TriggerGenerationErrors,
} from './types';

import styles from './TriggerCard.module.css';

const GeographySelector = lazy(() => import('./GeographySelector'));

const optionKeySelector = (option: Option) => option.key;
const optionLabelSelector = (option: Option) => option.label;

interface Props {
    strings: {
        triggerCardHeading: string;
        removeTriggerButtonLabel: string;
        triggerLogicTitle: string;
        triggerLogicDescription: string;
        thresholdTypeLabel: string;
        thresholdTypePlaceholder: string;
        measureLabel: string;
        measurePlaceholder: string;
        operatorLabel: string;
        operatorPlaceholder: string;
        valueLabel: string;
        unitLabel: string;
        unitPlaceholder: string;
        leadTimeLabel: string;
        timeframeLabel: string;
        timeframePlaceholder: string;
        probabilityLabel: string;
        generationNotesLabel: string;
        generationNotesPlaceholder: string;
        geographyTitle: string;
        geographyDescription: string;
        geographyTypeLabel: string;
        geographyLabel: string;
        geographyPlaceholder: string;
        geographyConfirmedTitle: string;
        geographyConfirmedDescription: string;
        geographyUnverifiedTitle: string;
        geographyUnverifiedDescription: string;
        geographySelectButtonLabel: string;
        geographyChangeButtonLabel: string;
        geographyReferencePinButtonLabel: string;
        geographyChangeReferencePinButtonLabel: string;
        geographyCloseButtonLabel: string;
        geographyTextConfirmButtonLabel: string;
        geographyDocumentConfirmedTitle: string;
        geographyDocumentConfirmedDescription: string;
        geographySelectorLoadingTitle: string;
        geographySelectorLoadingDescription: string;
        forecastSourcesTitle: string;
        forecastSourcesDescription: string;
        sourceNameLabel: string;
        sourceLinkLabel: string;
        sourceLinkPlaceholder: string;
        removeSourceButtonLabel: string;
        addSourceButtonLabel: string;
        requiredFieldError: string;
    };
    index: number;
    trigger: TriggerDraft;
    country: DraftCountry | undefined;
    schema: TriggerBuilderSchema | undefined;
    canRemove: boolean;
    geographyOpen: boolean;
    errors: TriggerGenerationErrors | undefined;
    onChange: (value: Partial<TriggerDraft>) => void;
    onRemove: () => void;
    onSourceChange: (sourceId: string, value: Partial<ForecastSource>) => void;
    onSourceAdd: () => void;
    onSourceRemove: (sourceId: string) => void;
    onToggleGeography: () => void;
}

function TriggerCard(props: Props) {
    const {
        strings,
        index,
        trigger,
        country,
        schema,
        canRemove,
        geographyOpen,
        errors,
        onChange,
        onRemove,
        onSourceChange,
        onSourceAdd,
        onSourceRemove,
        onToggleGeography,
    } = props;
    const thresholdTypeOptions = includeCurrentOption(
        schema?.primaryVariables ?? [],
        trigger.canonicalVariable,
    );
    const measureOptions = includeCurrentOption(
        schema?.subcategoriesByVariable[trigger.canonicalVariable] ?? [],
        trigger.subcategory,
    );
    const operatorOptions = includeCurrentOption(
        schema?.operatorsByVariable[trigger.canonicalVariable] ?? [],
        trigger.operator,
    );
    const unitOptions = includeCurrentOption(
        schema?.unitsByVariable[trigger.canonicalVariable] ?? [],
        trigger.thresholdUnit,
    );
    const timeframeOptions = includeCurrentOption(
        schema?.timeframeUnits ?? [],
        trigger.timeframeUnit,
    );
    const geographyOptions = includeCurrentOption(
        schema?.geographyTypes ?? [],
        trigger.geographyType,
    );
    const isDocumentGeography = trigger.geographySource === 'pilot_document';
    let geographyButtonLabel = strings.geographySelectButtonLabel;
    if (geographyOpen) {
        geographyButtonLabel = strings.geographyCloseButtonLabel;
    } else if (isDocumentGeography && trigger.geographyCoordinates) {
        geographyButtonLabel = strings.geographyChangeReferencePinButtonLabel;
    } else if (isDocumentGeography) {
        geographyButtonLabel = strings.geographyReferencePinButtonLabel;
    } else if (trigger.geographyConfirmed) {
        geographyButtonLabel = strings.geographyChangeButtonLabel;
    }
    let geographyMessageTitle = strings.geographyUnverifiedTitle;
    let geographyMessageDescription = strings.geographyUnverifiedDescription;
    if (trigger.geographyConfirmed) {
        geographyMessageTitle = isDocumentGeography
            ? strings.geographyDocumentConfirmedTitle
            : strings.geographyConfirmedTitle;
        geographyMessageDescription = isDocumentGeography
            ? strings.geographyDocumentConfirmedDescription
            : strings.geographyConfirmedDescription;
    }

    return (
        <Container
            heading={`${strings.triggerCardHeading} ${index + 1}`}
            headingLevel={4}
            withBackground
            withBorder
            withPadding
            headerActions={canRemove ? (
                <Button
                    name={undefined}
                    styleVariant="transparent"
                    before={<DeleteBinLineIcon />}
                    onClick={onRemove}
                >
                    {strings.removeTriggerButtonLabel}
                </Button>
            ) : undefined}
        >
            <ListView
                layout="block"
                spacing="lg"
            >
                <InputSection
                    title={strings.triggerLogicTitle}
                    description={strings.triggerLogicDescription}
                    withAsteriskOnTitle
                    numPreferredColumns={3}
                >
                    {thresholdTypeOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.thresholdTypeLabel}
                            placeholder={strings.thresholdTypePlaceholder}
                            error={errors?.canonicalVariable
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.canonicalVariable || undefined}
                            options={thresholdTypeOptions}
                            keySelector={optionKeySelector}
                            labelSelector={optionLabelSelector}
                            onChange={(value) => onChange({
                                canonicalVariable: value ?? '',
                                subcategory: '',
                                operator: '',
                                thresholdUnit: '',
                            })}
                        />
                    ) : (
                        <TextInput
                            name={undefined}
                            label={strings.thresholdTypeLabel}
                            error={errors?.canonicalVariable
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.canonicalVariable}
                            onChange={(value) => onChange({ canonicalVariable: value ?? '' })}
                        />
                    )}
                    {measureOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.measureLabel}
                            placeholder={strings.measurePlaceholder}
                            error={errors?.subcategory
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.subcategory || undefined}
                            options={measureOptions}
                            keySelector={optionKeySelector}
                            labelSelector={optionLabelSelector}
                            onChange={(value) => onChange({ subcategory: value ?? '' })}
                        />
                    ) : (
                        <TextInput
                            name={undefined}
                            label={strings.measureLabel}
                            error={errors?.subcategory
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.subcategory}
                            onChange={(value) => onChange({ subcategory: value ?? '' })}
                        />
                    )}
                    {operatorOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.operatorLabel}
                            placeholder={strings.operatorPlaceholder}
                            error={errors?.operator
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.operator || undefined}
                            options={operatorOptions}
                            keySelector={optionKeySelector}
                            labelSelector={optionLabelSelector}
                            onChange={(value) => onChange({ operator: value ?? '' })}
                        />
                    ) : (
                        <TextInput
                            name={undefined}
                            label={strings.operatorLabel}
                            error={errors?.operator
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.operator}
                            onChange={(value) => onChange({ operator: value ?? '' })}
                        />
                    )}
                    <TextInput
                        name={undefined}
                        label={strings.valueLabel}
                        error={errors?.thresholdValue
                            ? strings.requiredFieldError
                            : undefined}
                        required
                        value={trigger.thresholdValue}
                        onChange={(value) => onChange({ thresholdValue: value ?? '' })}
                    />
                    {unitOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.unitLabel}
                            placeholder={strings.unitPlaceholder}
                            error={errors?.thresholdUnit
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.thresholdUnit || undefined}
                            options={unitOptions}
                            keySelector={optionKeySelector}
                            labelSelector={optionLabelSelector}
                            onChange={(value) => onChange({ thresholdUnit: value ?? '' })}
                        />
                    ) : (
                        <TextInput
                            name={undefined}
                            label={strings.unitLabel}
                            error={errors?.thresholdUnit
                                ? strings.requiredFieldError
                                : undefined}
                            required
                            value={trigger.thresholdUnit}
                            onChange={(value) => onChange({ thresholdUnit: value ?? '' })}
                        />
                    )}
                    <TextInput
                        name={undefined}
                        label={strings.leadTimeLabel}
                        placeholder="e.g. 3-5 or 5"
                        value={trigger.leadTimeValue !== undefined
                            ? String(trigger.leadTimeValue)
                            : ''}
                        onChange={(value) => onChange({ leadTimeValue: value ?? '' })}
                    />
                    {timeframeOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.timeframeLabel}
                            placeholder={strings.timeframePlaceholder}
                            value={trigger.timeframeUnit || undefined}
                            options={timeframeOptions}
                            keySelector={optionKeySelector}
                            labelSelector={optionLabelSelector}
                            onChange={(value) => onChange({ timeframeUnit: value ?? '' })}
                        />
                    ) : (
                        <TextInput
                            name={undefined}
                            label={strings.timeframeLabel}
                            value={trigger.timeframeUnit}
                            onChange={(value) => onChange({ timeframeUnit: value ?? '' })}
                        />
                    )}
                    <NumberInput
                        name={undefined}
                        label={strings.probabilityLabel}
                        value={trigger.probabilityValue}
                        min={0}
                        max={100}
                        onChange={(value) => onChange({ probabilityValue: value })}
                    />
                    <TextArea
                        name={undefined}
                        label={strings.generationNotesLabel}
                        placeholder={strings.generationNotesPlaceholder}
                        rows={5}
                        value={trigger.generationNotes ?? ''}
                        onChange={(value) => onChange({ generationNotes: value ?? '' })}
                    />
                </InputSection>
                <InputSection
                    title={strings.geographyTitle}
                    description={strings.geographyDescription}
                    withFullWidthContent
                >
                    <div className={styles.geographyContent}>
                        <div className={styles.geographyFields}>
                            {geographyOptions.length > 0 ? (
                                <SelectInput
                                    name={undefined}
                                    label={strings.geographyTypeLabel}
                                    value={trigger.geographyType || undefined}
                                    options={geographyOptions}
                                    keySelector={optionKeySelector}
                                    labelSelector={optionLabelSelector}
                                    onChange={(value) => onChange(
                                        changeGeographyType(value ?? '', country),
                                    )}
                                />
                            ) : (
                                <TextInput
                                    name={undefined}
                                    label={strings.geographyTypeLabel}
                                    value={trigger.geographyType}
                                    onChange={(value) => onChange(
                                        changeGeographyType(value ?? '', country),
                                    )}
                                />
                            )}
                            <TextArea
                                name={undefined}
                                label={strings.geographyLabel}
                                placeholder={strings.geographyPlaceholder}
                                rows={3}
                                value={trigger.geographyLabel}
                                onChange={(value) => {
                                    const geographyLabel = value ?? '';
                                    onChange({
                                        geographyLabel,
                                        geographyFeatureId: geographyLabel
                                            ? trigger.geographyFeatureId
                                            : undefined,
                                        geographyCoordinates: geographyLabel
                                            ? trigger.geographyCoordinates
                                            : undefined,
                                        geographySource: geographyLabel
                                            ? 'pilot_document'
                                            : undefined,
                                        geographyConfirmed: false,
                                    });
                                }}
                                disabled={trigger.geographyType === 'national'}
                            />
                        </div>
                        <Message
                            variant={errors?.geography ? 'error' : undefined}
                            title={geographyMessageTitle}
                            description={geographyMessageDescription}
                            compact
                        />
                        {trigger.geographyType !== 'national' && (
                            <div className={styles.geographyActions}>
                                {(isDocumentGeography || !trigger.geographyConfirmed) && (
                                    <Button
                                        name={undefined}
                                        styleVariant="filled"
                                        disabled={
                                            !trigger.geographyLabel.trim()
                                            || (
                                                isDocumentGeography
                                                && trigger.geographyConfirmed
                                            )
                                        }
                                        onClick={() => onChange({
                                            geographySource: 'pilot_document',
                                            geographyConfirmed: true,
                                        })}
                                    >
                                        {strings.geographyTextConfirmButtonLabel}
                                    </Button>
                                )}
                                <Button
                                    name={undefined}
                                    styleVariant={geographyOpen ? 'outline' : 'filled'}
                                    onClick={onToggleGeography}
                                >
                                    {geographyButtonLabel}
                                </Button>
                            </div>
                        )}
                        {geographyOpen && trigger.geographyType !== 'national' && (
                            <Suspense
                                fallback={(
                                    <Message
                                        pending
                                        title={strings.geographySelectorLoadingTitle}
                                        description={strings.geographySelectorLoadingDescription}
                                    />
                                )}
                            >
                                <GeographySelector
                                    country={country}
                                    trigger={trigger}
                                    onChange={onChange}
                                />
                            </Suspense>
                        )}
                    </div>
                </InputSection>
                <InputSection
                    title={strings.forecastSourcesTitle}
                    description={strings.forecastSourcesDescription}
                    numPreferredColumns={3}
                >
                    {trigger.sources.map((source, sourceIndex) => (
                        <Fragment key={source.id}>
                            <TextInput
                                name={undefined}
                                label={`${strings.sourceNameLabel} ${sourceIndex + 1}`}
                                value={source.name}
                                onChange={(value) => onSourceChange(
                                    source.id,
                                    { name: value ?? '' },
                                )}
                            />
                            <TextInput
                                name={undefined}
                                label={strings.sourceLinkLabel}
                                placeholder={strings.sourceLinkPlaceholder}
                                value={source.link}
                                onChange={(value) => onSourceChange(
                                    source.id,
                                    { link: value ?? '' },
                                )}
                            />
                            {sourceIndex > 0 ? (
                                <Button
                                    name={undefined}
                                    styleVariant="transparent"
                                    before={<DeleteBinLineIcon />}
                                    onClick={() => onSourceRemove(source.id)}
                                >
                                    {strings.removeSourceButtonLabel}
                                </Button>
                            ) : <span />}
                        </Fragment>
                    ))}
                    <Button
                        name={undefined}
                        before={<AddLineIcon />}
                        onClick={onSourceAdd}
                    >
                        {strings.addSourceButtonLabel}
                    </Button>
                </InputSection>
            </ListView>
        </Container>
    );
}

export default TriggerCard;
