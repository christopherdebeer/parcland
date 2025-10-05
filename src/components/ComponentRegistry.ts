/**
 * ComponentRegistry
 *
 * Registry for managing component types and their lifecycle.
 * Provides factory methods for creating element and edge components.
 */

import type { CanvasElement, Edge } from '../types.ts';
import { BaseElementComponent } from './BaseElementComponent.ts';
import { BaseEdgeComponent } from './BaseEdgeComponent.ts';
import type { ComponentContext } from './BaseComponent.ts';

// Import concrete implementations
import { TextElement } from './elements/TextElement.ts';
import { MarkdownElement } from './elements/MarkdownElement.ts';
import { ImageElement } from './elements/ImageElement.ts';
import { HtmlElement } from './elements/HtmlElement.ts';
import { JsonElement } from './elements/JsonElement.ts';
import { StandardEdge } from './edges/StandardEdge.ts';

type ElementComponentConstructor = new (data: CanvasElement, context: ComponentContext) => BaseElementComponent;
type EdgeComponentConstructor = new (data: Edge, context: ComponentContext) => BaseEdgeComponent;

/**
 * Component registry for creating and managing canvas components
 */
export class ComponentRegistry {
  private elementTypes: Map<string, ElementComponentConstructor> = new Map();
  private edgeTypes: Map<string, EdgeComponentConstructor> = new Map();

  constructor() {
    // Register built-in element types
    this.registerElementType('text', TextElement);
    this.registerElementType('markdown', MarkdownElement);
    this.registerElementType('img', ImageElement);
    this.registerElementType('html', HtmlElement);
    this.registerElementType('json', JsonElement);

    // Register built-in edge types
    this.registerEdgeType('standard', StandardEdge);
  }

  /**
   * Register a new element component type
   */
  registerElementType(type: string, constructor: ElementComponentConstructor): void {
    this.elementTypes.set(type, constructor);
  }

  /**
   * Register a new edge component type
   */
  registerEdgeType(type: string, constructor: EdgeComponentConstructor): void {
    this.edgeTypes.set(type, constructor);
  }

  /**
   * Create an element component instance
   */
  createElementComponent(data: CanvasElement, context: ComponentContext): BaseElementComponent | null {
    const ComponentClass = this.elementTypes.get(data.type);
    if (ComponentClass) {
      return new ComponentClass(data, context);
    }
    return null;
  }

  /**
   * Create an edge component instance
   */
  createEdgeComponent(data: Edge, context: ComponentContext): BaseEdgeComponent | null {
    // For now, all edges use StandardEdge
    // In the future, could support different edge types based on data.type
    const ComponentClass = this.edgeTypes.get('standard');
    if (ComponentClass) {
      return new ComponentClass(data, context);
    }
    return null;
  }

  /**
   * Check if an element type is registered
   */
  hasElementType(type: string): boolean {
    return this.elementTypes.has(type);
  }

  /**
   * Check if an edge type is registered
   */
  hasEdgeType(type: string): boolean {
    return this.edgeTypes.has(type);
  }

  /**
   * Get all registered element types
   */
  getElementTypes(): string[] {
    return Array.from(this.elementTypes.keys());
  }

  /**
   * Get all registered edge types
   */
  getEdgeTypes(): string[] {
    return Array.from(this.edgeTypes.keys());
  }
}

// Singleton instance
export const componentRegistry = new ComponentRegistry();

// Make it available globally for dynamic registration
if (typeof window !== 'undefined') {
  (window as any).componentRegistry = componentRegistry;
}
