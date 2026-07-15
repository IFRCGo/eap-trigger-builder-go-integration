import { describe, expect, it } from 'vitest';

import {
    loadUiSchema,
    sanitizeSchemaText,
} from './loadUiSchema';

describe('loadUiSchema', () => {
    it('replaces standalone NaN values before parsing', () => {
        expect(sanitizeSchemaText('{"value": NaN, "other": "NaN token"}')).toBe('{"value": null, "other": "NaN token"}');
    });

    it('loads normalized lookup data from the generated schema adapter bundle', () => {
        const loaded = loadUiSchema();

        expect(loaded.diagnostics.nanTokenCount).toBeGreaterThan(0);
        expect(loaded.diagnostics.sanitized).toBe(true);
        expect(loaded.schema.metadata?.total_documents).toBeGreaterThan(0);
        expect(loaded.lookups.primaryVariables.length).toBeGreaterThan(0);
        expect(loaded.lookups.hazardTypes.length).toBeGreaterThan(0);
        expect(loaded.lookups.connectorVocabulary.within_statement).toContain('AND');
        expect(loaded.lookups.geographyTypes.length).toBeGreaterThan(0);
    });
});
