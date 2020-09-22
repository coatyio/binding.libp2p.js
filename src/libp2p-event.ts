/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

import { Uuid } from "@coaty/core";

/**
 * Defines Coaty event properties for a libp2p RPC publication message (except
 * for Raw and external IoValue events).
 */
export interface Libp2pEvent {

    /**
     * Globally unique ID (UUID) of the event source that is publishing a topic,
     * either an agent's identity or that of the publishing IO source for
     * IoValue events.
     */
    sourceId: Uuid;

    /**
     * The correlation ID of a two-way request or response event.
     */
    correlationId?: Uuid;

    /** Event-specific data as a JSON object. */
    data: any;
}
