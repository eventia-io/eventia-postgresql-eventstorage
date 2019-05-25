import { EventEmitter } from "events";

import { Pool } from "pg";
import {
    InfiniteStream, TrackedDomainEventMessage, Logger,
    TrackingToken,
    PositionalTrackingToken
} from "@eventia/core";

import { PostgresqlCursor } from "./PostgreSQLCursor";
import { PostgreSQLEventQuery } from "./PostgreSQLQuery";


export class PostgreSQLEventStorageStream extends EventEmitter implements InfiniteStream<TrackedDomainEventMessage> {

    protected readonly logger: Logger;
    protected readonly pool: Pool;
    protected readonly trackingToken: TrackingToken;
    protected closed: boolean;
    protected position: number;

    protected iterator: AsyncIterableIterator<StoredEvent>;

    public constructor(logger: Logger, pool: Pool, trackingToken: TrackingToken) {
        super();

        this.logger = logger;
        this.trackingToken = trackingToken;
        this.closed = false;
        this.position = 0;

        const query = PostgreSQLEventQuery
            .fromTrackingToken(this.logger, trackingToken)
            .build();

        const cursor = new PostgresqlCursor<StoredEvent>(
            this.pool,
            query
        );

        this.iterator = cursor[Symbol.asyncIterator]();
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<TrackedDomainEventMessage> {
        return this;
    }

    public async next(): Promise<IteratorResult<TrackedDomainEventMessage>> {
        const item = await this.iterator.next();

        if (item.value !== undefined) {
            const storedEvent = item.value;
            const metadata = storedEvent.metadata || {};

            if (storedEvent.tenantidentifier) {
                metadata.tenantId = storedEvent.tenantidentifier;
            }

            if (storedEvent.useridentifier) {
                metadata.userId = storedEvent.useridentifier;
            }

            return {
                done: false,
                value: new TrackedDomainEventMessage({
                    identifier: storedEvent.identifier,
                    timestamp: storedEvent.logdate,
                    aggregateIdentifier: storedEvent.aggregateidentifier,
                    sequenceNumber: storedEvent.sequencenumber,
                    payloadType: storedEvent.payloadtype,
                    payload: storedEvent.payload,
                    metadata: metadata,
                    trackingToken: new PositionalTrackingToken(
                        parseInt(storedEvent.position, 10)
                    ),
                    aggregateType: ""
                })
            };
        }

        return this.return();
    }

    public async return(): Promise<IteratorResult<TrackedDomainEventMessage>> {
        this.close();

        return {
            done: true,
            value: undefined as unknown as TrackedDomainEventMessage
        };
    }

    public close(): void {
        if (this.iterator !== undefined && this.iterator.return !== undefined) {
            this.iterator.return();
        }

        this.iterator = undefined as unknown as AsyncIterableIterator<StoredEvent>;
        this.closed = true;
    }

}
