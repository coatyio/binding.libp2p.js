/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

import Libp2p = require("libp2p");
import Libp2pBootstrap = require("libp2p-bootstrap");
import Libp2pFloodsub = require("libp2p-floodsub");
import Libp2pMdns = require("libp2p-mdns");
import Libp2pMplex = require("libp2p-mplex");
import Libp2pSecio = require("libp2p-secio");
import Libp2pTcp = require("libp2p-tcp");
import Libp2pPeerId = require("peer-id");
import Uint8ArraysFromString = require("uint8arrays/from-string");
import Uint8ArraysToString = require("uint8arrays/to-string");

import {
    Async,
    CommunicationBinding,
    CommunicationBindingJoinOptions,
    CommunicationBindingLogLevel,
    CommunicationBindingOptions,
    CommunicationBindingWithOptions,
    CommunicationEventLike,
    CommunicationEventType,
    CommunicationState,
} from "@coaty/core";
import { MulticastDnsDiscovery } from "@coaty/core/runtime-node";

import { Libp2pEvent } from "./libp2p-event";
import { LastWill, LivelinessService } from "./libp2p-liveliness";
import { Libp2pTopic } from "./libp2p-topic";

/**
 * Options provided by the libp2p communication binding.
 */
export interface Libp2pBindingOptions extends CommunicationBindingOptions {

    /**
     * Namespace used to isolate different Coaty applications running with the
     * same binding type in the same networking infrastructure (optional).
     *
     * Communication events are only routed between agents within a common
     * communication namespace: an agent publishes and observes communication
     * events with respect to the given namespace.
     *
     * If not specified (i.e. undefined), a default namespace named "-" is used.
     *
     * @remarks The libp2p binding poses the following restrictions on this
     * option: namespace must not include consecutive dots or end with a dot,
     * and namespace must not contain more than 236 characters.
     */
    namespace?: string;

    /**
     * > The libp2p binding does **not** support this option, i.e. it is always
     * > disabled. Coaty communication events published by agents in a different
     * > namespace cannot be observed.
     *
     * Determines whether to enable cross-namespace communication between agents
     * in special use cases (optional).
     *
     * If `true`, an agent receives communication events published by *any*
     * agent running with the same binding type in the same networking
     * infrastructure, regardless of namespace.
     *
     * If not specified or `false`, this option is not enabled.
     */
    shouldEnableCrossNamespacing?: boolean;

    /**
     * Use a specific libp2p Peer ID consisting of the ID's multihash complete
     * with public/private keypair (optional).
     *
     * If no Peer ID is specified, a new one is generated automatically whenever
     * the binding joins the libp2p network.
     *
     * Provide a specific/constant Peer ID whenever you want to leverage known
     * addresses, for example in combination with bootstrap peer discovery (see
     * options `ownBootstrapAddresses` and `bootstrapPeers`).
     *
     * @remarks To generate a new Peer ID complete with private/public keypairs,
     * `npm install peer-id` and use either the CLI function `peer-id` or
     * `require("peer-id").create().then(id => console.log(id.toJSON()))`.
     * Details can be found [here](https://www.npmjs.com/package/peer-id#cli).
     */
    peerId?: {
        /** The multihash of the public key as string. */
        id: string,

        /** RSA Private Key. */
        privKey: string,

        /** RSA PublicKey. */
        pubKey: string;
    };

    /**
     * The interval in milliseconds to discover remote peers or broadcast peer
     * information (optional).
     *
     * If not specifid, the value defaults to 10000 msecs.
     *
     * @remarks This option is used by both peer discovery methods: mDNS and
     * bootstrap peers.
     */
    peerDiscoveryInterval?: number;

    /**
     * Disable Multicast DNS (mDNS) as peer discovery method (optional).
     * 
     * If not specified, mDNS peer discovery is enabled by default.
     */
    shouldDisableMdnsPeerDiscovery?: boolean;

    /** 
     * Provide a list of libp2p bootstrap nodes for peer discovery by specifying
     * their multiaddresses (optional).
     *
     * This option may be specified in addition to the default Multicast DNS
     * peer discovery mechanism. It is useful to connect to remote peers in
     * non-local networks that are known in advance and that are not
     * discoverable by mDNS.
     *
     * A typical bootstrap multiaddr specifies a bootstrap node by its given
     * transport multiaddr composed with its libp2p peer ID multiaddr, like
     * this:
     * `/ip4/7.7.7.7/tcp/4242/p2p/QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N`.
     */
    bootstrapPeers?: string[];

    /**
     * Provide a list of transport multiaddrs on the local host that should make
     * up a bootstrap peer (optional).
     *
     * This option is used to set up a bootstrap peer which listens on the given
     * transport addresses (a +n explicit port must be specified). The transport
     * part of a multiaddr specified in the correlating option `bootstrapPeers`
     * should correspond with one of the given addresses.
     *
     * A typical bootstrap transport multiaddr on the local host looks like:
     * `/ip4/127.0.0.1/tcp/4242`.
     *
     * @remarks Only TCP multiaddrs are supported. Note that you have to provide
     * a constant, preconfigured peer ID for a bootstrap peer (with options
     * `peerId`) so that the peer is discoverable by other peers specifying this
     * peer ID in their bootstrap addresses.
     */
    ownBootstrapAddresses?: string[];

    /**
     * A list of transport multiaddresses on which the libp2p node should listen
     * (optional).
     *
     * If not specified, the libp2p node will listen on the first local IPv4
     * network interface, using a randomly chosen free port. If no such
     * interface is present, it will listen on the first IPv6 interface.
     *
     * @remarks Only TCP multiaddrs are supported, e.g. use
     * `/ip4/127.0.0.1/tcp/2000` to configure the node to listen on TCP port
     * 2000 on the IPv4 loopback interface.
     *
     * @remarks To listen on all available IPv4 and/or IPv6 network interfaces
     * using a randomly chosen free port, specify the following multiaddresses:
     * `/ip4/0.0.0.0/tcp/0`, `/ip6/::1/tcp/0`.
     * 
     * @remarks To listen on host names instead of TCP addresses, use the `dns4`
     * format to specify multiaddresses: `/dns4/foo.mydomain.com/tcp/6001`.
     *
     * @remarks If your agents run in docker compose services, use the `dns4`
     * format instead of `ip4` or `ip6` to specify multiaddresses:
     * `/dns4/<docker-service-name>/tcp/6001`.
     */
    listenAddresses?: string[];

    /**
     * The time window (in milliseconds) to wait on start-up of the libp2p node
     * until no more subscriptions by other peers are received (optional).
     * Afterwards, own publication messages are delivered to other peers.
     *
     * If not specified, the settling time window defaults to 1000ms.
     *
     * If a lot of agents are started concurrently, the settling time window
     * should be enlarged.
     */
    peerSettlingTimeWindow?: number;
}

/**
 * Defines a peer-to-peer based communication binding for transmitting Coaty
 * communication events via a [libp2p](https://libp2p.io) pubsub messaging
 * protocol. A detailed explanation can be found
 * [here](https://docs.libp2p.io/concepts/publish-subscribe/).
 *
 * With this binding, TCP connections between Coaty agent peers are secured by
 * default, i.e. messages are encryped and signed using public key cryptography.
 *
 * As this binding is based on peer-to-peer communication, the emitted
 * communication state is `Online` as long as the binding is in `Joined` state
 * and the libp2p peer node is not *isolated*, i.e. has at least one active
 * libp2p connection to remote libp2p peers. However, note that an isolated
 * offline peer can communicate with itself.
 *
 * This binding supports Raw events with plain topic strings that contain no
 * wildcard tokens. Topic strings must be non-empty and may include arbitrary
 * Unicode characters.
 *
 * This binding does **not** support the `shouldEnableCrossNamespacing` option.
 * Coaty communication events published by agents in a different namespace
 * cannot be observed.
 *
 * This binding poses the following restrictions on its `namespace` option:
 * namespace must not include consecutive dots or end with a dot, and namespace
 * must not contain more than 236 characters.
 *
 * @remarks In case you are running multiple isolated Coaty applications on the
 * same local network, you should specify different namespaces for each of them.
 * This ensures that peer connections are only set up between Coaty agents
 * sharing the same namespace.
 *
 * @remarks This binding supports two peer discovery methods: `Multicast DNS`
 * (mDNS) to discover peers in a local network, and `Bootstrap Peers` to
 * discover peers across networks. mDNS discovery cannot be used across multiple
 * IP subnets. It should be used in networks having a small number of nodes as
 * mDNS queries and responses are transmitted in multicast mode and
 * consecutively generate large volume of traffic. Bootstrap peer discovery uses
 * a list of preconfigured bootstrap nodes. Depending on the application use
 * case, both methods can be combined or used exclusively.
 *
 * @remarks To enable debug mode of the underlying `libp2p` libraries, set
 * global variable `DEBUG` to a comma-separated list of libp2p packages to be
 * debugged *before* loading this binding. To debug the base libp2p system, use
 * `libp2p`, to debug a specific module use `libp2p:<module>`, to debug all
 * modules use `libp2p,libp2p:*`. For example, to restrict debug mode to the
 * used libp2p pubsub module, set global variable `DEBUG` to `libp2p:floodsub`.
 * Valid module names include `floodsub`, `mdns`, `mplex`, `dialer`,
 * `connection-manager`, `transports`, `bootstrap`, `peer-store`, etc.
 *
 * @remarks This binding requires Node.js 12 or higher. Support for browsers is
 * work in progress.
 */
export class Libp2pBinding extends CommunicationBinding<Libp2pBindingOptions> {

    private _joinOptions: CommunicationBindingJoinOptions;
    private _pendingPublicationItems: PublicationItem[];
    private _issuedSubscriptionItems: SubscriptionItem[];
    private _isPublishingDeferred: boolean;

    private _node: Libp2p;
    private _nodeIdLogItem = "[---] ";
    private _isNodeReady: boolean;
    private _isNodeStopping: boolean;

    private _livelinessService: LivelinessService;

    /**
     * Provides the libp2p binding with application-specific options as value of
     * the `CommunicationOptions.binding` property in the agent container
     * configuration.
     *
     * To be used as follows:
     *
     * ```ts
     * import { Libp2pBinding } from "@coaty/binding.libp2p";
     *
     * const configuration: Configuration = {
     *   ...
     *   communication: {
     *       binding: Libp2pBinding.withOptions({
     *           ...
     *       }),
     *       ...
     *   },
     *   ...
     * };
     * ```
     *
     * @param options options available for libp2p binding
     */
    static withOptions(options: Libp2pBindingOptions): CommunicationBindingWithOptions<Libp2pBinding, Libp2pBindingOptions> {
        return { type: Libp2pBinding, options };
    }

    /* Communication Binding Protocol */

    get apiName(): string {
        return "libp2p";
    }

    get apiVersion() {
        return 1;
    }

    createIoRoute(ioSourceId: string) {
        return Libp2pTopic.getTopicName(
            this.apiVersion,
            this.options.namespace,
            CommunicationEventType.IoValue,
            undefined,
            undefined,
        );
    }

    /* Communication Binding Protocol Handlers */

    protected onInit() {
        this._reset();
    }

    protected onJoin(joinOptions: CommunicationBindingJoinOptions) {
        this._joinOptions = joinOptions;
        this._isNodeStopping = false;

        if (this.options.shouldEnableCrossNamespacing) {
            this.log(CommunicationBindingLogLevel.error, "Enabling cross namespacing is not supported by this binding");
        }

        // Set up a libp2p peer node.
        const isBootstrapEnabled = this.options.bootstrapPeers?.length > 0;
        const isMdnsEnabled = this.options.shouldDisableMdnsPeerDiscovery !== true;
        const peerDiscoveryInterval = this.options.peerDiscoveryInterval || 10000;

        let settlingTimerId;
        const startSettlingTimer = () => {
            settlingTimerId = setTimeout(() => {
                settlingTimerId = undefined;
                this._onNodeReady();
            }, this.options.peerSettlingTimeWindow ?? 1000);
        };

        // An mDNS hostname must not include consecutive dot (.) characters and be more than 255 bytes long.
        const mdnsServiceTag = `coaty-libp2p-${this.options.namespace}.local`;
        if (mdnsServiceTag.includes("..")) {
            this.log(CommunicationBindingLogLevel.error,
                "In this binding, namespace must not include consecutive dots or end with a dot: ", this.options.namespace);
        }
        if (mdnsServiceTag.length > 255) {
            // Note that UTF-8 bytes length equals UTF-8 characters length as only
            // one byte is used for all valid namespace characters.
            this.log(CommunicationBindingLogLevel.error,
                "In this binding, namespace must not contain more than 236 characters: ", this.options.namespace);
        }

        const agentId = this._joinOptions.agentId;

        this.log(CommunicationBindingLogLevel.info, "Creating node for agent ", agentId);

        (this.options.peerId ? Libp2pPeerId.createFromJSON(this.options.peerId) : Libp2pPeerId.create())
            .then(peerId => Libp2p.create({
                peerId,
                addresses: {
                    // By default, accept IPv4 connections on the first local
                    // network interface listening on a randomly chosen free port.
                    listen: [
                        // @todo use NodeUtils.getLocalIpV4Address and extend to use
                        // NodeUtils.getLocalIpV6Address if IPv4 is not present.
                        ...(this.options.listenAddresses ?? [
                            `/ip4/${MulticastDnsDiscovery.getLocalIpV4Address()}/tcp/0`,
                        ]),
                        ...(this.options.ownBootstrapAddresses?.map(a => `${a}/p2p/${peerId.toB58String()}`) ?? []),
                    ],
                },
                modules: {
                    transport: [Libp2pTcp],
                    connEncryption: [Libp2pSecio],
                    streamMuxer: [Libp2pMplex],
                    peerDiscovery: [Libp2pMdns, Libp2pBootstrap],
                    pubsub: Libp2pFloodsub,
                },
                connectionManager: {
                    maxConnections: Infinity,
                    // Note that the effective default value is 25, not 0 as specified in the documentation!
                    minConnections: Infinity,
                },
                config: {
                    peerDiscovery: {
                        // Auto connect to discovered peers if less than ConnectionManager
                        // minConnections (default value is 25) connections are existing
                        // (both inbound and outbound). This condition is rechecked
                        // periodically. Note that the default value of the autoDial
                        // property is true.
                        autoDial: true,
                        [Libp2pBootstrap.tag]: {
                            enabled: isBootstrapEnabled,
                            list: this.options.bootstrapPeers ?? [],

                            // The interval between emitting addresses in milliseconds (default: 10000).
                            interval: peerDiscoveryInterval,
                        },
                        [Libp2pMdns.tag]: {
                            enabled: isMdnsEnabled,

                            // Query every given milliseconds (default: 10000).
                            interval: peerDiscoveryInterval,

                            // Note: libp2p-mdns only announces the peer's configured TCP multiaddrs for now.
                            serviceTag: mdnsServiceTag,

                            // Disable compatibility with go-libp2p-mdns.
                            //
                            // @todo Set to true as soon as we have a Go based libp2p binding.
                            compat: false,
                        },
                    },
                    pubsub: {
                        enabled: true,

                        // Publish subscribed topics to self.
                        emitSelf: true,

                        // Outgoing messages must be signed.
                        signMessages: true,

                        // Inbound messages must be signed.
                        strictSigning: true,
                    },
                },
            }))
            .then(node => {
                const nodePeerId = node.peerId.toB58String();
                this._nodeIdLogItem = `[${nodePeerId.substring(0, 6)}] `;

                if (this._isNodeStopping) {
                    return node;
                }

                this._node = node;

                const deadvertiseIds = this._joinOptions.unjoinEvent.data.objectIds as string[];
                const otherDeadvertiseIds = deadvertiseIds.filter(id => id !== this._joinOptions.agentId);
                this._livelinessService = new LivelinessService(
                    node,
                    this.log.bind(this),
                    (lastWill: LastWill) => this._dispatchLastWill(lastWill),
                    [
                        nodePeerId,
                        this._joinOptions.agentId,
                        ...otherDeadvertiseIds,
                    ]);

                // Emitted when an error occurs.
                node.on("error", error => {
                    this.log(CommunicationBindingLogLevel.error, "Node error: ", error);
                });

                // Emitted when a peer has been discovered.
                node.on("peer:discovery", peerId => {
                    this.log(CommunicationBindingLogLevel.debug, "Peer discovered ", peerId.toB58String());
                });

                // This event will be triggered anytime a new connection is
                // established to another peer.
                node.connectionManager.on("peer:connect", connection => {
                    if (this._isNodeStopping) {
                        return;
                    }
                    this.log(CommunicationBindingLogLevel.debug, "Peer connected ",
                        connection.stat.direction, " ", connection.remotePeer.toB58String());
                    if (this._node.connectionManager.size === 0) {
                        this.emit("communicationState", CommunicationState.Online);
                        this.log(CommunicationBindingLogLevel.debug, "Peer online");
                    }
                });

                // Triggered anytime we are disconnected from another peer, regardless of the
                // circumstances of that disconnection. If we happen to have multiple (inbound
                // and outbound) connections to a peer, this event will only be triggered when
                // the last connection is closed.
                node.connectionManager.on("peer:disconnect", connection => {
                    if (this._isNodeStopping) {
                        return;
                    }
                    this.log(CommunicationBindingLogLevel.debug, "Peer disconnected ", connection.remotePeer.toB58String());
                    if (this._node.connectionManager.size === 0) {
                        this.emit("communicationState", CommunicationState.Offline);
                        this.log(CommunicationBindingLogLevel.debug, "Peer offline");
                    }
                });

                // After starting the libp2p node, wait until subscriptions received by other
                // peers have been settled down before own publications are delivered. The
                // settling time is over when no more incoming subscription change event has
                // been received within a configured time interval.
                node.pubsub.on("pubsub:subscription-change", () => {
                    if (settlingTimerId !== undefined) {
                        clearTimeout(settlingTimerId);
                        settlingTimerId = undefined;
                    }
                    if (this._isNodeReady || this._isNodeStopping) {
                        return;
                    }
                    startSettlingTimer();
                });

                this._livelinessService.registerProtocol();

                this.log(CommunicationBindingLogLevel.info, "Node starting for agent ", agentId, " as peer ", nodePeerId);

                return node.start().then(() => node);
            })
            .then(node => {
                if (this._isNodeStopping) {
                    if (node.isStarted()) {
                        node.stop();
                    }
                    return;
                }

                if (this.options.logLevel === CommunicationBindingLogLevel.debug) {
                    this.log(CommunicationBindingLogLevel.debug, "Node started with listen addresses: ",
                        node.transportManager.getAddrs());
                    this.log(CommunicationBindingLogLevel.debug, "Node started with protocols: ",
                        Array.from(node.upgrader.protocols.keys()));
                    this.log(CommunicationBindingLogLevel.debug, "Node started with peer discovery: ",
                        isMdnsEnabled ? "mDNS " : "",
                        isBootstrapEnabled ? "bootstrap " : "",
                        isMdnsEnabled || isBootstrapEnabled ? `(${peerDiscoveryInterval}ms)` : "",
                    );
                }

                // Ensure all issued subscription items are subscribed.
                this._subscribeItems(this._issuedSubscriptionItems);

                // Before publishing pending items wait until connectivity with other peers
                // has been established, so that remote subscriptions have been properly
                // routed to this peer; otherwise publications are dropped. Note that
                // waiting for the first outbound "peer:connected" event is not early enough
                // and prevents intra-agent communication for single-agent scenarios (cp.
                // Coaty JS tests).
                startSettlingTimer();
            })
            .catch(error => {
                this.log(CommunicationBindingLogLevel.error, "Node failed to start: ", error);
            });
    }

    protected onUnjoin() {
        this._isNodeStopping = true;

        this._livelinessService?.unregisterProtocol();

        // Do not publish a Deadvertise event before stopping, as liveliness detection
        // is performed by remote peers anyway. Otherwise, Deadvertise events might be
        // triggered twice by a remote peer. No need to unsubscribe this peer's
        // subscription topics as these are automatically removed by remote peers when
        // the connection closes.
        this.log(CommunicationBindingLogLevel.info, "Node stopping on unjoin for agent ", this._joinOptions?.agentId);
        this._reset();

        // Note: sometimes the stop method gets stuck (caused by mDNS stop if invoked right
        // after start) and won't resolve the promise returned, so we issue side effects before
        // invoking stop.
        if (this._node?.isStarted()) {
            return Async.withTimeout(1000, this._node.stop())
                .catch(() => {
                    // Resolve promise after at most 1 sec.
                });
        }
        return Promise.resolve();
    }

    protected onPublish(eventLike: CommunicationEventLike) {
        // Check whether raw topic is in a valid format; otherwise ignore it.
        if (eventLike.eventType === CommunicationEventType.Raw &&
            (Libp2pTopic.isCoatyTopicLike(eventLike.eventTypeFilter) ||
                !Libp2pTopic.isValidTopic(eventLike.eventTypeFilter, false))) {
            this.log(CommunicationBindingLogLevel.error, "Raw publication topic is invalid: ", eventLike.eventTypeFilter);
            return;
        }

        this._addPublicationItem(eventLike);
        this._drainPublications();
    }

    protected onSubscribe(eventLike: CommunicationEventLike) {
        // Check whether raw topic is in a valid format; otherwise ignore it.
        if (eventLike.eventType === CommunicationEventType.Raw &&
            (Libp2pTopic.isCoatyTopicLike(eventLike.eventTypeFilter) ||
                !Libp2pTopic.isValidTopic(eventLike.eventTypeFilter, true))) {
            this.log(CommunicationBindingLogLevel.error, "Raw subscription topic is invalid: ", eventLike.eventTypeFilter);
            return;
        }

        // Check whether IO route is in a valid format; otherwise ignore it.
        if (eventLike.eventType === CommunicationEventType.IoValue &&
            ((eventLike.isExternalIoRoute && Libp2pTopic.isCoatyTopicLike(eventLike.eventTypeFilter)) ||
                !Libp2pTopic.isValidTopic(eventLike.eventTypeFilter, false))) {
            this.log(CommunicationBindingLogLevel.error, "IO route topic is invalid: ", eventLike.eventTypeFilter);
            return;
        }

        this._addSubscriptionItem(eventLike);
    }

    protected onUnsubscribe(eventLike: CommunicationEventLike) {
        this._removeSubscriptionItem(eventLike);
    }

    protected log(logLevel: CommunicationBindingLogLevel, arg1: string, arg2?: any, arg3?: any, arg4?: any) {
        super.log(logLevel, this._nodeIdLogItem, arg1, arg2, arg3, arg4);
    }

    /* Private */

    private _reset() {
        this._isPublishingDeferred = true;
        this._isNodeReady = false;
        this._pendingPublicationItems = [];
        this._issuedSubscriptionItems = [];
        this.emit("communicationState", CommunicationState.Offline);
    }

    private _getTopicFor(eventLike: CommunicationEventLike) {
        if (eventLike.eventType === CommunicationEventType.Raw) {
            return eventLike.eventTypeFilter;
        }
        if (eventLike.eventType === CommunicationEventType.IoValue) {
            return eventLike.eventTypeFilter;
        }
        return Libp2pTopic.getTopicName(
            this.apiVersion,
            this.options.namespace,
            eventLike.eventType,
            eventLike.eventTypeFilter,
            eventLike.correlationId,
        );
    }

    private _getTopicFilterFor(eventLike: CommunicationEventLike) {
        if (eventLike.eventType === CommunicationEventType.Raw) {
            return eventLike.eventTypeFilter;
        }
        if (eventLike.eventType === CommunicationEventType.IoValue) {
            return eventLike.eventTypeFilter;
        }
        return Libp2pTopic.getTopicFilter(
            this.apiVersion,
            this.options.namespace,
            eventLike.eventType,
            eventLike.eventTypeFilter,
            eventLike.correlationId,
        );
    }

    /* Node Initialization */

    private _onNodeReady() {
        if (this._isNodeStopping) {
            return;
        }

        this._isNodeReady = true;

        this.log(CommunicationBindingLogLevel.debug, "Node ready for publishing");

        // Ensure join events are published first in the given order.
        const joinEvents = this._joinOptions.joinEvents;
        for (let i = joinEvents.length - 1; i >= 0; i--) {
            this._addPublicationItem(joinEvents[i], true, true);
        }

        // Start emitting all deferred offline publications.
        this._drainPublications();
    }

    /* Encoding and Decoding */

    /**
     * Encodes the given event data.
     * 
     * @param eventLike event with raw or JSON object data 
     * @returns encoded data as Uint8Array
     * @throws if event data cannot be encoded
     */
    private _encodePayload(eventLike: CommunicationEventLike) {
        if (eventLike.isDataRaw) {
            // Raw data may be either a string or Uint8Array.
            return eventLike.data instanceof Uint8Array ? eventLike.data : Uint8ArraysFromString(eventLike.data.toString()) as Uint8Array;
        }
        // Note: stringify throws a TypeError if data is cyclic.
        return Uint8ArraysFromString(JSON.stringify({
            sourceId: eventLike.sourceId,
            correlationId: eventLike.correlationId,
            data: eventLike.data,
        } as Libp2pEvent)) as Uint8Array;
    }

    private _decodePayload(payload: Uint8Array): Libp2pEvent {
        return JSON.parse(Uint8ArraysToString(payload));
    }

    /* Inbound Message Dispatch */

    private _dispatchMessage(item: SubscriptionItem, msg: Libp2p.SubMessage) {
        try {
            const payload = msg.data;
            const topic = Libp2pTopic.createByName(item.topic);
            const msgEvent = item.shouldDecodeData ? this._decodePayload(payload) : undefined;

            // Dispatch Raw or IoValue event for the given subscription item.
            if (item.eventType === CommunicationEventType.Raw || item.eventType === CommunicationEventType.IoValue) {
                this.log(CommunicationBindingLogLevel.debug,
                    "Inbound message as ",
                    CommunicationEventType[item.eventType],
                    " on ",
                    item.topic);

                this.emit("inboundEvent", {
                    eventType: item.eventType,
                    eventTypeFilter: item.topic,
                    sourceId: msgEvent?.sourceId,
                    correlationId: item.topic,
                    data: msgEvent ? (topic ? msgEvent.data : msgEvent) : payload,
                });

                return;
            }

            // Dispatch Coaty event (except IoValue event) for the given subscription item.
            this.log(CommunicationBindingLogLevel.debug, "Inbound message on ", item.topic,
                Libp2pTopic.isTwoWayRequestEvent(topic.eventType) ? " with correlationId " : "", msgEvent.correlationId);
            this.emit("inboundEvent", {
                eventType: topic.eventType,
                eventTypeFilter: topic.eventTypeFilter,
                sourceId: msgEvent.sourceId,
                correlationId: msgEvent.correlationId,
                data: msgEvent.data,
            });

        } catch (error) {
            this.log(CommunicationBindingLogLevel.error, "Inbound message error on topic ", item.topic, ": ", error);
        }
    }

    /* Last Will Dispatch */

    private _dispatchLastWill(lastWill: LastWill) {
        if (!this._issuedSubscriptionItems.some(item => item.eventType === CommunicationEventType.Deadvertise)) {
            return;
        }

        const [peerId, agentId, ...otherDeadvertiseIds] = lastWill;
        this.log(CommunicationBindingLogLevel.debug, "Dispatch last will of peer ", peerId, " for agent ", agentId);
        this.emit("inboundEvent", {
            eventType: CommunicationEventType.Deadvertise,
            sourceId: agentId,
            data: { objectIds: [agentId, ...otherDeadvertiseIds] },
        });
    }

    /* Publication Management */

    private _addPublicationItem(
        eventLike: CommunicationEventLike,
        shouldAddFirst = false,
        once = false) {
        // If a publication item cannot be composed, discard it immediately and signal an
        // error.
        try {
            const topic = this._getTopicFor(eventLike);
            const payload = this._encodePayload(eventLike);
            const delay = 0;

            if (once && this._pendingPublicationItems.some(i => i.topic === topic)) {
                return;
            }

            if (shouldAddFirst) {
                this._pendingPublicationItems.unshift({ topic, payload, delay });
            } else {
                this._pendingPublicationItems.push({ topic, payload, delay });
            }
        } catch (error) {
            this.log(CommunicationBindingLogLevel.error, "Publication message cannot be composed: ", error);
        }
    }

    private _drainPublications() {
        if (!this._isPublishingDeferred) {
            return;
        }
        this._isPublishingDeferred = false;
        this._doDrainPublications();
    }

    private _doDrainPublications() {
        // If node is started and ready for publishing, try to publish each pending
        // publication draining them in the order they were queued.
        if (!this._isNodeReady || this._pendingPublicationItems.length === 0) {
            this._isPublishingDeferred = true;
            return;
        }

        const { topic, payload, delay } = this._pendingPublicationItems[0];
        const publish = () => {
            this.log(CommunicationBindingLogLevel.debug, "Publishing on ", topic);
            this._node.pubsub.publish(topic, payload)
                .then(() => {
                    this._pendingPublicationItems.shift();
                    this._doDrainPublications();
                })
                .catch(error => {
                    // If publication fails, stop draining, but keep this publication
                    // and all other pending ones queued for next attempt.
                    this.log(CommunicationBindingLogLevel.error, "Publish failed on ", topic, error);
                    this._isPublishingDeferred = true;
                });
        };

        if (delay > 0) {
            setTimeout(publish, delay);
        } else {
            publish();
        }
    }

    /* Subscription Management */

    private _subscriptionItemPredicate(eventType: CommunicationEventType, topicFilter: string) {
        return (item: SubscriptionItem) => item.eventType === eventType && item.topic === topicFilter;
    }

    private _addSubscriptionItem(eventLike: CommunicationEventLike) {
        const topicFilter = this._getTopicFilterFor(eventLike);
        const item: SubscriptionItem = {
            eventType: eventLike.eventType,
            topic: topicFilter,
            shouldDecodeData: !eventLike.isDataRaw,
            handler: msg => this._dispatchMessage(item, msg),
        };

        // For Raw and external IoValue events we need to store separate subscriptions
        // for the same topic filter as they can be unsubscribed individually.
        const index = this._issuedSubscriptionItems.findIndex(this._subscriptionItemPredicate(item.eventType, item.topic));

        if (index === -1) {
            this._issuedSubscriptionItems.push(item);
            this._subscribeItems(item);
        } else {
            const existingHandler = this._issuedSubscriptionItems[index].handler;
            this._issuedSubscriptionItems[index] = item;
            this._subscribeItems(item);

            // Remove the existing event handler to avoid multiple event emits and a
            // MaxListenersExceededWarning by Node.js when the limit (default 10)
            // has been reached.
            this._node.pubsub.removeListener(item.topic, existingHandler);
        }
    }

    private _removeSubscriptionItem(eventLike: CommunicationEventLike) {
        const topicFilter = this._getTopicFilterFor(eventLike);
        const index = this._issuedSubscriptionItems.findIndex(this._subscriptionItemPredicate(eventLike.eventType, topicFilter));

        if (index === -1) {
            // Already unsubscribed.
            return;
        }

        const items = this._issuedSubscriptionItems.splice(index, 1);

        // As each subscription item has its own handler, we can safely unsubscribe an item
        // with a topic which is still subscribed by another item. This can happen for Raw
        // and external IoValue events sharing the same subscription topic.
        this._unsubscribeItems(items);
    }

    private _subscribeItems(items: SubscriptionItem | SubscriptionItem[]) {
        // If node is not yet started, items will be subscribed when started.
        if (!this._node?.isStarted()) {
            return;
        }

        const subscribe = (item: SubscriptionItem) => {
            this.log(CommunicationBindingLogLevel.debug, "Subscribing on ", item.topic);
            this._node.pubsub.on(item.topic, item.handler);
            this._node.pubsub.subscribe(item.topic);
        };

        if (Array.isArray(items)) {
            items.forEach(item => subscribe(item));
        } else {
            subscribe(items);
        }
    }

    private _unsubscribeItems(items: SubscriptionItem | SubscriptionItem[]) {
        // If node is not yet started, items don't need to be unsubscribed.
        if (!this._node?.isStarted()) {
            return;
        }

        const unsubscribe = (item: SubscriptionItem) => {
            this.log(CommunicationBindingLogLevel.debug, "Unsubscribing on ", item.topic);
            // If multiple handlers are registered with the given subscription topic
            // unregister only the given item handler but keep the subscription alive.
            this._node.pubsub.removeListener(item.topic, item.handler);
            if (this._node.pubsub.listenerCount(item.topic) === 0) {
                this._node.pubsub.unsubscribe(item.topic);
            }
        };

        if (Array.isArray(items)) {
            items.forEach(item => unsubscribe(item));
        } else {
            unsubscribe(items);
        }
    }
}

/** Represents an item to be published. */
interface PublicationItem {
    topic: string;
    payload: Uint8Array;
    delay: number;
}

/** Represents an item to be subscribed or unsubscribed. */
interface SubscriptionItem {
    eventType: CommunicationEventType;
    topic: string;
    shouldDecodeData: boolean;
    handler: (msg: Libp2p.SubMessage) => void;
}
