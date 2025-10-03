import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  saveCanvas,
  setBackpackItem,
  saveCanvasLocalOnly,
  getAuthToken,
  loadInitialCanvas,
} from '../src/lib/network/storage';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('storage module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    jest.useFakeTimers();
    // Suppress console warnings and errors during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('getAuthToken', () => {
    it('should return token from localStorage if it exists', () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'test-token-123');

      const token = getAuthToken();

      expect(token).toBe('test-token-123');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('PARC.LAND/BKPK_TOKEN');
    });

    it('should create and return TBC token if none exists', () => {
      const token = getAuthToken();

      expect(token).toBe('TBC');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('PARC.LAND/BKPK_TOKEN', 'TBC');
    });

    it('should not overwrite existing token', () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'existing-token');
      // Clear the mock after the initial setup
      localStorageMock.setItem.mockClear();

      const token = getAuthToken();

      expect(token).toBe('existing-token');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('saveCanvasLocalOnly', () => {
    it('should save canvas state to localStorage', () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [{ id: 'elem-1', x: 0, y: 0, width: 100, height: 100, type: 'text', content: 'Test' }],
        edges: [],
        versionHistory: [],
      };

      saveCanvasLocalOnly(canvasState);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myCanvasData_canvas-123',
        JSON.stringify(canvasState)
      );
    });

    it('should handle localStorage quota errors gracefully', () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [],
        edges: [],
        versionHistory: [],
      };

      // Simulate quota exceeded error
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw
      expect(() => saveCanvasLocalOnly(canvasState)).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith('localStorage quota?', expect.any(Error));
    });

    it('should serialize complex canvas state correctly', () => {
      const complexState = {
        canvasId: 'canvas-456',
        elements: [
          { id: 'elem-1', x: 10, y: 20, width: 100, height: 50, type: 'text', content: 'A' },
          { id: 'elem-2', x: 150, y: 200, width: 200, height: 150, type: 'image', content: 'B', src: 'https://example.com/img.jpg' },
        ],
        edges: [
          { id: 'edge-1', source: 'elem-1', target: 'elem-2', label: 'connects' },
        ],
        versionHistory: [{ timestamp: 1234567890, action: 'create' }],
      };

      saveCanvasLocalOnly(complexState);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myCanvasData_canvas-456',
        JSON.stringify(complexState)
      );
    });
  });

  describe('saveCanvas (debounced)', () => {
    it('should debounce multiple save calls', () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [],
        edges: [],
        versionHistory: [],
      };

      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      // Call saveCanvas multiple times
      saveCanvas(canvasState);
      saveCanvas(canvasState);
      saveCanvas(canvasState);

      // Should not save immediately
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1); // Only the token set

      // Fast-forward past debounce delay
      jest.advanceTimersByTime(300);

      // Should save only once after debounce
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myCanvasData_canvas-123',
        JSON.stringify(canvasState)
      );
    });

    it('should save locally even without auth token', () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [],
        edges: [],
        versionHistory: [],
      };

      saveCanvas(canvasState);
      jest.advanceTimersByTime(300);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'myCanvasData_canvas-123',
        JSON.stringify(canvasState)
      );
    });

    it('should not make remote save without valid auth token', async () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [],
        edges: [],
        versionHistory: [],
      };

      // Clear localStorage to have no token
      localStorageMock.clear();

      saveCanvas(canvasState);
      jest.advanceTimersByTime(300);

      // Wait for async operations
      await Promise.resolve();

      expect(console.warn).toHaveBeenCalledWith('No auth token found – skipping remote save');
    });

    it('should make remote save with valid auth token', async () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [{ id: 'elem-1', x: 0, y: 0, width: 100, height: 100, type: 'text', content: 'Test' }],
        edges: [],
        versionHistory: [],
      };

      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token-abc');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      saveCanvas(canvasState);
      jest.advanceTimersByTime(300);

      // Wait for async operations
      await Promise.resolve();
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://backpack.parc.land/websim/canvas-123',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token-abc',
          },
          body: JSON.stringify(canvasState),
        })
      );
    });

    it('should handle remote save errors gracefully', async () => {
      const canvasState = {
        canvasId: 'canvas-123',
        elements: [],
        edges: [],
        versionHistory: [],
      };

      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      saveCanvas(canvasState);
      jest.advanceTimersByTime(300);

      // Wait for async operations
      await Promise.resolve();
      await Promise.resolve();

      expect(console.error).toHaveBeenCalledWith(
        'Error saving canvas canvas-123',
        expect.any(Error)
      );
    });
  });

  describe('setBackpackItem', () => {
    it('should not save without auth token', async () => {
      // Clear localStorage to have no token
      localStorageMock.clear();

      await setBackpackItem('test-key', 'test-value');

      expect(console.warn).toHaveBeenCalledWith('No auth token – skipping API save');
    });

    it('should save to API with valid token', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await setBackpackItem('test-key', 'test-value');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://backpack.parc.land/websim/test-key',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
          body: 'test-value',
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API error'));

      await setBackpackItem('test-key', 'test-value');

      expect(console.error).toHaveBeenCalledWith(
        'Error saving backpack item test-key',
        expect.any(Error)
      );
    });
  });

  describe('loadInitialCanvas', () => {
    const defaultState = {
      canvasId: 'canvas-123',
      elements: [],
      edges: [],
      versionHistory: [],
    };

    it('should load from remote API with valid token', async () => {
      const remoteState = {
        ...defaultState,
        elements: [{ id: 'elem-remote', x: 0, y: 0, width: 100, height: 100, type: 'text', content: 'Remote' }],
      };

      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => remoteState,
      });

      const result = await loadInitialCanvas(defaultState, null);

      expect(result).toEqual(remoteState);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://backpack.parc.land/websim/canvas-123',
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer valid-token' },
        })
      );
    });

    it('should fall back to localStorage when remote fails', async () => {
      const localState = {
        ...defaultState,
        elements: [{ id: 'elem-local', x: 0, y: 0, width: 100, height: 100, type: 'text', content: 'Local' }],
      };

      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');
      localStorageMock.setItem('myCanvasData_canvas-123', JSON.stringify(localState));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await loadInitialCanvas(defaultState, null);

      expect(result).toEqual(localState);
      expect(console.warn).toHaveBeenCalledWith('Remote load failed, falling back to local copy');
    });

    it('should fall back to localStorage on network error', async () => {
      const localState = {
        ...defaultState,
        elements: [{ id: 'elem-local', x: 0, y: 0, width: 100, height: 100, type: 'text', content: 'Local' }],
      };

      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');
      localStorageMock.setItem('myCanvasData_canvas-123', JSON.stringify(localState));

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await loadInitialCanvas(defaultState, null);

      expect(result).toEqual(localState);
      expect(console.error).toHaveBeenCalledWith('Error loading canvas from API', expect.any(Error));
    });

    it('should return default state when no local or remote data exists', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await loadInitialCanvas(defaultState, null);

      expect(result).toEqual(defaultState);
    });

    it('should use paramToken if provided', async () => {
      const paramToken = 'param-token-xyz';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => defaultState,
      });

      await loadInitialCanvas(defaultState, paramToken);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('PARC.LAND/BKPK_TOKEN', paramToken);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://backpack.parc.land/websim/canvas-123',
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer param-token-xyz' },
        })
      );
    });

    it('should handle invalid JSON in localStorage', async () => {
      localStorageMock.setItem('myCanvasData_canvas-123', 'invalid json{');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should throw when trying to parse invalid JSON
      await expect(loadInitialCanvas(defaultState, null)).rejects.toThrow();
    });
  });

  describe('serialization', () => {
    it('should properly serialize complex nested objects', () => {
      const complexState = {
        canvasId: 'canvas-complex',
        elements: [
          {
            id: 'elem-1',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            type: 'text',
            content: 'Test',
            metadata: {
              created: '2024-01-01',
              author: 'test-user',
              tags: ['tag1', 'tag2'],
            },
          },
        ],
        edges: [],
        versionHistory: [],
      };

      saveCanvasLocalOnly(complexState);

      const saved = localStorageMock.setItem.mock.calls[0][1];
      const parsed = JSON.parse(saved);

      expect(parsed).toEqual(complexState);
    });
  });
});
