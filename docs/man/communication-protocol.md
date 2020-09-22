---
layout: default
title: Coaty libp2p Communication Protocol
---

# Coaty libp2p Communication Protocol

> This specification conforms to Coaty libp2p Communication Protocol Version 1

## Version History

* **Version 1**: initial specification

## Table of Contents

* [Introduction](#introduction)
* [Requirements](#requirements)
* [Topic Structure](#topic-structure)
* [Topic Filters](#topic-filters)
* [Message Payloads](#message-payloads)
* [Liveliness Awareness](#liveliness-awareness)

## Introduction

This document specifies the common Coaty libp2p Communication Protocol that must
be implemented by all language-specific Coaty libp2p communication bindings to
be interoperable.

The *reference implementation* of this protocol can be found in the
[binding.libp2p.js](https://github.com/coatyio/binding.libp2p.js) repository on
GitHub.

The Coaty libp2p binding builds upon peer-to-peer based communication without
the need for a central broker or router component. Coaty communication events
are transmitted via the [pubsub interfaces]
(https://github.com/libp2p/specs/tree/master/pubsub) of the
[libp2p](https://libp2p.io/) network stack. A detailed explanation of libp2p
pubsub concepts can be found
[here](https://docs.libp2p.io/concepts/publish-subscribe/). The libp2p pubsub
interface for JavaScript is documented
[here](https://github.com/libp2p/js-libp2p-interfaces/tree/master/src/pubsub).

## Requirements

A libp2p binding must use the following libp2p modules:

| Module                 | Implementation       |
|-------------------     |--------------------- |
| Transport              | `tcp`                |
| Connection encryption  | `secio`              |
| Stream muliplexer      | `mplex`              |
| Peer discovery         | `mdns`, `bootstrap` (optional) |
| Pubsub                 | [`Floodsub v1.0`](https://github.com/libp2p/specs/tree/master/pubsub) |

These modules should be configured as follows:

* `bootstrap` - the default peer discovery interval should be 10000 ms.
* `mdns` - the default query interval should be 10000 ms.
* `mdns` - the service name looks like `coaty-libp2p-<namespace>.local`, where
  `<namespace>` is the namespace specified in the binding options.
* `pubsub` - enable options "publish subscribed topics to self", "sign outgoing
  messages", and "inbound messages must be signed".

The libp2p connection manager must be configured with both `minConnections` and
`maxConnections` parameters set to `Infinity`.

Additional requirements are as follows:

* The binding option `namespace` must not include consecutive dots or end with a
  dot, and namespace must not contain more than 236 characters. Otherwise, an
  error should be emitted on the binding's event emitter.
* The binding option `shouldEnableCrossNamespacing` is not supported, i.e. it is
  always disabled. Coaty communication events published by agents in a different
  namespace cannot be observed.
* As a libp2p binding is based on peer-to-peer communication, the emitted
  communication state is `Online` as long as the binding is in `Joined` state
  and the libp2p peer node is not *isolated*, i.e. has at least one active
  libp2p connection to remote libp2p peers. However, an isolated offline peer
  can communicate with itself.
* Topic publications and subscriptions must be defered until the libp2p peer
  node has been started. After the node is started, publications should be
  defered by another 1000 msecs so that remote subscriptions have been properly
  routed to the joining peer. This prevents publication messages to be dropped
  locally. Join events must always be published first in the given order.
* A decentralized liveliness detection and last will delivery mechanism must be
  realized to ensure Deadvertise events which carry last wills are received by
  subscribing remote peers whenever a peer goes offline or terminates
  (ab)normally. Details are specified in this [section](#liveliness-awareness).

> Note that the libp2p `kad-dht` module is not used by this binding, as the
> pubsub module implements uses its own peer and content routing method.
>
> Note that libp2p
> [`Gossipsub`](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/README.md)
> is not supported by this binding, as this protocol has some conceptual
> limitations regarding out-of-order message delivery, and additional latency of
> message propagation introduced by gossiping. A gossipsub peer may even deliver
> publications to late joining peers that were not existing at the point in time
> when the original publication message was sent.

## Topic Structure

The libp2p pubsub interfaces support topic-based publications and subscriptions.
Pattern-based topic matching is not supported.

[Coaty communication event
patterns](https://coatyio.github.io/coaty-js/man/communication-events/) are
mapped onto libp2p publication and subscription messages. Coaty defines its own
topic structure that comprises the following components:

* **ProtocolName** - the name of the protocol, i.e. `coaty`.
* **ProtocolVersion** - for versioning the communication protocol. The protocol
  version number conforming to this specification is shown at the top of this
  page.
* **Namespace** - namespace used to isolate different Coaty applications.
  Communication events are only routed between agents within a common namespace.
* **Event** - event type and filter of a [Coaty communication
  event](https://coatyio.github.io/coaty-js/man/communication-events/).
* **CorrelationID** - UUID that correlates a response message with its request
  message. This component is only present in two-way response events, i.e.
  Resolve, Retrieve, Complete, and Return events. For two-way request events,
  the correlation ID is part of the [message payload](#message-payloads).

UUIDs (Universally Unique Identifiers) must conform to the UUID version 4 format
as specified in [RFC 4122](https://www.ietf.org/rfc/rfc4122.txt). In the string
representation of a UUID the hexadecimal values "a" through "f" are output as
lower case characters.

> **Note**: Raw events and external IoValue events do not conform to this topic
> structure. They are published and subscribed on an application-specific
> topic string, which can be any non-empty Unicode string that must not start
> with `<ProtocolName>/`.

A topic name for publication is composed as follows:

```
// Publication of one-way event and two-way request event
<ProtocolName>/<ProtocolVersion>/<Namespace>/<Event>

// Publication of two-way response event
<ProtocolName>/<ProtocolVersion>/<Namespace>/<Event>/<CorrelationId>
```

The ProtocolVersion topic component represents the communication protocol
version of the publishing party, as a positive integer.

The Namespace topic component **must** specify a non-empty string. It must not
contain the characters `NULL (U+0000)`, `# (U+0023)`, `+ (U+002B)`, and `/
(U+002F)`. It must not include consecutive dots or end with a dot, and it must
not contain more than 236 characters.

To denote event types in the Event topic component, 3-character shortcuts are
used:

| Event Type            | Shortcut       |
|-------------------    |--------------- |
| Advertise             | ADV            |
| Deadvertise           | DAD            |
| Channel               | CHN            |
| Associate             | ASC            |
| IoValue               | IOV            |
| Discover              | DSC            |
| Resolve               | RSV            |
| Query                 | QRY            |
| Retrieve              | RTV            |
| Update                | UPD            |
| Complete              | CPL            |
| Call                  | CLL            |
| Return                | RTN            |

When publishing an Advertise event the Event topic component **must** include a
filter of the form: `ADV<filter>`. The filter must not be empty. It must not
contain the characters `NULL (U+0000)`, `# (U+0023)`, `+ (U+002B)`, and `/
(U+002F)`. Framework implementations specify the core type (`ADV<coreType>`) or
the object type (`ADV:<objectType>`) of the advertised object as filter in
order to allow subscribers to listen just to objects of a specific core or
object type.

When publishing an Update event the Event topic component **must** include a
filter of the form: `UPD<filter>`. The filter must not be empty. It must not
contain the characters `NULL (U+0000)`, `# (U+0023)`, `+ (U+002B)`, and `/
(U+002F)`. Framework implementations specify the core type (`UPD<coreType>`) or
the object type (`UPD:<objectType>`) of the updated object as filter in order
to allow subscribers to listen just to objects of a specific core or object
type.

When publishing a Channel event the Event topic component **must** include a
channel identifier of the form: `CHN<channelId>`. The channel ID must not be
empty. It must not contain the characters `NULL (U+0000)`, `# (U+0023)`, `+
(U+002B)`, and `/ (U+002F)`.

When publishing a Call event the Event topic component **must** include an
operation name of the form: `CLL<operationname>`. The operation name must not be
empty. It must not contain the characters `NULL (U+0000)`, `# (U+0023)`, `+
(U+002B)`, and `/ (U+002F)`.

When publishing an Associate event the Event topic component **must** include an
IO context name of the form: `ASC<contextName>`. The context name must not be
empty. It must not contain the characters `NULL (U+0000)`, `# (U+0023)`, `+
(U+002B)`, and `/ (U+002F)`.

For any request-response event pattern the receiving party must respond with an
outbound message topic containing the original CorrelationID which is part of
the incoming message payload. Note that the Event topic component of response
events **must never** include a filter field.

## Topic Filters

Each libp2p binding must subscribe to topics according to the defined topic
structure:

```
// Subscription of one-way event and two-way request event
<ProtocolName>/<ProtocolVersion>/<Namespace>/<Event>

// Subscription of two-way response event
<ProtocolName>/<ProtocolVersion>/<Namespace>/<Event>/<CorrelationId>
```

These subscriptions, especially response subscriptions, should be unsubscribed
as soon as they are no longer needed by the agent. Since Coaty uses Reactive
Programming `Observables` to observe communication events, libp2p subscription
topics should be unsubscribed whenever the corresponding observable is
unsubscribed by the application.

When subscribing to a response event, the Event topic component **must not**
include an event filter.

When subscribing to an Advertise event, the Event topic component **must**
include the Advertise filter: `ADV<filter>`.

When subscribing to a Channel event, the Event topic component **must** include
the channel ID: `CHN<channelId>`.

When subscribing to an Update event, the Event topic component **must** include
the Update filter: `UPD<filter>`.

When subscribing to a Call event, the Event topic component **must** include the
operation name: `CLL<operationname>`.

When subscribing to an Associate event, the Event topic component **must**
include the IO context name: `ASC<contextName>`.

When subscribing to a response event, the CorrelationID topic component **must**
include the CorrelationID of the correlated request.

## Message Payloads

The message payload for the Coaty events described above consists of
attribute-value pairs in JavaScript Object Notation format
([JSON](http://www.json.org), see [RFC
4627](https://www.ietf.org/rfc/rfc4627.txt)). This JSON object has the following
structure:

```js
{
    // Globally unique ID (UUID) of the event source that is publishing a topic,
    // either an agent's identity or that of the publishing IO source.
    "sourceId": "UUID of event source",

    // The correlation ID of a two-way request or response event
    // (for two-way events only, not present for one-way events).
    "correlationId": "UUID",

    // Event-specific data as a JSON object.
    "data": { ... }
}
```

The `data` property defines event-specific data as specified
[here](https://coatyio.github.io/coaty-js/man/communication-events/#event-data).

As libp2p pubsub interfaces use payloads in byte array format for publication
messages, this JSON object **must** be serialized into a UTF-8 string whose
characters are then encoded into a byte array.

> **Note**: Payloads for Raw events and IoValue events with raw data do not
> conform to this specification. They are published as byte arrays encoded in
> any application-specific format. For Raw events with text string event data,
> the string has to be encoded into a byte array using UTF-8 encoding.

## Liveliness Awareness

A decentralized liveliness detection and last will delivery mechanism ensures
that Deadvertise events which carry a peer's last will are received by
subscribing peers whenever the peer is no longer alive because it is offline or
has terminated (ab)normally.

Liveliness detection and last will delivery must be realized by defining a
custom libp2p liveliness protocol named `/coaty/liveliness/1.0.0`. This protocol
supports the following operations:

* Last will announcements are sent to newly connected peers on outbound libp2p
  connections that also support the liveliness protocol.
* Last will announcements received by a peer are propagated to all connected
  peers that support the liveliness protocol except the ones that have already
  been visited.
* Whenever the last libp2p connection to another peer supporting the liveliness
  protocol is closed, regardless of the circumstances of that disconnection by
  the remote peer, this peer is a candicate for being no longer alive. To ensure
  that this peer is no longer reachable, a PingAlive liveliness operation is
  send on a new connection stream. If the connection can be established and a
  PingAliveAck response is received on the same stream, the remote peer is
  considered still alive and the new connection is closed immediately.
  Otherwise, the peer is considered to be dead.
* Whenever a peer is asserted to be dead, dead announcements are sent to all
  connected peers that support the liveliness protocol.
* Dead announcements received by a peer are propagated to all connected peers
  that support the liveliness protocol except the ones that have already been
  visited.
* Each peer detecting a dead peer or receiving a dead announcement in turn
  dispatches the dead peer's last will as a Deadvertise event locally if the
  Coaty agent observes it.

Leveraging these operations, each peer maintains its own last will and the last
wills of all other peers which are alive. The last will of a Coaty agent is
represented as a tuple array of associated peer ID (in Base58 string format),
agent identity object ID (as UUID string) to be deadvertised, and an optional
series of other Coaty object IDs to be deadvertised, as specified in the
binding's unjoin event data:

```ts
type LastWill = [string, Uuid, ...Uuid[]];
```

Liveliness operations are encoded as integer values:

```ts
enum LivelinessOperation {
    AnnounceLastWill = 0,
    AnnounceDead = 1,
    PingAlive = 2,
    PingAliveAck = 3,
}
```

A liveliness protocol message is a JSON object with the following structure:

```js
{
    // Operation to be performed.
    "op": LivelinessOperation,

    // Peer IDs (in Base58 string format) to which this message has already been
    // propagated (optional, for AnnounceLastWill and AnnounceDead operations only).
    // The first peer ID in the array is the originator of the message: for
    // AnnounceLastWill operations it is the announcing peer; for AnnounceDead
    // operations it is the dead peer.
    "propagatedPeerIds": string[],

    // Collection of last wills to be announced or propagated (optional, for
    // AnnounceLastWill operation only).
    "lastWills": LastWill[]
}
```

All liveliness protocol messages must be serialized as UTF-8 encoded JSON
strings.

---
Copyright (c) 2020 Siemens AG. This work is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-sa/4.0/).
