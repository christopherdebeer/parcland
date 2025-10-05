/**
 * EventBus - Simple pub/sub event system for decoupling components
 *
 * Enables loose coupling between services and components by allowing them
 * to communicate via events rather than direct method calls.
 */

export type EventHandler = (data?: any) => void;

export interface EventSubscription {
  unsubscribe: () => void;
}

export class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private debug: boolean = false;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  /**
   * Subscribe to an event
   * @param event Event name
   * @param handler Callback function
   * @returns Subscription object with unsubscribe method
   */
  on(event: string, handler: EventHandler): EventSubscription {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    if (this.debug) {
      console.log(`[EventBus] Subscribed to "${event}"`);
    }

    return {
      unsubscribe: () => this.off(event, handler)
    };
  }

  /**
   * Unsubscribe from an event
   * @param event Event name
   * @param handler Callback function to remove
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }

      if (this.debug) {
        console.log(`[EventBus] Unsubscribed from "${event}"`);
      }
    }
  }

  /**
   * Emit an event to all subscribers
   * @param event Event name
   * @param data Optional data to pass to handlers
   */
  emit(event: string, data?: any): void {
    const handlers = this.listeners.get(event);

    if (this.debug && handlers && handlers.size > 0) {
      console.log(`[EventBus] Emitting "${event}" to ${handlers.size} listener(s)`, data);
    }

    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[EventBus] Error in handler for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Subscribe to an event for a single emission, then auto-unsubscribe
   * @param event Event name
   * @param handler Callback function
   * @returns Subscription object
   */
  once(event: string, handler: EventHandler): EventSubscription {
    const wrappedHandler = (data?: any) => {
      handler(data);
      this.off(event, wrappedHandler);
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Remove all listeners for a specific event, or all events if no event specified
   * @param event Optional event name
   */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      if (this.debug) {
        console.log(`[EventBus] Cleared all listeners for "${event}"`);
      }
    } else {
      this.listeners.clear();
      if (this.debug) {
        console.log(`[EventBus] Cleared all listeners`);
      }
    }
  }

  /**
   * Get count of listeners for an event
   * @param event Event name
   * @returns Number of listeners
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }

  /**
   * Get all registered event names
   * @returns Array of event names
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }
}

/**
 * Standard event names used throughout the application
 */
export const Events = {
  // Element lifecycle events
  ELEMENT_CREATED: 'element:created',
  ELEMENT_UPDATED: 'element:updated',
  ELEMENT_DELETED: 'element:deleted',
  ELEMENT_SELECTED: 'element:selected',

  // Edge lifecycle events
  EDGE_CREATED: 'edge:created',
  EDGE_UPDATED: 'edge:updated',
  EDGE_DELETED: 'edge:deleted',

  // Selection events
  SELECTION_CHANGED: 'selection:changed',
  SELECTION_CLEARED: 'selection:cleared',

  // Viewport events
  VIEWPORT_CHANGED: 'viewport:changed',
  VIEWPORT_PAN: 'viewport:pan',
  VIEWPORT_ZOOM: 'viewport:zoom',
  VIEWPORT_RECENTER: 'viewport:recenter',

  // History events
  HISTORY_SNAPSHOT: 'history:snapshot',
  HISTORY_UNDO: 'history:undo',
  HISTORY_REDO: 'history:redo',

  // Rendering events
  RENDER_REQUESTED: 'render:requested',
  RENDER_COMPLETE: 'render:complete',

  // Canvas state events
  CANVAS_LOADED: 'canvas:loaded',
  CANVAS_SAVED: 'canvas:saved',
} as const;

export type EventName = typeof Events[keyof typeof Events];
