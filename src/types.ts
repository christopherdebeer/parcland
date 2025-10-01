// Type definitions for parcland
// Using 'any' types where complex inference would be needed to avoid breaking existing behavior

export interface CanvasElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  type: string;
  content: string;
  scale?: number;
  versions?: any[];
  static?: boolean;
  group?: string;
  zIndex?: number;
  blendMode?: string;
  color?: string;
  src?: string;
  imgId?: string;
  refCanvasId?: string;
  fixedTop?: number;
  fixedLeft?: number;
  target?: string;
  property?: string;
  [key: string]: any; // Allow additional properties
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: {
    color?: string;
    thickness?: string;
    dash?: string;
    [key: string]: any;
  };
  data?: {
    meta?: boolean;
    [key: string]: any;
  };
}

export interface CanvasState {
  canvasId: string;
  elements: CanvasElement[];
  edges: Edge[];
  versionHistory: any[];
  parentCanvas?: string;
  parentElement?: string;
}

export interface ViewState {
  scale: number;
  translateX: number;
  translateY: number;
}

// Global type augmentations
declare global {
  interface Window {
    CC: any;
    marked: any;
    CodeMirror: any;
    eruda: any;
  }
}

export {};
