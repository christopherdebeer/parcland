import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as Y from 'yjs';
import { CrdtAdapter } from '../src/lib/network/crdt';

// Create mock provider factory
const createMockProvider = (id: string, doc: any, opts: any) => {
  return {
    doc,
    awareness: {
      clientID: 12345,
      setLocalStateField: jest.fn(),
      on: jest.fn(),
      getStates: jest.fn().mockReturnValue(new Map()),
    },
    on: jest.fn(),
    destroy: jest.fn(),
    disconnect: jest.fn(),
  };
};

// Mock y-webrtc
jest.mock('y-webrtc', () => {
  return {
    WebrtcProvider: jest.fn().mockImplementation(createMockProvider),
  };
});

describe('CrdtAdapter', () => {
  let adapter: CrdtAdapter;
  let testId: string;

  beforeEach(() => {
    // Use unique test ID for each test to avoid conflicts
    testId = `test-canvas-${Math.random().toString(36).substring(7)}`;
    jest.clearAllMocks();
    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up adapter if it was created
    if (adapter && adapter.provider) {
      if (adapter.provider.destroy) {
        adapter.provider.destroy();
      }
      if (adapter.doc) {
        adapter.doc.destroy();
      }
    }
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create a new Y.Doc instance', () => {
      adapter = new CrdtAdapter(testId);
      expect(adapter.doc).toBeInstanceOf(Y.Doc);
    });

    it('should initialize elements and edges maps', () => {
      adapter = new CrdtAdapter(testId);
      expect(adapter.elements).toBeInstanceOf(Y.Map);
      expect(adapter.edges).toBeInstanceOf(Y.Map);
      expect(adapter.doc.getMap('elements')).toBe(adapter.elements);
      expect(adapter.doc.getMap('edges')).toBe(adapter.edges);
    });

    it('should create WebrtcProvider with correct configuration', () => {
      const { WebrtcProvider } = require('y-webrtc');
      adapter = new CrdtAdapter(testId);

      expect(WebrtcProvider).toHaveBeenCalledWith(
        testId,
        expect.any(Y.Doc),
        expect.objectContaining({
          signaling: ['wss://rtc.parc.land'],
          maxConns: 20,
          filterBcConns: true,
          peerOpts: {},
        })
      );
    });

    it('should set up synced event listener', () => {
      adapter = new CrdtAdapter(testId);
      expect(adapter.provider.on).toHaveBeenCalledWith('synced', expect.any(Function));
    });

    it('should initialize client info with awareness clientID', () => {
      adapter = new CrdtAdapter(testId);
      expect(adapter.clientInfo).toEqual({
        clientId: 12345,
        user: 'Unknown',
      });
    });

    it('should set initial awareness state', () => {
      adapter = new CrdtAdapter(testId);
      expect(adapter.provider.awareness.setLocalStateField).toHaveBeenCalledWith(
        'client',
        {
          clientId: 12345,
          user: 'Unknown',
          selection: [],
        }
      );
    });
  });

  describe('updateElement', () => {
    beforeEach(() => {
      adapter = new CrdtAdapter(testId);
    });

    it('should add a new element to the elements map', () => {
      const element = {
        id: 'elem-1',
        x: 100,
        y: 200,
        width: 150,
        height: 100,
        type: 'text',
        content: 'Hello World',
      };

      adapter.updateElement('elem-1', element);
      expect(adapter.elements.get('elem-1')).toEqual(element);
    });

    it('should update an existing element when data changes', () => {
      const element1 = {
        id: 'elem-1',
        x: 100,
        y: 200,
        width: 150,
        height: 100,
        type: 'text',
        content: 'Hello',
      };

      const element2 = {
        ...element1,
        content: 'Hello World',
      };

      adapter.updateElement('elem-1', element1);
      adapter.updateElement('elem-1', element2);

      expect(adapter.elements.get('elem-1')).toEqual(element2);
    });

    it('should not update when element data is identical', () => {
      const element = {
        id: 'elem-1',
        x: 100,
        y: 200,
        width: 150,
        height: 100,
        type: 'text',
        content: 'Hello',
      };

      adapter.updateElement('elem-1', element);
      const setSpy = jest.spyOn(adapter.elements, 'set');

      // Update with same data
      adapter.updateElement('elem-1', element);

      // Should not call set again since data is identical
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple elements', () => {
      const elements = [
        { id: 'elem-1', x: 0, y: 0, width: 100, height: 100, type: 'text', content: 'A' },
        { id: 'elem-2', x: 100, y: 100, width: 100, height: 100, type: 'text', content: 'B' },
        { id: 'elem-3', x: 200, y: 200, width: 100, height: 100, type: 'text', content: 'C' },
      ];

      elements.forEach(el => adapter.updateElement(el.id, el));

      expect(adapter.elements.size).toBe(3);
      elements.forEach(el => {
        expect(adapter.elements.get(el.id)).toEqual(el);
      });
    });
  });

  describe('updateEdge', () => {
    beforeEach(() => {
      adapter = new CrdtAdapter(testId);
    });

    it('should add a new edge to the edges map', () => {
      const edge = {
        id: 'edge-1',
        source: 'elem-1',
        target: 'elem-2',
        label: 'connects to',
      };

      adapter.updateEdge('edge-1', edge);
      expect(adapter.edges.get('edge-1')).toEqual(edge);
    });

    it('should update an existing edge', () => {
      const edge1 = {
        id: 'edge-1',
        source: 'elem-1',
        target: 'elem-2',
        label: 'old label',
      };

      const edge2 = {
        ...edge1,
        label: 'new label',
      };

      adapter.updateEdge('edge-1', edge1);
      adapter.updateEdge('edge-1', edge2);

      expect(adapter.edges.get('edge-1')).toEqual(edge2);
    });

    it('should handle multiple edges', () => {
      const edges = [
        { id: 'edge-1', source: 'elem-1', target: 'elem-2', label: 'A' },
        { id: 'edge-2', source: 'elem-2', target: 'elem-3', label: 'B' },
        { id: 'edge-3', source: 'elem-1', target: 'elem-3', label: 'C' },
      ];

      edges.forEach(edge => adapter.updateEdge(edge.id, edge));

      expect(adapter.edges.size).toBe(3);
      edges.forEach(edge => {
        expect(adapter.edges.get(edge.id)).toEqual(edge);
      });
    });
  });

  describe('awareness state management', () => {
    beforeEach(() => {
      adapter = new CrdtAdapter(testId);
    });

    it('should update view state in awareness', () => {
      const viewData = {
        scale: 1.5,
        translateX: 100,
        translateY: 200,
      };

      adapter.updateView(viewData);

      expect(adapter.provider.awareness.setLocalStateField).toHaveBeenCalledWith(
        'viewState',
        viewData
      );
    });

    it('should update selection in awareness', () => {
      const selection = new Set(['elem-1', 'elem-2', 'elem-3']);

      adapter.updateSelection(selection);

      expect(adapter.provider.awareness.setLocalStateField).toHaveBeenCalledWith(
        'client',
        {
          clientId: 12345,
          user: 'Unknown',
          selection: ['elem-1', 'elem-2', 'elem-3'],
        }
      );
    });

    it('should handle empty selection', () => {
      const selection = new Set<string>();

      adapter.updateSelection(selection);

      expect(adapter.provider.awareness.setLocalStateField).toHaveBeenCalledWith(
        'client',
        {
          clientId: 12345,
          user: 'Unknown',
          selection: [],
        }
      );
    });
  });

  describe('event listeners', () => {
    beforeEach(() => {
      adapter = new CrdtAdapter(testId);
    });

    it('should register onPresenceChange callback', () => {
      const callback = jest.fn();
      adapter.onPresenceChange(callback);

      expect(adapter.provider.awareness.on).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should filter out own client from presence changes', () => {
      const mockStates = new Map([
        [12345, { client: { clientId: 12345, user: 'Self' } }],
        [67890, { client: { clientId: 67890, user: 'Other' } }],
      ]);

      adapter.provider.awareness.getStates.mockReturnValue(mockStates);

      const callback = jest.fn();
      adapter.onPresenceChange(callback);

      // Get the registered callback
      const registeredCallback = (adapter.provider.awareness.on as jest.Mock).mock.calls[0][1];

      // Trigger it
      registeredCallback({});

      // Should filter out own clientId (12345)
      expect(callback).toHaveBeenCalledWith([
        { client: { clientId: 67890, user: 'Other' } }
      ]);
    });

    it('should register onUpdate callback for elements', () => {
      const callback = jest.fn();
      const observeSpy = jest.spyOn(adapter.elements, 'observe');

      adapter.onUpdate(callback);

      expect(observeSpy).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register onUpdate callback for edges', () => {
      const callback = jest.fn();
      const observeSpy = jest.spyOn(adapter.edges, 'observe');

      adapter.onUpdate(callback);

      expect(observeSpy).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should trigger onUpdate callback when elements change', () => {
      const callback = jest.fn();
      adapter.onUpdate(callback);

      // Add an element to trigger the observe callback
      const element = {
        id: 'elem-1',
        x: 100,
        y: 200,
        width: 150,
        height: 100,
        type: 'text',
        content: 'Test',
      };

      adapter.updateElement('elem-1', element);

      // The callback should have been triggered by the Y.Map change
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('sync events', () => {
    it('should handle synced event', () => {
      adapter = new CrdtAdapter(testId);

      const syncedCallback = (adapter.provider.on as jest.Mock).mock.calls.find(
        call => call[0] === 'synced'
      )?.[1];

      expect(syncedCallback).toBeDefined();

      // Trigger synced event
      syncedCallback(true);

      // Should log the sync status (mocked console.log)
      expect(console.log).toHaveBeenCalledWith('[CRDT] Synced', true);
    });
  });
});
