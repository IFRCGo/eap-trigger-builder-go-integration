import {
    StrictMode,
    type ReactNode,
    useCallback,
    useMemo,
    useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import '@ifrc-go/ui/index.css';
import {
    LanguageContext,
    type Language,
    type LanguageContextProps,
    type LanguageNamespaceStatus,
} from '@ifrc-go/ui/contexts';

import App from './App';
import './index.css';

interface PrototypeLanguageProviderProps {
    children: ReactNode;
}

// eslint-disable-next-line react-refresh/only-export-components
function PrototypeLanguageProvider(props: PrototypeLanguageProviderProps) {
    const { children } = props;

    const [strings, setStrings] = useState<LanguageContextProps['strings']>({});
    const [currentLanguage, setCurrentLanguage] = useState<Language>('en');
    const [
        languageNamespaceStatus,
        setLanguageNamespaceStatus,
    ] = useState<Record<string, LanguageNamespaceStatus>>({});

    const registerLanguageNamespace = useCallback((
        namespace: string,
        fallbackStrings: Record<string, string>,
    ) => {
        setStrings((prevValue) => {
            if (prevValue[namespace] !== undefined) {
                return {
                    ...prevValue,
                    [namespace]: {
                        ...fallbackStrings,
                        ...prevValue[namespace],
                    },
                };
            }

            return {
                ...prevValue,
                [namespace]: fallbackStrings,
            };
        });

        setLanguageNamespaceStatus((prevValue) => {
            if (prevValue[namespace] !== undefined) {
                return prevValue;
            }

            return {
                ...prevValue,
                [namespace]: 'queued',
            };
        });
    }, []);

    const languageContextValue = useMemo<LanguageContextProps>(() => ({
        languageNamespaceStatus,
        setLanguageNamespaceStatus,
        currentLanguage,
        setCurrentLanguage,
        strings,
        setStrings,
        registerNamespace: registerLanguageNamespace,
    }), [
        currentLanguage,
        languageNamespaceStatus,
        registerLanguageNamespace,
        strings,
    ]);

    return (
        <LanguageContext.Provider value={languageContextValue}>
            {children}
        </LanguageContext.Provider>
    );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Root element #root was not found.');
}

createRoot(rootElement).render(
    <StrictMode>
        <PrototypeLanguageProvider>
            <App />
        </PrototypeLanguageProvider>
    </StrictMode>,
);
