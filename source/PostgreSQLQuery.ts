import { QueryConfig } from "pg";
import {
    Logger, TrackingToken, CombinedTrackingToken,
    PositionalTrackingToken, UpperBoundTrackingToken, BoundedTrackingToken,
    PayloadTrackingToken,
    AggregateIdentifierTrackingToken
} from "@eventia/core";


class PostgreSQLEventQueryFilter {

    private operator: string;
    private slots: number[] = [];

    public constructor(
        private readonly query: PostgreSQLEventQuery,
        private readonly values: {}[],
        private readonly fieldName: string
    ) { }

    public equal(value: {}): PostgreSQLEventQuery {
        this.operator = "=";
        this.pushValue(value);

        return this.query;
    }

    public notEqual(value: {}): PostgreSQLEventQuery {
        this.operator = "<>";
        this.pushValue(value);

        return this.query;
    }

    public greater(value: {}): PostgreSQLEventQuery {
        this.operator = ">";
        this.pushValue(value);

        return this.query;
    }

    public greaterEqual(value: {}): PostgreSQLEventQuery {
        this.operator = ">=";
        this.pushValue(value);

        return this.query;
    }

    public less(value: {}): PostgreSQLEventQuery {
        this.operator = "<";
        this.pushValue(value);

        return this.query;
    }

    public lessEqual(value: {}): PostgreSQLEventQuery {
        this.operator = "<=";
        this.pushValue(value);

        return this.query;
    }

    public in(values: {}[]): PostgreSQLEventQuery {
        this.operator = "in";
        for (const value of values) {
            this.pushValue(value);
        }
        return this.query;
    }

    public build(): string {
        const sql: string[] = [];

        sql.push(this.fieldName);
        sql.push(this.operator);

        if (this.slots.length > 1) {
            sql.push("(");
            sql.push(this.slots.map(slot => `$${slot}`).join(","));
            sql.push(")");
        } else if (this.slots.length === 1) {
            sql.push(`$${this.slots[0]}`);
        } else {
            throw new Error(
                `PostgreSQLEventQueryFilter operator "${this.operator}" on field ${this.fieldName} has no slots`
            );
        }

        return sql.join(" ");
    }

    private pushValue(value: {}): void {
        this.slots.push(this.values.push(value));
    }

}


export class PostgreSQLEventQuery {

    private values: {}[] = [];
    private filters: PostgreSQLEventQueryFilter[] = [];
    private orders: string[] = [];
    private limitCount: number;

    private constructor(private readonly logger: Logger) { }

    public static fromTrackingToken(logger: Logger, tokenOrTokens: TrackingToken): PostgreSQLEventQuery {
        let query = this.begin(logger);

        const tokens = tokenOrTokens instanceof CombinedTrackingToken
            ? tokenOrTokens.trackingTokens
            : [tokenOrTokens];

        for (const token of tokens) {
            query = query.applyToken(token);
        }

        return query;
    }

    public static begin(logger: Logger): PostgreSQLEventQuery {
        return new PostgreSQLEventQuery(logger);
    }

    public get position(): PostgreSQLEventQueryFilter {
        return this.appendFilter(new PostgreSQLEventQueryFilter(this, this.values, "position"));
    }

    public get tenantId(): PostgreSQLEventQueryFilter {
        return this.appendFilter(new PostgreSQLEventQueryFilter(this, this.values, "tenantidentifier"));
    }

    public get userId(): PostgreSQLEventQueryFilter {
        return this.appendFilter(new PostgreSQLEventQueryFilter(this, this.values, "useridentififer"));
    }

    public get aggregateIdentifier(): PostgreSQLEventQueryFilter {
        return this.appendFilter(new PostgreSQLEventQueryFilter(this, this.values, "aggregateidentifier"));
    }

    public get sequenceNumber(): PostgreSQLEventQueryFilter {
        return this.appendFilter(new PostgreSQLEventQueryFilter(this, this.values, "sequencenumber"));
    }

    public get payloadType(): PostgreSQLEventQueryFilter {
        return this.appendFilter(new PostgreSQLEventQueryFilter(this, this.values, "payloadtype"));
    }

    public orderByPosition(order: number = 1): PostgreSQLEventQuery {
        if (order > 0) {
            this.orders.push("position ASC");
        } else {
            this.orders.push("position DESC");
        }

        return this;
    }

    public limit(count: number): PostgreSQLEventQuery {
        if (count !== -1) {
            this.limitCount = count;
        }

        return this;
    }


    public build(): QueryConfig {
        if (this.orders.length === 0) {
            this.orderByPosition();
        }

        const pgQuery = {
            text: [
                "SELECT * FROM EVENTS WHERE",
                this.filters.length > 0
                    ? this.filters.map(filter => filter.build()).join(" AND ")
                    : "1=1",
                "ORDER BY",
                this.orders.join(","),
                this.limitCount !== undefined
                    ? `LIMIT ${this.limitCount}`
                    : ""
            ].join(" "),
            values: this.values
        };

        return pgQuery;
    }

    protected applyToken(token: TrackingToken): this {
        if (token instanceof UpperBoundTrackingToken) {
            this.position.lessEqual(token.position);
        } else if (token instanceof PositionalTrackingToken) {
            this.position.greater(token.position);
        } else if (token instanceof BoundedTrackingToken) {
            this.position.greater(token.lowerBound);
            this.position.lessEqual(token.upperBound);
        } else if (token instanceof PayloadTrackingToken) {
            this.payloadType.in(Array.from(token.payloadTypes));
        } else if (token instanceof AggregateIdentifierTrackingToken) {
            this.aggregateIdentifier.equal(token.identifier);
        }

        return this;
    }

    private appendFilter(filter: PostgreSQLEventQueryFilter): PostgreSQLEventQueryFilter {
        this.filters.push(filter);
        return filter;
    }

}
