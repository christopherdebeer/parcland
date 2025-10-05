/**
 * StandardEdge
 *
 * Standard edge implementation with straight lines and arrowheads
 */

import { BaseEdgeComponent } from '../BaseEdgeComponent.ts';
import type { Edge } from '../../types.ts';
import type { ComponentContext } from '../BaseComponent.ts';

export class StandardEdge extends BaseEdgeComponent {
  constructor(data: Edge, context: ComponentContext) {
    super(data, context);
  }

  // Uses default intersection calculation from BaseEdgeComponent
  // Can override calculateIntersection() for custom behavior
}
