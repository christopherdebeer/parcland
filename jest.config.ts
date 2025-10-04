export default {
  testEnvironment: "jsdom",
  moduleFileExtensions: ["js", "ts"],
  testMatch: ["**/tests/**/*.test.js", "**/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/setup.js"],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  coverageThresholds: {
    global: {
      statements: 70,
      branches: 50,
      functions: 60,
      lines: 70,
    },
    // Higher thresholds for service classes (our refactored code)
    "./src/services/**/*.ts": {
      statements: 80,
      branches: 50,
      functions: 75,
      lines: 80,
    },
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/tests/styleMock.js",
  },
  extensionsToTreatAsEsm: [".ts"],
  testPathIgnorePatterns: ["/node_modules/"],
};
