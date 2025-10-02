import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import type { CanvasElement, Edge } from '../../types';

export class CrdtAdapter {
    doc: Y.Doc;
    elements: Y.Map<CanvasElement>;
    edges: Y.Map<Edge>;
    provider: WebrtcProvider;
    clientInfo: { clientId: number; user: string };

    constructor(id: string) {
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

        this.provider.on('synced', (isSynced: boolean) => {
            console.log("[CRDT] Synced", isSynced);
        });

        this.clientInfo = {
            clientId: this.provider.awareness.clientID,
            user: 'Unknown'
        };

        this.provider.awareness.setLocalStateField("client", {
            ...this.clientInfo,
            selection: [],
        });
    }

    updateElement(id: string, data: CanvasElement): void {
        const existing = this.elements.get(id);
        const delta = JSON.stringify(existing) !== JSON.stringify(data);
        
        // deep equality check
        if (!delta && existing) {
            // console.log("[CRDT] No change", id, {delta}, {prev: JSON.stringify(existing), next: JSON.stringify(data)});
            return;
        }
        console.log("[CRDT] Update element", id, {delta}, {prev: JSON.stringify(existing), next: JSON.stringify(data)});
        this.elements.set(id, data);
    }

    updateEdge(id: string, data: Edge): void {
        this.edges.set(id, data);
    }

    updateView(data: any): void {
        this.provider.awareness.setLocalStateField("viewState", data);
    }

    updateSelection(data: Set<string>): void {
        this.provider.awareness.setLocalStateField("client", {
            ...this.clientInfo,
            selection: Array.from(data),
        });
    }

    onPresenceChange(callback: (presence: any[]) => void): void {
        this.provider.awareness.on('change', (changes: any) => {
            callback(Array.from(this.provider.awareness.getStates().values()).filter((p: any) => p.client?.clientId !== this.provider.awareness.clientID));
        });
    }

    onUpdate(callback: (event: any) => void): void {
        this.elements.observe((event) => {
            callback(event);
        });
        this.edges.observe((event) => {
            callback(event);
        });
    }
}
