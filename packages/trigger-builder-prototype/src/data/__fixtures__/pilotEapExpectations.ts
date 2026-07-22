/**
 * Gold-standard expectations for all 18 pilot EAPs.
 *
 * Each entry captures:
 *   - totalStatements: the expected number of parsed StatementDraftState objects
 *   - phaseDistribution: statement count per phase after parsePilotStatements applies defaults
 *   - proseOnlyIndices: indices (0-based) where both canonicalVariable AND operator are '' in raw data
 *   - spotChecks: 2–4 field-level assertions per EAP (using raw-data values, before defaults are applied)
 *
 * IMPORTANT: parsePilotStatements applies two defaults to raw data:
 *   - phase '' → 'activation'
 *   - geographyType '' → 'national'
 * All expected values below reflect these post-default values.
 */

export interface SpotCheck {
    index: number;
    phase: string;
    canonicalVariable: string;
    operator: string;
    thresholdValue: string;
    geographyType: string;
    sourceAuthority?: string;
    withinConnector?: string;
    crossConnector?: string;
}

export interface EapExpectation {
    totalStatements: number;
    phaseDistribution: {
        pre_activation: number;
        activation: number;
        stop: number;
    };
    /** 0-based indices of statements where canonicalVariable==='' AND operator==='' in raw data */
    proseOnlyIndices: number[];
    spotChecks: SpotCheck[];
}

export const pilotEapExpectations: Record<string, EapExpectation> = {
    '16389': {
        totalStatements: 4,
        phaseDistribution: { pre_activation: 0, activation: 2, stop: 2 },
        proseOnlyIndices: [3],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Wind',
                operator: '>=',
                thresholdValue: '34',
                geographyType: 'regional',
                sourceAuthority: 'CENAOS (Center for Atmospheric, Oceanographic and Seismic Studies) or NOAA (National Oceanic and Atmospheric Administration)',
                crossConnector: 'ENABLES',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '==',
                thresholdValue: '10',
                geographyType: 'watershed_basin',
                sourceAuthority: 'GEOGLOWS (Group on Earth Observations Global Water Sustainability) / GloFAS (Global Flood Awareness System)',
            },
            {
                index: 2,
                phase: 'stop',
                canonicalVariable: 'Wind',
                operator: 'reduction',
                thresholdValue: 'tropical disturbance',
                geographyType: 'national',
                withinConnector: 'OR',
                sourceAuthority: 'competent forecasting authorities',
            },
            {
                index: 3,
                phase: 'stop',
                canonicalVariable: '',
                operator: '',
                thresholdValue: 'abrupt change',
                geographyType: 'national',
                sourceAuthority: 'competent forecasting authorities',
            },
        ],
    },

    '16399': {
        totalStatements: 9,
        phaseDistribution: { pre_activation: 3, activation: 5, stop: 1 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Precipitation',
                operator: '',
                thresholdValue: 'normal to above-normal',
                geographyType: 'national',
                sourceAuthority: 'Department of Climate Change and Meteorological Services',
                withinConnector: 'AND',
                crossConnector: 'THEN',
            },
            {
                index: 3,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: '>=',
                thresholdValue: '100',
                geographyType: 'watershed_basin',
                sourceAuthority: 'DCCMS (Department of Climate Change and Meteorological Services)',
                withinConnector: 'OR',
                crossConnector: 'THEN',
            },
            {
                index: 8,
                phase: 'stop',
                canonicalVariable: 'Precipitation',
                operator: 'reduction',
                thresholdValue: '',
                geographyType: 'national',
                sourceAuthority: 'DCCMS',
            },
        ],
    },

    '16416': {
        totalStatements: 21,
        phaseDistribution: { pre_activation: 2, activation: 19, stop: 0 },
        proseOnlyIndices: [1],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Hydrological Flow',
                operator: 'between',
                thresholdValue: '2 to 5',
                geographyType: 'station_gauge',
                sourceAuthority: 'GLOFAS',
            },
            {
                index: 1,
                phase: 'pre_activation',
                canonicalVariable: '',
                operator: '',
                thresholdValue: '',
                geographyType: 'watershed_basin',
                sourceAuthority: 'PMD',
            },
            {
                index: 20,
                phase: 'activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '>=',
                thresholdValue: '700000',
                geographyType: 'station_gauge',
                sourceAuthority: 'FFD',
            },
        ],
    },

    '16440': {
        totalStatements: 1,
        phaseDistribution: { pre_activation: 0, activation: 1, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: '>',
                thresholdValue: '150',
                geographyType: 'watershed_basin',
                sourceAuthority: 'Directorate General of Meteorology (DGM)',
            },
        ],
    },

    '16445': {
        totalStatements: 1,
        phaseDistribution: { pre_activation: 0, activation: 1, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: '<',
                thresholdValue: '33',
                geographyType: 'regional',
                sourceAuthority: 'Directorate of Meteorology and Hydrology (DMH) - Climate Outlook Bulletin',
            },
        ],
    },

    '16473': {
        totalStatements: 2,
        phaseDistribution: { pre_activation: 0, activation: 2, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Temperature',
                operator: '>',
                thresholdValue: '95',
                geographyType: 'administrative_unit',
                sourceAuthority: 'National Hydrometeorological Agency (IGEO), using European Centre for Medium-Range Weather Forecasts (ECMWF) forecasts',
                withinConnector: 'AND',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Temperature',
                operator: '>',
                thresholdValue: '95',
                geographyType: 'administrative_unit',
                sourceAuthority: 'National Hydrometeorological Agency (IGEO), using European Centre for Medium-Range Weather Forecasts (ECMWF) forecasts',
            },
        ],
    },

    '16527': {
        totalStatements: 4,
        phaseDistribution: { pre_activation: 0, activation: 4, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Population Impact',
                operator: '>=',
                thresholdValue: '1290',
                geographyType: 'administrative_unit',
                sourceAuthority: 'Transitional Justice Committee, OCHA or the Ombudsman\'s Office',
                withinConnector: 'OR',
            },
            {
                index: 3,
                phase: 'activation',
                canonicalVariable: 'Population Impact',
                operator: '>=',
                thresholdValue: '2078',
                geographyType: 'administrative_unit',
                sourceAuthority: 'Transitional Justice Committee, OCHA or the Ombudsman\'s Office',
            },
        ],
    },

    '16566': {
        totalStatements: 5,
        phaseDistribution: { pre_activation: 2, activation: 3, stop: 0 },
        proseOnlyIndices: [4],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Alert/Warning Status',
                operator: '==',
                thresholdValue: 'Orange',
                geographyType: 'administrative_unit',
                sourceAuthority: 'DNMG',
                withinConnector: 'AND',
                crossConnector: 'THEN',
            },
            {
                index: 1,
                phase: 'pre_activation',
                canonicalVariable: 'Precipitation',
                operator: '>=',
                thresholdValue: '150',
                geographyType: 'administrative_unit',
                sourceAuthority: 'DNMG',
                crossConnector: 'THEN',
            },
            {
                index: 4,
                phase: 'activation',
                canonicalVariable: '',
                operator: '',
                thresholdValue: '',
                geographyType: 'national',
            },
        ],
    },

    '16567': {
        totalStatements: 4,
        phaseDistribution: { pre_activation: 2, activation: 2, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Precipitation',
                operator: '>',
                thresholdValue: '50',
                geographyType: 'national',
                sourceAuthority: 'BMKG',
            },
            {
                index: 1,
                phase: 'pre_activation',
                canonicalVariable: 'Hydrological Flow',
                operator: 'IN',
                thresholdValue: 'Waspada (Alert), Siaga (Standby), or Awas (Warning)',
                geographyType: 'station_gauge',
                sourceAuthority: 'PUPR',
            },
            {
                index: 3,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: '>',
                thresholdValue: '80',
                geographyType: 'regional',
                sourceAuthority: 'BNPB',
            },
        ],
    },

    '16633': {
        totalStatements: 1,
        phaseDistribution: { pre_activation: 0, activation: 1, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Temperature',
                operator: '>=',
                thresholdValue: '42.4',
                geographyType: 'administrative_unit',
                sourceAuthority: 'National Meteorological Agency (ANAM)',
            },
        ],
    },

    '16845': {
        totalStatements: 8,
        phaseDistribution: { pre_activation: 3, activation: 3, stop: 2 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '>',
                thresholdValue: '2',
                geographyType: 'station_gauge',
                sourceAuthority: 'GLOFAS',
                crossConnector: 'OR',
            },
            {
                index: 1,
                phase: 'pre_activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '',
                thresholdValue: 'extreme and widespread',
                geographyType: 'watershed_basin',
                sourceAuthority: 'DHM/RIMES',
                withinConnector: 'AND',
                crossConnector: 'THEN',
            },
            {
                index: 7,
                phase: 'stop',
                canonicalVariable: 'Hydrological Flow',
                operator: '==',
                thresholdValue: 'rising trend',
                geographyType: 'station_gauge',
                sourceAuthority: 'DHM',
            },
        ],
    },

    '16877': {
        totalStatements: 3,
        phaseDistribution: { pre_activation: 1, activation: 1, stop: 1 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Other',
                operator: '==',
                thresholdValue: 'issued',
                geographyType: 'regional',
                sourceAuthority: 'INSIVUMEH',
                crossConnector: 'PRECEDES',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: '<=',
                thresholdValue: '33',
                geographyType: 'national',
                sourceAuthority: 'INSIVUMEH',
                crossConnector: 'ENABLES',
            },
            {
                index: 2,
                phase: 'stop',
                canonicalVariable: 'Precipitation',
                operator: '==',
                thresholdValue: 'not confirmed',
                geographyType: 'national',
                sourceAuthority: 'INSIVUMEH',
            },
        ],
    },

    '17044': {
        totalStatements: 6,
        phaseDistribution: { pre_activation: 0, activation: 4, stop: 2 },
        proseOnlyIndices: [3, 5],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '>=',
                thresholdValue: '5',
                geographyType: 'station_gauge',
                sourceAuthority: 'DNGRH',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '>=',
                thresholdValue: '5',
                geographyType: 'station_gauge',
                sourceAuthority: 'REPRESA project through GloFAS',
                crossConnector: 'OR',
            },
        ],
    },

    '17240': {
        totalStatements: 5,
        phaseDistribution: { pre_activation: 1, activation: 3, stop: 1 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Volcanic Activity',
                operator: '',
                thresholdValue: 'significant changes/increase in internal activity',
                geographyType: 'regional',
                sourceAuthority: 'IGEPN',
                crossConnector: 'PRECEDES',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Volcanic Activity',
                operator: '',
                thresholdValue: 'Increase of parameters of internal activity',
                geographyType: 'national',
                sourceAuthority: 'IGEPN',
                withinConnector: 'OR',
            },
            {
                index: 4,
                phase: 'stop',
                canonicalVariable: 'Volcanic Activity',
                operator: '',
                thresholdValue: 'no greater variation is observed or when the activity decreases',
                geographyType: 'national',
                sourceAuthority: 'IGEPN',
            },
        ],
    },

    '17253': {
        totalStatements: 3,
        phaseDistribution: { pre_activation: 1, activation: 2, stop: 0 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Population Impact',
                operator: '<',
                thresholdValue: 'Category 3 with 45% excess mortality',
                geographyType: 'administrative_unit',
                sourceAuthority: 'NOA',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Population Impact',
                operator: '==',
                thresholdValue: '3',
                geographyType: 'administrative_unit',
                sourceAuthority: 'NOA',
                withinConnector: 'AND',
            },
            {
                index: 2,
                phase: 'activation',
                canonicalVariable: 'Population Impact',
                operator: '>=',
                thresholdValue: '45',
                geographyType: 'administrative_unit',
                sourceAuthority: 'NOA',
            },
        ],
    },

    '17366': {
        totalStatements: 5,
        phaseDistribution: { pre_activation: 2, activation: 2, stop: 1 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'pre_activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '>',
                thresholdValue: '150000',
                geographyType: 'station_gauge',
                sourceAuthority: 'FFD/PMD',
                withinConnector: 'AND',
                crossConnector: 'THEN',
            },
            {
                index: 1,
                phase: 'pre_activation',
                canonicalVariable: 'Hydrological Flow',
                operator: '',
                thresholdValue: 'very high to exceptionally high flooding',
                geographyType: 'station_gauge',
                sourceAuthority: 'FFD/PMD',
                crossConnector: 'THEN',
            },
            {
                index: 4,
                phase: 'stop',
                canonicalVariable: 'Hydrological Flow',
                operator: '<=',
                thresholdValue: '150000',
                geographyType: 'watershed_basin',
                sourceAuthority: 'FFD/PMD',
            },
        ],
    },

    '17595': {
        totalStatements: 3,
        phaseDistribution: { pre_activation: 0, activation: 2, stop: 1 },
        proseOnlyIndices: [2],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Other',
                operator: '',
                thresholdValue: '',
                geographyType: 'regional',
                sourceAuthority: 'COPECO/CENAOS',
                crossConnector: 'AND',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: 'between',
                thresholdValue: '10 and 20',
                geographyType: 'regional',
                sourceAuthority: 'COPECO/CENAOS',
            },
            {
                index: 2,
                phase: 'stop',
                canonicalVariable: '',
                operator: '',
                thresholdValue: '',
                geographyType: 'national',
            },
        ],
    },

    '26012': {
        totalStatements: 4,
        phaseDistribution: { pre_activation: 0, activation: 3, stop: 1 },
        proseOnlyIndices: [],
        spotChecks: [
            {
                index: 0,
                phase: 'activation',
                canonicalVariable: 'Precipitation',
                operator: '>=',
                thresholdValue: 'below-normal',
                geographyType: 'administrative_unit',
                sourceAuthority: 'ECMWF',
            },
            {
                index: 1,
                phase: 'activation',
                canonicalVariable: 'Agricultural Impact',
                operator: '>=',
                thresholdValue: '40',
                geographyType: 'administrative_unit',
                sourceAuthority: 'Ministry of Livestock',
            },
            {
                index: 3,
                phase: 'stop',
                canonicalVariable: 'Precipitation',
                operator: '',
                thresholdValue: 'significant improvement',
                geographyType: 'national',
            },
        ],
    },
};

export const ALL_PILOT_EAP_IDS = Object.keys(pilotEapExpectations) as (keyof typeof pilotEapExpectations)[];
