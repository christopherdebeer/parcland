/**
 * Unit tests for align.ts - Element alignment functionality
 * Tests alignment along x and y axes with various edge cases
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { align } from '../../src/lib/layout/align';
import type { CanvasController, CanvasElement } from '../../src/types';

// Mock the storage module
jest.mock('../../src/lib/network/storage.ts', () => ({
  saveCanvas: jest.fn()
}));

describe('align - Element Alignment', () => {
  let mockController: Partial<CanvasController>;
  let mockElements: CanvasElement[];

  beforeEach(() => {
    // Create mock elements with different positions
    mockElements = [
      { id: 'el-1', x: 100, y: 50, width: 40, height: 30, type: 'text', content: 'A', scale: 1 },
      { id: 'el-2', x: 200, y: 150, width: 40, height: 30, type: 'text', content: 'B', scale: 1 },
      { id: 'el-3', x: 300, y: 100, width: 40, height: 30, type: 'text', content: 'C', scale: 1 },
    ];

    mockController = {
      selectedElementIds: new Set(['el-1', 'el-2', 'el-3']),
      canvasState: {
        elements: mockElements,
        edges: [],
        canvasId: 'test',
        versionHistory: []
      },
      findElementById: jest.fn((id: string) => mockElements.find(e => e.id === id)),
      requestRender: jest.fn(),
      _pushHistorySnapshot: jest.fn(),
    } as any;
  });

  describe('X-axis Alignment', () => {
    it('should align elements to left (min x)', () => {
      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockElements[0].x).toBe(100);
      expect(mockElements[1].x).toBe(100);
      expect(mockElements[2].x).toBe(100);
      expect(mockController.requestRender).toHaveBeenCalled();
      expect(mockController._pushHistorySnapshot).toHaveBeenCalledWith('align elements');
    });

    it('should align elements to right (max x)', () => {
      align(mockController as CanvasController, { axis: 'x', pos: 'max' });

      expect(mockElements[0].x).toBe(300);
      expect(mockElements[1].x).toBe(300);
      expect(mockElements[2].x).toBe(300);
      expect(mockController.requestRender).toHaveBeenCalled();
    });

    it('should align elements to center (x)', () => {
      align(mockController as CanvasController, { axis: 'x', pos: 'center' });

      const expectedCenter = (100 + 300) / 2; // 200
      expect(mockElements[0].x).toBe(expectedCenter);
      expect(mockElements[1].x).toBe(expectedCenter);
      expect(mockElements[2].x).toBe(expectedCenter);
    });

    it('should default to left alignment when pos not specified', () => {
      align(mockController as CanvasController, { axis: 'x' });

      expect(mockElements[0].x).toBe(100);
      expect(mockElements[1].x).toBe(100);
      expect(mockElements[2].x).toBe(100);
    });
  });

  describe('Y-axis Alignment', () => {
    it('should align elements to top (min y)', () => {
      align(mockController as CanvasController, { axis: 'y', pos: 'min' });

      expect(mockElements[0].y).toBe(50);
      expect(mockElements[1].y).toBe(50);
      expect(mockElements[2].y).toBe(50);
      expect(mockController.requestRender).toHaveBeenCalled();
      expect(mockController._pushHistorySnapshot).toHaveBeenCalledWith('align elements');
    });

    it('should align elements to bottom (max y)', () => {
      align(mockController as CanvasController, { axis: 'y', pos: 'max' });

      expect(mockElements[0].y).toBe(150);
      expect(mockElements[1].y).toBe(150);
      expect(mockElements[2].y).toBe(150);
    });

    it('should align elements to middle (y)', () => {
      align(mockController as CanvasController, { axis: 'y', pos: 'center' });

      const expectedMiddle = (50 + 150) / 2; // 100
      expect(mockElements[0].y).toBe(expectedMiddle);
      expect(mockElements[1].y).toBe(expectedMiddle);
      expect(mockElements[2].y).toBe(expectedMiddle);
    });
  });

  describe('Default Behavior', () => {
    it('should default to x-axis min alignment when no options provided', () => {
      align(mockController as CanvasController);

      expect(mockElements[0].x).toBe(100);
      expect(mockElements[1].x).toBe(100);
      expect(mockElements[2].x).toBe(100);
      // Y coordinates should not change
      expect(mockElements[0].y).toBe(50);
      expect(mockElements[1].y).toBe(150);
      expect(mockElements[2].y).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should do nothing when only one element is selected', () => {
      mockController.selectedElementIds = new Set(['el-1']);
      const originalX = mockElements[0].x;

      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockElements[0].x).toBe(originalX);
      expect(mockController.requestRender).not.toHaveBeenCalled();
      expect(mockController._pushHistorySnapshot).not.toHaveBeenCalled();
    });

    it('should do nothing when no elements are selected', () => {
      mockController.selectedElementIds = new Set();

      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockController.requestRender).not.toHaveBeenCalled();
      expect(mockController._pushHistorySnapshot).not.toHaveBeenCalled();
    });

    it('should handle two elements correctly', () => {
      mockController.selectedElementIds = new Set(['el-1', 'el-2']);

      align(mockController as CanvasController, { axis: 'x', pos: 'center' });

      const expectedCenter = (100 + 200) / 2; // 150
      expect(mockElements[0].x).toBe(expectedCenter);
      expect(mockElements[1].x).toBe(expectedCenter);
      // Third element should not be affected
      expect(mockElements[2].x).toBe(300);
    });

    it('should work with elements that have negative coordinates', () => {
      mockElements[0].x = -100;
      mockElements[1].x = 0;
      mockElements[2].x = 100;

      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockElements[0].x).toBe(-100);
      expect(mockElements[1].x).toBe(-100);
      expect(mockElements[2].x).toBe(-100);
    });

    it('should work when all elements are already aligned', () => {
      mockElements[0].x = 100;
      mockElements[1].x = 100;
      mockElements[2].x = 100;

      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockElements[0].x).toBe(100);
      expect(mockElements[1].x).toBe(100);
      expect(mockElements[2].x).toBe(100);
      expect(mockController.requestRender).toHaveBeenCalled();
    });

    it('should handle fractional coordinates', () => {
      mockElements[0].x = 100.5;
      mockElements[1].x = 200.7;
      mockElements[2].x = 150.3;

      align(mockController as CanvasController, { axis: 'x', pos: 'center' });

      const expectedCenter = (100.5 + 200.7) / 2; // 150.6
      expect(mockElements[0].x).toBe(expectedCenter);
      expect(mockElements[1].x).toBe(expectedCenter);
      expect(mockElements[2].x).toBe(expectedCenter);
    });
  });

  describe('Canvas State Modifications', () => {
    it('should modify elements in-place', () => {
      const elementRefs = mockElements.map(e => e);

      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      // Elements should be the same objects (modified in-place)
      expect(mockElements[0]).toBe(elementRefs[0]);
      expect(mockElements[1]).toBe(elementRefs[1]);
      expect(mockElements[2]).toBe(elementRefs[2]);
    });

    it('should only modify the specified axis', () => {
      const originalYs = mockElements.map(e => e.y);

      align(mockController as CanvasController, { axis: 'x', pos: 'center' });

      // Y coordinates should remain unchanged
      expect(mockElements[0].y).toBe(originalYs[0]);
      expect(mockElements[1].y).toBe(originalYs[1]);
      expect(mockElements[2].y).toBe(originalYs[2]);

      const originalXs = mockElements.map(e => e.x);

      align(mockController as CanvasController, { axis: 'y', pos: 'center' });

      // X coordinates should remain unchanged from last operation
      expect(mockElements[0].x).toBe(originalXs[0]);
      expect(mockElements[1].x).toBe(originalXs[1]);
      expect(mockElements[2].x).toBe(originalXs[2]);
    });
  });

  describe('History Snapshot', () => {
    it('should create history snapshot with correct label', () => {
      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockController._pushHistorySnapshot).toHaveBeenCalledWith('align elements');
      expect(mockController._pushHistorySnapshot).toHaveBeenCalledTimes(1);
    });

    it('should not create history snapshot when nothing changes', () => {
      mockController.selectedElementIds = new Set(['el-1']);

      align(mockController as CanvasController, { axis: 'x', pos: 'min' });

      expect(mockController._pushHistorySnapshot).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when element is missing', () => {
      mockController.findElementById = jest.fn((id: string) => {
        if (id === 'el-2') return undefined;
        return mockElements.find(e => e.id === id);
      });

      // Function will throw when trying to access undefined element properties
      expect(() => {
        align(mockController as CanvasController, { axis: 'x', pos: 'min' });
      }).toThrow();
    });
  });

  describe('Large Selection Sets', () => {
    it('should handle many elements efficiently', () => {
      const manyElements: CanvasElement[] = [];
      const manyIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const el: CanvasElement = {
          id: `el-${i}`,
          x: i * 10,
          y: i * 5,
          width: 40,
          height: 30,
          type: 'text',
          content: `Element ${i}`,
          scale: 1
        };
        manyElements.push(el);
        manyIds.add(el.id);
      }

      mockController.selectedElementIds = manyIds;
      mockController.findElementById = jest.fn((id: string) => manyElements.find(e => e.id === id));

      const startTime = Date.now();
      align(mockController as CanvasController, { axis: 'x', pos: 'center' });
      const endTime = Date.now();

      // Should complete reasonably fast (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);

      // All elements should have the same x coordinate
      const targetX = manyElements[0].x;
      expect(manyElements.every(e => e.x === targetX)).toBe(true);
    });
  });
});
