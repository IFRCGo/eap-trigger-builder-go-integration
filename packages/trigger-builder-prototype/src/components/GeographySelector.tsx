import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Button,
    Description,
    Message,
    TextInput,
} from '@ifrc-go/ui';
import {
    SearchBoxCore,
    SessionToken,
    type SearchBoxFeatureSuggestion,
    type SearchBoxSuggestion,
} from '@mapbox/search-js-core';
import mapboxgl, {
    type MapMouseEvent,
    type MapboxGeoJSONFeature,
} from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { getRuntimeMapboxToken } from '../config/runtime';
import type {
    GeographySelection,
    MetadataState,
    StatementDraftState,
} from '../types/app';
import styles from './GeographySelector.module.css';

const ifrcMapStyle = 'mapbox://styles/go-ifrc/clvvgugzh00x501pc1n00b8cz';

interface GeographySelectorProps {
    country: MetadataState;
    statement: StatementDraftState;
    onChange: (selection: GeographySelection) => void;
}

function getFeatureLabel(feature: SearchBoxFeatureSuggestion): string {
    return feature.properties.full_address
        || feature.properties.name_preferred
        || feature.properties.name
        || feature.properties.place_formatted
        || 'Selected location';
}

function toSearchSelection(
    feature: SearchBoxFeatureSuggestion,
    source: GeographySelection['geographySource'],
): GeographySelection {
    const [longitude, latitude] = feature.geometry.coordinates;
    if (longitude === undefined || latitude === undefined) {
        throw new Error('Mapbox returned incomplete coordinates.');
    }
    return {
        geographyFeatureId: feature.properties.mapbox_id,
        geographyLabel: getFeatureLabel(feature),
        geographyCoordinates: { longitude, latitude },
        geographySource: source,
        geographyConfirmed: false,
    };
}

function labelFromProperties(properties: Record<string, unknown> | null | undefined): string {
    const name = typeof properties?.name === 'string' ? properties.name : undefined;
    const adminOneName = typeof properties?.admin1_name === 'string' ? properties.admin1_name : undefined;
    if (name && adminOneName && name !== adminOneName) {
        return `${name} (${adminOneName})`;
    }
    return name ?? adminOneName ?? 'Selected administrative area';
}

function idFromProperties(properties: Record<string, unknown> | null | undefined): string | undefined {
    const rawId = properties?.id ?? properties?.code;
    if (typeof rawId === 'string' || typeof rawId === 'number') {
        return String(rawId);
    }
    return undefined;
}

function toAdminSelection(
    feature: MapboxGeoJSONFeature,
    longitude: number,
    latitude: number,
    source: 'go_admin1' | 'go_admin2',
): GeographySelection {
    return {
        geographyFeatureId: idFromProperties(feature.properties),
        geographyLabel: labelFromProperties(feature.properties),
        geographyCoordinates: { longitude, latitude },
        geographySource: source,
        geographyConfirmed: false,
    };
}

function GeographySelector(props: GeographySelectorProps) {
    const { country, onChange, statement } = props;
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | undefined>(undefined);
    const markerRef = useRef<mapboxgl.Marker | undefined>(undefined);
    const statementRef = useRef(statement);
    const importedLookupStartedRef = useRef(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState<string | undefined>();
    const [searchText, setSearchText] = useState('');
    const [suggestions, setSuggestions] = useState<SearchBoxSuggestion[]>([]);
    const [searching, setSearching] = useState(false);
    const [pendingSelection, setPendingSelection] = useState<GeographySelection | undefined>();
    const mapboxToken = getRuntimeMapboxToken();
    const sessionTokenRef = useRef(new SessionToken());

    statementRef.current = statement;

    const countryBbox = country.countryBoundingBox;
    const countryIso = country.countryIso;
    const countryIso3 = country.countryIso3;
    const countrySelected = Boolean(country.countryId && countryIso && countryIso3 && countryBbox);
    const isSearchGeography = statement.geographyType === 'station_gauge'
        || statement.geographyType === 'watershed_basin';

    const search = useMemo(() => (
        mapboxToken
            ? new SearchBoxCore({
                accessToken: mapboxToken,
                language: 'en',
                limit: 8,
            })
            : undefined
    ), [mapboxToken]);

    const updateMarker = useCallback((selection: GeographySelection | undefined) => {
        const map = mapRef.current;
        const coordinates = selection?.geographyCoordinates;
        markerRef.current?.remove();
        markerRef.current = undefined;
        if (!map || !coordinates) {
            return;
        }
        const markerColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--go-ui-color-primary-red')
            .trim() || 'red';
        markerRef.current = new mapboxgl.Marker({ color: markerColor })
            .setLngLat([coordinates.longitude, coordinates.latitude])
            .addTo(map);
        map.easeTo({
            center: [coordinates.longitude, coordinates.latitude],
            zoom: Math.max(map.getZoom(), 9),
        });
    }, []);

    const chooseSearchSuggestion = useCallback(async (
        suggestion: SearchBoxSuggestion,
        imported = false,
    ) => {
        if (!search) {
            return;
        }
        setSearching(true);
        setMapError(undefined);
        try {
            const response = await search.retrieve(suggestion, {
                sessionToken: sessionTokenRef.current,
            });
            const feature = response.features[0];
            if (!feature) {
                throw new Error('Mapbox returned no coordinates for this result.');
            }
            const selection = toSearchSelection(
                feature,
                imported ? 'pilot_geocoded' : 'mapbox_search',
            );
            setPendingSelection(selection);
            updateMarker(selection);
            setSuggestions([]);
        } catch (reason) {
            setMapError(reason instanceof Error ? reason.message : 'Mapbox could not retrieve that location.');
        } finally {
            setSearching(false);
        }
    }, [search, updateMarker]);

    const runSearch = useCallback(async (query: string, imported = false) => {
        if (!search || !countryBbox || !countryIso || query.trim().length < 2) {
            return;
        }
        setSearching(true);
        setMapError(undefined);
        try {
            const result = await search.suggest(query.trim(), {
                sessionToken: sessionTokenRef.current,
                bbox: countryBbox.join(','),
                country: countryIso,
                limit: 8,
            });
            if (imported) {
                const best = result.suggestions[0];
                if (best) {
                    await chooseSearchSuggestion(best, true);
                } else {
                    setMapError('The imported geography could not be matched. Select a new location.');
                }
                return;
            }
            setSuggestions(result.suggestions);
            if (result.suggestions.length === 0) {
                setMapError('No Mapbox results were found inside the selected country.');
            }
        } catch (reason) {
            setMapError(reason instanceof Error ? reason.message : 'Mapbox Search is unavailable.');
        } finally {
            setSearching(false);
        }
    }, [chooseSearchSuggestion, countryBbox, countryIso, search]);

    const reverseGeocode = useCallback(async (longitude: number, latitude: number) => {
        if (!search || !countryBbox || !countryIso) {
            return;
        }
        setSearching(true);
        setMapError(undefined);
        try {
            const response = await search.reverse(
                { lng: longitude, lat: latitude },
                {
                    bbox: countryBbox.join(','),
                    country: countryIso,
                    limit: 1,
                },
            );
            const feature = response.features[0];
            if (!feature) {
                throw new Error('Mapbox could not identify the dropped pin.');
            }
            const selection: GeographySelection = {
                ...toSearchSelection(feature, 'mapbox_pin'),
                geographyCoordinates: { longitude, latitude },
            };
            setPendingSelection(selection);
            updateMarker(selection);
        } catch (reason) {
            setMapError(reason instanceof Error ? reason.message : 'Reverse geocoding failed.');
        } finally {
            setSearching(false);
        }
    }, [countryBbox, countryIso, search, updateMarker]);

    useEffect(() => {
        if (
            !countrySelected
            || !mapboxToken
            || !mapContainerRef.current
            || !countryBbox
            || !countryIso3
        ) {
            return undefined;
        }
        const rootStyle = getComputedStyle(document.documentElement);
        const activeColor = rootStyle.getPropertyValue('--go-ui-color-primary-red').trim() || 'red';
        const activeOutlineColor = rootStyle.getPropertyValue('--go-ui-color-primary-red-dark').trim() || 'darkred';
        mapboxgl.accessToken = mapboxToken;
        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: ifrcMapStyle,
            bounds: [
                [countryBbox[0], countryBbox[1]],
                [countryBbox[2], countryBbox[3]],
            ],
            fitBoundsOptions: { padding: 36 },
            attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;

        const adminClick = (source: 'go_admin1' | 'go_admin2') => (
            event: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }
        ) => {
            const feature = event.features?.[0];
            if (!feature) {
                return;
            }
            const selection = toAdminSelection(
                feature,
                event.lngLat.lng,
                event.lngLat.lat,
                source,
            );
            setPendingSelection(selection);
            updateMarker(selection);
        };

        map.on('load', () => {
            setMapLoaded(true);
            map.getCanvas().setAttribute(
                'aria-label',
                `Interactive geography map for ${country.countryName}. Use arrow keys to pan.`,
            );
            if (statement.geographyType === 'regional') {
                const referenceLayer = map.getLayer('admin-1-highlight')
                    ?? map.getLayer('admin-1-boundary');
                const referenceSource = referenceLayer && 'source' in referenceLayer
                    ? referenceLayer.source
                    : undefined;
                const referenceSourceLayer = referenceLayer && 'source-layer' in referenceLayer
                    ? referenceLayer['source-layer']
                    : undefined;
                if (referenceSource && referenceSourceLayer) {
                    map.addLayer({
                        id: 'trigger-builder-admin1',
                        type: 'fill',
                        source: referenceSource,
                        'source-layer': referenceSourceLayer,
                        filter: ['==', ['get', 'country_iso3'], countryIso3],
                        paint: {
                            'fill-color': activeColor,
                            'fill-opacity': 0.22,
                            'fill-outline-color': activeOutlineColor,
                        },
                    });
                    map.on('click', 'trigger-builder-admin1', adminClick('go_admin1'));
                    map.on('mouseenter', 'trigger-builder-admin1', () => { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', 'trigger-builder-admin1', () => { map.getCanvas().style.cursor = ''; });
                } else {
                    setMapError('The IFRC Admin-1 layer is not available for this token or style.');
                }
            }

            if (statement.geographyType === 'administrative_unit') {
                const sourceId = 'trigger-builder-admin2-source';
                const layerId = 'trigger-builder-admin2';
                map.addSource(sourceId, {
                    type: 'vector',
                    url: `mapbox://go-ifrc.go-admin2-${countryIso3}-staging`,
                });
                map.addLayer({
                    id: layerId,
                    type: 'fill',
                    source: sourceId,
                    'source-layer': `go-admin2-${countryIso3}-staging`,
                    paint: {
                        'fill-color': activeColor,
                        'fill-opacity': 0.2,
                        'fill-outline-color': activeOutlineColor,
                    },
                });
                map.on('click', layerId, adminClick('go_admin2'));
                map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
            }

            if (isSearchGeography) {
                map.on('click', (event) => {
                    void reverseGeocode(event.lngLat.lng, event.lngLat.lat);
                });
            }

            const currentStatement = statementRef.current;
            const existingSelection: GeographySelection | undefined = currentStatement.geographyCoordinates
                ? {
                    geographyFeatureId: currentStatement.geographyFeatureId,
                    geographyLabel: currentStatement.geographyLabel,
                    geographyCoordinates: currentStatement.geographyCoordinates,
                    geographySource: currentStatement.geographySource,
                    geographyConfirmed: currentStatement.geographyConfirmed,
                }
                : undefined;
            updateMarker(existingSelection);
        });
        map.on('error', (event) => {
            const message = event.error?.message ?? 'Mapbox failed to load the required map resources.';
            setMapError(message);
        });

        return () => {
            markerRef.current?.remove();
            markerRef.current = undefined;
            map.remove();
            mapRef.current = undefined;
            setMapLoaded(false);
        };
    }, [
        countryBbox,
        countryIso3,
        countrySelected,
        country.countryName,
        isSearchGeography,
        mapboxToken,
        reverseGeocode,
        statement.geographyType,
        updateMarker,
    ]);

    useEffect(() => {
        const currentSelection: GeographySelection | undefined = statement.geographyCoordinates
            ? {
                geographyFeatureId: statement.geographyFeatureId,
                geographyLabel: statement.geographyLabel,
                geographyCoordinates: statement.geographyCoordinates,
                geographySource: statement.geographySource,
                geographyConfirmed: statement.geographyConfirmed,
            }
            : undefined;
        updateMarker(currentSelection);
    }, [
        statement.geographyConfirmed,
        statement.geographyCoordinates,
        statement.geographyFeatureId,
        statement.geographyLabel,
        statement.geographySource,
        updateMarker,
    ]);

    useEffect(() => {
        if (
            !mapLoaded
            || importedLookupStartedRef.current
            || statement.geographyConfirmed
            || !statement.geographyLabel.trim()
            || statement.geographyType === 'national'
        ) {
            return;
        }
        importedLookupStartedRef.current = true;
        void runSearch(statement.geographyLabel, true);
    }, [
        mapLoaded,
        runSearch,
        statement.geographyConfirmed,
        statement.geographyLabel,
        statement.geographyType,
    ]);

    const handleSearchClick = useCallback(() => {
        void runSearch(searchText);
    }, [runSearch, searchText]);

    const handleMapCenterSelection = useCallback(() => {
        const map = mapRef.current;
        if (!map) {
            return;
        }
        const center = map.getCenter();
        if (isSearchGeography) {
            void reverseGeocode(center.lng, center.lat);
            return;
        }
        const layerId = statement.geographyType === 'regional'
            ? 'trigger-builder-admin1'
            : statement.geographyType === 'administrative_unit'
                ? 'trigger-builder-admin2'
                : undefined;
        if (!layerId || !map.getLayer(layerId)) {
            return;
        }
        const feature = map.queryRenderedFeatures(map.project(center), { layers: [layerId] })[0];
        if (!feature) {
            setMapError('No administrative feature is visible at the map centre. Pan the map and try again.');
            return;
        }
        const selection = toAdminSelection(
            feature,
            center.lng,
            center.lat,
            statement.geographyType === 'regional' ? 'go_admin1' : 'go_admin2',
        );
        setMapError(undefined);
        setPendingSelection(selection);
        updateMarker(selection);
    }, [isSearchGeography, reverseGeocode, statement.geographyType, updateMarker]);

    const handleConfirm = useCallback(() => {
        if (pendingSelection) {
            onChange({ ...pendingSelection, geographyConfirmed: true });
            setPendingSelection(undefined);
        }
    }, [onChange, pendingSelection]);

    const handleClear = useCallback(() => {
        setPendingSelection(undefined);
        setSuggestions([]);
        setSearchText('');
        markerRef.current?.remove();
        markerRef.current = undefined;
        onChange({
            geographyLabel: '',
            geographyConfirmed: false,
        });
    }, [onChange]);

    if (!countrySelected) {
        return (
            <Message
                compact
                title="Select a country first"
                description="A structured GO country is required before geography can be selected."
            />
        );
    }

    if (!mapboxToken) {
        return (
            <Message
                compact
                title="Mapbox unavailable"
                description="No runtime Mapbox public token is configured. Geography confirmation is blocked; no fallback country or location will be substituted."
            />
        );
    }

    const displayedSelection = pendingSelection ?? (statement.geographyLabel ? {
        geographyFeatureId: statement.geographyFeatureId,
        geographyLabel: statement.geographyLabel,
        geographyCoordinates: statement.geographyCoordinates,
        geographySource: statement.geographySource,
        geographyConfirmed: statement.geographyConfirmed,
    } : undefined);

    return (
        <div className={styles.selectorStack}>
            {isSearchGeography && (
                <>
                    <div className={styles.searchRow}>
                        <TextInput
                            name="mapboxSearch"
                            label="Search within selected country"
                            aria-label="Search within selected country"
                            value={searchText}
                            onChange={(value) => setSearchText(value ?? '')}
                            placeholder="Search for a station, gauge, basin reference, or place"
                        />
                        <Button
                            name={undefined}
                            styleVariant="outline"
                            onClick={handleSearchClick}
                            disabled={searching || searchText.trim().length < 2}
                        >
                            {searching ? 'Searching…' : 'Search Mapbox'}
                        </Button>
                    </div>
                    {suggestions.length > 0 && (
                        <div className={styles.suggestionList} aria-label="Mapbox search results">
                            {suggestions.map((suggestion) => (
                                <Button
                                    key={suggestion.mapbox_id}
                                    name={undefined}
                                    className={styles.suggestionButton}
                                    styleVariant="transparent"
                                    onClick={() => { void chooseSearchSuggestion(suggestion); }}
                                >
                                    {suggestion.name} · {suggestion.place_formatted}
                                </Button>
                            ))}
                        </div>
                    )}
                </>
            )}

            <div className={styles.mapFrame} role="application" aria-label={`Geography map for ${country.countryName}`}>
                <div ref={mapContainerRef} className={styles.mapCanvas} />
                {!mapLoaded && !mapError && (
                    <div className={styles.mapLoading}>Loading Mapbox and IFRC geography layers…</div>
                )}
            </div>

            <div className={styles.keyboardSelectionRow}>
                <Description textSize="xs">
                    Keyboard option: focus the map, use arrow keys to position its centre,
                    then use the selection button.
                </Description>
                <Button
                    name={undefined}
                    styleVariant="outline"
                    onClick={handleMapCenterSelection}
                    disabled={!mapLoaded || Boolean(mapError) || searching}
                >
                    {isSearchGeography
                        ? 'Drop pin at map centre'
                        : 'Select administrative area at map centre'}
                </Button>
            </div>

            {mapError && (
                <Message
                    compact
                    title="Mapbox geography unavailable"
                    description={`${mapError} Geography confirmation remains blocked.`}
                />
            )}

            {statement.geographyType === 'watershed_basin' && (
                <Message
                    compact
                    title="Reference location only"
                    description="A basin chosen through Search or a dropped pin is a reference location, not an authoritative watershed polygon."
                />
            )}

            {displayedSelection && (
                <div className={styles.selectionCard}>
                    <p className={styles.selectionTitle}>
                        {displayedSelection.geographyConfirmed
                            ? 'Confirmed geography'
                            : statement.geographyLabel && !pendingSelection
                                ? 'Unverified imported location'
                                : 'Selection awaiting confirmation'}
                    </p>
                    <p className={styles.selectionMeta}>{displayedSelection.geographyLabel}</p>
                    {displayedSelection.geographyCoordinates && (
                        <Description textSize="xs">
                            {displayedSelection.geographyCoordinates.latitude.toFixed(5)}, {' '}
                            {displayedSelection.geographyCoordinates.longitude.toFixed(5)}
                        </Description>
                    )}
                    <div className={styles.actionRow}>
                        {pendingSelection && !mapError && (
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                onClick={handleConfirm}
                            >
                                Confirm geography
                            </Button>
                        )}
                        <Button
                            name={undefined}
                            styleVariant="outline"
                            onClick={handleClear}
                        >
                            Clear selection
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default GeographySelector;
