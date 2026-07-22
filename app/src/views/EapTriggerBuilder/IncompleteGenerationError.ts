class IncompleteGenerationError extends Error {
    missingFacts: string[];

    constructor(missingFacts: string[]) {
        super('The generated statement omitted required trigger facts.');
        this.name = 'IncompleteGenerationError';
        this.missingFacts = missingFacts;
    }
}

export default IncompleteGenerationError;
