/**
 * Qala Multi-Project Dashboard Server
 *
 * Express server that provides API endpoints for managing multiple
 * projects from a central dashboard.
 */
export interface ServerOptions {
    port?: number;
    host?: string;
}
export declare function createServer(options?: ServerOptions): Promise<{
    app: import("express-serve-static-core").Express;
    port: number;
    host: string;
}>;
export declare function startServer(options?: ServerOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map