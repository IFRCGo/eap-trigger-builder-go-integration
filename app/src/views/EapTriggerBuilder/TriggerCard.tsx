import { Fragment } from 'react';
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
    TextInput,
} from '@ifrc-go/ui';

import { includeCurrentOption } from './model';
import type {
    ForecastSource,
    Option,
    TriggerBuilderSchema,
    TriggerDraft,
} from './types';

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
        geographyTitle: string;
        geographyDescription: string;
        geographyTypeLabel: string;
        geographyLabel: string;
        geographyPlaceholder: string;
        geographyUnverifiedTitle: string;
        geographyUnverifiedDescription: string;
        forecastSourcesTitle: string;
        forecastSourcesDescription: string;
        sourceNameLabel: string;
        sourceLinkLabel: string;
        sourceLinkPlaceholder: string;
        removeSourceButtonLabel: string;
        addSourceButtonLabel: string;
    };
    index: number;
    trigger: TriggerDraft;
    schema: TriggerBuilderSchema | undefined;
    canRemove: boolean;
    onChange: (value: Partial<TriggerDraft>) => void;
    onRemove: () => void;
    onSourceChange: (sourceId: string, value: Partial<ForecastSource>) => void;
    onSourceAdd: () => void;
    onSourceRemove: (sourceId: string) => void;
}

function TriggerCard(props: Props) {
    const {
        strings,
        index,
        trigger,
        schema,
        canRemove,
        onChange,
        onRemove,
        onSourceChange,
        onSourceAdd,
        onSourceRemove,
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
                            value={trigger.canonicalVariable}
                            onChange={(value) => onChange({ canonicalVariable: value ?? '' })}
                        />
                    )}
                    {measureOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.measureLabel}
                            placeholder={strings.measurePlaceholder}
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
                            value={trigger.subcategory}
                            onChange={(value) => onChange({ subcategory: value ?? '' })}
                        />
                    )}
                    {operatorOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.operatorLabel}
                            placeholder={strings.operatorPlaceholder}
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
                            value={trigger.operator}
                            onChange={(value) => onChange({ operator: value ?? '' })}
                        />
                    )}
                    <TextInput
                        name={undefined}
                        label={strings.valueLabel}
                        value={trigger.thresholdValue}
                        onChange={(value) => onChange({ thresholdValue: value ?? '' })}
                    />
                    {unitOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.unitLabel}
                            placeholder={strings.unitPlaceholder}
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
                            value={trigger.thresholdUnit}
                            onChange={(value) => onChange({ thresholdUnit: value ?? '' })}
                        />
                    )}
                    <NumberInput
                        name={undefined}
                        label={strings.leadTimeLabel}
                        value={trigger.leadTimeValue}
                        min={0}
                        onChange={(value) => onChange({ leadTimeValue: value })}
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
                </InputSection>
                <InputSection
                    title={strings.geographyTitle}
                    description={strings.geographyDescription}
                    numPreferredColumns={2}
                >
                    {geographyOptions.length > 0 ? (
                        <SelectInput
                            name={undefined}
                            label={strings.geographyTypeLabel}
                            value={trigger.geographyType || undefined}
                            options={geographyOptions}
                            keySelector={optionKeySelector}
                            labelSelector={optionLabelSelector}
                            onChange={(value) => onChange({
                                geographyType: value ?? '',
                                geographyConfirmed: value === 'national',
                            })}
                        />
                    ) : (
                        <TextInput
                            name={undefined}
                            label={strings.geographyTypeLabel}
                            value={trigger.geographyType}
                            onChange={(value) => onChange({
                                geographyType: value ?? '',
                                geographyConfirmed: value === 'national',
                            })}
                        />
                    )}
                    <TextInput
                        name={undefined}
                        label={strings.geographyLabel}
                        placeholder={strings.geographyPlaceholder}
                        value={trigger.geographyLabel}
                        disabled={trigger.geographyType === 'national'}
                        onChange={(value) => onChange({
                            geographyLabel: value ?? '',
                            geographyConfirmed: false,
                        })}
                    />
                    {trigger.geographyType !== 'national' && (
                        <Message
                            title={strings.geographyUnverifiedTitle}
                            description={strings.geographyUnverifiedDescription}
                            compact
                        />
                    )}
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
