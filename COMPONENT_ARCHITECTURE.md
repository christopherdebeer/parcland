# Component Architecture

This document describes the component-based architecture for canvas elements and edges.

## Overview

The component system provides an object-oriented, inheritance-based architecture for creating and managing canvas elements and edges. It replaces the previous procedural rendering approach with reusable, testable component classes.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      BaseComponent                          │
│  - Lifecycle (mount, update, unmount)                       │
│  - DOM helpers (createElement, createSVGElement)            │
│  - Event management (addEventListener, cleanup)             │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼──────────┐  ┌───────▼──────────┐
│ BaseElement      │  │ BaseEdge         │
│ Component        │  │ Component        │
│ - Positioning    │  │ - Line rendering │
│ - Handles        │  │ - Intersections  │
│ - Selection      │  │ - Labels         │
└───────┬──────────┘  └───────┬──────────┘
        │                     │
  ┌─────┴─────┐         ┌─────┴─────┐
  │           │         │           │
┌─▼──┐  ┌────▼───┐  ┌──▼──┐  ┌────▼──────┐
│Text│  │Markdown│  │Image│  │StandardEdge│
└────┘  └────────┘  └─────┘  └───────────┘
```

## Base Classes

### BaseComponent

The root base class for all canvas components (elements and edges).

**Responsibilities:**
- Component lifecycle management (mount, update, unmount)
- DOM/SVG element creation helpers
- Event listener management with automatic cleanup
- CSS style helpers

**Key Methods:**
```typescript
abstract mount(): HTMLElement | SVGElement;
abstract update(newData: TData): void;
unmount(): void;
getRoot(): HTMLElement | SVGElement | null;
```

**Example Usage:**
```typescript
class MyComponent extends BaseComponent<CanvasElement> {
  mount() {
    this.rootElement = this.createElement('div', 'my-component');
    return this.rootElement;
  }

  update(newData: CanvasElement) {
    this.data = newData;
    // Update DOM...
  }
}
```

### BaseElementComponent

Base class for all canvas element types (text, markdown, images, etc.).

**Responsibilities:**
- Element positioning and transforms (absolute/fixed)
- Selection state management
- Interaction handles (resize, rotate, scale, etc.)
- Content rendering delegation to subclasses

**Key Methods:**
```typescript
abstract renderContent(container: HTMLElement): void;
protected applyPositioning(): void;
protected buildHandles(): void;
protected shouldUpdateContent(oldData, newData): boolean;
protected shouldUpdatePosition(oldData, newData): boolean;
```

**Example Usage:**
```typescript
class TextElement extends BaseElementComponent {
  protected renderContent(container: HTMLElement): void {
    container.innerHTML = '';
    const p = this.createElement('p');
    p.textContent = this.data.content;
    container.appendChild(p);
  }
}
```

### BaseEdgeComponent

Base class for all edge/connection types.

**Responsibilities:**
- SVG line and label rendering
- Source/target element intersection calculation
- Arrowhead markers
- Edge styling (color, thickness, dash patterns)

**Key Methods:**
```typescript
protected updateEdgePosition(): void;
protected calculateIntersection(from, to): {x, y} | null;
protected updateStyle(): void;
protected hide(): void;
protected show(): void;
```

**Example Usage:**
```typescript
class StandardEdge extends BaseEdgeComponent {
  // Uses default implementation
  // Can override calculateIntersection() for custom paths
}
```

## Component Registry

The `ComponentRegistry` manages component types and provides factory methods.

### Registration

```typescript
import { componentRegistry } from './components/ComponentRegistry';

// Register a custom element type
componentRegistry.registerElementType('my-type', MyElementComponent);

// Register a custom edge type
componentRegistry.registerEdgeType('curved', CurvedEdge);
```

### Factory Methods

```typescript
// Create element component
const elementComponent = componentRegistry.createElementComponent(
  canvasElement,
  { controller, eventBus }
);

// Create edge component
const edgeComponent = componentRegistry.createEdgeComponent(
  edge,
  { controller, eventBus }
);
```

## Built-in Components

### Element Components

#### TextElement
Simple text paragraph with color support.

**Type:** `text`
**Data:** `content` (string), `color` (optional)

#### MarkdownElement
Markdown rendering using the `marked` library.

**Type:** `markdown`
**Data:** `content` (markdown string), `color` (optional)

#### ImageElement
Image rendering with lazy loading and placeholders.

**Type:** `img`
**Data:** `src` (image URL), `content` (alt text), `imgId` (optional)

### Edge Components

#### StandardEdge
Standard straight-line edge with arrowhead.

**Type:** `standard` (default)
**Data:** `source`, `target`, `label`, `style` (color, thickness, dash)

## Creating Custom Components

### Custom Element Component

```typescript
import { BaseElementComponent } from './components/BaseElementComponent';

export class VideoElement extends BaseElementComponent {
  private videoEl: HTMLVideoElement | null = null;

  protected renderContent(container: HTMLElement): void {
    if (!this.videoEl) {
      this.videoEl = this.createElement('video') as HTMLVideoElement;
      this.videoEl.controls = true;

      // Event listeners are auto-cleaned up on unmount
      this.addEventListener(this.videoEl, 'play', () => {
        console.log('Video started');
      });
    }

    this.videoEl.src = this.data.src;
    container.appendChild(this.videoEl);
  }

  unmount(): void {
    this.videoEl = null;
    super.unmount();
  }
}

// Register
componentRegistry.registerElementType('video', VideoElement);
```

### Custom Edge Component

```typescript
import { BaseEdgeComponent } from './components/BaseEdgeComponent';

export class CurvedEdge extends BaseEdgeComponent {
  protected lineElement: SVGPathElement | null = null;

  mount(): SVGElement {
    // Create custom path element instead of line
    this.groupElement = this.createSVGElement('g') as SVGGElement;

    this.lineElement = this.createSVGElement('path', {
      stroke: this.data.style?.color || '#ccc',
      'stroke-width': this.data.style?.thickness || '2',
      fill: 'none'
    }) as SVGPathElement;

    this.groupElement.appendChild(this.lineElement);
    this.updateEdgePosition();

    return this.groupElement;
  }

  protected updateEdgePosition(): void {
    // Custom curved path calculation
    const sourceEl = this.context.controller.findElementById(this.data.source);
    const targetEl = this.context.controller.findElementById(this.data.target);

    if (sourceEl && targetEl) {
      const sx = sourceEl.x;
      const sy = sourceEl.y;
      const tx = targetEl.x;
      const ty = targetEl.y;

      // Quadratic curve
      const cx = (sx + tx) / 2;
      const cy = Math.min(sy, ty) - 50; // Control point above

      const path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
      this.lineElement.setAttribute('d', path);
    }
  }
}

// Register
componentRegistry.registerEdgeType('curved', CurvedEdge);
```

## Benefits

### For Developers

1. **Clear Inheritance Hierarchy**: Easy to understand where functionality comes from
2. **Reusable Code**: Common functionality in base classes
3. **Type Safety**: Full TypeScript support with generics
4. **Testable**: Each component can be tested in isolation
5. **Extensible**: Easy to add new element/edge types

### For the Codebase

1. **Separation of Concerns**: Rendering logic isolated from controller
2. **Reduced Complexity**: Each component is self-contained
3. **Better Performance**: Only update what changed
4. **Memory Management**: Automatic cleanup of event listeners
5. **Maintainability**: Changes to one component don't affect others

## Migration Path

The component system is designed to coexist with the existing rendering pipeline. Migration can happen gradually:

### Phase 1: Parallel Implementation (Current)
- Component architecture exists alongside current rendering
- Can be tested independently
- No breaking changes

### Phase 2: Opt-in Migration
- Update ElementRenderer to use components when available
- Fall back to legacy rendering for unmigrated types
- Gradual migration of element types

### Phase 3: Full Migration
- All element types use components
- Remove legacy rendering code
- Optimize component-based rendering

## Testing

### Unit Testing Components

```typescript
import { TextElement } from './components/elements/TextElement';

describe('TextElement', () => {
  it('should render text content', () => {
    const data = {
      id: 'el-1',
      type: 'text',
      content: 'Hello',
      x: 0, y: 0, width: 100, height: 50
    };
    const context = { controller: mockController };

    const component = new TextElement(data, context);
    const root = component.mount();

    expect(root.textContent).toBe('Hello');
  });

  it('should update when content changes', () => {
    const component = new TextElement(data, context);
    component.mount();

    component.update({ ...data, content: 'World' });

    expect(component.getRoot().textContent).toBe('World');
  });

  it('should cleanup on unmount', () => {
    const component = new TextElement(data, context);
    const root = component.mount();

    component.unmount();

    expect(component.isMounted()).toBe(false);
    expect(component.getRoot()).toBe(null);
  });
});
```

### Integration Testing

```typescript
describe('ComponentRegistry', () => {
  it('should create element components', () => {
    const data = { id: 'el-1', type: 'text', content: 'Test', ...  };
    const component = componentRegistry.createElementComponent(data, context);

    expect(component).toBeInstanceOf(TextElement);
    expect(component).toBeInstanceOf(BaseElementComponent);
  });
});
```

## Performance Considerations

### Optimizations

1. **Diff-based Updates**: `shouldUpdateContent()` and `shouldUpdatePosition()` prevent unnecessary DOM updates
2. **Event Listener Cleanup**: Automatic cleanup prevents memory leaks
3. **DOM Reuse**: Components reuse DOM elements when possible
4. **Lazy Content**: Content only rendered when visible

### Best Practices

1. **Minimize DOM Operations**: Batch updates when possible
2. **Cache Calculations**: Store computed values
3. **Use CSS Transforms**: For positioning (faster than left/top)
4. **Debounce Updates**: For frequently changing properties

## Future Enhancements

### Potential Features

1. **React Integration**: Convert components to React components
2. **Virtual Scrolling**: Only render visible components
3. **State Management**: Component-level state with hooks
4. **Animations**: Built-in animation support
5. **Drag & Drop**: Drag and drop API for components
6. **Snapshots**: Component state serialization

### Component Ideas

1. **CodeElement**: Syntax-highlighted code editor
2. **ChartElement**: Data visualization
3. **TableElement**: Editable data tables
4. **CanvasElement**: Nested canvas containers
5. **BezierEdge**: Curved edges with control points
6. **AnimatedEdge**: Edges with flowing animations

## Resources

- [TypeScript Class Documentation](https://www.typescriptlang.org/docs/handbook/2/classes.html)
- [DOM API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
- [SVG API Reference](https://developer.mozilla.org/en-US/docs/Web/SVG)
- [Component Pattern](https://en.wikipedia.org/wiki/Component-based_software_engineering)

## Questions?

For questions or suggestions about the component architecture, please:
1. Check existing components for examples
2. Review this documentation
3. Open an issue on GitHub
4. Ask in team chat
