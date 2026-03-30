import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
    '^@main/(.*)$':     '<rootDir>/src/main/$1',
    '^@shared/(.*)$':   '<rootDir>/src/shared/$1',
    '^electron$':       '<rootDir>/tests/__mocks__/electron.ts',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/renderer/features/**/*.ts',
    'src/renderer/features/**/*.tsx',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80 },
  },
};

export default config;
