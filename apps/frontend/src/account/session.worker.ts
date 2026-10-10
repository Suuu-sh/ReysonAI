export declare const AGENT_HANDS_KEY = "reysonai:agent-hands:v1";
export declare const LEGACY_AGENT_HANDS_KEY = "evionai:agent-hands:v1";
export declare const accountKeys: string[];
export interface AccountUser {
    id: string;
    email: string;
    verified: boolean;
    name?: string;
    picture?: string;
}
export interface AccountState {
    user: AccountUser | null;
    ready: boolean;
    available: boolean;
    error: string;
}
interface AccountResponses {
    session: {
        user: AccountUser | null;
    };
    data: {
        ownerId: string;
        data?: Record<string, unknown>;
        version: number;
    };
    "google/start": {
        url: string;
    };
    logout: {
        ok?: boolean;
    };
}
type AccountSaveOptions = {
    importLocal?: boolean;
    consent?: boolean;
};
export declare const accountSnapshot: () => {
    user: AccountUser | null;
    ready: boolean;
    available: boolean;
    error: string;
};
export declare const subscribeAccount: (listener: () => void) => (() => void);
export declare function accountRequest<P extends keyof AccountResponses>(path: P, body?: unknown): Promise<AccountResponses[P]>;
export declare function startGoogleSignIn(): Promise<void>;
export declare function refreshAccount(): Promise<void>;
export declare function revalidateAccountSession(): Promise<void>;
export declare function accountStorage(): Storage | {
    readonly length: number;
    key: (index: number) => string;
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
} | null;
export declare function saveAccountData(extra?: AccountSaveOptions, expectedOwnerAtCall?: string): Promise<void>;
export declare function importGuestData(consent?: boolean): Promise<void>;
export declare function logoutAccount(): Promise<void>;
export declare function exportAccountData(): {
    app: string;
    exportedAt: string;
    data: any;
    rankedAuthoritative: boolean;
};
export {};
