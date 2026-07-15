import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Message,
    SearchSelectInput,
} from '@ifrc-go/ui';

import {
    fetchGoCountries,
    findCountryByLegacyName,
    type GoCountry,
} from '../api/countries';

interface CountrySelectorProps {
    legacyName: string;
    value: number | undefined;
    onChange: (country: GoCountry | undefined) => void;
}

function countryKeySelector(country: GoCountry): number {
    return country.id;
}

function countryLabelSelector(country: GoCountry): string {
    return country.name;
}

function countryDescriptionSelector(country: GoCountry): string {
    return `${country.iso3} · ${country.record_type_display}`;
}

function CountrySelector(props: CountrySelectorProps) {
    const { legacyName, onChange, value } = props;
    const [countries, setCountries] = useState<GoCountry[]>([]);
    const [filteredCountries, setFilteredCountries] = useState<GoCountry[]>([]);
    const [pending, setPending] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        const controller = new AbortController();
        fetchGoCountries(controller.signal)
            .then((nextCountries) => {
                setCountries(nextCountries);
                setFilteredCountries(nextCountries);
                setError(undefined);
            })
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) {
                    setError(reason instanceof Error ? reason.message : 'The GO country service is unavailable.');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setPending(false);
                }
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (value !== undefined || countries.length === 0 || !legacyName.trim()) {
            return;
        }
        const match = findCountryByLegacyName(countries, legacyName);
        if (match) {
            onChange(match);
        }
    }, [countries, legacyName, onChange, value]);

    const selectedCountry = useMemo(
        () => countries.find((country) => country.id === value),
        [countries, value],
    );

    const handleSearch = useCallback((searchText: string | undefined) => {
        const normalized = searchText?.trim().toLocaleLowerCase();
        if (!normalized) {
            setFilteredCountries(countries);
            return;
        }
        setFilteredCountries(countries.filter((country) => (
            country.name.toLocaleLowerCase().includes(normalized)
            || country.iso3.toLocaleLowerCase().includes(normalized)
        )));
    }, [countries]);

    const handleChange = useCallback((
        countryId: number | undefined,
        _name: 'countryId',
        country: GoCountry | undefined,
    ) => {
        if (countryId === undefined) {
            onChange(undefined);
            return;
        }
        onChange(country ?? countries.find((item) => item.id === countryId));
    }, [countries, onChange]);

    return (
        <>
            <SearchSelectInput
                name="countryId"
                label="Country"
                value={selectedCountry?.id ?? value}
                options={countries}
                searchOptions={filteredCountries}
                keySelector={countryKeySelector}
                labelSelector={countryLabelSelector}
                descriptionSelector={countryDescriptionSelector}
                onChange={handleChange}
                onSearchValueChange={handleSearch}
                optionsPending={pending}
                optionsErrored={Boolean(error)}
                selectedOnTop
                placeholder="Select a GO country"
                required
            />
            {error && (
                <Message
                    compact
                    title="Country list unavailable"
                    description={`${error} Country selection is required before generation.`}
                />
            )}
        </>
    );
}

export default CountrySelector;
