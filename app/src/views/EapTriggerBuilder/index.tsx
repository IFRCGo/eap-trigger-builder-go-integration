import {
    CheckboxMultipleBlankFillIcon,
    ShareFillIcon,
} from '@ifrc-go/icons';
import {
    Button,
    Container,
    Tab,
    TabList,
    Tabs,
} from '@ifrc-go/ui';
import { useTranslation } from '@ifrc-go/ui/hooks';

import Page from '#components/Page';

import i18n from './i18n.json';

function keepTriggerModelActive() {
    // The other Full EAP sections are orientation-only in this release.
}

// eslint-disable-next-line import/prefer-default-export
export function Component() {
    const strings = useTranslation(i18n);

    return (
        <Tabs
            value="triggerModel"
            onChange={keepTriggerModelActive}
            styleVariant="step"
        >
            <Page
                title={strings.pageTitle}
                heading={strings.pageHeading}
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
                    {null}
                </Container>
            </Page>
        </Tabs>
    );
}

Component.displayName = 'EapTriggerBuilder';
