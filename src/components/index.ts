/**
 * Component System
 *
 * Export all component base classes, implementations, and registry
 */

// Base classes
export { BaseComponent } from './BaseComponent.ts';
export { BaseElementComponent } from './BaseElementComponent.ts';
export { BaseEdgeComponent } from './BaseEdgeComponent.ts';

// Element implementations
export { TextElement } from './elements/TextElement.ts';
export { MarkdownElement } from './elements/MarkdownElement.ts';
export { ImageElement } from './elements/ImageElement.ts';

// Edge implementations
export { StandardEdge } from './edges/StandardEdge.ts';

// Registry
export { ComponentRegistry, componentRegistry } from './ComponentRegistry.ts';

// Types
export type { ComponentContext } from './BaseComponent.ts';
