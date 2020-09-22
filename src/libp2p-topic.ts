/*! Copyright (c) 2020 Siemens AG. Licensed under the MIT License. */

import { CommunicationEventType, Uuid } from "@coaty/core";

/**
 * Represents libp2p pub-sub topics for Coaty communication events (except Raw
 * and external IoValue events).
 */
export class Libp2pTopic {

    get eventType() {
        return this._eventType;
    }

    get eventTypeFilter() {
        return this._eventTypeFilter;
    }

    get correlationId() {
        return this._correlationId;
    }

    get version() {
        return this._version;
    }

    get namespace() {
        return this._namespace;
    }

    private static readonly PROTOCOL_NAME = "coaty";
    private static readonly PROTOCOL_NAME_PREFIX = Libp2pTopic.PROTOCOL_NAME + "/";

    private static EVENT_TYPE_TOPIC_LEVELS: { [level: string]: CommunicationEventType };
    private static TOPIC_LEVELS_BY_EVENT_TYPE: string[];

    private _version: number;
    private _namespace: string;
    private _eventType: CommunicationEventType;
    private _eventTypeFilter: string;
    private _correlationId: Uuid;

    private constructor() {
        /* tslint:disable:empty-block */
        /* tslint:enable:empty-block */
    }

    /**
     * Create a new topic instance from the given libp2p publication topic name.
     *
     * @param topicName the structured name of a Coaty publication topic
     * @returns a Coaty communication topic instance or undefined if the topic
     * name represents a Raw or external IoValue event.
     */
    static createByName(topicName: string): Libp2pTopic {
        if (!Libp2pTopic.isCoatyTopicLike(topicName)) {
            return undefined;
        }

        const topic = new Libp2pTopic();
        const [, version, namespace, event, corrId] = topicName.split("/");
        const v = parseInt(version, 10);
        const [eventType, eventTypeFilter] = this._parseEvent(event);

        topic._version = v;
        topic._namespace = namespace;
        topic._eventType = eventType;
        topic._eventTypeFilter = eventTypeFilter;
        topic._correlationId = corrId === "" ? undefined : corrId;

        return topic;
    }

    /**
     * Gets the p2p publication topic name for the given topic levels.
     *
     * @param version the protocol version
     * @param namepace the messaging namespace
     * @param eventType an event type
     * @param eventTypeFilter a filter for an event type, or undefined
     * @param correlationId correlation ID for two-way message, otherwise undefined
     */
    static getTopicName(
        version: number,
        namespace: string,
        eventType: CommunicationEventType,
        eventTypeFilter: string,
        correlationId: Uuid): string {
        let eventLevel = Libp2pTopic._getEventTopicLevelPrefix(eventType);
        if (eventTypeFilter) {
            eventLevel += eventTypeFilter;
        }
        let levels = `${Libp2pTopic.PROTOCOL_NAME}/${version}/${namespace}/${eventLevel}`;
        if (this._isTwoWayResponseEvent(eventType)) {
            levels += `/${correlationId}`;
        }

        return levels;
    }

    /**
     * Gets a libp2p topic for subscription.
     *
     * @param version the protocol version
     * @param namepace the messaging namespace or undefined
     * @param eventType the event type
     * @param eventTypeFilter the event filter or undefined
     * @param correlationId correlation ID for two-way message, otherwise undefined
     */
    static getTopicFilter(
        version: number,
        namespace: string,
        eventType: CommunicationEventType,
        eventTypeFilter: string,
        correlationId: Uuid): string {
        let eventLevel = Libp2pTopic._getEventTopicLevelPrefix(eventType);
        if (eventTypeFilter) {
            eventLevel += eventTypeFilter;
        }
        let levels = `${this.PROTOCOL_NAME}/${version}/${namespace}/${eventLevel}`;
        if (this._isTwoWayResponseEvent(eventType)) {
            levels += `/${correlationId}`;
        }

        return levels;
    }

    /**
     * Determines whether the given topic name starts with the same topic level
     * as a Coaty topic.
     *
     * @param topicName a topic name
     * @returns true if the given topic name is a potential Coaty topic; false
     * otherwise
     */
    static isCoatyTopicLike(topicName: string) {
        return topicName.startsWith(this.PROTOCOL_NAME_PREFIX);
    }

    /**
     * Determines whether the given name is a valid libp2p topic for publication
     * or subscription. 
     *
     * @param name a topic name
     * @param forSubscription indicates whether the name is used for
     * subscription (true) or publication (false)
     * @returns true if the given topic name can be used as requested; false
     * otherwise
     */
    static isValidTopic(name: string, forSubscription = false): boolean {
        if (!name) {
            return false;
        }
        return true;
    }

    static isTwoWayRequestEvent(eventType: CommunicationEventType) {
        switch (eventType) {
            case CommunicationEventType.Update:
            case CommunicationEventType.Discover:
            case CommunicationEventType.Query:
            case CommunicationEventType.Call:
                return true;
            default:
                return false;
        }
    }

    private static _isTwoWayResponseEvent(eventType: CommunicationEventType) {
        switch (eventType) {
            case CommunicationEventType.Complete:
            case CommunicationEventType.Resolve:
            case CommunicationEventType.Retrieve:
            case CommunicationEventType.Return:
                return true;
            default:
                return false;
        }
    }

    private static _parseEvent(event: string): [CommunicationEventType, string] {
        const typeLen = 3;
        const hasEventFilter = event.length > typeLen;
        const type = hasEventFilter ? event.substr(0, typeLen) : event;
        const filter = hasEventFilter ? event.substring(typeLen) : undefined;
        return [this._getEventType(type), filter];
    }

    private static _initTopicLevels() {
        if (this.EVENT_TYPE_TOPIC_LEVELS === undefined) {
            this.EVENT_TYPE_TOPIC_LEVELS = {
                ADV: CommunicationEventType.Advertise,
                DAD: CommunicationEventType.Deadvertise,
                CHN: CommunicationEventType.Channel,
                ASC: CommunicationEventType.Associate,
                IOV: CommunicationEventType.IoValue,

                DSC: CommunicationEventType.Discover,
                RSV: CommunicationEventType.Resolve,
                QRY: CommunicationEventType.Query,
                RTV: CommunicationEventType.Retrieve,
                UPD: CommunicationEventType.Update,
                CPL: CommunicationEventType.Complete,
                CLL: CommunicationEventType.Call,
                RTN: CommunicationEventType.Return,
            };
        }
        if (this.TOPIC_LEVELS_BY_EVENT_TYPE === undefined) {
            this.TOPIC_LEVELS_BY_EVENT_TYPE = [];
            Object.keys(this.EVENT_TYPE_TOPIC_LEVELS).findIndex(key => {
                const eventType = this.EVENT_TYPE_TOPIC_LEVELS[key];
                this.TOPIC_LEVELS_BY_EVENT_TYPE[eventType] = key;
            });
        }
    }

    private static _getEventType(topicLevel: string) {
        this._initTopicLevels();
        return this.EVENT_TYPE_TOPIC_LEVELS[topicLevel];
    }

    private static _getEventTopicLevelPrefix(eventType: CommunicationEventType) {
        this._initTopicLevels();
        return this.TOPIC_LEVELS_BY_EVENT_TYPE[eventType];
    }

}
