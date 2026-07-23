import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(packageRoot, '..', '..');
const repositoryRoot = resolve(workspaceRoot, '..');
const inputsRoot = resolve(repositoryRoot, 'implementation_inputs');
const generatedRoot = resolve(packageRoot, 'src', 'data', 'generated');
const fallbackConnectorVocabulary = {
    within_statement: ['AND', 'OR'],
    cross_statement: ['AND', 'OR', 'THEN'],
    inter_phase: ['PRECEDES', 'ENABLES'],
};

const schemaSource = resolve(
    inputsRoot,
    'schema',
    'ui_schema_gemini31_filtered.json',
);

const requiredCopies = [
    {
        source: resolve(inputsRoot, 'examples', 'pilot_eaps.json'),
        destination: resolve(generatedRoot, 'pilot_eaps.json'),
    },
];

function isJsonTokenBoundary(character) {
    return character == null || /[\s,[\]{}:]/.test(character);
}

function sanitizeSchemaTextWithDiagnostics(rawText) {
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

function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item) => typeof item === 'string');
}

function asOptionList(values) {
    return values.map((value) => ({
        key: value,
        label: value,
    }));
}

function asRecordOfOptionLists(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, options]) => [
            key,
            asOptionList(asStringArray(options)),
        ]),
    );
}

function ensureGeneratedRoot() {
    mkdirSync(generatedRoot, { recursive: true });
}

function copyRequiredFiles() {
    for (const item of requiredCopies) {
        if (!existsSync(item.source)) {
            throw new Error(`Missing implementation input: ${item.source}`);
        }
        copyFileSync(item.source, item.destination);
    }
}

function writeCompactSchemaBundle() {
    if (!existsSync(schemaSource)) {
        throw new Error(`Missing implementation input: ${schemaSource}`);
    }

    const rawSchemaText = readFileSync(schemaSource, 'utf8');
    const {
        nanTokenCount,
        sanitizedText,
    } = sanitizeSchemaTextWithDiagnostics(rawSchemaText);
    const parsedSchema = JSON.parse(sanitizedText);
    const dropdownMasters = parsedSchema.dropdown_masters;
    const geographyContract = parsedSchema.geographic_scope_contract;

    const compactSchemaBundle = {
        schema: {
            metadata: parsedSchema.metadata,
            geographic_scope_contract: {
                enum_values: asStringArray(geographyContract?.enum_values),
                label_required_for: asStringArray(geographyContract?.label_required_for),
                default: typeof geographyContract?.default === 'string'
                    ? geographyContract.default
                    : undefined,
                ui_note: typeof geographyContract?.ui_note === 'string'
                    ? geographyContract.ui_note
                    : undefined,
            },
            connector_vocabulary: parsedSchema.connector_vocabulary ?? fallbackConnectorVocabulary,
        },
        diagnostics: {
            nanTokenCount,
            sanitized: nanTokenCount > 0,
        },
        lookups: {
            primaryVariables: asOptionList(
                asStringArray(dropdownMasters?.primary_dropdown_top10),
            ),
            hazardTypes: asOptionList(
                asStringArray(dropdownMasters?.hazard_types),
            ),
            timeframeUnits: asOptionList(
                asStringArray(dropdownMasters?.timeframe_units),
            ),
            geographyTypes: asOptionList(
                asStringArray(geographyContract?.enum_values),
            ),
            labelRequiredFor: asStringArray(geographyContract?.label_required_for),
            subcategoriesByVariable: asRecordOfOptionLists(
                dropdownMasters?.secondary_subcategory_dropdown,
            ),
            unitsByVariable: asRecordOfOptionLists(
                dropdownMasters?.canonical_to_units,
            ),
            operatorsByVariable: asRecordOfOptionLists(
                dropdownMasters?.canonical_to_operators,
            ),
            connectorVocabulary: parsedSchema.connector_vocabulary ?? fallbackConnectorVocabulary,
        },
    };

    writeFileSync(
        resolve(generatedRoot, 'ui_schema_compact.json'),
        `${JSON.stringify(compactSchemaBundle, null, 2)}\n`,
        'utf8',
    );
}

const thresholdsSource = resolve(
    inputsRoot,
    'schema',
    'normalized_thresholds_v2_gemini31.csv',
);

function parseCsvLine(line) {
    const result = [];
    let insideQuote = false;
    let currentToken = '';
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === '"') {
            if (insideQuote && line[index + 1] === '"') {
                currentToken += '"';
                index++; // skip next quote
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            result.push(currentToken.trim());
            currentToken = '';
        } else {
            currentToken += char;
        }
    }
    result.push(currentToken.trim());
    return result;
}

function parseCsv(rawText) {
    const lines = rawText.split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        rows.push(parseCsvLine(line));
    }
    return rows;
}

function normalizeLeadTimeValue(rawLeadTime, timeframeUnit, fallbackValue) {
    const leadTime = String(rawLeadTime ?? '').trim();
    const unit = String(timeframeUnit ?? '').trim();
    const valueWithoutUnit = unit && leadTime.toLowerCase().endsWith(` ${unit.toLowerCase()}`)
        ? leadTime.slice(0, -unit.length).trim()
        : '';

    if (/^\d+(?:\s*(?:-|to)\s*\d+)?$/i.test(valueWithoutUnit)) {
        return valueWithoutUnit
            .replace(/\s*to\s*/i, '-')
            .replace(/\s*-\s*/, '-');
    }

    return String(fallbackValue ?? '').trim();
}

function writePilotStatements() {
    if (!existsSync(thresholdsSource)) {
        throw new Error(`Missing implementation input: ${thresholdsSource}`);
    }
    const rawCsvText = readFileSync(thresholdsSource, 'utf8');
    const rows = parseCsv(rawCsvText);
    if (rows.length === 0) return;

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const documentIdIdx = headers.indexOf('document_id');
    const statementKeyIdx = headers.indexOf('statement_key');
    const triggerPhaseIdx = headers.indexOf('trigger_phase');
    const canonicalVariableIdx = headers.indexOf('canonical_variable');
    const subcategoryIdx = headers.indexOf('subcategory');
    const thresholdOperatorIdx = headers.indexOf('threshold_operator');
    const thresholdValueIdx = headers.indexOf('threshold_value');
    const thresholdUnitIdx = headers.indexOf('threshold_unit');
    const probabilityValueIdx = headers.indexOf('probability_value');
    const leadTimeIdx = headers.indexOf('lead_time');
    const leadTimeValueIdx = headers.indexOf('lead_time_value');
    const timeframeUnitIdx = headers.indexOf('timeframe_unit');
    const geographicScopeTypeIdx = headers.indexOf('geographic_scope_type');
    const geographicScopeLabelIdx = headers.indexOf('geographic_scope_label');
    const notesIdx = headers.indexOf('notes');
    const generationNotesIdx = headers.indexOf('generation_notes');
    const sourceAuthorityIdx = headers.indexOf('source_authority');
    const crossConnectorIdx = headers.indexOf('cross_statement_connector');
    const withinConnectorIdx = headers.indexOf('within_statement_connector');
    const statementOrderIdx = headers.indexOf('statement_order');
    const thresholdIndexIdx = headers.indexOf('threshold_index');

    const pilotEapsRaw = readFileSync(resolve(inputsRoot, 'examples', 'pilot_eaps.json'), 'utf8');
    const pilotEaps = JSON.parse(pilotEapsRaw);
    const pilotDocIds = new Set(pilotEaps.selected.map(item => String(item.document_id)));

    const statementsByDoc = {};

    for (const row of dataRows) {
        const docId = String(row[documentIdIdx]);
        if (!pilotDocIds.has(docId)) continue;

        if (!statementsByDoc[docId]) {
            statementsByDoc[docId] = [];
        }

        const probabilityValue = parseFloat(row[probabilityValueIdx]);
        const timeframeUnit = row[timeframeUnitIdx] || '';
        const leadTimeValue = normalizeLeadTimeValue(
            row[leadTimeIdx],
            timeframeUnit,
            row[leadTimeValueIdx],
        );

        statementsByDoc[docId].push({
            id: `${docId}-${row[statementKeyIdx]}-${row[statementOrderIdx] || 0}-${row[thresholdIndexIdx] ?? 0}`,
            phase: row[triggerPhaseIdx] || 'activation',
            canonicalVariable: row[canonicalVariableIdx] || '',
            subcategory: row[subcategoryIdx] || '',
            operator: row[thresholdOperatorIdx] || '',
            thresholdValue: row[thresholdValueIdx] || '',
            thresholdUnit: row[thresholdUnitIdx] || '',
            probabilityValue: isNaN(probabilityValue) ? undefined : probabilityValue,
            leadTimeValue: leadTimeValue || undefined,
            timeframeUnit,
            geographyType: row[geographicScopeTypeIdx] || 'national',
            geographyLabel: row[geographicScopeLabelIdx] || '',
            notes: row[notesIdx] || '',
            generationNotes: generationNotesIdx >= 0
                ? row[generationNotesIdx] || ''
                : '',
            withinConnector: row[withinConnectorIdx] || undefined,
            crossConnector: row[crossConnectorIdx] || undefined,
            sourceAuthority: row[sourceAuthorityIdx] || '',
        });
    }

    writeFileSync(
        resolve(generatedRoot, 'pilot_eap_statements.json'),
        `${JSON.stringify(statementsByDoc, null, 2)}\n`,
        'utf8',
    );
}

function writeSyncMetadata() {
    const syncedAt = new Date().toISOString();
    const metadata = {
        syncedAt,
        sources: [
            ...requiredCopies.map((item) => ({
                source: item.source,
                destination: item.destination,
                mode: 'copied',
            })),
            {
                source: schemaSource,
                destination: resolve(generatedRoot, 'ui_schema_compact.json'),
                mode: 'sanitized-and-compacted',
            },
            {
                source: thresholdsSource,
                destination: resolve(generatedRoot, 'pilot_eap_statements.json'),
                mode: 'parsed-from-csv',
            },
        ],
    };

    writeFileSync(
        resolve(generatedRoot, 'sync-metadata.json'),
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
    );
}

function main() {
    ensureGeneratedRoot();
    copyRequiredFiles();
    writeCompactSchemaBundle();
    writePilotStatements();
    writeSyncMetadata();
    console.log(`Synced and parsed implementation input files to ${generatedRoot}`);
}

main();
