export default {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  transform: {},
  testPathIgnorePatterns: ['/node_modules/']
};
