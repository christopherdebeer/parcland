/**
 * Tests for Component Architecture
 *
 * Validates the new component-based element rendering system
 */

import {
  componentRegistry,
  TextElement,
  MarkdownElement,
  ImageElement,
  HtmlElement,
  JsonElement,
} from '../src/components/index';
import type { CanvasElement } from '../src/types';

describe('ComponentRegistry', () => {
  it('should have built-in element types registered', () => {
    expect(componentRegistry.hasElementType('text')).toBe(true);
    expect(componentRegistry.hasElementType('markdown')).toBe(true);
    expect(componentRegistry.hasElementType('img')).toBe(true);
    expect(componentRegistry.hasElementType('html')).toBe(true);
    expect(componentRegistry.hasElementType('json')).toBe(true);
  });

  it('should create component instances for registered types', () => {
    const mockElement: CanvasElement = {
      id: 'test-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      content: 'Test content',
      color: '#000000',
      zIndex: 1,
    };

    const context = {
      controller: {},
      requestRender: jest.fn(),
    };

    const component = componentRegistry.createElementComponent(mockElement, context);
    expect(component).toBeInstanceOf(TextElement);
  });

  it('should return null for unregistered element types', () => {
    const mockElement: CanvasElement = {
      id: 'test-1',
      type: 'unknown-type',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      content: 'Test',
      color: '#000000',
      zIndex: 1,
    };

    const context = {
      controller: {},
      requestRender: jest.fn(),
    };

    const component = componentRegistry.createElementComponent(mockElement, context);
    expect(component).toBeNull();
  });

  it('should allow registration of custom element types', () => {
    class CustomElement extends TextElement {}

    componentRegistry.registerElementType('custom', CustomElement);
    expect(componentRegistry.hasElementType('custom')).toBe(true);

    const mockElement: CanvasElement = {
      id: 'test-1',
      type: 'custom',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      content: 'Test',
      color: '#000000',
      zIndex: 1,
    };

    const context = {
      controller: {},
      requestRender: jest.fn(),
    };

    const component = componentRegistry.createElementComponent(mockElement, context);
    expect(component).toBeInstanceOf(CustomElement);
  });
});

describe('TextElement Component', () => {
  let mockElement: CanvasElement;
  let context: any;

  beforeEach(() => {
    mockElement = {
      id: 'test-text',
      type: 'text',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      content: 'Hello World',
      color: '#FF0000',
      zIndex: 1,
    };

    context = {
      controller: {},
      requestRender: jest.fn(),
    };
  });

  it('should mount and render text content', () => {
    const component = new TextElement(mockElement, context);
    const element = component.mount();

    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.textContent).toBe('Hello World');
  });

  it('should apply color style', () => {
    const component = new TextElement(mockElement, context);
    const element = component.mount();

    const paragraph = element.querySelector('p');
    expect(paragraph?.style.color).toBe('rgb(255, 0, 0)');
  });

  it('should update content when data changes', () => {
    const component = new TextElement(mockElement, context);
    const element = component.mount();

    const updatedElement = { ...mockElement, content: 'Updated Content' };
    component.update(updatedElement);

    expect(element.textContent).toBe('Updated Content');
  });
});

describe('JsonElement Component', () => {
  let mockElement: CanvasElement;
  let context: any;

  beforeEach(() => {
    mockElement = {
      id: 'test-json',
      type: 'json',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      content: '{"key": "value"}',
      color: '#000000',
      zIndex: 1,
    };

    context = {
      controller: {},
      requestRender: jest.fn(),
    };
  });

  it('should mount and render JSON content', () => {
    const component = new JsonElement(mockElement, context);
    const element = component.mount();

    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.querySelector('pre')).toBeTruthy();
  });

  it('should pretty-print valid JSON', () => {
    const component = new JsonElement(mockElement, context);
    const element = component.mount();

    const pre = element.querySelector('pre');
    expect(pre?.textContent).toContain('"key"');
    expect(pre?.textContent).toContain('"value"');
  });

  it('should handle invalid JSON gracefully', () => {
    const invalidElement = { ...mockElement, content: '{invalid json}' };
    const component = new JsonElement(invalidElement, context);
    const element = component.mount();

    const pre = element.querySelector('pre');
    expect(pre?.textContent).toBe('{invalid json}');
    expect(pre?.style.borderLeft).toBeTruthy();
  });
});

describe('HtmlElement Component', () => {
  let mockElement: CanvasElement;
  let context: any;

  beforeEach(() => {
    mockElement = {
      id: 'test-html',
      type: 'html',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      content: '<div>Hello <strong>World</strong></div>',
      color: '#000000',
      zIndex: 1,
    };

    context = {
      controller: {},
      requestRender: jest.fn(),
    };
  });

  it('should mount and render HTML content', () => {
    const component = new HtmlElement(mockElement, context);
    const element = component.mount();

    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.querySelector('strong')?.textContent).toBe('World');
  });

  it('should execute scripts in HTML content', () => {
    const scriptElement = {
      ...mockElement,
      content: '<div>Test</div><script>window.testScriptExecuted = true;</script>',
    };

    const component = new HtmlElement(scriptElement, context);
    const element = component.mount();

    // Script tags should be present in the DOM (execution happens when added to real document)
    const scripts = element.querySelectorAll('script');
    expect(scripts.length).toBeGreaterThan(0);

    // Note: Scripts only execute when added to the actual document body
    // In JSDOM test environment, we just verify the script tag is present
  });

  it('should reset script execution flag on content change', () => {
    const component = new HtmlElement(mockElement, context);
    const element = component.mount();

    const updatedElement = { ...mockElement, content: '<div>New content</div><script>console.log("test");</script>' };
    component.update(updatedElement);

    // After update, scripts should be re-processed
    const scripts = element.querySelectorAll('script');
    expect(scripts.length).toBeGreaterThan(0);

    // Verify content was actually updated
    expect(element.textContent).toContain('New content');
  });
});

describe('ImageElement Component', () => {
  let mockElement: CanvasElement;
  let context: any;

  beforeEach(() => {
    mockElement = {
      id: 'test-img',
      type: 'img',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      content: 'https://example.com/image.jpg',
      color: '#000000',
      zIndex: 1,
    };

    context = {
      controller: {},
      requestRender: jest.fn(),
    };
  });

  it('should mount and render image', () => {
    const component = new ImageElement(mockElement, context);
    const element = component.mount();

    expect(element).toBeInstanceOf(HTMLElement);
    const img = element.querySelector('img');
    expect(img).toBeTruthy();
  });

  it('should use placeholder when no src provided', () => {
    const noSrcElement = { ...mockElement, src: undefined };
    const component = new ImageElement(noSrcElement, context);
    const element = component.mount();

    // Should use placeholder image service
    const img = element.querySelector('img');
    expect(img?.src).toContain('placehold.co');
  });

  it('should update src when data changes', () => {
    const elementWithSrc = { ...mockElement, src: 'https://example.com/image.jpg' };
    const component = new ImageElement(elementWithSrc, context);
    const element = component.mount();

    const updatedElement = { ...elementWithSrc, src: 'https://example.com/new-image.jpg' };
    component.update(updatedElement);

    const img = element.querySelector('img');
    expect(img?.src).toBe('https://example.com/new-image.jpg');
  });
});
