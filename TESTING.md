# Testing Strategy & Documentation

This document outlines the testing approach, tools, and best practices for the Parcland project.

## Table of Contents

- [Overview](#overview)
- [Testing Philosophy](#testing-philosophy)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Coverage Requirements](#coverage-requirements)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

The Parcland project uses a multi-layered testing strategy to ensure code quality and catch bugs early:

- **Unit Tests**: Test individual functions and classes in isolation
- **Integration Tests**: Test interactions between services and components
- **Contract Tests**: Verify API contracts remain consistent across refactoring
- **Property-Based Tests**: Use randomized inputs to find edge cases automatically
- **E2E Tests**: Test complete user workflows through the browser
- **Mutation Testing**: Validate test quality by introducing code mutations

### Current Test Coverage

- **Overall Coverage**: ~70% statement coverage
- **Service Classes**: 68-88% coverage with higher thresholds (80% target)
- **Total Tests**: 450+ tests across 17 test suites
- **E2E Tests**: 13 end-to-end scenarios
- **Property-Based Tests**: 12 invariant tests

## Testing Philosophy

### 1. Test Behavior, Not Implementation

Focus on testing **what** the code does, not **how** it does it. This makes tests resilient to refactoring.

**Good Example:**
```typescript
it('should allow multi-selection of elements', () => {
  selectionManager.selectElement('el-1');
  selectionManager.selectElement('el-2', true); // additive

  expect(selectionManager.getSelectedIds().size).toBe(2);
});
```

**Bad Example:**
```typescript
it('should add element to internal Set', () => {
  selectionManager.selectElement('el-1');

  // Testing internal implementation
  expect(selectionManager._selectedIds.has('el-1')).toBe(true);
});
```

### 2. Test at the Right Level

- **Unit tests** for business logic and algorithms
- **Integration tests** for service interactions
- **Contract tests** for API boundaries
- **Property-based tests** for invariants and edge cases
- **E2E tests** for critical user workflows

### 3. Test Failures, Not Just Success Cases

Always test error conditions, edge cases, and boundary conditions:

```typescript
it('should handle empty selection gracefully', () => {
  selectionManager.clearSelection();
  expect(selectionManager.getSelectedIds().size).toBe(0);
});

it('should clamp scale to MAX_SCALE', () => {
  viewportManager.setViewState({ scale: 999 });
  // Behavior depends on implementation - document expectations
});
```

## Test Types

### Unit Tests

Located in: `tests/*.test.ts`

Test individual functions, classes, and modules in isolation. Use mocks for external dependencies.

**Example:**
```typescript
describe('HistoryManager', () => {
  it('should maintain undo/redo stacks', () => {
    const manager = new HistoryManager(getState, setState);

    manager.snapshot('Action 1');
    manager.snapshot('Action 2');

    expect(manager.canUndo()).toBe(true);
    manager.undo();
    expect(manager.canRedo()).toBe(true);
  });
});
```

### Integration Tests

Located in: `tests/services-integration.test.ts`

Test interactions between multiple services or components. Verify that services work together correctly.

**Example:**
```typescript
it('should support complete pan workflow with undo/redo', () => {
  // Setup ViewportManager and HistoryManager
  const viewportManager = new ViewportManager(...);
  const historyManager = new HistoryManager(...);

  // Perform pan operation
  viewportManager.getViewState().translateX += 100;
  historyManager.snapshot('Pan');

  // Undo should restore previous state
  historyManager.undo();
  expect(viewportManager.getViewState().translateX).toBe(0);
});
```

### Contract Tests

Located in: `tests/service-contracts.test.ts`

Verify that service APIs maintain their contracts (mutability, reference equality, etc.) even after refactoring.

**Example:**
```typescript
it('getViewState() should return mutable reference', () => {
  const state1 = viewportManager.getViewState();
  const state2 = viewportManager.getViewState();

  // Should be the same object (reference equality)
  expect(state1).toBe(state2);

  // Mutations should be visible
  state1.translateX = 999;
  expect(state2.translateX).toBe(999);
});
```

### Property-Based Tests

Located in: `tests/property-based.test.ts`

Property-based tests use the `fast-check` library to automatically generate hundreds of random inputs and verify that certain invariants always hold true. This helps find edge cases that manual tests might miss.

**Example:**
```typescript
import fc from 'fast-check';

it('selection should be idempotent', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string(), { minLength: 1, maxLength: 20 }),
      (elementIds) => {
        const manager = new SelectionManager(...);

        // Select the same element multiple times
        const elementId = elementIds[0];
        manager.selectElement(elementId);
        manager.selectElement(elementId);
        manager.selectElement(elementId);

        // Should only be selected once
        expect(manager.getSelectedIds().size).toBe(1);
      }
    )
  );
});
```

**Benefits:**
- Finds edge cases automatically
- Tests hundreds of inputs in seconds
- Validates invariants across the input space
- Catches bugs that manual tests miss

**Example Invariants Tested:**
- `undo` followed by `redo` restores state
- Selection remains unchanged when viewport transforms
- History operations preserve state integrity
- Clear selection always results in empty set

### E2E Tests

Located in: `tests/e2e/*.spec.ts`

End-to-end tests use Playwright to test the application through a real browser, simulating actual user interactions.

**Example:**
```typescript
import { test, expect } from '@playwright/test';

test('should create a text element via command palette', async ({ page }) => {
  await page.goto('/');

  // Open command palette (Cmd/Ctrl+K)
  await page.keyboard.press('Control+K');

  // Type "text" to filter commands
  await page.keyboard.type('text');
  await page.keyboard.press('Enter');

  // Verify that a text element was created
  const elements = page.locator('.canvas-element');
  await expect(elements).toHaveCount(1);
});
```

**Running E2E tests:**
```bash
npm run test:e2e              # Run all E2E tests
npm run test:e2e:ui           # Run with Playwright UI
npm run test:e2e:headed       # Run in headed mode (visible browser)
```

**Test Coverage:**
- Canvas loading and initialization
- Element creation via command palette
- Pan and zoom gestures
- Selection (single and multi-select)
- Undo/redo functionality
- Keyboard shortcuts
- Drag and drop
- Error handling

**Best Practices:**
- Use data-testid attributes for reliable selectors
- Test user-facing behavior, not implementation
- Use page.waitForSelector for dynamic content
- Screenshot on failure (configured automatically)

### Mutation Testing

Mutation testing validates the quality of your tests by introducing small changes (mutations) to the code and checking if tests catch them.

**Running mutation tests:**
```bash
npm run test:mutation
```

This will:
1. Create mutants (modified versions of your code)
2. Run tests against each mutant
3. Report which mutants "survived" (weren't caught by tests)

**Target**: 80% mutation score for service classes

## Running Tests

### All Tests

```bash
npm test
```

Runs linting, type-checking, and all test suites.

### Unit Tests Only

```bash
npm run test:unit
```

Runs Jest tests without linting/type-checking.

### Watch Mode

```bash
npm run test:watch
```

Runs tests in watch mode - automatically re-runs tests when files change.

### Mutation Tests

```bash
npm run test:mutation
```

Runs Stryker mutation testing on service classes.

### E2E Tests

```bash
npm run test:e2e              # Run all E2E tests
npm run test:e2e:ui           # Run with Playwright UI
npm run test:e2e:headed       # Run in headed mode (visible browser)
```

Runs Playwright E2E tests in real browsers.

### All Tests

```bash
npm run test:all
```

Runs both unit/integration tests and E2E tests.

### Specific Test File

```bash
npm run test:unit -- tests/service-contracts.test.ts
```

### Coverage Report

```bash
npm run test:unit
# Open coverage/index.html in browser
```

## Writing Tests

### Test Structure

Follow the **Arrange-Act-Assert** pattern:

```typescript
it('should do something useful', () => {
  // Arrange: Set up test data and dependencies
  const manager = new ServiceManager(...);
  const initialState = manager.getState();

  // Act: Perform the operation
  manager.doSomething();

  // Assert: Verify the outcome
  expect(manager.getState()).not.toBe(initialState);
});
```

### Test Data Factories

Use factories to create test data consistently:

```typescript
const createTestElement = (overrides = {}) => ({
  id: 'el-' + Math.random(),
  x: 100,
  y: 100,
  width: 120,
  height: 80,
  ...overrides
});

it('should position element', () => {
  const element = createTestElement({ x: 200, y: 300 });
  expect(element.x).toBe(200);
});
```

### Mocking

Use Jest mocks for external dependencies:

```typescript
const mockElementRegistry = {
  getDefinition: jest.fn(() => ({ type: 'text', schema: {} })),
  getAllTypes: jest.fn(() => []),
  getTypeLabel: jest.fn(() => 'Text')
};

const controller = new CanvasController(state, mockElementRegistry);
```

### DOM Setup

For tests requiring DOM elements:

```typescript
beforeEach(() => {
  document.body.innerHTML = `
    <div id="canvas"></div>
    <div id="canvas-container"></div>
  `;

  // Mock DOM APIs
  const canvas = document.getElementById('canvas')!;
  canvas.getBoundingClientRect = jest.fn(() => ({
    width: 800,
    height: 600,
    // ...
  }));
});

afterEach(() => {
  document.body.innerHTML = '';
});
```

## Coverage Requirements

### Global Thresholds

Enforced via `jest.config.ts`:

- **Statements**: 70%
- **Branches**: 50%
- **Functions**: 60%
- **Lines**: 70%

### Service Class Thresholds

Higher standards for refactored service classes (`src/services/**/*.ts`):

- **Statements**: 80%
- **Branches**: 50%
- **Functions**: 75%
- **Lines**: 80%

### Mutation Testing Thresholds

Configured in `stryker.config.json`:

- **High**: 80% (excellent test quality)
- **Low**: 60% (acceptable)
- **Break**: 50% (build fails below this)

## CI/CD Integration

### Pre-Commit Hooks

Configured via Husky and lint-staged:

**On `git commit`:**
1. Run ESLint with auto-fix on changed files
2. Run Prettier on changed files
3. Run tests for changed source files
4. Commit fails if any step fails

### GitHub Actions

The CI pipeline runs:
1. Linting
2. Type checking
3. Full test suite
4. Coverage reporting

## Best Practices

### 1. Test File Organization

- Place tests in `tests/` directory
- Name test files: `<module>.test.ts`
- Group related tests with `describe` blocks
- Use descriptive test names that explain behavior

### 2. Test Naming

Use "should" statements:
```typescript
it('should allow in-place mutation of viewState')
it('should maintain undo/redo stacks')
it('should handle empty selection gracefully')
```

### 3. Keep Tests Focused

Each test should verify one behavior:

**Good:**
```typescript
it('should add element to selection', () => {
  selectionManager.selectElement('el-1');
  expect(selectionManager.getSelectedIds().has('el-1')).toBe(true);
});

it('should support multi-selection', () => {
  selectionManager.selectElement('el-1');
  selectionManager.selectElement('el-2', true);
  expect(selectionManager.getSelectedIds().size).toBe(2);
});
```

**Bad:**
```typescript
it('should handle selection', () => {
  // Tests too many things at once
  selectionManager.selectElement('el-1');
  expect(selectionManager.getSelectedIds().has('el-1')).toBe(true);

  selectionManager.selectElement('el-2', true);
  expect(selectionManager.getSelectedIds().size).toBe(2);

  selectionManager.clearSelection();
  expect(selectionManager.getSelectedIds().size).toBe(0);
});
```

### 4. Don't Test Implementation Details

Test the public API, not internal state:

**Good:**
```typescript
it('should persist viewState mutations', () => {
  const viewState = viewportManager.getViewState();
  viewState.translateX += 100;

  // Test through public API
  expect(viewportManager.getViewState().translateX).toBe(100);
});
```

**Bad:**
```typescript
it('should update internal viewState property', () => {
  viewportManager.setViewState({ translateX: 100 });

  // Accessing private/internal state
  expect(viewportManager._viewState.translateX).toBe(100);
});
```

### 5. Test Edge Cases

Always test boundary conditions:

```typescript
it('should handle empty element list', () => {
  const elements = [];
  const result = calculateBoundingBox(elements);
  expect(result).toBeNull();
});

it('should handle single element', () => {
  const elements = [createTestElement()];
  const result = calculateBoundingBox(elements);
  expect(result).toEqual({ x1: 100, y1: 100, x2: 220, y2: 180 });
});
```

## Critical Bugs Caught by Testing

The testing strategy successfully caught these critical bugs during Phase 1/2 refactoring:

### Bug #1: ViewportManager.setViewState() Breaking Reference Equality

**Issue**: `setViewState()` was creating a new object with spread operator, breaking code that relied on reference equality.

**Test that caught it:**
```typescript
it('setViewState() should update the mutable reference', () => {
  const originalState = manager.getViewState();
  manager.setViewState({ translateX: 500 });

  // This failed because setViewState created new object
  expect(originalState.translateX).toBe(500);
});
```

**Fix**: Changed to use `Object.assign()` for in-place mutation.

### Bug #2: HistoryManager Initialization Order

**Issue**: If `HistoryManager` was initialized before `ViewportManager`, it would capture undefined `viewState`.

**Test that caught it:**
```typescript
it('should not capture undefined viewState when HistoryManager initialized after ViewportManager', () => {
  const viewportManager = new ViewportManager(...);
  const historyManager = new HistoryManager(...);

  expect(viewportManager.getViewState()).toBeDefined();
  expect(() => historyManager.undo()).not.toThrow();
});
```

**Fix**: Documentation and test coverage ensures correct initialization order.

### Bug #3: selectedElementIds Returning New Set

**Issue**: Getter was returning a new Set on each call, losing mutations.

**Test that caught it:**
```typescript
it('should allow in-place mutation of selectedElementIds Set', () => {
  const selectedIds = selectionManager.getSelectedIds();
  selectedIds.add('el-1');

  // This failed because getter returned new Set
  expect(selectionManager.getSelectedIds().has('el-1')).toBe(true);
});
```

**Fix**: Ensured getter returns mutable reference.

## Troubleshooting

### Tests Pass Locally but Fail in CI

**Possible causes:**
- Different Node.js versions
- Missing environment setup
- Timing issues with async operations

**Solutions:**
- Check Node.js version matches CI
- Ensure `tests/setup.js` has all necessary polyfills
- Use `await` for all async operations

### Mutation Tests Show Low Score

**If mutants survive:**
1. Review the specific mutants in the Stryker report
2. Add tests that verify the mutated behavior fails
3. Focus on branch coverage and boundary conditions

### Tests Are Slow

**Optimization strategies:**
- Use `describe.only` and `it.only` during development
- Run specific test files: `npm run test:unit -- tests/specific.test.ts`
- Use `--maxWorkers=4` to limit Jest parallelism
- Mock expensive operations (network, timers, etc.)

### Coverage Not Improving

**Common issues:**
- Testing implementation instead of behavior
- Not testing edge cases
- Missing error handling tests

**Solutions:**
- Review uncovered lines in coverage report
- Add tests for error conditions
- Test boundary values (0, -1, MAX, etc.)

## Future Testing Enhancements

### Visual Regression Testing

Visual regression testing can catch unintended UI changes by comparing screenshots.

**Recommended Tools:**
- **Percy**: Automated visual testing platform
- **Chromatic**: Visual testing for Storybook components
- **Playwright Visual Comparisons**: Built-in screenshot comparison

**Implementation Approach:**
1. Take baseline screenshots of key UI states
2. On each commit, capture new screenshots
3. Compare pixel-by-pixel differences
4. Flag visual changes for human review

**Example with Playwright:**
```typescript
test('should render canvas correctly', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('canvas-initial-state.png');
});
```

**Benefits:**
- Catch CSS regressions
- Detect layout shifts
- Verify responsive design
- Document visual changes

### Performance Testing

Monitor application performance over time.

**Recommended Approach:**
- Use Playwright to measure page load times
- Track rendering performance with Performance API
- Set performance budgets in CI
- Monitor bundle size changes

**Example:**
```typescript
test('should load within 2 seconds', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(2000);
});
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [fast-check Documentation](https://fast-check.dev/)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Stryker Mutator Documentation](https://stryker-mutator.io/docs/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [Property-Based Testing Guide](https://fsharpforfunandprofit.com/posts/property-based-testing/)

## Contributing

When adding new code:

1. Write tests **before** or **alongside** implementation
2. Ensure tests pass locally: `npm test`
3. Check coverage: Review `coverage/index.html`
4. Run mutation tests: `npm run test:mutation` (for service classes)
5. Consider E2E tests for user-facing features: `npm run test:e2e`
6. Pre-commit hooks will run automatically

When reviewing PRs:

- Verify test coverage for new code
- Check that tests are testing behavior, not implementation
- Ensure edge cases are covered
- Look for integration tests for service interactions
- Verify E2E tests cover critical user workflows
- Consider property-based tests for complex logic

### Test Selection Guide

**When to write Unit Tests:**
- Business logic and algorithms
- Data transformations
- Utility functions
- Individual class methods

**When to write Integration Tests:**
- Service-to-service interactions
- State management across components
- Event handling chains

**When to write Contract Tests:**
- Public API boundaries
- Service interfaces
- Refactoring existing code

**When to write Property-Based Tests:**
- Complex algorithms with invariants
- Functions with many edge cases
- Mathematical operations
- State machines

**When to write E2E Tests:**
- Critical user workflows
- Multi-step interactions
- UI interactions
- Cross-browser compatibility

---

**Last Updated**: 2025-10-04
**Maintained By**: Development Team
