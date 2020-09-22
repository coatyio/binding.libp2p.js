/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

import { CommunicationBindingLogLevel, Uuid } from "@coaty/core";
import { pipe } from "it-pipe";
import Libp2p = require("libp2p");
import PeerId = require("peer-id");

/**
 * Represents the last will of a Coaty agent as a tuple of associated peer ID,
 * agent identity object ID to be deadvertised, and an optional series of other
 * Coaty object IDs to be deadvertised.
 */
export type LastWill = [string, Uuid, ...Uuid[]];

/**
 * Defines liveliness protocol operations.
 */
export enum LivelinessOperation {
    AnnounceLastWill = 0,
    AnnounceDead = 1,
    PingAlive = 2,
    PingAliveAck = 3,
}

/**
 * Defines message format of the Liveliness protocol.
 */
export interface LivelinessMessage {

    /** Operation to be performed. */
    op: LivelinessOperation;

    /** 
     * Peers to which this message has already been propagated (optional, for
     * `AnnounceLastWill` and `AnnounceDead` operations only). The first peer in
     * the array is the originator of the message: for `AnnounceLastWill`
     * operations it is the announcing peer; for `AnnounceDead` operations it is
     * the dead peer.
     */
    propagatedPeerIds?: string[];

    /**
     * Collection of last wills to be announced or propagated (optional, for
     * `AnnounceLastWill` operation only).
     */
    lastWills?: LastWill[];
}

/**
 * Provides liveliness detection among libp2p peers and last will delivery of
 * and on behalf of peers that are no longer alive.
 *
 * Liveliness detection and last will delivery works as follows: Last will
 * announcements are sent to newly connected peers that also support the
 * liveliness protocol and propagated through the network of peers. Each peer
 * maintains its own last will and the last wills of all other peers which are
 * alive. Whenever a peer is asserted to be no longer alive, i.e. the peer is
 * offline or terminated normally or abnormally, dead announcements are
 * propagated to all other peers which in turn dispatch the dead peer's last
 * will as a Deadvertise event locally if the Coaty agent observes it.
 */
export class LivelinessService {

    /** Defines the versioned name of the Coaty Liveliness protocol. */
    static readonly LIVELINESS_PROTOCOL = "/coaty/liveliness/1.0.0";

    // Map of LastWill tuples per peer ID as B58 string.
    private _lastWills: Map<string, LastWill>;

    private _isStarted: boolean;
    private _onPeerConnected: (connection) => void;
    private _onPeerDisconnected: (connection) => void;

    constructor(
        private _node: Libp2p,
        private _log: (...args: any[]) => void,
        private _lastWillDispatcher: (lastWill: LastWill) => void,
        lastWill: LastWill) {
        this._isStarted = false;
        this._lastWills = new Map<string, LastWill>();
        this._lastWills.set(lastWill[0], lastWill);
    }

    /**
     * Register the Coaty Liveliness Protocol with the associated libp2p peer.
     */
    registerProtocol() {
        this._onPeerConnected = connection => {
            if (this._isStarted && connection.stat.direction === "outbound") {
                // Announce last will to a newly connected peer that also
                // supports the liveliness protocol.
                this._announceLastWill(connection);
            }
        };

        // This event will be triggered anytime a new connection is
        // established to another peer.
        this._node.connectionManager.on("peer:connect", this._onPeerConnected);

        this._onPeerDisconnected = connection => {
            if (this._isStarted && this._isLivelinessPeer(connection)) {
                this._onPeerMaybeDead(connection);
            }
        };

        // Triggered anytime we are disconnected from another peer, regardless of
        // the circumstances of that disconnection. If we happen to have multiple
        // connections to a peer, this event will only be triggered when the last
        // connection is closed.
        this._node.connectionManager.on("peer:disconnect", this._onPeerDisconnected);

        this._isStarted = true;
        this._node.handle(LivelinessService.LIVELINESS_PROTOCOL, this._handleInboundLivelinessMessage);
    }

    /**
     * Unregister the Coaty Liveliness Protocol from the associated libp2p peer.
     */
    unregisterProtocol() {
        this._isStarted = false;
        this._node.connectionManager.removeListener("peer:connect", this._onPeerConnected);
        this._node.connectionManager.removeListener("peer:disconnect", this._onPeerDisconnected);
        this._node.unhandle(LivelinessService.LIVELINESS_PROTOCOL);
    }

    /*  Liveliness Codec */

    private _encodeLivelinessMessage(msg: LivelinessMessage) {
        return JSON.stringify(msg);
    }

    private _decodeLivelinessMessage(msg: any) {
        return JSON.parse(msg.toString()) as LivelinessMessage;
    }

    /* Peer Alive Handling */

    private _addLastWills(lastWills: LastWill[]): LastWill[] {
        const newLastWills: LastWill[] = [];
        for (const lastWill of lastWills) {
            const [peerId] = lastWill;
            if (!this._lastWills.has(peerId)) {
                // Only set non-existing entries as last wills won't change during an agent's lifecycle.
                this._lastWills.set(peerId, lastWill);
                newLastWills.push(lastWill);
            }
        }
        return newLastWills;
    }

    /**
     * Announce local last wills to a remote peer over a given connection.
     */
    private async _announceLastWill(connection) {
        const remotePeerId = connection.remotePeer.toB58String();

        // Note: cannot check here if remote peer supports liveliness protocol as peer
        // data is not yet set up in local peer store when the "peer:connect" event is
        // handled (the libp2p identify protocol handshake is not yet finished). Anyway,
        // if this protocol is not supported creating a new stream on the connection
        // will fail eventually.

        let stream;
        try {
            const message: LivelinessMessage = {
                op: LivelinessOperation.AnnounceLastWill,
                lastWills: Array.from(this._lastWills.values()),
                propagatedPeerIds: [this._node.peerId.toB58String()],
            };
            const s = await connection.newStream([LivelinessService.LIVELINESS_PROTOCOL]);
            if (connection.stat.status !== "open") {
                return;
            }
            stream = s.stream;
            this._log(CommunicationBindingLogLevel.debug, "Announce ", message.lastWills.length, " last wills to ", remotePeerId);
            await pipe(
                [this._encodeLivelinessMessage(message)],
                stream,
            );
            return true;
        } catch (error) {
            this._log(CommunicationBindingLogLevel.debug, "Announce last wills to ", remotePeerId, " failed: ", error);
            return false;
        } finally {
            // Close the stream after first reply is received.
            stream?.close();
        }
    }

    /**
     * Propagate new last wills to all connected peers except the ones which
     * have already been visited.
     */
    private _propagateLastWills(newLastWills: LastWill[], propagatedPeerIds: string[]) {
        if (newLastWills.length === 0) {
            return;
        }
        propagatedPeerIds.push(this._node.peerId.toB58String());
        const message: LivelinessMessage = {
            op: LivelinessOperation.AnnounceLastWill,
            lastWills: newLastWills,
            propagatedPeerIds,
        };
        this._propagateMessage(message);
    }

    /**
     * Propagate a dead peer to all connected peers except the ones which have
     * already been visited.
     */
    private _propagateDead(propagatedPeerIds: string[]) {
        propagatedPeerIds.push(this._node.peerId.toB58String());
        this._propagateMessage({
            op: LivelinessOperation.AnnounceDead,
            propagatedPeerIds,
        });
    }

    private _propagateMessage(message: LivelinessMessage) {
        this._node.peerStore.peers.forEach(async (peerData) => {
            if (!this._isStarted) {
                return;
            }
            const peerId = peerData.id.toB58String();

            if (message.propagatedPeerIds.includes(peerId)) {
                return;
            }

            if (!peerData.protocols.includes(LivelinessService.LIVELINESS_PROTOCOL)) {
                return;
            }

            const connection = this._node.registrar.getConnection(peerData.id);
            if (!connection || connection.stat.status !== "open") {
                return;
            }

            let stream;
            try {
                const s = await connection.newStream([LivelinessService.LIVELINESS_PROTOCOL]);
                if (connection.stat.status !== "open") {
                    return;
                }
                stream = s.stream;
                this._log(CommunicationBindingLogLevel.debug, "Propagate ", LivelinessOperation[message.op],
                    " to ", peerId);
                await pipe(
                    [this._encodeLivelinessMessage(message)],
                    stream,
                );
            } catch (error) {
                this._log(CommunicationBindingLogLevel.debug, "Propagate ", LivelinessOperation[message.op],
                    " to ", peerId, " failed: ", error);
            } finally {
                // Close the stream as we don't expect a reply.
                stream?.close();
            }
        });
    }

    private get _handleInboundLivelinessMessage() {
        return async ({ connection, stream }) => {
            await pipe(
                stream,
                // tslint:disable-next-line: space-before-function-paren
                source => (async function* (that: LivelinessService) {
                    for await (const msg of source) {
                        if (!that._isStarted) {
                            break;
                        }
                        const remotePeer = connection.remotePeer;
                        const remotePeerId = remotePeer.toB58String();
                        try {
                            const message = that._decodeLivelinessMessage(msg);
                            switch (message.op) {
                                case LivelinessOperation.AnnounceLastWill:
                                    that._propagateLastWills(that._addLastWills(message.lastWills), message.propagatedPeerIds);
                                    break;
                                case LivelinessOperation.AnnounceDead:
                                    if (that._dispatchLastWill(message.propagatedPeerIds[0])) {
                                        that._propagateDead(message.propagatedPeerIds);
                                    }
                                    break;
                                case LivelinessOperation.PingAlive:
                                    // Reply on the same stream.
                                    yield that._encodeLivelinessMessage({ op: LivelinessOperation.PingAliveAck });
                                    break;
                                default:
                                    throw new Error("unknown liveliness operation");
                            }
                        } catch (error) {
                            that._log(CommunicationBindingLogLevel.error, "Failed to handle liveliness message by ",
                                remotePeerId, " : ", error);
                        }
                    }
                })(this),
                stream,
            );
        };
    }

    /* Peer Death Handling */

    private async _onPeerMaybeDead(connection) {
        // Depending on configuration and state of ConnectionManager, the disconnected
        // peer might be still alive, i.e. still be reachable and having open
        // connections to other peers. We can check this condition by trying to ping the
        // disconnected peer.
        if (await this._isPeerAlive(connection.remotePeer)) {
            return;
        }

        const deadPeerId = connection.remotePeer.toB58String();

        // Locally dispatch last will of dead peer and remove it from the last will store.
        if (this._dispatchLastWill(deadPeerId)) {

            // Announce dead peer to connected peers for local dispatch of last will.
            this._propagateDead([deadPeerId]);
        }
    }

    private async _isPeerAlive(peerId: PeerId) {
        if (await this._pingAlive(peerId)) {
            // Peer is still reachable, close newly created ping connection immediately.
            try {
                await this._node.hangUp(peerId);
            } catch {
                // Even if hangup fails, peer is considered alive.
            }
            return true;
        }
        return false;
    }

    private async _pingAlive(peerId: PeerId) {
        const peerIdString = peerId.toB58String();
        const message: LivelinessMessage = {
            op: LivelinessOperation.PingAlive,
        };

        this._log(CommunicationBindingLogLevel.debug, "Ping alive to ", peerIdString);

        try {
            // Note that the libp2p internal dial timeout is 2000ms.
            const { stream } = await this._node.dialProtocol(peerId, LivelinessService.LIVELINESS_PROTOCOL);
            await pipe(
                [this._encodeLivelinessMessage(message)],
                stream,
                async source => {
                    // Receive the first reply on the same stream.
                    for await (const _reply of source) {
                        this._log(CommunicationBindingLogLevel.debug, "Ping alive acknowledged by ", peerIdString);
                        break;
                    }
                },
            );
            return true;
        } catch {
            this._log(CommunicationBindingLogLevel.debug, "Ping alive not acknowledged by ", peerIdString);
            return false;
        }
    }

    private _isLivelinessPeer(connection) {
        return this._node.peerStore.get(connection.remotePeer)?.protocols.some(p => p === LivelinessService.LIVELINESS_PROTOCOL);
    }

    private _dispatchLastWill(peerId: string) {
        const lastWill = this._lastWills.get(peerId);
        if (lastWill) {
            this._lastWills.delete(peerId);
            this._lastWillDispatcher(lastWill);
            return true;
        }
        return false;
    }
}
