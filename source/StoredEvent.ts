
/**
 * Internal class that represents the physical layout of an event in our
 * PostgreSQL model.
 * Note that the position field is read as a string, due to the lack of mapping
 * between PostgreSQL bigint (64 bits) and Javascript (MAX_SAFE_INTEGER = 2^53 - 1).
 */
interface StoredEvent {
    identifier: string;
    position: string;
    logdate: Date;
    tenantidentifier?: string;
    useridentifier?: string;
    aggregateidentifier: string;
    sequencenumber: number;
    payloadtype: string;
    payload: any;
    metadata: any;
}
