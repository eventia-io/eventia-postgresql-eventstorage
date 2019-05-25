import { Pool, QueryConfig, PoolClient } from "pg";
import { Transaction, Logger } from "@eventia/core";


export class PostgreSQLTransaction implements Transaction {

    protected readonly logger: Logger;
    protected readonly pool: Pool;

    protected client: PoolClient;
    protected beginCount: number = 0;
    protected statementCount: number = 0;
    protected rolledBack: boolean = false;

    public constructor(logger: Logger, pool: Pool) {
        this.logger = logger;
        this.pool = pool;
    }

    public async execute(statement: QueryConfig): Promise<void> {
        if (this.rolledBack === true) {
            throw new Error(
                "PostgreSQLTransaction.execute() called after rollback"
            );
        }

        if (this.beginCount === 0) {
            throw new Error(
                "PostgreSQLTransaction.execute() called before begining the transaction."
            );
        }

        const client = await this.getClient();
        await client.query(statement);
        this.statementCount++;
    }

    public async begin(): Promise<void> {
        if (this.rolledBack === true) {
            throw new Error(
                "PostgreSQLTransaction.begin() called after rollback"
            );
        }

        this.beginCount++;
    }

    public async commit(): Promise<void> {
        if (this.rolledBack === true) {
            throw new Error(
                "PostgreSQLTransaction.commit() called after rollback"
            );
        }

        this.beginCount--;

        if (this.beginCount === 0) {
            if (this.statementCount > 0) {
                await this.client.query("COMMIT");
            }
        } else if (this.beginCount < 0) {
            this.logger.error(
                "PostgreSQLTransaction.commit() called more times than begin()."
            );
        }
    }

    public async rollback(): Promise<void> {
        if (this.rolledBack === true) {
            return;
        }

        if (this.beginCount > 0) {
            if (this.statementCount > 0) {
                await this.client.query("ROLLBACK");
            }

            this.rolledBack = true;
        } else {
            this.logger.error(
                "PostgreSQLTransaction.rollback() called with no active transaction."
            );
        }
    }

    public async release(): Promise<void> {
        // Make sure we release resources.
        if (this.client !== undefined) {
            this.client.release();
            this.client = undefined as unknown as PoolClient;
        }

        if (this.beginCount > 0 && this.rolledBack === false) {
            throw new Error(
                "PostgreSQLTransaction.release() called with an active transaction"
            );
        }
    }

    private async getClient(): Promise<PoolClient> {
        if (this.client === undefined) {
            this.client = await this.pool.connect();
            await this.client.query("BEGIN");
        }
        return this.client;
    }

}
