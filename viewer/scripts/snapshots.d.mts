export declare const SOURCE: string;
export declare const PUBLIC: string;
export declare const EXPORT: string;
export declare function verifySnapshots(dir: string, label?: string): { manifest: { latest: { path: string } }; referenced: string[] };
export declare function copySnapshots(): string[];
