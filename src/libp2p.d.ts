/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

/*
 * Type definitions for libp2p packages used in libp2p binding. Note that type
 * definitions are not complete, but only defined for types used in the binding.
 * 
 * Based on type definitions on https://github.com/ChainSafe/libp2p-ts.
 */

declare module "libp2p" {

    declare class Libp2p {
        readonly peerId: import("peer-id");
        readonly peerStore: PeerStore;
        readonly registrar: Registrar;
        readonly connectionManager: ConnectionManager;
        readonly transportManager: TransportManager;
        readonly upgrader: any;
        readonly multiaddrs: Array<import("multiaddr")>;
        readonly pubsub: PubSub;

        constructor(options: Options);

        static create(options: Options): Promise<Libp2p>;

        isStarted(): boolean;
        on(event: Events, cb: (event: any) => any): this;
        once(event: Events, cb: (event: any) => any): this;
        removeListener(event: Events, cb: (event: any) => any): this;
        ping(peer: import("peer-id") | import("multiaddr") | string): Promise<number>;
        hangUp(peer: import("peer-id") | import("multiaddr") | string): Promise<void>;
        start(): Promise<void>;
        stop(): Promise<void>;
        handle(protocols: string[] | string, handler: (param: { connection: Connection; stream: Stream; protocol: string }) => void): void;
        unhandle(protocols: string[] | string): void;
        dial(peer: import("peer-id") | import("multiaddr") | string, options: {}): Promise<Connection>;
        dialProtocol(
            peer: import("peer-id") | import("multiaddr") | string,
            protocols: string | string[],
            options?: {}): Promise<{ stream: Stream, protocol: string }>;
    }

    declare class PeerStore {
        readonly peers: Map<string, { id: import("peer-id"); addresses: Array<{ multiaddr: import("multiaddr") }>; protocols: string[] }>;
        readonly addressBook: AddressBook;
        get(peerId: import("peer-id")): {
            id: import("peer-id");
            addresses: Array<{ multiaddr: import("multiaddr") }>;
            protocols: string[]
        };
    }

    declare class Registrar {
        connections: Map<string, Connection[]>;
        getConnection(peerId: import("peer-id")): Connection;
        handle(): void;
        register(): void;
        unregister(): void;
    }

    declare class ConnectionManager {
        size: number;
        on(event: Libp2p.ConnectionEvents, cb: (event: Connection) => any): this;
        once(event: Libp2p.ConnectionEvents, cb: (event: Connection) => any): this;
        removeListener(event: Libp2p.ConnectionEvents, cb: (event: Connection) => any): this;
        get(peerId: import("peer-id")): Connection | null;
    }

    type OptionsConfig = {
        contentRouting?: {},
        dht?: {
            kBucketSize?: number,
            enabled?: boolean,
            randomWalk?: {
                enabled?: boolean,
            },
        },
        peerDiscovery?: {
            autoDial?: boolean,
            enabled?: boolean,
            bootstrap?: {
                enabled?: boolean,
                list: Array<string | import("multiaddr")>,
                interval?: number,
            },
            mdns?: {
                enabled?: boolean,

                /** Announce our presence through mDNS, default false. */
                broadcast?: boolean,

                /** Query interval, default 10 * 1000 (10 seconds). */
                interval?: number,

                /** PeerId to announce, default is own peerId. */
                peerId?: import("peer-id"),

                /** UDP mDNS Port (default 5353). */
                port?: number,

                /** Name of the service announce, default "ipfs.local`. */
                serviceTag?: string,

                /** Enable/disable compatibility with go-libp2p-mdns, default true. */
                compat?: boolean,
            },
            webRTCStar?: {
                interval?: number,
                enabled?: boolean,
            },
            websocketStar?: {
                enabled?: boolean,
            },
        },
        peerRouting?: {},
        pubsub?: {
            enabled?: boolean,
            emitSelf?: boolean,
            signMessages?: boolean,
            strictSigning?: boolean,
            canRelayMessage?: boolean,
            gossipIncoming?: boolean,
            fallbackToFloodsub?: boolean,
            floodPublish?: boolean,
            doPX?: boolean,
            msgIdFn?: (message) => string,
            messageCache?: MessageCache,
        },
        relay?: {
            enabled?: boolean,
            hop?: {
                enabled?: boolean,
                active?: boolean,
            },
        },
    };

    type OptionsModules = {
        connEncryption?: ConnectionEncryption[],
        streamMuxer: Array<LibP2pMplex | LibP2pSpdy>,
        dht?: typeof LibP2pKadDht,
        peerDiscovery: Array<typeof LibP2pBootstrap | typeof LibP2pMdns>,
        transport: LibP2pTransport[],
        pubsub: typeof PubSub,
    };

    type Options = {
        config: OptionsConfig,
        modules: OptionsModules,
        peerId?: import("peer-id").JSONPeerId | import("peer-id"),
        addresses?: { listen?: string[], announce?: string[], noAnnounce?: string[] },
        connectionManager?: {
            maxConnections?: number,
            minConnections?: number,
            pollInterval?: number,
            defaultPeerValue?: number,
        },
    };

    export type SubMessage = {
        data: Uint8Array;
        from?: string | Uint8Array,
        seqno?: Uint8Array,
        topicIDs?: string[],
        signature?: Uint8Array,
        key?: Uint8Array,
    };

    // See https://github.com/libp2p/js-libp2p-interfaces/blob/master/src/pubsub/index.js
    interface PubSub {
        on(topic: string, handler: (msg: SubMessage) => void): this;
        removeListener(topic: string, handler: any): this;
        listenerCount(topic: string): number;
        subscribe(topic: string);
        unsubscribe(topic: string);
        publish(topic: string, data: Uint8Array): Promise<void>;
        getTopics(): string[];
        getSubscribers(topic: string): string[];
        start(): void;
        stop(): void;
    }

    type Source<T> = AsyncIterable<T> | Iterable<T>;
    type Sink<TSource, TReturn = void> = (source: Source<TSource>) => TReturn;
    interface Stream<TSource = unknown, TReturn = unknown> {
        [Symbol.asyncIterator]: () => AsyncIterator;
        source: Source<TSource>;
        sink: Sink<TSource, TReturn>;
        close: () => void;
    }

    interface Connection {
        localPeer: import("peer-id");
        remotePeer: import("peer-id");
        id: string;
        streams: Stream[];
        registry: Map<string, Stream>;
        localAddr: import("multiaddr");
        remoteAddr: import("multiaddr");
        stat: {
            status: "open" | "closing" | "closed";
            timeline: { open: Date; upgraded: Date; close: Date };
            direction: "inbound" | "outbound";
            multiplexer: string;
            encryption: string;
            tags: string[]
        };
        newStream(protocols: string[]): Promise<{ stream: Stream; protocol: string }>;
        addStream(stream: Stream, meta: { protocol: string, metadata: object }): void;
        removeStream(id: string): void;
        close(): Promise<void>;
    }

    interface ConnectionEncryption {
        protocol: string;
        secureInbound(
            localPeer: import("peer-id"),
            connection: Connection,
            remotePeer: import("peer-id")): Promise<SecureConnection>;
        secureOutbound(
            localPeer: import("peer-id"),
            connection: Connection,
            remotePeer?: import("peer-id")): Promise<SecureConnection>;
    }

    interface SecureConnection {
        conn: Connection;
        remotePeer: import("peer-id");
    }

    type Events = "peer:discovery" | "start" | "stop" | "error";
    type ConnectionEvents = "peer:connect" | "peer:disconnect";

    export = Libp2p;
}
