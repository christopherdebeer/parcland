import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock the storage module BEFORE importing generation
const mockGetAuthToken = jest.fn();
const mockSaveCanvas = jest.fn();

jest.mock('../src/lib/network/storage', () => ({
  getAuthToken: () => mockGetAuthToken(),
  saveCanvas: (...args: any[]) => mockSaveCanvas(...args),
}));

// Now import after mocking
import {
  editElementWithPrompt,
  generateContent,
  regenerateImage,
} from '../src/lib/network/generation';

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

describe('generation module', () => {
  let mockController: any;
  let mockElement: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthToken.mockClear();
    mockSaveCanvas.mockClear();
    localStorageMock.clear();

    // Suppress console output during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mock controller
    mockController = {
      canvasState: {
        canvasId: 'test-canvas',
        elements: [],
        edges: [],
        versionHistory: [],
      },
      elementNodesMap: {},
      findEdgesByElementId: jest.fn().mockReturnValue([]),
      findElementById: jest.fn(),
      updateElementNode: jest.fn(),
    };

    // Setup mock element
    mockElement = {
      id: 'elem-1',
      type: 'text',
      content: 'Original content',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('editElementWithPrompt', () => {
    it('should not edit without valid auth token', async () => {
      // Don't set any token in localStorage (will default to 'TBC')

      await editElementWithPrompt('make it better', mockElement, mockController);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('No auth token, cannot edit element via AI');
    });

    it('should not edit with TBC token', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'TBC');

      await editElementWithPrompt('make it better', mockElement, mockController);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('No auth token, cannot edit element via AI');
    });

    it('should make API request with valid token', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'I will improve the content',
          result: 'Improved content',
        }),
      });

      await editElementWithPrompt('make it better', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://gen.parc.land',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
        })
      );
    });

    it('should include element context in request', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Updated',
          result: 'New content',
        }),
      });

      await editElementWithPrompt('update this', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.model).toBe('claude-3-5-sonnet-20241022');
      expect(requestBody.max_tokens).toBe(4096);
      expect(requestBody.messages[0].content[0].text).toContain('Original content');
      expect(requestBody.messages[0].content[0].text).toContain('update this');
    });

    it('should include related edges in context', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const relatedElement = {
        id: 'elem-source',
        type: 'text',
        content: 'Related content',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      mockController.findEdgesByElementId.mockReturnValue([
        {
          id: 'edge-1',
          source: 'elem-source',
          target: 'elem-1',
          label: 'relates to',
        },
      ]);

      mockController.findElementById.mockReturnValue(relatedElement);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Considered context',
          result: 'Context-aware content',
        }),
      });

      await editElementWithPrompt('update', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages[0].content[0].text).toContain('relates to');
      expect(requestBody.messages[0].content[0].text).toContain('Related content');
    });

    it('should update element content with API response', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const mockNode = document.createElement('div');
      mockController.elementNodesMap[mockElement.id] = mockNode;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Analysis',
          result: 'Updated content from AI',
        }),
      });

      const result = await editElementWithPrompt('improve', mockElement, mockController);

      expect(mockElement.content).toBe('Updated content from AI');
      expect(result).toBe('Updated content from AI');
      expect(mockController.updateElementNode).toHaveBeenCalledWith(
        mockNode,
        mockElement,
        true
      );
      // saveCanvas is called with debounce so we can't easily test it synchronously
      // The important behavior (updating element) is tested above
    });

    it('should handle API error responses', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await editElementWithPrompt('update', mockElement, mockController);

      expect(result).toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        'AI edit request failed:',
        500,
        'Internal Server Error'
      );
    });

    it('should handle invalid JSON responses', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => 'invalid json{',
      });

      const result = await editElementWithPrompt('update', mockElement, mockController);

      expect(result).toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse AI response:',
        expect.any(Error),
        'invalid json{'
      );
    });

    it('should handle network errors', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await editElementWithPrompt('update', mockElement, mockController);

      expect(result).toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        'Error in editElementWithPrompt:',
        expect.any(Error)
      );
    });
  });

  describe('generateContent', () => {
    it('should fallback to old API without valid auth token', async () => {
      // Don't set token - will default to 'TBC'

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          thinking: 'Processing',
          result: 'Fallback content',
        }),
      });

      const result = await generateContent('test content', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ai_completion',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toBe('Fallback content');
    });

    it('should fallback to old API with TBC token', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'TBC');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          thinking: 'Processing',
          result: 'Fallback result',
        }),
      });

      const result = await generateContent('test content', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ai_completion',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toBe('Fallback result');
    });

    it('should make API request with valid token', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Generated',
          result: 'Generated content',
        }),
      });

      await generateContent('test content', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://gen.parc.land',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer valid-token',
          },
        })
      );
    });

    it('should include related edges in generation context', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const relatedElement = {
        id: 'elem-related',
        type: 'text',
        content: 'Context content',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      mockController.findEdgesByElementId.mockReturnValue([
        {
          id: 'edge-1',
          source: 'elem-related',
          target: 'elem-1',
          label: 'provides context',
        },
      ]);

      mockController.findElementById.mockReturnValue(relatedElement);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Used context',
          result: 'Contextual result',
        }),
      });

      await generateContent('generate', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages[0].content[0].text).toContain('provides context');
      expect(requestBody.messages[0].content[0].text).toContain('Context content');
    });

    it('should return generated result', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Analysis',
          result: 'Final generated content',
        }),
      });

      const result = await generateContent('prompt', mockElement, mockController);

      expect(result).toBe('Final generated content');
    });

    it('should handle invalid JSON response when using new API', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => 'not valid json',
      });

      const result = await generateContent('prompt', mockElement, mockController);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Failed to parse json response', expect.any(Error));
    });

    it('should handle network errors when using new API', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      const result = await generateContent('prompt', mockElement, mockController);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching AI response:', expect.any(Error));
    });

    it('should handle invalid JSON response when using fallback API', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'TBC');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await generateContent('prompt', mockElement, mockController);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching AI response (old fallback):', expect.any(Error));
    });

    it('should handle network errors when using fallback API', async () => {
      // Don't set token - will default to 'TBC'

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      const result = await generateContent('prompt', mockElement, mockController);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching AI response (old fallback):', expect.any(Error));
    });

    it('should handle edges without labels', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const relatedElement = {
        id: 'elem-related',
        type: 'text',
        content: 'Related',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      mockController.findEdgesByElementId.mockReturnValue([
        {
          id: 'edge-1',
          source: 'elem-related',
          target: 'elem-1',
          // No label
        },
      ]);

      mockController.findElementById.mockReturnValue(relatedElement);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Done',
          result: 'Content',
        }),
      });

      await generateContent('test', mockElement, mockController);

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // Should handle undefined label
      expect(requestBody.messages[0].content[0].text).toContain('undefined');
    });
  });

  describe('regenerateImage', () => {
    it('should make API request to image generation endpoint', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const imageElement = {
        id: 'img-1',
        type: 'image',
        content: 'A beautiful sunset',
        width: 400,
        height: 300,
        x: 0,
        y: 0,
        src: 'old-image-url',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          imageUrl: 'https://img.parc.land/new-image.jpg',
        }),
      });

      await regenerateImage(imageElement);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://img.parc.land/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid-token',
          },
        })
      );
    });

    it('should include image dimensions and prompt in request', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const imageElement = {
        id: 'img-1',
        type: 'image',
        content: 'A mountain landscape',
        width: 800,
        height: 600,
        x: 0,
        y: 0,
        src: '',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          imageUrl: 'new-url',
        }),
      });

      await regenerateImage(imageElement);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody).toEqual({
        prompt: 'A mountain landscape',
        width: 800,
        height: 600,
      });
    });

    it('should update element src with new image URL', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const imageElement = {
        id: 'img-1',
        type: 'image',
        content: 'Test image',
        width: 400,
        height: 300,
        x: 0,
        y: 0,
        src: 'old-url',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          imageUrl: 'https://img.parc.land/generated-123.jpg',
        }),
      });

      await regenerateImage(imageElement);

      expect(imageElement.src).toBe('https://img.parc.land/generated-123.jpg');
    });

    it('should handle image generation errors', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const imageElement = {
        id: 'img-1',
        type: 'image',
        content: 'Test',
        width: 400,
        height: 300,
        x: 0,
        y: 0,
        src: 'old-url',
      };

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Image generation failed'));

      await regenerateImage(imageElement);

      expect(console.error).toHaveBeenCalledWith('Failed to regenerate image', expect.any(Error));
      // Element src should remain unchanged
      expect(imageElement.src).toBe('old-url');
    });

    it('should handle JSON parsing errors', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      const imageElement = {
        id: 'img-1',
        type: 'image',
        content: 'Test',
        width: 400,
        height: 300,
        x: 0,
        y: 0,
        src: 'old-url',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await regenerateImage(imageElement);

      expect(console.error).toHaveBeenCalledWith('Failed to regenerate image', expect.any(Error));
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle missing element nodes map gracefully', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      mockController.elementNodesMap = {};

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Done',
          result: 'New content',
        }),
      });

      // Should not throw even if node doesn't exist
      await expect(
        editElementWithPrompt('update', mockElement, mockController)
      ).resolves.not.toThrow();
    });

    it('should handle empty edge arrays', async () => {
      localStorageMock.setItem('PARC.LAND/BKPK_TOKEN', 'valid-token');

      mockController.findEdgesByElementId.mockReturnValue([]);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          thoughts: 'Done',
          result: 'Content',
        }),
      });

      const result = await generateContent('test', mockElement, mockController);

      expect(result).toBe('Content');
    });
  });
});
