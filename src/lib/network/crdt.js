import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export class CrdtAdapter {
    constructor(id) {
        this.doc = new Y.Doc();
        this.elements = this.doc.getMap('elements');
        this.edges = this.doc.getMap('edges');
        this.provider = new WebrtcProvider(id, this.doc, {
            signaling: ['wss://c15r--752c8bf437cd11f0b0e09e149126039e.web.val.run'],
            maxConns: 20,
            filterBcConns: true,
            peerOpts: {}
        });
    }

    updateElement(id, data) {
        this.elements.set(id, data);
    }

    updateEdge(id, data) {
        this.edges.set(id, data);
    }

    onUpdate(callback) {
        this.elements.observe((event) => {
            callback(event);
        });
        this.edges.observe((event) => {
            callback(event);
        });
    }
}