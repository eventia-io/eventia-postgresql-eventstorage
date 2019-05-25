import { Pool, PoolClient, QueryConfig } from "pg";
import * as Cursor from "pg-cursor";


const defaultBatchSize = 500;

export class PostgresqlCursor<T> {

    private readonly pool: Pool;
    private readonly query: QueryConfig;
    private readonly batchSize: number;

    private client?: PoolClient;
    private innerCursor?: Cursor;

    public constructor(pool: Pool, query: QueryConfig, batchSize: number = defaultBatchSize) {
        this.pool = pool;
        this.query = query;
        this.batchSize = batchSize;
    }

    public async * execute(): AsyncIterable<T> {
        try {
            this.client = await this.pool.connect();
            this.innerCursor = this.client.query(new Cursor(this.query.text, this.query.values));

            let slice = this.readCursor();
            let results: T[];
            do {
                results = await slice;
                if (results.length > 0) {
                    const nextSlice = this.readCursor();

                    for (const row of results) {
                        yield row;
                    }

                    slice = nextSlice;
                }
            } while (results.length === this.batchSize);
        } finally {
            await this.release();
        }
    }

    public async release(): Promise<void> {
        await this.closeCursor();

        if (this.client !== undefined) {
            this.client.release();
        }
    }

    private closeCursor(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.innerCursor !== undefined) {
                this.innerCursor.close((error: Error) => {
                    this.innerCursor = undefined;

                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    private readCursor(): Promise<T[]> {
        return new Promise<T[]>((resolve, reject) => {
            this.innerCursor.read(this.batchSize, (err: Error, rows: T[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

}
