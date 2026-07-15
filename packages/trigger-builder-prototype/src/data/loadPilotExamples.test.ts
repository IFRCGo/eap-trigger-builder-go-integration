import { describe, expect, it } from 'vitest';

import {
    loadPilotExamples,
    toPilotExampleOptions,
} from './loadPilotExamples';

describe('loadPilotExamples', () => {
    it('returns pilot examples sorted by pilot order', () => {
        const examples = loadPilotExamples();

        expect(examples.length).toBeGreaterThan(0);
        expect(examples[0]?.pilot_order).toBeLessThanOrEqual(examples[1]?.pilot_order ?? examples[0]!.pilot_order);
    });

    it('builds readable select options for the embedded example picker', () => {
        const examples = loadPilotExamples();
        const options = toPilotExampleOptions(examples);

        expect(options).toHaveLength(examples.length);
        expect(options[0]?.description).toContain('Pilot');
        expect(options[0]?.description).toContain('trigger path');
    });
});
