import 'mapbox-gl/dist/mapbox-gl.css';

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
import { useTranslation } from '@ifrc-go/ui/hooks';
import {
    SearchBoxCore,
    type SearchBoxFeatureSuggestion,
    type SearchBoxSuggestion,
    SessionToken,
} from '@mapbox/search-js-core';
import mapboxgl, {
    type MapboxGeoJSONFeature,
    type MapMouseEvent,
} from 'mapbox-gl';

import { mbtoken } from '#config';
import { localUnitMapStyle } from '#utils/map';

import type {
    DraftCountry,
    GeographySelection,
    TriggerDraft,
} from '../types';

import i18n from './i18n.json';
import styles from './styles.module.css';

interface Props {
    country: DraftCountry | undefined;
    trigger: TriggerDraft;
    onChange: (selection: GeographySelection) => void;
}

function getFeatureLabel(
    feature: SearchBoxFeatureSuggestion,
    fallback: string,
): string {
    return feature.properties.full_address
        || feature.properties.name_preferred
        || feature.properties.name
        || feature.properties.place_formatted
        || fallback;
}

function toSearchSelection(
    feature: SearchBoxFeatureSuggestion,
    source: GeographySelection['geographySource'],
    fallbackLabel: string,
): GeographySelection {
    const [longitude, latitude] = feature.geometry.coordinates;
    if (longitude === undefined || latitude === undefined) {
        throw new Error('Mapbox returned incomplete coordinates.');
    }

    return {
        geographyFeatureId: feature.properties.mapbox_id,
        geographyLabel: getFeatureLabel(feature, fallbackLabel),
        geographyCoordinates: { longitude, latitude },
        geographySource: source,
        geographyConfirmed: false,
    };
}

function labelFromProperties(
    properties: Record<string, unknown> | null | undefined,
    fallback: string,
): string {
    const name = typeof properties?.name === 'string' ? properties.name : undefined;
    const districtName = typeof properties?.district_name === 'string'
        ? properties.district_name
        : undefined;
    const adminOneName = typeof properties?.admin1_name === 'string'
        ? properties.admin1_name
        : undefined;
    if (name && adminOneName && name !== adminOneName) {
        return `${name} (${adminOneName})`;
    }

    return name ?? districtName ?? adminOneName ?? fallback;
}

function idFromProperties(
    properties: Record<string, unknown> | null | undefined,
): string | undefined {
    const rawId = properties?.id ?? properties?.code ?? properties?.district_id;
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
    fallbackLabel: string,
): GeographySelection {
    return {
        geographyFeatureId: idFromProperties(feature.properties),
        geographyLabel: labelFromProperties(feature.properties, fallbackLabel),
        geographyCoordinates: { longitude, latitude },
        geographySource: source,
        geographyConfirmed: false,
    };
}

function GeographySelector(props: Props) {
    const { country, onChange, trigger } = props;
    const strings = useTranslation(i18n);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | undefined>(undefined);
    const markerRef = useRef<mapboxgl.Marker | undefined>(undefined);
    const triggerRef = useRef(trigger);
    const importedLookupStartedRef = useRef(false);
    const sessionTokenRef = useRef(new SessionToken());
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState<string | undefined>();
    const [searchText, setSearchText] = useState('');
    const [suggestions, setSuggestions] = useState<SearchBoxSuggestion[]>([]);
    const [searching, setSearching] = useState(false);
    const [pendingSelection, setPendingSelection] = useState<GeographySelection | undefined>();

    triggerRef.current = trigger;

    const countryBbox = country?.boundingBox;
    const countrySelected = Boolean(
        country?.id
        && country.iso
        && country.iso3
        && countryBbox,
    );
    const isSearchGeography = trigger.geographyType === 'station_gauge'
        || trigger.geographyType === 'watershed_basin';

    const search = useMemo(() => (
        mbtoken
            ? new SearchBoxCore({
                accessToken: mbtoken,
                language: 'en',
                limit: 8,
            })
            : undefined
    ), []);

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
                throw new Error(strings.geographyRetrieveNoCoordinatesError);
            }
            const selection = toSearchSelection(
                feature,
                imported ? 'pilot_geocoded' : 'mapbox_search',
                strings.geographySelectedLocationFallback,
            );
            setPendingSelection(selection);
            updateMarker(selection);
            setSuggestions([]);
        } catch (reason) {
            setMapError(
                reason instanceof Error
                    ? reason.message
                    : strings.geographyRetrieveError,
            );
        } finally {
            setSearching(false);
        }
    }, [search, strings, updateMarker]);

    const runSearch = useCallback(async (query: string, imported = false) => {
        if (!search || !countryBbox || !country?.iso || query.trim().length < 2) {
            return;
        }

        setSearching(true);
        setMapError(undefined);
        try {
            const result = await search.suggest(query.trim(), {
                sessionToken: sessionTokenRef.current,
                bbox: countryBbox.join(','),
                country: country.iso,
                limit: 8,
            });
            if (imported) {
                const best = result.suggestions[0];
                if (best) {
                    await chooseSearchSuggestion(best, true);
                } else {
                    setMapError(strings.geographyImportedNoMatchError);
                }
                return;
            }

            setSuggestions(result.suggestions);
            if (result.suggestions.length === 0) {
                setMapError(strings.geographyNoResultsError);
            }
        } catch (reason) {
            setMapError(
                reason instanceof Error
                    ? reason.message
                    : strings.geographySearchUnavailableError,
            );
        } finally {
            setSearching(false);
        }
    }, [chooseSearchSuggestion, country?.iso, countryBbox, search, strings]);

    const reverseGeocode = useCallback(async (longitude: number, latitude: number) => {
        if (!search || !countryBbox || !country?.iso) {
            return;
        }

        setSearching(true);
        setMapError(undefined);
        try {
            const response = await search.reverse(
                { lng: longitude, lat: latitude },
                {
                    bbox: countryBbox.join(','),
                    country: country.iso,
                    limit: 1,
                },
            );
            const feature = response.features[0];
            const selection: GeographySelection = feature
                ? {
                    ...toSearchSelection(
                        feature,
                        'mapbox_pin',
                        strings.geographySelectedLocationFallback,
                    ),
                    geographyCoordinates: { longitude, latitude },
                }
                : {
                    geographyLabel: `${strings.geographySelectedLocationFallback} (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
                    geographyCoordinates: { longitude, latitude },
                    geographySource: 'mapbox_pin',
                    geographyConfirmed: false,
                };
            setPendingSelection(selection);
            updateMarker(selection);
        } catch (reason) {
            setMapError(
                reason instanceof Error
                    ? reason.message
                    : strings.geographyReverseError,
            );
        } finally {
            setSearching(false);
        }
    }, [country?.iso, countryBbox, search, strings, updateMarker]);

    useEffect(() => {
        if (
            !country
            || !countrySelected
            || !mbtoken
            || !mapContainerRef.current
            || !countryBbox
        ) {
            return undefined;
        }

        const rootStyle = getComputedStyle(document.documentElement);
        const activeColor = rootStyle
            .getPropertyValue('--go-ui-color-primary-red')
            .trim() || 'red';
        const activeOutlineColor = rootStyle
            .getPropertyValue('--go-ui-color-primary-red-dark')
            .trim() || 'darkred';
        mapboxgl.accessToken = mbtoken;
        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: localUnitMapStyle,
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
            event: MapMouseEvent & { features?: MapboxGeoJSONFeature[] },
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
                strings.geographySelectedAdminFallback,
            );
            setMapError(undefined);
            setPendingSelection(selection);
            updateMarker(selection);
        };

        map.on('load', () => {
            setMapLoaded(true);
            map.getCanvas().setAttribute(
                'aria-label',
                `${strings.geographyMapAriaLabel} ${country.name}`,
            );

            if (trigger.geographyType === 'regional') {
                const layerId = 'admin-1-highlight';
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, 'visibility', 'visible');
                    map.setFilter(layerId, ['==', ['get', 'country_iso'], country.iso]);
                    map.setPaintProperty(layerId, 'fill-color', activeColor);
                    map.setPaintProperty(layerId, 'fill-opacity', 0.22);
                    map.setPaintProperty(layerId, 'fill-outline-color', activeOutlineColor);
                    map.on('click', layerId, adminClick('go_admin1'));
                    map.on('mouseenter', layerId, () => {
                        map.getCanvas().style.cursor = 'pointer';
                    });
                    map.on('mouseleave', layerId, () => {
                        map.getCanvas().style.cursor = '';
                    });
                } else {
                    setMapError(strings.geographyAdminOneUnavailableError);
                }
            }

            if (trigger.geographyType === 'administrative_unit') {
                const sourceId = 'trigger-builder-admin2-source';
                const layerId = 'trigger-builder-admin2';
                map.addSource(sourceId, {
                    type: 'vector',
                    url: `mapbox://go-ifrc.go-admin2-${country.iso3}-staging`,
                });
                map.addLayer({
                    id: layerId,
                    type: 'fill',
                    source: sourceId,
                    'source-layer': `go-admin2-${country.iso3}-staging`,
                    paint: {
                        'fill-color': activeColor,
                        'fill-opacity': 0.2,
                        'fill-outline-color': activeOutlineColor,
                    },
                });
                map.on('click', layerId, adminClick('go_admin2'));
                map.on('mouseenter', layerId, () => {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', layerId, () => {
                    map.getCanvas().style.cursor = '';
                });
            }

            if (isSearchGeography) {
                map.on('click', (event) => {
                    reverseGeocode(event.lngLat.lng, event.lngLat.lat).catch(() => undefined);
                });
            }

            const currentTrigger = triggerRef.current;
            const existingSelection: GeographySelection | undefined = (
                currentTrigger.geographyCoordinates
                    ? {
                        geographyFeatureId: currentTrigger.geographyFeatureId,
                        geographyLabel: currentTrigger.geographyLabel,
                        geographyCoordinates: currentTrigger.geographyCoordinates,
                        geographySource: currentTrigger.geographySource,
                        geographyConfirmed: currentTrigger.geographyConfirmed,
                    }
                    : undefined
            );
            updateMarker(existingSelection);
        });
        map.on('error', (event) => {
            setMapError(event.error?.message ?? strings.geographyMapLoadError);
        });

        return () => {
            markerRef.current?.remove();
            markerRef.current = undefined;
            map.remove();
            mapRef.current = undefined;
            setMapLoaded(false);
        };
    }, [
        country,
        countryBbox,
        countrySelected,
        isSearchGeography,
        reverseGeocode,
        strings,
        trigger.geographyType,
        updateMarker,
    ]);

    useEffect(() => {
        const currentSelection: GeographySelection | undefined = trigger.geographyCoordinates
            ? {
                geographyFeatureId: trigger.geographyFeatureId,
                geographyLabel: trigger.geographyLabel,
                geographyCoordinates: trigger.geographyCoordinates,
                geographySource: trigger.geographySource,
                geographyConfirmed: trigger.geographyConfirmed,
            }
            : undefined;
        updateMarker(currentSelection);
    }, [
        trigger.geographyConfirmed,
        trigger.geographyCoordinates,
        trigger.geographyFeatureId,
        trigger.geographyLabel,
        trigger.geographySource,
        updateMarker,
    ]);

    useEffect(() => {
        if (
            !mapLoaded
            || importedLookupStartedRef.current
            || trigger.geographyConfirmed
            || !trigger.geographyLabel.trim()
            || trigger.geographyType === 'national'
        ) {
            return;
        }
        importedLookupStartedRef.current = true;
        runSearch(trigger.geographyLabel, true).catch(() => undefined);
    }, [
        mapLoaded,
        runSearch,
        trigger.geographyConfirmed,
        trigger.geographyLabel,
        trigger.geographyType,
    ]);

    const handleSearchClick = useCallback(() => {
        runSearch(searchText).catch(() => undefined);
    }, [runSearch, searchText]);

    const handleMapCenterSelection = useCallback(() => {
        const map = mapRef.current;
        if (!map) {
            return;
        }

        const center = map.getCenter();
        if (isSearchGeography) {
            reverseGeocode(center.lng, center.lat).catch(() => undefined);
            return;
        }
        let layerId: string | undefined;
        if (trigger.geographyType === 'regional') {
            layerId = 'admin-1-highlight';
        } else if (trigger.geographyType === 'administrative_unit') {
            layerId = 'trigger-builder-admin2';
        }
        if (!layerId || !map.getLayer(layerId)) {
            return;
        }
        const feature = map.queryRenderedFeatures(
            map.project(center),
            { layers: [layerId] },
        )[0];
        if (!feature) {
            setMapError(strings.geographyAdminCenterNoFeatureError);
            return;
        }
        const selection = toAdminSelection(
            feature,
            center.lng,
            center.lat,
            trigger.geographyType === 'regional' ? 'go_admin1' : 'go_admin2',
            strings.geographySelectedAdminFallback,
        );
        setMapError(undefined);
        setPendingSelection(selection);
        updateMarker(selection);
    }, [
        isSearchGeography,
        reverseGeocode,
        strings,
        trigger.geographyType,
        updateMarker,
    ]);

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
            geographyFeatureId: undefined,
            geographyCoordinates: undefined,
            geographySource: undefined,
            geographyConfirmed: false,
        });
    }, [onChange]);

    if (!countrySelected) {
        return (
            <Message
                compact
                title={strings.geographyCountryRequiredTitle}
                description={strings.geographyCountryRequiredDescription}
            />
        );
    }

    if (!mbtoken) {
        return (
            <Message
                compact
                title={strings.geographyMapboxUnavailableTitle}
                description={strings.geographyMapboxUnavailableDescription}
            />
        );
    }

    const displayedSelection = pendingSelection ?? (trigger.geographyLabel ? {
        geographyFeatureId: trigger.geographyFeatureId,
        geographyLabel: trigger.geographyLabel,
        geographyCoordinates: trigger.geographyCoordinates,
        geographySource: trigger.geographySource,
        geographyConfirmed: trigger.geographyConfirmed,
    } : undefined);
    let selectionTitle: string | undefined;
    if (displayedSelection?.geographyConfirmed) {
        selectionTitle = strings.geographyConfirmedSelectionTitle;
    } else if (trigger.geographyLabel && !pendingSelection) {
        selectionTitle = strings.geographyImportedSelectionTitle;
    } else if (displayedSelection) {
        selectionTitle = strings.geographyPendingSelectionTitle;
    }

    return (
        <div className={styles.selectorStack}>
            {isSearchGeography && (
                <>
                    <div className={styles.searchRow}>
                        <TextInput
                            name="mapboxSearch"
                            label={strings.geographySearchLabel}
                            aria-label={strings.geographySearchLabel}
                            value={searchText}
                            onChange={(value) => setSearchText(value ?? '')}
                            placeholder={strings.geographySearchPlaceholder}
                        />
                        <Button
                            name={undefined}
                            styleVariant="outline"
                            onClick={handleSearchClick}
                            disabled={searching || searchText.trim().length < 2}
                        >
                            {searching
                                ? strings.geographySearchingButtonLabel
                                : strings.geographySearchButtonLabel}
                        </Button>
                    </div>
                    {suggestions.length > 0 && (
                        <div
                            className={styles.suggestionList}
                            aria-label={strings.geographySearchResultsLabel}
                        >
                            {suggestions.map((suggestion) => (
                                <Button
                                    key={suggestion.mapbox_id}
                                    name={undefined}
                                    className={styles.suggestionButton}
                                    styleVariant="transparent"
                                    onClick={() => {
                                        chooseSearchSuggestion(suggestion).catch(() => undefined);
                                    }}
                                >
                                    {`${suggestion.name} - ${suggestion.place_formatted}`}
                                </Button>
                            ))}
                        </div>
                    )}
                </>
            )}

            <div
                className={styles.mapFrame}
                role="application"
                aria-label={`${strings.geographyMapAriaLabel} ${country?.name}`}
            >
                <div ref={mapContainerRef} className={styles.mapCanvas} />
                {!mapLoaded && !mapError && (
                    <div className={styles.mapLoading}>
                        {strings.geographyMapLoadingLabel}
                    </div>
                )}
            </div>

            <div className={styles.keyboardSelectionRow}>
                <Description textSize="xs">
                    {strings.geographyKeyboardDescription}
                </Description>
                <Button
                    name={undefined}
                    styleVariant="outline"
                    onClick={handleMapCenterSelection}
                    disabled={!mapLoaded || searching}
                >
                    {isSearchGeography
                        ? strings.geographyDropPinButtonLabel
                        : strings.geographySelectAdminButtonLabel}
                </Button>
            </div>

            {mapError && (
                <Message
                    compact
                    title={strings.geographyMapUnavailableTitle}
                    description={`${mapError} ${strings.geographyConfirmationBlockedDescription}`}
                />
            )}

            {trigger.geographyType === 'watershed_basin' && (
                <Message
                    compact
                    title={strings.geographyBasinReferenceTitle}
                    description={strings.geographyBasinReferenceDescription}
                />
            )}

            {displayedSelection && (
                <div className={styles.selectionCard}>
                    <p className={styles.selectionTitle}>
                        {selectionTitle}
                    </p>
                    <p className={styles.selectionMeta}>
                        {displayedSelection.geographyLabel}
                    </p>
                    {displayedSelection.geographyCoordinates && (
                        <Description textSize="xs">
                            {`${displayedSelection.geographyCoordinates.latitude.toFixed(5)}, ${displayedSelection.geographyCoordinates.longitude.toFixed(5)}`}
                        </Description>
                    )}
                    <div className={styles.actionRow}>
                        {pendingSelection && (
                            <Button
                                name={undefined}
                                styleVariant="filled"
                                onClick={handleConfirm}
                            >
                                {strings.geographyConfirmButtonLabel}
                            </Button>
                        )}
                        <Button
                            name={undefined}
                            styleVariant="outline"
                            onClick={handleClear}
                        >
                            {strings.geographyClearButtonLabel}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default GeographySelector;
