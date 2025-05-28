import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export class CrdtAdapter {
    constructor(id) {
        this.doc = new Y.Doc();
        this.elements = this.doc.getMap('elements');
        this.edges = this.doc.getMap('edges');
        this.provider = new WebrtcProvider(id, this.doc, {
            signaling: ['wss://rtc.parc.land'],
            maxConns: 20,
            filterBcConns: true,
            peerOpts: {}
        });

        // this.provider.awareness.on('change', (changes) => {
        //     console.log("[CRDT] Awareness change", changes);
        //     console.log("[CRDT] Awareness full", Array.from(this.provider.awareness.getStates().values()));
        // });

        this.provider.on('synced', (isSynced) => {
            console.log("[CRDT] Synced", isSynced);
        });

        this.provider.awareness.setLocalStateField("client", {
            clientId: this.provider.awareness.clientID,
            user: 'Unknown'
        });
    }

    updateElement(id, data) {
        const existing = this.elements.get(id);
        const delta = JSON.stringify(existing) !== JSON.stringify(data);
        
        // deep equality check
        if (!delta && existing) {
            // console.log("[CRDT] No change", id, {delta}, {prev: JSON.stringify(existing), next: JSON.stringify(data)});
            return;
        }
        debugger;
        console.log("[CRDT] Update element", id, {delta}, {prev: JSON.stringify(existing), next: JSON.stringify(data)});
        this.elements.set(id, data);
    }

    updateEdge(id, data) {
        this.edges.set(id, data);
    }

    updateView(data) {
        this.provider.awareness.setLocalStateField("viewState", data);
    }

    updateSelection(data) {
        this.provider.awareness.setLocalStateField("selection", data);
    }

    onPresenceChange(callback) {
        this.provider.awareness.on('change', (changes) => {
            callback(Array.from(this.provider.awareness.getStates().values()).filter( p => p.client.clientId !== this.provider.awareness.clientID));
        });
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