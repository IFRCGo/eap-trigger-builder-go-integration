import { describe, expect, it } from 'vitest';

import { parsePilotStatements, isPilotStatementProseOnly } from './parsePilotStatements';
import type { EapExpectation } from './__fixtures__/pilotEapExpectations';
import {
    pilotEapExpectations,
    ALL_PILOT_EAP_IDS,
} from './__fixtures__/pilotEapExpectations';
import type { StatementDraftState } from '../types/app';

// ---------------------------------------------------------------------------
// Test helpers (needed because noUncheckedIndexedAccess makes all index
// access return T | undefined; these helpers assert and give clear failures)
// ---------------------------------------------------------------------------

function getExp(id: string): EapExpectation {
    const exp = pilotEapExpectations[id];
    if (!exp) throw new Error(`No expectation for EAP ${id}`);
    return exp;
}

function getStmt(result: StatementDraftState[], index: number): StatementDraftState {
    const s = result[index];
    if (!s) throw new Error(`No statement at index ${index} (result has ${result.length})`);
    return s;
}

function countByPhase(statements: StatementDraftState[]) {
    return statements.reduce<Record<string, number>>((acc, s) => {
        acc[s.phase] = (acc[s.phase] ?? 0) + 1;
        return acc;
    }, {});
}

function proseIndicesOf(statements: StatementDraftState[]): number[] {
    return statements
        .map((s, i) => (isPilotStatementProseOnly(s) ? i : -1))
        .filter((i) => i >= 0);
}

// ---------------------------------------------------------------------------
// Cross-EAP structural invariants (apply to every EAP)
// ---------------------------------------------------------------------------

describe('parsePilotStatements — structural invariants across all 18 EAPs', () => {
    it('returns a non-empty array for every known pilot EAP ID', () => {
        for (const id of ALL_PILOT_EAP_IDS) {
            const result = parsePilotStatements(id);
            expect(result.length, `EAP ${id} should return at least one statement`).toBeGreaterThan(0);
        }
    });

    it('produces only unique IDs across all statements for each EAP', () => {
        for (const id of ALL_PILOT_EAP_IDS) {
            const result = parsePilotStatements(id);
            const ids = result.map((s) => s.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size, `EAP ${id} has duplicate statement IDs`).toBe(ids.length);
        }
    });

    it('never leaves phase empty — defaults to "activation"', () => {
        for (const id of ALL_PILOT_EAP_IDS) {
            for (const s of parsePilotStatements(id)) {
                expect(s.phase, `EAP ${id} statement phase should not be empty`).not.toBe('');
            }
        }
    });

    it('never leaves geographyType empty — defaults to "national"', () => {
        for (const id of ALL_PILOT_EAP_IDS) {
            for (const s of parsePilotStatements(id)) {
                expect(s.geographyType, `EAP ${id} geographyType should not be empty`).not.toBe('');
            }
        }
    });

    it('returns [] for an unknown EAP ID', () => {
        expect(parsePilotStatements('00000')).toEqual([]);
        expect(parsePilotStatements('')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Per-EAP tests: total count, phase distribution, prose-only, spot checks
// ---------------------------------------------------------------------------

describe('EAP 16389 — Honduras Floods (1 pre + 1 act + 2 stop)', () => {
    const ID = '16389';
    const exp = getExp(ID);

    it('returns the expected total statement count', () => {
        expect(parsePilotStatements(ID)).toHaveLength(exp.totalStatements);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(exp.phaseDistribution.pre_activation);
        expect(phases['activation'] ?? 0).toBe(exp.phaseDistribution.activation);
        expect(phases['stop'] ?? 0).toBe(exp.phaseDistribution.stop);
    });

    it('identifies prose-only statements at the expected indices', () => {
        expect(proseIndicesOf(parsePilotStatements(ID))).toEqual(exp.proseOnlyIndices);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.thresholdValue).toBe(check.thresholdValue);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.withinConnector !== undefined) expect(s.withinConnector).toBe(check.withinConnector);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 16399 — Malawi Floods (6 pre + 2 act + 1 stop)', () => {
    const ID = '16399';
    const exp = getExp(ID);

    it('returns the expected total statement count', () => {
        expect(parsePilotStatements(ID)).toHaveLength(exp.totalStatements);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(exp.phaseDistribution.pre_activation);
        expect(phases['activation'] ?? 0).toBe(exp.phaseDistribution.activation);
        expect(phases['stop'] ?? 0).toBe(exp.phaseDistribution.stop);
    });

    it('has no prose-only statements', () => {
        expect(proseIndicesOf(parsePilotStatements(ID))).toEqual([]);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.withinConnector !== undefined) expect(s.withinConnector).toBe(check.withinConnector);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 16416 — Pakistan Floods (2 pre + 19 act, largest EAP)', () => {
    const ID = '16416';
    const exp = getExp(ID);

    it('returns the expected total statement count', () => {
        expect(parsePilotStatements(ID)).toHaveLength(exp.totalStatements);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(exp.phaseDistribution.pre_activation);
        expect(phases['activation'] ?? 0).toBe(exp.phaseDistribution.activation);
        expect(phases['stop'] ?? 0).toBe(exp.phaseDistribution.stop);
    });

    it('identifies prose-only statement at index 1', () => {
        expect(proseIndicesOf(parsePilotStatements(ID))).toEqual(exp.proseOnlyIndices);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.thresholdValue).toBe(check.thresholdValue);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
        }
    });
});

describe('EAP 16440 — single activation statement', () => {
    const ID = '16440';
    const exp = getExp(ID);
    const check = exp.spotChecks[0]!;

    it('returns exactly 1 statement', () => {
        expect(parsePilotStatements(ID)).toHaveLength(1);
    });

    it('maps spot-check fields correctly', () => {
        const s = getStmt(parsePilotStatements(ID), 0);
        expect(s.phase).toBe(check.phase);
        expect(s.canonicalVariable).toBe(check.canonicalVariable);
        expect(s.operator).toBe(check.operator);
        expect(s.thresholdValue).toBe(check.thresholdValue);
        expect(s.geographyType).toBe(check.geographyType);
        expect(s.sourceAuthority).toBe(check.sourceAuthority);
    });
});

describe('EAP 16445 — single activation statement (drought)', () => {
    const ID = '16445';
    const exp = getExp(ID);
    const check = exp.spotChecks[0]!;

    it('returns exactly 1 statement', () => {
        expect(parsePilotStatements(ID)).toHaveLength(1);
    });

    it('maps spot-check fields correctly', () => {
        const s = getStmt(parsePilotStatements(ID), 0);
        expect(s.phase).toBe(check.phase);
        expect(s.canonicalVariable).toBe(check.canonicalVariable);
        expect(s.operator).toBe(check.operator);
        expect(s.geographyType).toBe(check.geographyType);
        expect(s.sourceAuthority).toBe(check.sourceAuthority);
    });
});

describe('EAP 16473 — heatwave, 2 activation statements', () => {
    const ID = '16473';
    const exp = getExp(ID);

    it('returns 2 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(2);
    });

    it('preserves withinConnector on first statement', () => {
        const result = parsePilotStatements(ID);
        expect(getStmt(result, 0).withinConnector).toBe('AND');
        expect(getStmt(result, 1).withinConnector).toBeUndefined();
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
            expect(s.sourceAuthority).toBe(check.sourceAuthority);
        }
    });
});

describe('EAP 16527 — displacement, 4 activation statements', () => {
    const ID = '16527';
    const exp = getExp(ID);

    it('returns 4 statements, all in activation phase', () => {
        const result = parsePilotStatements(ID);
        expect(result).toHaveLength(4);
        expect(result.every((s) => s.phase === 'activation')).toBe(true);
    });

    it('preserves withinConnector OR on first statement', () => {
        expect(getStmt(parsePilotStatements(ID), 0).withinConnector).toBe('OR');
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.thresholdValue).toBe(check.thresholdValue);
            expect(s.sourceAuthority).toBe(check.sourceAuthority);
        }
    });
});

describe('EAP 16566 — cyclone (2 pre + 3 act, prose-only at index 4)', () => {
    const ID = '16566';
    const exp = getExp(ID);

    it('returns 5 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(5);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(2);
        expect(phases['activation'] ?? 0).toBe(3);
        expect(phases['stop'] ?? 0).toBe(0);
    });

    it('identifies prose-only statement at index 4', () => {
        expect(proseIndicesOf(parsePilotStatements(ID))).toEqual(exp.proseOnlyIndices);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.withinConnector !== undefined) expect(s.withinConnector).toBe(check.withinConnector);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 16567 — Indonesia floods (2 pre + 2 act)', () => {
    const ID = '16567';
    const exp = getExp(ID);

    it('returns 4 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(4);
    });

    it('has no prose-only statements', () => {
        expect(parsePilotStatements(ID).some(isPilotStatementProseOnly)).toBe(false);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
        }
    });
});

describe('EAP 16633 — heatwave Panama, single activation', () => {
    const ID = '16633';

    it('returns exactly 1 statement in activation phase', () => {
        const result = parsePilotStatements(ID);
        expect(result).toHaveLength(1);
        expect(getStmt(result, 0).phase).toBe('activation');
    });

    it('maps temperature threshold correctly', () => {
        const s = getStmt(parsePilotStatements(ID), 0);
        expect(s.canonicalVariable).toBe('Temperature');
        expect(s.operator).toBe('>=');
        expect(s.thresholdValue).toBe('42.4');
        expect(s.thresholdUnit).toBe('°C');
        expect(s.sourceAuthority).toBe('National Meteorological Agency (ANAM)');
    });
});

describe('EAP 16845 — Nepal floods (3 pre + 3 act + 2 stop)', () => {
    const ID = '16845';
    const exp = getExp(ID);

    it('returns 8 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(8);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(3);
        expect(phases['activation'] ?? 0).toBe(3);
        expect(phases['stop'] ?? 0).toBe(2);
    });

    it('has no prose-only statements', () => {
        expect(parsePilotStatements(ID).some(isPilotStatementProseOnly)).toBe(false);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.withinConnector !== undefined) expect(s.withinConnector).toBe(check.withinConnector);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 16877 — Guatemala drought (1 pre + 1 act + 1 stop)', () => {
    const ID = '16877';
    const exp = getExp(ID);

    it('returns 3 statements, one per phase', () => {
        const result = parsePilotStatements(ID);
        expect(result).toHaveLength(3);
        const phases = countByPhase(result);
        expect(phases['pre_activation']).toBe(1);
        expect(phases['activation']).toBe(1);
        expect(phases['stop']).toBe(1);
    });

    it('preserves inter-phase crossConnectors (PRECEDES, ENABLES)', () => {
        const result = parsePilotStatements(ID);
        expect(getStmt(result, 0).crossConnector).toBe('PRECEDES');
        expect(getStmt(result, 1).crossConnector).toBe('ENABLES');
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 17044 — flooding (4 act + 2 stop, prose-only at indices 3 and 5)', () => {
    const ID = '17044';
    const exp = getExp(ID);

    it('returns 6 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(6);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(0);
        expect(phases['activation'] ?? 0).toBe(4);
        expect(phases['stop'] ?? 0).toBe(2);
    });

    it('identifies prose-only statements at indices 3 and 5', () => {
        expect(proseIndicesOf(parsePilotStatements(ID))).toEqual(exp.proseOnlyIndices);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 17240 — volcanic activity Ecuador (1 pre + 3 act + 1 stop)', () => {
    const ID = '17240';
    const exp = getExp(ID);

    it('returns 5 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(5);
    });

    it('distributes statements correctly across phases', () => {
        const phases = countByPhase(parsePilotStatements(ID));
        expect(phases['pre_activation'] ?? 0).toBe(1);
        expect(phases['activation'] ?? 0).toBe(3);
        expect(phases['stop'] ?? 0).toBe(1);
    });

    it('has no prose-only statements (empty operator ≠ prose-only when variable is present)', () => {
        expect(parsePilotStatements(ID).some(isPilotStatementProseOnly)).toBe(false);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.thresholdValue).toBe(check.thresholdValue);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.withinConnector !== undefined) expect(s.withinConnector).toBe(check.withinConnector);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 17253 — Panama heatwave (1 pre + 2 act)', () => {
    const ID = '17253';
    const exp = getExp(ID);

    it('returns 3 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(3);
    });

    it('preserves withinConnector AND on second statement', () => {
        expect(getStmt(parsePilotStatements(ID), 1).withinConnector).toBe('AND');
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.thresholdValue).toBe(check.thresholdValue);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
        }
    });
});

describe('EAP 17366 — Pakistan floods 2 (2 pre + 2 act + 1 stop)', () => {
    const ID = '17366';
    const exp = getExp(ID);

    it('returns 5 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(5);
    });

    it('has no prose-only statements', () => {
        expect(parsePilotStatements(ID).some(isPilotStatementProseOnly)).toBe(false);
    });

    it('maps spot-check fields correctly including THEN cross-connectors', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
            if (check.withinConnector !== undefined) expect(s.withinConnector).toBe(check.withinConnector);
            if (check.crossConnector !== undefined) expect(s.crossConnector).toBe(check.crossConnector);
        }
    });
});

describe('EAP 17595 — Honduras drought (2 act + 1 stop, prose-only at index 2)', () => {
    const ID = '17595';
    const exp = getExp(ID);

    it('returns 3 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(3);
    });

    it('identifies prose-only stop statement at index 2', () => {
        expect(proseIndicesOf(parsePilotStatements(ID))).toEqual(exp.proseOnlyIndices);
    });

    it('preserves crossConnector AND on first activation statement', () => {
        expect(getStmt(parsePilotStatements(ID), 0).crossConnector).toBe('AND');
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
        }
    });
});

describe('EAP 26012 — drought (3 act + 1 stop)', () => {
    const ID = '26012';
    const exp = getExp(ID);

    it('returns 4 statements', () => {
        expect(parsePilotStatements(ID)).toHaveLength(4);
    });

    it('has no prose-only statements', () => {
        expect(parsePilotStatements(ID).some(isPilotStatementProseOnly)).toBe(false);
    });

    it('maps spot-check fields correctly', () => {
        const result = parsePilotStatements(ID);
        for (const check of exp.spotChecks) {
            const s = getStmt(result, check.index);
            expect(s.phase).toBe(check.phase);
            expect(s.canonicalVariable).toBe(check.canonicalVariable);
            expect(s.operator).toBe(check.operator);
            expect(s.geographyType).toBe(check.geographyType);
            if (check.sourceAuthority !== undefined) expect(s.sourceAuthority).toBe(check.sourceAuthority);
        }
    });
});

// ---------------------------------------------------------------------------
// isPilotStatementProseOnly helper
// ---------------------------------------------------------------------------

describe('isPilotStatementProseOnly', () => {
    const base: StatementDraftState = {
        id: 't1',
        phase: 'activation',
        canonicalVariable: '',
        subcategory: '',
        operator: '',
        thresholdValue: 'some text',
        thresholdUnit: '',
        probabilityValue: undefined,
        leadTimeValue: undefined,
        timeframeUnit: '',
        geographyType: 'national',
            geographyLabel: '',
            geographyConfirmed: false,
        notes: 'prose description',
    };

    it('returns true when both canonicalVariable and operator are empty', () => {
        expect(isPilotStatementProseOnly(base)).toBe(true);
    });

    it('returns false when canonicalVariable is non-empty', () => {
        expect(isPilotStatementProseOnly({ ...base, canonicalVariable: 'Rainfall' })).toBe(false);
    });

    it('returns false when operator is non-empty', () => {
        expect(isPilotStatementProseOnly({ ...base, operator: '>=' })).toBe(false);
    });

    it('returns false when both are non-empty', () => {
        expect(isPilotStatementProseOnly({ ...base, canonicalVariable: 'Wind', operator: '>=' })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Stage 10b — auto-detection of prose-only statements
// ---------------------------------------------------------------------------

describe('parsePilotStatements — Stage 10b auto-detection', () => {
    it('sets isFreeText=true and freeTextStatement=notes for prose-only statements', () => {
        // EAP 16389 index 3 is a prose-only stop statement
        const result = parsePilotStatements('16389');
        const proseStmt = getStmt(result, 3);
        expect(proseStmt.isFreeText).toBe(true);
        expect(typeof proseStmt.freeTextStatement).toBe('string');
        expect(proseStmt.freeTextStatement).toBe(proseStmt.notes);
    });

    it('does NOT set isFreeText for structured statements', () => {
        const result = parsePilotStatements('16389');
        // First statement has variable and operator — should not be free-text
        const structuredStmt = getStmt(result, 0);
        expect(structuredStmt.isFreeText).toBeUndefined();
    });

    it('flags all prose-only indices for EAP 17044', () => {
        // 17044 has prose-only at indices 3 and 5
        const result = parsePilotStatements('17044');
        const s3 = getStmt(result, 3);
        const s5 = getStmt(result, 5);
        expect(s3.isFreeText).toBe(true);
        expect(s5.isFreeText).toBe(true);
    });

    it('all 18 EAPs: prose-only statements have isFreeText=true', () => {
        for (const id of ALL_PILOT_EAP_IDS) {
            const exp = getExp(id);
            const result = parsePilotStatements(id);
            for (const idx of exp.proseOnlyIndices) {
                const s = getStmt(result, idx);
                expect(s.isFreeText).toBe(true);
                expect(typeof s.freeTextStatement).toBe('string');
            }
        }
    });

    it('all 18 EAPs: structured statements do not have isFreeText=true', () => {
        for (const id of ALL_PILOT_EAP_IDS) {
            const exp = getExp(id);
            const result = parsePilotStatements(id);
            result.forEach((s, idx) => {
                if (!exp.proseOnlyIndices.includes(idx)) {
                    expect(s.isFreeText).not.toBe(true);
                }
            });
        }
    });
});
