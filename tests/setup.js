// Jest setup file
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock setPointerCapture/releasePointerCapture
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {};
}

// Ensure Element.prototype.closest is available for all events
if (!Element.prototype.closest) {
  Element.prototype.closest = function (selector) {
    let el = this;
    while (el) {
      if (el.matches && el.matches(selector)) return el;
      el = el.parentElement;
    }
    return null;
  };
}

// Polyfill PointerEvent for JSDOM
if (typeof global.PointerEvent === "undefined") {
  global.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId || 0;
      this.width = params.width || 0;
      this.height = params.height || 0;
      this.pressure = params.pressure || 0;
      this.tangentialPressure = params.tangentialPressure || 0;
      this.tiltX = params.tiltX || 0;
      this.tiltY = params.tiltY || 0;
      this.twist = params.twist || 0;
      this.pointerType = params.pointerType || "mouse";
      this.isPrimary = params.isPrimary || false;
    }
  };
}

// Polyfill structuredClone for Node.js < 17
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };
}
