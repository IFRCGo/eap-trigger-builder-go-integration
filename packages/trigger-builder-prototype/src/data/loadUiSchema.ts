import compactUiSchemaFile from './generated/ui_schema_compact.json';
import type { LoadedUiSchema } from './types';

let cachedSchema: LoadedUiSchema | undefined;

function isJsonTokenBoundary(character: string | undefined): boolean {
    return character == null || /[\s,[\]{}:]/.test(character);
}

function sanitizeSchemaTextWithDiagnostics(rawText: string) {
    let sanitizedText = '';
    let nanTokenCount = 0;
    let isInsideString = false;
    let isEscaping = false;

    for (let index = 0; index < rawText.length; index += 1) {
        const character = rawText[index];

        if (isInsideString) {
            sanitizedText += character;

            if (isEscaping) {
                isEscaping = false;
            } else if (character === '\\') {
                isEscaping = true;
            } else if (character === '"') {
                isInsideString = false;
            }

            continue;
        }

        if (character === '"') {
            isInsideString = true;
            sanitizedText += character;
            continue;
        }

        if (
            rawText.slice(index, index + 3) === 'NaN'
            && isJsonTokenBoundary(rawText[index - 1])
            && isJsonTokenBoundary(rawText[index + 3])
        ) {
            sanitizedText += 'null';
            nanTokenCount += 1;
            index += 2;
            continue;
        }

        sanitizedText += character;
    }

    return {
        nanTokenCount,
        sanitizedText,
    };
}

export function sanitizeSchemaText(rawText: string): string {
    return sanitizeSchemaTextWithDiagnostics(rawText).sanitizedText;
}

export function loadUiSchema(): LoadedUiSchema {
    if (cachedSchema) {
        return cachedSchema;
    }

    cachedSchema = compactUiSchemaFile as LoadedUiSchema;

    return cachedSchema;
}
