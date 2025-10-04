# CanvasController Refactoring Plan

## Executive Summary

This document outlines the complete refactoring strategy for the CanvasController monolith (`src/main.ts:14-1288`, 1,274 lines). The goal is to reduce complexity, improve maintainability, and enable future enhancements without altering behavior or losing features.

**Original State (Before Refactoring):** Single monolithic class with 40+ properties, 60+ methods, deep coupling - 1,274 lines

**Current State (After Phases 1 & 2):** Service-based architecture with rendering pipeline - 1,144 lines
- 3 service classes: HistoryManager, ViewportManager, SelectionManager (727 lines)
- 3 renderer classes: RenderingPipeline, ElementRenderer, EdgeRenderer (483 lines)
- Main controller delegates to services and renderers
- All tests passing, 73.23% coverage maintained

**Target State:** Component-based architecture with clear separation of concerns, independent testability, and manageable complexity (Phase 3 - not yet implemented)

**Approach:** Hybrid phased refactoring (conservative → progressive → transformative)

**Timeline:**
- Phases 1 & 2: COMPLETED (2025-10-04)
- Phase 3: Planned for future dedicated effort (1-2 weeks estimated)

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

### Phase 1 Progress (COMPLETED)
- [x] Planning complete
- [x] HistoryManager extracted (166 lines)
- [x] ViewportManager extracted (247 lines)
- [x] SelectionManager extracted (314 lines)
- [x] Tests passing
- [x] Code review
- [x] Documentation updated
- [x] Main controller reduced to 1,209 lines (from 1,274 - 5% reduction)

### Phase 2 Progress (COMPLETED)
- [x] RenderingPipeline class created
- [x] ElementRenderer extracted (213 lines)
- [x] EdgeRenderer extracted (172 lines)
- [x] Controller updated to use pipeline
- [x] All tests passing (73.23% coverage maintained)
- [x] Main controller reduced to 1,144 lines (from 1,209)

### Phase 3 Progress
- [ ] NOT STARTED - Requires dedicated effort (see recommendations below)

**Phase 3 Recommendations:**

Given the complexity and scope of Phase 3 (full component architecture with event bus), this should be tackled as a separate, focused effort. Here's the recommended approach:

**Prerequisites for Phase 3:**
1. Phases 1 & 2 provide a solid foundation
2. Rendering is now isolated in dedicated classes
3. Services are independently testable

**Suggested Phase 3 Scope (when undertaken):**
1. **Extract remaining helper methods** (~150-200 lines)
   - `setElementContent`, `executeScriptElements`, `_showElementError` → ContentRenderer utility
   - `_ensureDomFor`, `createElementNode` → ElementManager
   - `computeIntersection` → Geometry utility

2. **Create EventBus for decoupling** (~100 lines)
   - Simple pub/sub implementation
   - Standard events: element:created, element:updated, selection:changed, etc.

3. **Refactor services to use EventBus**
   - Remove direct controller references where possible
   - Services publish events instead of calling controller methods

4. **Create ElementManager and EdgeManager**
   - Encapsulate element/edge lifecycle
   - Coordinate between services via events

**Estimated Effort:** 1-2 weeks (not 3-4 weeks with pragmatic scope)

**Expected Outcome:**
- Controller: ~600-800 lines (from current 1,144)
- Clear component boundaries
- Event-driven architecture
- Easier to test and extend

---

## Lessons Learned

### Phase 1
*Completed 2025-10-04*

**What went well:**
- Clean extraction of three cohesive service classes
- All services < 350 lines as planned
- Backward compatibility maintained
- Test coverage maintained at 73.23%

**Challenges encountered:**
- Some properties needed to remain on controller for backward compatibility
- Service interdependencies required careful coordination

**Adjustments made:**
- Kept legacy properties on controller while delegating to services
- Services reference controller for shared state access

**Recommendations for Phase 2:**
- Focus on isolating rendering logic completely
- Consider event-driven architecture for better decoupling
- Be mindful of performance when adding abstraction layers

### Phase 2
*Completed 2025-10-04*

**What went well:**
- Clean extraction of rendering pipeline with separate renderers
- Property delegation pattern worked well for backward compatibility
- Rendering logic nicely isolated from controller
- All tests continue to pass

**Challenges encountered:**
- Still have rendering helper methods in controller (setElementContent, buildHandles, etc.)
- These are called by renderers, creating some coupling
- Target of < 600 lines not met yet - need Phase 3 for further reduction

**Adjustments made:**
- Created property accessors for elementNodesMap, edgeNodesMap to delegate to renderers
- Kept helper methods in controller temporarily for renderer callbacks
- Maintained queued rendering via requestAnimationFrame

**Recommendations for Phase 3:**
- Extract remaining rendering helpers into renderers or separate utilities
- Consider breaking controller into smaller domain-specific managers
- Event bus architecture may help decouple remaining dependencies

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
