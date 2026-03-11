import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: ['src/version.ts', 'src/index.ts', 'src/**/*.test.*', 'src/components/**/*.tsx'],
            thresholds: {
                perFile: true,
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80
            }
        }
    }
});
