# CanvasController Refactoring Plan

## Executive Summary

This document outlines the complete refactoring strategy for the CanvasController monolith (`src/main.ts:14-1288`, 1,274 lines). The goal is to reduce complexity, improve maintainability, and enable future enhancements without altering behavior or losing features.

**Current State:** Single monolithic class with 40+ properties, 60+ methods, and deep coupling.

**Target State:** Component-based architecture with clear separation of concerns, independent testability, and manageable complexity.

**Approach:** Hybrid phased refactoring (conservative → progressive → transformative)

**Timeline:** 7-10 weeks total across 3 phases

---

## Strategy Overview

We're using a **Hybrid Approach** that combines:
1. **Phase 1:** Service extraction (conservative, low risk)
2. **Phase 2:** Rendering abstraction (moderate risk)
3. **Phase 3:** Full component architecture (transformative)

This allows us to:
- Deliver value incrementally
- Test in production between phases
- Stop at any phase if needed
- Learn and adapt as we progress

---

## Phase 1: Extract Service Classes (CURRENT)

**Goal:** Extract cohesive groups of methods into dedicated service classes

**Timeline:** 2-3 weeks

**Risk Level:** Low

**Complexity Reduction:** 40-50%

### Services to Extract

#### 1.1 HistoryManager
**Location:** `src/main.ts:263-300`

**Responsibilities:**
- Undo/redo stack management
- Snapshot creation and restoration
- History limits (ring buffer)

**Interface:**
```typescript
class HistoryManager {
  undo(): void
  redo(): void
  snapshot(label: string): void
  canUndo(): boolean
  canRedo(): boolean
}
```

**Dependencies:**
- Needs reference to controller for state access
- Emits events when history changes (for UI updates)

**Test Coverage:**
- Snapshot creation preserves state
- Undo/redo operations work correctly
- Stack limits enforced
- Redo stack cleared on new action

**Success Metrics:**
- HistoryManager < 150 lines
- All existing history tests pass
- No behavior changes

---

#### 1.2 ViewportManager
**Location:** `src/main.ts:454-530`

**Responsibilities:**
- View state (scale, translate)
- Coordinate transformations (screen ↔ canvas)
- Viewport persistence (localStorage)
- Recenter operations

**Interface:**
```typescript
class ViewportManager {
  getViewState(): ViewState
  setViewState(state: ViewState): void
  screenToCanvas(px: number, py: number): { x: number; y: number }
  recenterOnElement(elId: string): void
  loadLocalViewState(): void
  saveLocalViewState(): void
  updateTransform(): void
}
```

**Dependencies:**
- Canvas DOM element (for offsets)
- CanvasState (for element lookup during recenter)

**Test Coverage:**
- Coordinate conversion math (with/without zoom)
- Recenter calculations
- LocalStorage persistence

**Success Metrics:**
- ViewportManager < 200 lines
- Pure math functions easily unit testable
- All viewport tests pass

---

#### 1.3 SelectionManager
**Location:** `src/main.ts:337-372`

**Responsibilities:**
- Selection state tracking (Set-based)
- Group selection logic
- Selection box rendering
- Selection events

**Interface:**
```typescript
class SelectionManager {
  selectElement(id: string, additive?: boolean): void
  clearSelection(): void
  isElementSelected(id: string): boolean
  getSelectedIds(): Set<string>
  getGroupBBox(): BoundingBox | null
  updateGroupBox(): void
  createSelectionBox(startX: number, startY: number): void
  updateSelectionBox(startX: number, startY: number, curX: number, curY: number): void
  removeSelectionBox(): void
}
```

**Dependencies:**
- CanvasState (for group lookups)
- CRDT adapter (for selection sync)
- DOM (for selection box and group box)

**Test Coverage:**
- Single and multi-selection
- Group selection (all members selected together)
- Selection toggle behavior
- Bounding box calculations

**Success Metrics:**
- SelectionManager < 250 lines
- Clear event interface for selection changes
- All selection tests pass

---

### Phase 1 Implementation Steps

1. **Create services directory structure**
   ```
   src/services/
   ├── HistoryManager.ts
   ├── ViewportManager.ts
   └── SelectionManager.ts
   ```

2. **Extract HistoryManager first** (least dependencies)
   - Copy methods to new file
   - Add controller reference parameter
   - Update CanvasController to instantiate and delegate
   - Run tests

3. **Extract ViewportManager** (pure math, self-contained)
   - Copy methods to new file
   - Add necessary dependencies
   - Update CanvasController to instantiate and delegate
   - Run tests

4. **Extract SelectionManager** (most complex due to DOM)
   - Copy methods to new file
   - Handle DOM element creation
   - Update CanvasController to instantiate and delegate
   - Run tests

5. **Update tests**
   - Ensure all existing tests pass
   - Add new service-specific tests
   - Verify no regressions

6. **Documentation**
   - Add JSDoc comments to service classes
   - Update this plan with learnings
   - Document any challenges encountered

### Phase 1 Exit Criteria

- [ ] All three services extracted and functional
- [ ] Main controller < 900 lines (30% reduction)
- [ ] All existing tests pass
- [ ] No behavior changes observed
- [ ] Services can be unit tested independently
- [ ] Code review completed
- [ ] Documentation updated

---

## Phase 2: Rendering Abstraction

**Goal:** Create a rendering pipeline that orchestrates element, edge, and selection rendering

**Timeline:** 2-3 weeks

**Risk Level:** Medium

**Complexity Reduction:** Additional 20-30% (cumulative 60-70%)

### Architecture

```
RenderingPipeline
├── ElementRenderer
│   ├── DOM node management
│   ├── Content rendering delegation
│   └── Position/transform application
├── EdgeRenderer
│   ├── SVG line management
│   ├── Arrowhead markers
│   └── Edge label positioning
└── SelectionRenderer
    ├── Selection highlights
    ├── Handles rendering
    └── Group box rendering
```

### Key Changes

1. **Introduce Observer Pattern**
   - Model changes emit events
   - Renderers subscribe to relevant events
   - Automatic re-rendering on state changes

2. **Separate Rendering from State**
   - Rendering logic doesn't modify state
   - State changes happen in services
   - Renderers are pure functions of state

3. **Batch Rendering**
   - Collect all pending changes
   - Single render pass per frame
   - Minimize DOM thrashing

### Implementation Steps

1. Create `RenderingPipeline` class
2. Extract `ElementRenderer` from current implementation
3. Extract `EdgeRenderer` from current implementation
4. Extract `SelectionRenderer` using SelectionManager
5. Implement event-driven rendering
6. Update controller to use pipeline
7. Test and validate

### Phase 2 Exit Criteria

- [ ] Rendering pipeline implemented
- [ ] All renderers extracted
- [ ] Event-driven rendering working
- [ ] Performance maintained or improved
- [ ] All tests pass
- [ ] Main controller < 600 lines

---

## Phase 3: Component Architecture

**Goal:** Convert to fully component-based architecture with event bus

**Timeline:** 3-4 weeks

**Risk Level:** High

**Complexity Reduction:** Additional 10-20% (cumulative 70-80%)

### Architecture

```
CanvasController (thin coordinator)
├── Canvas (composition root)
│   ├── viewport: ViewportComponent
│   ├── selection: SelectionComponent
│   ├── history: HistoryComponent
│   └── crdt: CrdtComponent
├── ElementManager
│   ├── lifecycle: ElementLifecycle
│   ├── registry: ElementRegistry (exists)
│   └── renderer: ElementRenderer
└── EdgeManager
    ├── lifecycle: EdgeLifecycle
    └── renderer: EdgeRenderer
```

### Component Interface

Each component follows this pattern:

```typescript
interface Component {
  init(): void
  destroy(): void
  on(event: string, handler: Function): void
  emit(event: string, data?: any): void
}
```

### Event Bus

Central event coordination:

```typescript
EventBus
├── element:created
├── element:updated
├── element:deleted
├── selection:changed
├── viewport:changed
├── history:snapshot
└── render:requested
```

### Implementation Steps

1. Design event bus architecture
2. Define component interfaces
3. Convert services to components
4. Implement event-based coordination
5. Remove direct dependencies
6. Test integration
7. Performance optimization

### Phase 3 Exit Criteria

- [ ] All components implemented
- [ ] Event bus functional
- [ ] No circular dependencies
- [ ] All tests pass
- [ ] Performance benchmarks met
- [ ] Main controller < 300 lines
- [ ] Full documentation

---

## Cross-Phase Considerations

### Testing Strategy

**Throughout all phases:**
- Maintain existing test suite
- Add new tests for extracted code
- Integration tests for component interaction
- Visual regression tests (if possible)
- Performance benchmarks

**Test Coverage Goals:**
- Overall: > 70%
- Services/Components: > 80%
- Business logic: > 90%

### Performance Monitoring

**Metrics to track:**
- Initial render time
- Re-render time
- Memory usage
- Event processing overhead
- Animation frame rate

**Acceptable Thresholds:**
- No more than 10% performance degradation
- No memory leaks
- 60fps maintained for animations

### Backward Compatibility

**Throughout refactoring:**
- Public API remains stable
- Existing element types continue to work
- CRDT synchronization unaffected
- Gesture machine integration preserved
- Command palette integration preserved

### Documentation Updates

**Maintain throughout:**
- Update README with new architecture
- Create architecture diagrams
- Document component interfaces
- Update contributor guide
- Add migration guide (if needed)

---

## Risk Management

### Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing features | Medium | High | Extensive testing, phased rollout |
| Performance degradation | Low | High | Performance benchmarks, profiling |
| Increased complexity | Medium | Medium | Clear interfaces, documentation |
| Team learning curve | Medium | Low | Good documentation, pair programming |
| Timeline overrun | Medium | Medium | Stop at any phase, adjust scope |

### Rollback Strategy

**Each phase should be:**
- Deployable independently
- Reversible via git
- Feature-flagged (if possible)

**If issues arise:**
1. Identify failing component
2. Roll back to previous phase
3. Analyze root cause
4. Address issues
5. Re-attempt with fixes

---

## Success Metrics

### Phase 1
- Main controller: < 900 lines (30% reduction)
- Services: < 200 lines each
- Test coverage: > 70%
- Zero regressions

### Phase 2
- Main controller: < 600 lines (50% reduction)
- Rendering isolated
- Test coverage: > 75%
- Performance maintained

### Phase 3
- Main controller: < 300 lines (75% reduction)
- Component-based architecture
- Test coverage: > 80%
- Performance optimized

### Overall Success
- 70-80% complexity reduction
- All features preserved
- Improved testability
- Better developer experience
- Easier to add new features

---

## Progress Tracking

### Phase 1 Progress (Current)
- [x] Planning complete
- [ ] HistoryManager extracted
- [ ] ViewportManager extracted
- [ ] SelectionManager extracted
- [ ] Tests passing
- [ ] Code review
- [ ] Documentation updated

### Phase 2 Progress
- [ ] Not started

### Phase 3 Progress
- [ ] Not started

---

## Lessons Learned

### Phase 1
*To be filled in during/after Phase 1*

**What went well:**
- TBD

**Challenges encountered:**
- TBD

**Adjustments made:**
- TBD

**Recommendations for Phase 2:**
- TBD

### Phase 2
*To be filled in during/after Phase 2*

### Phase 3
*To be filled in during/after Phase 3*

---

## Appendix

### Code Metrics (Before Refactoring)

**CanvasController:**
- Lines: 1,274
- Properties: 40+
- Methods: 60+
- Cyclomatic complexity: High
- Dependencies: 10+ external modules

**Test Coverage:**
- Overall: ~65%
- CanvasController: ~60%
- Services: N/A (don't exist yet)

### References

- Original refactoring analysis: Issue #36
- Test suite: `tests/CanvasController.test.ts`
- Type definitions: `src/types.ts`
- Element registry: `src/lib/elements/elementRegistry.ts`

### Related Issues

- #30: CRDT integration
- #33: Recent improvements

---

**Document Status:** Living document, updated throughout refactoring process

**Last Updated:** 2025-10-04 (Phase 1 start)

**Next Review:** End of Phase 1
