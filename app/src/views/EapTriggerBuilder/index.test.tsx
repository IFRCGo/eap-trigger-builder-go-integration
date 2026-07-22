import {
    act,
    type ReactNode,
} from 'react';
import {
    createRoot,
    type Root,
} from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { PrototypeAccessError } from './api';
import { Component } from './index';
import { createBlankDraft } from './model';
import type {
    ReferenceData,
    TriggerBuilderDraft,
} from './types';

const mocks = vi.hoisted(() => ({
    alert: { show: vi.fn() },
    clearAccessCode: vi.fn(),
    generate: vi.fn(),
    getAccessCode: vi.fn(),
    getReferenceData: vi.fn(),
    loadDraft: vi.fn(),
    navigate: vi.fn(),
    routing: { navigate: vi.fn() },
    saveDraft: vi.fn(),
    setAccessCode: vi.fn(),
    shareDraft: vi.fn(),
}));

vi.mock('@ifrc-go/icons', async () => {
    const React = await import('react');
    function Icon() {
        return React.createElement('span');
    }
    return {
        AddLineIcon: Icon,
        CheckboxMultipleBlankFillIcon: Icon,
        ShareFillIcon: Icon,
    };
});

vi.mock('@ifrc-go/ui/hooks', () => ({
    useTranslation: (resource: { strings: Record<string, string> }) => resource.strings,
}));

vi.mock('@ifrc-go/ui', async () => {
    const React = await import('react');

    interface ChildrenProps {
        children?: ReactNode;
    }
    interface ButtonProps extends ChildrenProps {
        disabled?: boolean;
        onClick?: () => void;
    }
    interface ConfirmButtonProps extends ChildrenProps {
        onConfirm?: () => void;
    }
    interface InputSectionProps extends ChildrenProps {
        title?: ReactNode;
    }
    interface MessageProps {
        actions?: ReactNode;
        description?: ReactNode;
        pending?: boolean;
        title?: ReactNode;
    }
    interface ModalProps extends ChildrenProps {
        footerActions?: ReactNode;
        headerDescription?: ReactNode;
        heading?: ReactNode;
    }
    interface SelectInputProps {
        keySelector?: (option: unknown) => string;
        label?: string;
        labelSelector?: (option: unknown) => string;
        onChange?: (value: string | undefined) => void;
        options?: unknown[];
        value?: string;
    }
    interface TextInputProps {
        disabled?: boolean;
        label?: string;
        onChange?: (value: string | undefined) => void;
        value?: string;
    }

    function Wrapper({ children }: ChildrenProps) {
        return React.createElement('div', null, children);
    }
    function Button({ children, disabled, onClick }: ButtonProps) {
        return React.createElement(
            'button',
            { disabled, onClick, type: 'button' },
            children,
        );
    }
    function ConfirmButton({ children, onConfirm }: ConfirmButtonProps) {
        return React.createElement(
            'button',
            { onClick: onConfirm, type: 'button' },
            children,
        );
    }
    function InputSection({ children, title }: InputSectionProps) {
        return React.createElement(
            'section',
            null,
            React.createElement('h2', null, title),
            children,
        );
    }
    function Message({
        actions, description, pending, title,
    }: MessageProps) {
        return React.createElement(
            'div',
            { 'data-pending': pending ? 'true' : undefined },
            title,
            description,
            actions,
        );
    }
    function Modal({
        children,
        footerActions,
        headerDescription,
        heading,
    }: ModalProps) {
        return React.createElement(
            'section',
            { 'aria-label': String(heading) },
            React.createElement('h2', null, heading),
            headerDescription,
            children,
            footerActions,
        );
    }
    function SelectInput({
        keySelector,
        label,
        labelSelector,
        onChange,
        options = [],
        value,
    }: SelectInputProps) {
        return React.createElement(
            'label',
            null,
            label,
            React.createElement(
                'select',
                {
                    'aria-label': label,
                    onChange: (event: { currentTarget: HTMLSelectElement }) => (
                        onChange?.(event.currentTarget.value || undefined)
                    ),
                    value: value ?? '',
                },
                React.createElement('option', { value: '' }),
                options.map((option) => React.createElement(
                    'option',
                    { key: keySelector?.(option), value: keySelector?.(option) },
                    labelSelector?.(option),
                )),
            ),
        );
    }
    function TextInput({
        disabled,
        label,
        onChange,
        value,
    }: TextInputProps) {
        return React.createElement(
            'label',
            null,
            label,
            React.createElement('textarea', {
                'aria-label': label,
                disabled,
                onChange: (event: { currentTarget: HTMLTextAreaElement }) => (
                    onChange?.(event.currentTarget.value)
                ),
                value: value ?? '',
            }),
        );
    }

    return {
        Button,
        ConfirmButton,
        Container: Wrapper,
        InputSection,
        ListView: Wrapper,
        Message,
        Modal,
        PasswordInput: TextInput,
        SelectInput,
        Tab: Wrapper,
        TabList: Wrapper,
        Tabs: Wrapper,
        TextArea: TextInput,
    };
});

vi.mock('#components/Page', async () => {
    const React = await import('react');

    interface PageProps {
        actions?: ReactNode;
        children?: ReactNode;
        heading?: ReactNode;
        info?: ReactNode;
        title?: ReactNode;
    }

    return {
        default: ({
            actions, children, heading, info, title,
        }: PageProps) => React.createElement(
            'main',
            null,
            React.createElement('h1', null, heading ?? title),
            actions,
            info,
            children,
        ),
    };
});

vi.mock('#components/domain/CountrySelectInput', async () => {
    const React = await import('react');
    return {
        default: ({ error }: { error?: ReactNode }) => React.createElement('div', null, error),
    };
});

vi.mock('#hooks/domain/useCountry', () => ({
    default: () => [{
        id: 35,
        iso: 'BF',
        iso3: 'BFA',
        name: 'Burkina Faso',
        centroid: { coordinates: [-1.52, 12.37], type: 'Point' },
    }],
}));

vi.mock('#hooks/useAlert', () => ({ default: () => mocks.alert }));
vi.mock('#hooks/useRouting', () => ({ default: () => mocks.routing }));

vi.mock('./TriggerCard', async () => {
    const React = await import('react');
    type TriggerDraft = import('./types').TriggerDraft;

    interface TriggerCardProps {
        errors?: Record<string, boolean>;
        onChange: (value: Partial<TriggerDraft>) => void;
        trigger: TriggerDraft;
    }

    return {
        default: ({ errors, onChange, trigger }: TriggerCardProps) => React.createElement(
            'article',
            null,
            React.createElement('span', { 'data-threshold': true }, trigger.thresholdValue),
            errors && React.createElement('span', null, 'Trigger errors'),
            React.createElement(
                'button',
                {
                    onClick: () => onChange({ thresholdValue: `${trigger.thresholdValue}-changed` }),
                    type: 'button',
                },
                'Change threshold',
            ),
        ),
    };
});

vi.mock('./api', async () => {
    const actual = await vi.importActual<typeof import('./api')>('./api');
    return {
        clearPrototypeAccessCode: mocks.clearAccessCode,
        default: mocks.getReferenceData,
        generateTriggerStatement: mocks.generate,
        getPrototypeAccessCode: mocks.getAccessCode,
        IncompleteGenerationError: actual.IncompleteGenerationError,
        PrototypeAccessError: actual.PrototypeAccessError,
        setPrototypeAccessCode: mocks.setAccessCode,
    };
});

vi.mock('./persistence', () => ({
    loadTriggerBuilderDraft: mocks.loadDraft,
    saveTriggerBuilderDraft: mocks.saveDraft,
    shareTriggerBuilderDraft: mocks.shareDraft,
}));

const country = {
    id: 35,
    iso: 'BF',
    iso3: 'BFA',
    name: 'Burkina Faso',
    centroid: { longitude: -1.52, latitude: 12.37 },
    boundingBox: undefined,
};

const referenceData: ReferenceData = {
    schema: {
        primaryVariables: [],
        hazardTypes: [{ key: 'FL', label: 'Flood' }],
        subcategoriesByVariable: {},
        unitsByVariable: {},
        operatorsByVariable: {},
        timeframeUnits: [],
        geographyTypes: [],
    },
    examples: [{
        documentId: 'burkina-faso-pilot',
        documentName: 'Burkina Faso Flood pilot EAP',
        statements: [{
            phase: 'activation',
            canonicalVariable: 'rainfall',
            subcategory: 'forecast',
            operator: 'greater_than',
            thresholdValue: '100',
            thresholdUnit: 'mm',
            probabilityValue: 60,
            leadTimeValue: 3,
            timeframeUnit: 'days',
            geographyType: 'national',
            geographyLabel: 'Burkina Faso',
            withinConnector: '',
            crossConnector: '',
            sourceAuthority: 'ECMWF',
        }],
    }],
};

function createValidDraft(aiStatement?: string): TriggerBuilderDraft {
    const draft = createBlankDraft(country);
    const trigger = draft.triggers[0];
    if (!trigger) {
        throw new Error('Blank draft did not contain a trigger');
    }
    return {
        ...draft,
        selectedPilotId: 'burkina-faso-pilot',
        selectedPilotName: 'Burkina Faso Flood pilot EAP',
        triggers: [{
            ...trigger,
            canonicalVariable: 'rainfall',
            subcategory: 'forecast',
            operator: 'greater_than',
            thresholdValue: '100',
            thresholdUnit: 'mm',
            probabilityValue: 60,
            leadTimeValue: 3,
            timeframeUnit: 'days',
            sources: [{
                id: 'source-1',
                link: '',
                name: 'ECMWF',
            }],
        }],
        aiStatement,
    };
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
    const button = [...container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent === label);
    if (!button) {
        throw new Error(`Button not found: ${label}`);
    }
    return button;
}

function getTextarea(container: HTMLElement, label: string): HTMLTextAreaElement {
    const textarea = container.querySelector<HTMLTextAreaElement>(
        `textarea[aria-label="${label}"]`,
    );
    if (!textarea) {
        throw new Error(`Text area not found: ${label}`);
    }
    return textarea;
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

async function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
    )?.set;
    await act(async () => {
        valueSetter?.call(textarea, value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('EAP Trigger Builder generation workflow', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAccessCode.mockReturnValue('stage-8-code');
        mocks.getReferenceData.mockResolvedValue(referenceData);
        mocks.loadDraft.mockReturnValue({ status: 'loaded', draft: createValidDraft() });
        mocks.saveDraft.mockImplementation((draft: TriggerBuilderDraft) => ({
            status: 'saved',
            draft,
        }));
        mocks.shareDraft.mockResolvedValue('clipboard');

        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
    });

    async function renderComponent() {
        await act(async () => root.render(<Component />));
        await flush();
    }

    test('blocks invalid generation and highlights the incomplete form', async () => {
        mocks.loadDraft.mockReturnValue({ status: 'empty' });
        await renderComponent();

        await act(async () => getButton(container, 'Generate').click());

        expect(mocks.generate).not.toHaveBeenCalled();
        expect(container.textContent).toContain(
            'Complete the highlighted fields before generating the Trigger statement.',
        );
    });

    test('processes, preserves edits, regenerates, and keeps the last statement on failure', async () => {
        const firstRequest = createDeferred<string>();
        mocks.generate.mockReturnValueOnce(firstRequest.promise);
        await renderComponent();

        const generateButton = getButton(container, 'Generate');
        await act(async () => generateButton.click());
        expect(container.textContent).toContain('Processing the Trigger statement...');
        expect(generateButton.disabled).toBe(true);

        generateButton.click();
        expect(mocks.generate).toHaveBeenCalledOnce();

        await act(async () => firstRequest.resolve('First AI statement'));
        const statement = getTextarea(container, 'AI-generated Trigger statement');
        expect(statement.value).toBe('First AI statement');
        expect(statement.disabled).toBe(false);

        await changeTextarea(statement, 'Manual edit');
        await act(async () => getButton(container, 'Change threshold').click());
        expect(statement.value).toBe('Manual edit');

        mocks.generate.mockResolvedValueOnce('Fresh AI statement');
        await act(async () => getButton(container, 'Generate').click());
        await flush();
        expect(statement.value).toBe('Fresh AI statement');

        mocks.generate.mockRejectedValueOnce(new Error('Network unavailable'));
        await act(async () => getButton(container, 'Generate').click());
        await flush();
        expect(statement.value).toBe('Fresh AI statement');
        expect(container.textContent).toContain(
            'The Trigger statement could not be generated. Please try again.',
        );
    });

    test('ignores a late result after structured fields change', async () => {
        const request = createDeferred<string>();
        mocks.loadDraft.mockReturnValue({
            status: 'loaded',
            draft: createValidDraft('Existing statement'),
        });
        mocks.generate.mockReturnValueOnce(request.promise);
        await renderComponent();

        await act(async () => getButton(container, 'Generate').click());
        await act(async () => getButton(container, 'Change threshold').click());
        await act(async () => request.resolve('Stale statement'));

        expect(getTextarea(container, 'AI-generated Trigger statement').value)
            .toBe('Existing statement');
    });

    test('prompts for missing access and retries rejected access', async () => {
        mocks.getAccessCode.mockReturnValue(undefined);
        mocks.generate.mockRejectedValueOnce(new PrototypeAccessError());
        await renderComponent();

        await act(async () => getButton(container, 'Generate').click());
        expect(container.textContent).toContain('Prototype access code');

        const accessInput = getTextarea(container, 'Access code');
        await changeTextarea(accessInput, 'new-code');
        await act(async () => getButton(container, 'Continue').click());
        await flush();

        expect(mocks.setAccessCode).toHaveBeenCalledWith('new-code');
        expect(mocks.clearAccessCode).toHaveBeenCalledOnce();
        expect(container.textContent).toContain('Prototype access code');
    });

    test('clears the generated statement when a different pilot is selected', async () => {
        mocks.loadDraft.mockReturnValue({
            status: 'loaded',
            draft: createValidDraft('Existing statement'),
        });
        await renderComponent();

        const pilotSelect = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Pilot EAP"]',
        );
        if (!pilotSelect) {
            throw new Error('Pilot EAP select not found');
        }
        await act(async () => {
            pilotSelect.value = 'burkina-faso-pilot';
            pilotSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const statement = getTextarea(container, 'AI-generated Trigger statement');
        expect(statement.value).toBe('');
        expect(statement.disabled).toBe(true);
    });
});
