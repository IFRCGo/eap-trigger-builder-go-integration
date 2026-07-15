import reactSwc from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [reactSwc()],
    css: {
        modules: {
            localsConvention: 'camelCaseOnly',
        },
    },
    server: {
        host: '0.0.0.0',
        port: 3101,
        strictPort: true,
    },
    preview: {
        host: '0.0.0.0',
        port: 4101,
        strictPort: true,
    },
    test: {
        environment: 'happy-dom',
    },
});
