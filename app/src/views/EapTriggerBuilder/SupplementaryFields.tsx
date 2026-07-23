import { useState } from 'react';
import {
    AddLineIcon,
    DeleteBinTwoLineIcon,
} from '@ifrc-go/icons';
import {
    Button,
    Container,
    Description,
    IconButton,
    InlineLayout,
    InlineView,
    InputSection,
    Label,
    ListView,
    RawFileInput,
    TextArea,
    TextInput,
} from '@ifrc-go/ui';
import { useTranslation } from '@ifrc-go/ui/hooks';

import Admin2Input from '#components/domain/Admin2Input';
import ExplanatoryNote from '#components/ExplanatoryNote';
import Link from '#components/Link';
import { api } from '#config';
import { resolveUrl } from '#utils/resolveUrl';

import { charLimits } from '../EapFullForm/common';

import triggerModelI18n from '../EapFullForm/TriggerModel/i18n.json';
import builderI18n from './i18n.json';

const forecastTableUrl = resolveUrl(api, 'static/files/eap/forecasts_table.docx');

interface GuidanceNoteProps {
    explanatoryNote: string;
    requiredPoints: string[];
    title: string;
}

function GuidanceNote(props: GuidanceNoteProps) {
    const {
        explanatoryNote,
        requiredPoints,
        title,
    } = props;
    const strings = useTranslation(triggerModelI18n);

    return (
        <ExplanatoryNote
            heading={title}
            ariaLabel={title}
            title={title}
            content={(
                <ListView layout="block">
                    <ListView spacing="xs" layout="block" withSpacingOpticalCorrection>
                        <Label strong>
                            {strings.triggerExplanatoryNoteLabel}
                        </Label>
                        <Description>
                            {explanatoryNote}
                        </Description>
                    </ListView>
                    <ListView spacing="xs" layout="block" withSpacingOpticalCorrection>
                        <Label strong>
                            {strings.triggerRequiredPointsLabel}
                        </Label>
                        <Description>
                            <ul>
                                {requiredPoints.map((point) => (
                                    <li key={point}>{point}</li>
                                ))}
                            </ul>
                        </Description>
                    </ListView>
                </ListView>
            )}
        />
    );
}

interface LocalMultipleFileInputProps {
    accept?: string;
    description?: string;
    label: string;
    maxFiles?: number;
}

function LocalMultipleFileInput(props: LocalMultipleFileInputProps) {
    const {
        accept,
        description,
        label,
        maxFiles,
    } = props;
    const strings = useTranslation(builderI18n);
    const [files, setFiles] = useState<File[]>([]);

    return (
        <ListView layout="block" spacing="xs">
            <InlineLayout
                before={(
                    <RawFileInput
                        name={undefined}
                        accept={accept}
                        multiple
                        onChange={(selectedFiles) => setFiles(
                            maxFiles
                                ? (selectedFiles ?? []).slice(0, maxFiles)
                                : selectedFiles ?? [],
                        )}
                        colorVariant="primary"
                        styleVariant="outline"
                    >
                        {label}
                    </RawFileInput>
                )}
                contentAlignment="start"
            >
                {files.length > 0
                    ? files.map((file) => file.name).join(', ')
                    : strings.noFileSelectedLabel}
            </InlineLayout>
            {description && <Description>{description}</Description>}
        </ListView>
    );
}

interface LocalSingleFileInputProps {
    accept?: string;
    label: string;
}

function LocalSingleFileInput(props: LocalSingleFileInputProps) {
    const { accept, label } = props;
    const strings = useTranslation(builderI18n);
    const [file, setFile] = useState<File>();

    return (
        <InlineLayout
            before={(
                <RawFileInput
                    name={undefined}
                    accept={accept}
                    onChange={setFile}
                    colorVariant="primary"
                    styleVariant="outline"
                >
                    {label}
                </RawFileInput>
            )}
            contentAlignment="start"
        >
            {file?.name ?? strings.noFileSelectedLabel}
        </InlineLayout>
    );
}

interface SourceInformation {
    id: string;
    link: string;
    name: string;
}

interface Props {
    countryId: number | undefined;
    onSave: () => void;
}

function SupplementaryFields(props: Props) {
    const { countryId, onSave } = props;
    const strings = useTranslation(triggerModelI18n);
    const builderStrings = useTranslation(builderI18n);
    const [forecastSelection, setForecastSelection] = useState('');
    const [impactLevelJustification, setImpactLevelJustification] = useState('');
    const [interventionArea, setInterventionArea] = useState('');
    const [admin2, setAdmin2] = useState<number[]>([]);
    const [sources, setSources] = useState<SourceInformation[]>([]);

    const updateSource = (sourceId: string, value: Partial<SourceInformation>) => {
        setSources((currentSources) => currentSources.map((source) => (
            source.id === sourceId ? { ...source, ...value } : source
        )));
    };

    return (
        <ListView layout="block" spacing="lg">
            <InputSection
                title={strings.forecastSelectionTitle}
                headerActions={(
                    <GuidanceNote
                        title={strings.forecastSelectionTitle}
                        explanatoryNote={strings.forecastExplanatoryNote}
                        requiredPoints={[
                            strings.forecastRequiredPoint1,
                            strings.forecastRequiredPoint2,
                        ]}
                    />
                )}
                description={strings.forecastSelectionDescription}
                withAsteriskOnTitle
            >
                <TextArea
                    label={strings.triggerModelDescriptionLabel}
                    name={undefined}
                    value={forecastSelection}
                    onChange={(value) => setForecastSelection(value ?? '')}
                    maxLength={charLimits.forecast_selection}
                />
                <LocalMultipleFileInput
                    accept="image/*"
                    label={strings.triggerSelectImagesLabel}
                    maxFiles={5}
                    description={strings.triggerModelImagesCountLabel}
                />
            </InputSection>
            <InputSection
                title={strings.forecastTableDetails}
                description={(
                    <Link
                        external
                        href={forecastTableUrl}
                        withUnderline
                        withLinkIcon
                    >
                        {strings.downloadForecastTableLabel}
                    </Link>
                )}
                withAsteriskOnTitle
            >
                <LocalSingleFileInput
                    accept=".docx"
                    label={strings.triggerUploadTableLabel}
                />
            </InputSection>
            <InputSection
                title={strings.definitionJustificationTitle}
                headerActions={(
                    <GuidanceNote
                        title={strings.definitionJustificationTitle}
                        explanatoryNote={strings.definitionJustificationExplanatoryNote}
                        requiredPoints={[
                            strings.definitionRequiredPoint1,
                            strings.definitionRequiredPoint2,
                            strings.definitionRequiredPoint3,
                            strings.definitionRequiredPoint4,
                        ]}
                    />
                )}
                description={(
                    <ul>
                        <li>{strings.definitionJustificationDescription1}</li>
                        <li>{strings.definitionJustificationDescription2}</li>
                        <li>{strings.definitionJustificationDescription3}</li>
                        <li>{strings.definitionJustificationDescription4}</li>
                        <li>{strings.definitionJustificationDescription5}</li>
                    </ul>
                )}
                withAsteriskOnTitle
            >
                <TextArea
                    label={strings.triggerModelDescriptionLabel}
                    name={undefined}
                    value={impactLevelJustification}
                    onChange={(value) => setImpactLevelJustification(value ?? '')}
                    maxLength={charLimits.definition_and_justification_impact_level}
                />
                <LocalMultipleFileInput
                    accept="image/*"
                    label={strings.triggerSelectImagesLabel}
                    maxFiles={5}
                    description={strings.triggerModelImagesCountLabel}
                />
            </InputSection>
            <InputSection
                title={strings.identificationInterventionTitle}
                headerActions={(
                    <GuidanceNote
                        title={strings.identificationInterventionTitle}
                        explanatoryNote={strings.identificationInterventionExplanatoryNote}
                        requiredPoints={[
                            strings.identificationRequiredPoint1,
                            strings.identificationRequiredPoint2,
                            strings.identificationRequiredPoint3,
                        ]}
                    />
                )}
                description={(
                    <ul>
                        <li>{strings.identificationInterventionDescription1}</li>
                        <li>{strings.identificationInterventionDescription2}</li>
                        <li>{strings.identificationInterventionDescription3}</li>
                    </ul>
                )}
                withAsteriskOnTitle
            >
                <TextArea
                    label={strings.triggerModelDescriptionLabel}
                    name={undefined}
                    value={interventionArea}
                    onChange={(value) => setInterventionArea(value ?? '')}
                    maxLength={charLimits.identification_of_the_intervention_area}
                />
                <LocalMultipleFileInput
                    accept="image/*"
                    label={strings.triggerSelectImagesLabel}
                    maxFiles={5}
                    description={strings.triggerModelImagesCountLabel}
                />
            </InputSection>
            <InputSection
                title={strings.selectRegionTitle}
                description={strings.selectRegionDescription}
                withAsteriskOnTitle
            >
                {countryId && (
                    <Admin2Input
                        name={undefined}
                        onChange={(value) => setAdmin2(value ?? [])}
                        value={admin2}
                        countryId={countryId}
                    />
                )}
            </InputSection>
            <InputSection
                title={strings.attachRelevantFilesTitle}
                description={strings.attachRelevantFilesDescription}
            >
                <LocalMultipleFileInput
                    accept=".pdf,.docx,.pptx,image/*"
                    label={strings.attachRelevantFilesUploadLabel}
                />
            </InputSection>
            <InputSection
                title={strings.sourceInformationTitle}
                description={strings.sourceInformationDescription}
            >
                {sources.map((source) => (
                    <Container key={source.id} withPadding withBorder>
                        <InlineView
                            after={(
                                <IconButton
                                    name={source.id}
                                    onClick={() => setSources((currentSources) => (
                                        currentSources.filter((item) => item.id !== source.id)
                                    ))}
                                    title={builderStrings.deleteSourceInformationButtonLabel}
                                    ariaLabel={builderStrings.deleteSourceInformationButtonLabel}
                                >
                                    <DeleteBinTwoLineIcon />
                                </IconButton>
                            )}
                        >
                            <ListView layout="grid">
                                <TextInput
                                    label={builderStrings.sourceInformationNameLabel}
                                    name={undefined}
                                    value={source.name}
                                    onChange={(value) => updateSource(
                                        source.id,
                                        { name: value ?? '' },
                                    )}
                                />
                                <TextInput
                                    label={builderStrings.sourceInformationLinkLabel}
                                    name={undefined}
                                    value={source.link}
                                    onChange={(value) => updateSource(
                                        source.id,
                                        { link: value ?? '' },
                                    )}
                                />
                            </ListView>
                        </InlineView>
                    </Container>
                ))}
                <Button
                    name={undefined}
                    onClick={() => setSources((currentSources) => [
                        ...currentSources,
                        { id: crypto.randomUUID(), link: '', name: '' },
                    ])}
                    before={<AddLineIcon />}
                >
                    {strings.addNewTriggerButtonLabel}
                </Button>
            </InputSection>
            <InlineLayout
                after={(
                    <Button name={undefined} onClick={onSave}>
                        {builderStrings.saveButtonLabel}
                    </Button>
                )}
            >
                <ListView withCenteredContents>
                    <Button name={undefined} disabled>
                        {builderStrings.backButtonLabel}
                    </Button>
                    <Button name={undefined} disabled>
                        {builderStrings.nextButtonLabel}
                    </Button>
                </ListView>
            </InlineLayout>
        </ListView>
    );
}

export default SupplementaryFields;
