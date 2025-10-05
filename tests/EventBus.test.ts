import { EventBus, Events } from '../src/services/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('Basic Pub/Sub', () => {
    it('should emit events to subscribed handlers', () => {
      const handler = jest.fn();
      eventBus.on('test:event', handler);

      eventBus.emit('test:event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);

      eventBus.emit('test:event', 'data');

      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });

    it('should not call handlers for different events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('event:one', handler1);
      eventBus.on('event:two', handler2);

      eventBus.emit('event:one', 'data');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should emit events with no data', () => {
      const handler = jest.fn();
      eventBus.on('test:event', handler);

      eventBus.emit('test:event');

      expect(handler).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Unsubscribe', () => {
    it('should unsubscribe via off method', () => {
      const handler = jest.fn();
      eventBus.on('test:event', handler);

      eventBus.off('test:event', handler);
      eventBus.emit('test:event');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should unsubscribe via subscription object', () => {
      const handler = jest.fn();
      const subscription = eventBus.on('test:event', handler);

      subscription.unsubscribe();
      eventBus.emit('test:event');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove specific handler when multiple exist', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);

      eventBus.off('test:event', handler1);
      eventBus.emit('test:event');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Once', () => {
    it('should only fire handler once', () => {
      const handler = jest.fn();
      eventBus.once('test:event', handler);

      eventBus.emit('test:event', 'data1');
      eventBus.emit('test:event', 'data2');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('data1');
    });

    it('should allow manual unsubscribe before firing', () => {
      const handler = jest.fn();
      const subscription = eventBus.once('test:event', handler);

      subscription.unsubscribe();
      eventBus.emit('test:event');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Clear', () => {
    it('should clear all listeners for specific event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('event:one', handler1);
      eventBus.on('event:two', handler2);

      eventBus.clear('event:one');

      eventBus.emit('event:one');
      eventBus.emit('event:two');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should clear all listeners when no event specified', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('event:one', handler1);
      eventBus.on('event:two', handler2);

      eventBus.clear();

      eventBus.emit('event:one');
      eventBus.emit('event:two');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    it('should return listener count', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      expect(eventBus.listenerCount('test:event')).toBe(0);

      eventBus.on('test:event', handler1);
      expect(eventBus.listenerCount('test:event')).toBe(1);

      eventBus.on('test:event', handler2);
      expect(eventBus.listenerCount('test:event')).toBe(2);

      eventBus.off('test:event', handler1);
      expect(eventBus.listenerCount('test:event')).toBe(1);
    });

    it('should return all event names', () => {
      eventBus.on('event:one', jest.fn());
      eventBus.on('event:two', jest.fn());
      eventBus.on('event:three', jest.fn());

      const names = eventBus.eventNames();

      expect(names).toContain('event:one');
      expect(names).toContain('event:two');
      expect(names).toContain('event:three');
      expect(names.length).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should catch and log errors in handlers without stopping other handlers', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const handler1 = jest.fn(() => {
        throw new Error('Test error');
      });
      const handler2 = jest.fn();

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);

      eventBus.emit('test:event');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Standard Events', () => {
    it('should define standard event constants', () => {
      expect(Events.ELEMENT_CREATED).toBe('element:created');
      expect(Events.ELEMENT_UPDATED).toBe('element:updated');
      expect(Events.SELECTION_CHANGED).toBe('selection:changed');
      expect(Events.VIEWPORT_CHANGED).toBe('viewport:changed');
      expect(Events.HISTORY_SNAPSHOT).toBe('history:snapshot');
      expect(Events.RENDER_REQUESTED).toBe('render:requested');
    });

    it('should work with standard event constants', () => {
      const handler = jest.fn();
      eventBus.on(Events.ELEMENT_CREATED, handler);

      eventBus.emit(Events.ELEMENT_CREATED, { id: 'test-123' });

      expect(handler).toHaveBeenCalledWith({ id: 'test-123' });
    });
  });
});
