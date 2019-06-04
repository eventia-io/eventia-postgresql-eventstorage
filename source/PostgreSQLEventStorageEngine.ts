import { Pool, QueryConfig } from "pg";
import {
    EventStorageEngine, DomainEventMessage, TrackingToken,
    InfiniteStream, TrackedDomainEventMessage, Transaction,
    Logger, PositionalTrackingToken, LowerBoundTrackingToken
} from "@eventia/core";

import { PostgreSQLTransaction } from "./PostgreSQLTransaction";
import { PostgreSQLEventStorageStream } from "./PostgreSQLEventStorateStream";


export abstract class AbstractPostgreSQLEventStorageEngine implements EventStorageEngine {

    protected readonly logger: Logger;
    protected readonly pool: Pool;

    public constructor(logger: Logger, connectionString: string) {
        this.logger = logger;
        this.pool = new Pool({
            connectionString: connectionString
        });
    }

    public createTransaction(): Transaction {
        return new PostgreSQLTransaction(this.logger, this.pool);
    }

    public async appendEvents(
        eventOrEvents: DomainEventMessage | DomainEventMessage[],
        transaction?: Transaction
    ): Promise<void> {
        const events: DomainEventMessage[] = Array.isArray(eventOrEvents)
            ? eventOrEvents
            : [eventOrEvents];

        const innerTransaction = this.useOrCreateTransaction(transaction);

        try {
            await innerTransaction.begin();

            const query = this.buildAppendStatement(events);

            await innerTransaction.execute(query);
            await innerTransaction.commit();
        } catch (error) {
            this.logger.error(error);
            await innerTransaction.rollback();
            throw error;
        } finally {
            // Release transaction only if we have created it.
            if (transaction === undefined) {
                await innerTransaction.release();
            }
        }
    }

    public async createHeadToken(): Promise<TrackingToken> {
        return new LowerBoundTrackingToken(0);
    }

    public async createTailToken(): Promise<TrackingToken> {
        const query = `
            SELECT MAX(Position) AS position
              FROM Events;
        `;

        const results = await this.pool.query(query);

        if (results.rowCount === 1) {
            return new PositionalTrackingToken(
                parseInt(results.rows[0].position, 10) || 0
            );
        }

        return this.createHeadToken();
    }

    public async createTokenAt(at: Date): Promise<TrackingToken> {
        const query = `
            SELECT MIN(Position) AS position
              FROM Events
              WHERE LogDate >= $1;
        `;

        const results = await this.pool.query(query, [at]);

        if (results.rowCount === 1) {
            return new PositionalTrackingToken(
                parseInt(results.rows[0].position, 10) || 0
            );
        }

        return this.createTailToken();
    }

    public async createTokenSince(duration: number): Promise<TrackingToken> {
        const query = `
            SELECT MIN(Position) AS position
              FROM Events
              WHERE LogDate >= NOW() - INTERVAL '${duration} seconds';
        `;

        const results = await this.pool.query(query);

        if (results.rowCount === 1) {
            return new PositionalTrackingToken(
                parseInt(results.rows[0].position, 10) || 0
            );
        }

        return this.createTailToken();
    }

    public readEvents(trackingToken: TrackingToken, block?: boolean): InfiniteStream<TrackedDomainEventMessage> {
        if (block === true) {
            throw new Error("PostgreSQLEventStorageEngine does not support infinite streams");
        }

        return new PostgreSQLEventStorageStream(this.logger, this.pool, trackingToken);
    }

    protected useOrCreateTransaction(transaction?: Transaction): PostgreSQLTransaction {
        if (transaction !== undefined && transaction instanceof PostgreSQLTransaction === false) {
            throw new Error("Transaction must be an instance of PostgreSQLTransaction");
        }

        return (transaction || this.createTransaction()) as PostgreSQLTransaction;
    }

    protected abstract buildAppendStatement(events: DomainEventMessage[]): QueryConfig;

}


export class PostgreSQLEventStorageEngine extends AbstractPostgreSQLEventStorageEngine {

    protected buildAppendStatement(events: DomainEventMessage[]): QueryConfig {
        const sql: string[] = [];
        const values: {}[] = [];

        let n = 1;
        for (const event of events) {
            sql.push(`($${n++}, $${n++}, $${n++}, $${n++}, $${n++}, $${n++}, $${n++})`);
            values.push(
                event.identifier,
                event.aggregateIdentifier,
                event.sequenceNumber,
                event.aggregateType,
                event.payloadType,
                event.payload,
                event.metadata || {}
            );
        }

        const text = [
            `INSERT INTO Events (
                Id,
                AggregateIdentifier,
                SequenceNumber,
                AggregateType,
                PayloadType,
                Payload,
                Metadata
            ) VALUES`,
            sql.join(",")
        ].join(" ");

        return {
            text: text,
            values: values
        };
    }

}
