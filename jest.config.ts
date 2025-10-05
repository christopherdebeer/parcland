export default {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest'
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/styleMock.js'
  },
  extensionsToTreatAsEsm: ['.ts'],
  testPathIgnorePatterns: ['/node_modules/']
};
