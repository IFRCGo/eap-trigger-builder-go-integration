import pilotExamplesFile from './generated/pilot_eaps.json';
import type {
    PilotExample,
    PilotExamplesFile,
    PrototypeOption,
} from './types';

let cachedExamples: PilotExample[] | undefined;

function toTitleCase(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
}

export function loadPilotExamples(): PilotExample[] {
    if (cachedExamples) {
        return cachedExamples;
    }

    const safeFile = pilotExamplesFile as PilotExamplesFile;
    cachedExamples = [...safeFile.selected].sort(
        (left, right) => left.pilot_order - right.pilot_order,
    );

    return cachedExamples;
}

export function toPilotExampleOptions(examples: PilotExample[]): PrototypeOption[] {
    return examples.map((example) => ({
        key: example.document_id,
        label: example.document_name,
        description: [
            `Pilot ${example.pilot_order}`,
            toTitleCase(example.activation_type),
            `${example.trigger_count_openai} trigger path(s)`,
            example.stop_mechanism_present ? 'Stop logic present' : 'No stop logic',
        ].join(' | '),
    }));
}
