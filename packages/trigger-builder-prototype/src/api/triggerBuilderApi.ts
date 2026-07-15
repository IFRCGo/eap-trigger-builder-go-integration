/**
 * Typed client for the trigger-builder backend API.
 *
 * Base URL resolution (in priority order):
 *   1. window.__apiBaseUrl  — injected at container start by 40-env-config.sh
 *   2. import.meta.env.VITE_API_BASE_URL — Vite build-time env var for local dev
 *   3. empty string — falls back to simulated output in App.tsx
 */

import type { MetadataState, ReviewOutput, StatementDraftState } from '../types/app';
import { getRuntimeApiBaseUrl } from '../config/runtime';

const prototypeAccessStorageKey = 'trigger-builder-prototype.access-code';
const generationTimeoutMs = 160_000;

export function getApiBaseUrl(): string {
    return getRuntimeApiBaseUrl();
}

export function getPrototypeAccessCode(): string {
    if (typeof window === 'undefined') {
        return '';
    }
    return window.sessionStorage.getItem(prototypeAccessStorageKey) ?? '';
}

export function setPrototypeAccessCode(value: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    if (value.trim()) {
        window.sessionStorage.setItem(prototypeAccessStorageKey, value);
    } else {
        window.sessionStorage.removeItem(prototypeAccessStorageKey);
    }
}

export function clearPrototypeAccessCode(): void {
    setPrototypeAccessCode('');
}

export class PrototypeAccessError extends Error {
    constructor(message = 'The prototype access code was rejected.') {
        super(message);
        this.name = 'PrototypeAccessError';
    }
}

// ── Internal response shapes ──────────────────────────────────────────────────

interface BackendReviewOutput {
    preActivation: string;
    activation: string;
    stop: string;
    combined: string;
}

interface GenerateApiResponse {
    deterministicDraft: {
        preActivation: string;
        activation: string;
        stop: string;
        combined: string;
    };
    reviewOutput: BackendReviewOutput;
    warnings: string[];
    modelId?: string;
    promptVersion?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const base = getApiBaseUrl().replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), generationTimeoutMs);
    let resp: Response;
    try {
        const accessCode = getPrototypeAccessCode();
        resp = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessCode ? { 'X-Prototype-Access-Code': accessCode } : {}),
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (reason) {
        if (controller.signal.aborted) {
            throw new Error('Generation timed out after 160 seconds. No output was saved; try again.');
        }
        throw reason;
    } finally {
        window.clearTimeout(timeout);
    }

    if (!resp.ok) {
        let detail = '';
        let errorCode = '';
        try {
            const json = (await resp.json()) as { error?: string; code?: string };
            detail = json.error ?? '';
            errorCode = json.code ?? '';
        } catch {
            // ignore JSON parse errors on error responses
        }
        if (
            resp.status === 401
            || resp.status === 403
            || errorCode === 'PROTOTYPE_ACCESS_DENIED'
            || errorCode === 'PROTOTYPE_ACCESS_REQUIRED'
        ) {
            clearPrototypeAccessCode();
            throw new PrototypeAccessError(detail || undefined);
        }
        throw new Error(`API ${resp.status}: ${detail || resp.statusText}`);
    }

    return resp.json() as Promise<T>;
}

function toReviewOutput(
    backend: BackendReviewOutput,
    generationIndex: number,
    modelId?: string,
    promptVersion?: string,
): ReviewOutput {
    return {
        preActivation: backend.preActivation,
        activation: backend.activation,
        stop: backend.stop,
        combined: backend.combined,
        generatedAt: new Date().toISOString(),
        generationIndex,
        modelId,
        promptVersion,
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenerateResult {
    reviewOutput: ReviewOutput;
    warnings: string[];
}

export async function callGenerate(
    metadata: MetadataState,
    statements: StatementDraftState[],
    generationIndex: number,
): Promise<GenerateResult> {
    const resp = await postJson<GenerateApiResponse>('/api/trigger-builder/generate', {
        documentContext: metadata,
        statements,
    });
    return {
        reviewOutput: toReviewOutput(
            resp.reviewOutput,
            generationIndex,
            resp.modelId,
            resp.promptVersion,
        ),
        warnings: resp.warnings ?? [],
    };
}

export async function callRegenerate(
    metadata: MetadataState,
    statements: StatementDraftState[],
    reviewerNotes: string,
    generationIndex: number,
): Promise<GenerateResult> {
    const resp = await postJson<GenerateApiResponse>('/api/trigger-builder/regenerate', {
        documentContext: metadata,
        statements,
        reviewerNotes,
    });
    return {
        reviewOutput: toReviewOutput(
            resp.reviewOutput,
            generationIndex,
            resp.modelId,
            resp.promptVersion,
        ),
        warnings: resp.warnings ?? [],
    };
}
