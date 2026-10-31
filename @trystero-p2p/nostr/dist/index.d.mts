import { JoinRoom, JoinRoomConfig, pauseRelayReconnection, resumeRelayReconnection, selfId } from "@trystero-p2p/core";
export type * from "@trystero-p2p/core";
//#region src/index.d.ts
export type NostrRoomConfig = JoinRoomConfig;
export declare const createEvent: (topic: string, content: string) => Promise<string>;
export declare const subscribe: (subId: string, topic: string) => string;
export declare const joinRoom: JoinRoom<NostrRoomConfig>;
export declare const getRelaySockets: any;
export declare const defaultRelayUrls: string[];
//#endregion
export { pauseRelayReconnection, resumeRelayReconnection, selfId };
//# sourceMappingURL=index.d.mts.map