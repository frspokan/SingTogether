import * as SignalR from "@microsoft/signalr";
import * as Telemetry from './telemetry'
import { Log } from "./log"

export class SignalingClient
{
    sdpReceivedCallback: (cidFrom: string, msg: string) => void;
    iceReceivedCallback: (cidFrom: string, msg: string) => void;
    chatMsgReceivedCallback: (timestamp: string, id: string, msg: string) => void;
    rosterUpdateReceivedCallback: (roster: string[]) => void;
    connectToReceivedCallback: (cids: string[]) => void;

    private connection: SignalR.HubConnection;
    private localCid: string;

    GetCid(): string {
        return this.localCid;
    }

    async Connect(url: string, eid: string) {
        if (this.IsConnected()) {
            return;
        }

        this.connection = new SignalR.HubConnectionBuilder().withUrl(url).withAutomaticReconnect().build();

        this.connection.on("sdpReceived", (cidFrom: string, msg: string) => {
            Log.info(`[SignalR] sdpReceived from ${cidFrom} to ${this.localCid}`);
            this.sdpReceivedCallback(cidFrom, msg);
        });
        this.connection.on("iceReceived", (cidFrom: string, msg: string) => {
            Log.info(`[SignalR] iceReceived from ${cidFrom} to ${this.localCid}`);
            this.iceReceivedCallback(cidFrom, msg);
        });
        this.connection.on("chatMsgReceived", (cid: string, timestamp: string, msg: string) => {
            Log.info(`[SignalR] chatMsgReceived at ${timestamp} from ${cid} with len ${msg.length}`);
            this.chatMsgReceivedCallback(timestamp, cid, msg);
        });
        this.connection.on("rosterUpdateReceived", (roster: string[]) => {
            Log.info(`[SignalR] rosterUpdateReceived with len ${roster.length}`);
            this.rosterUpdateReceivedCallback(roster);
        });
        this.connection.on("connectTo", (cids: string[]) => {
            Log.info(`[SignalR] connectTo with cids ${JSON.stringify(cids)}`);
            this.connectToReceivedCallback(cids);
        });

        this.connection.onreconnected((connectionId: string) => {
            Log.info("[SignalR] reconnected " + connectionId);
        });
        this.connection.onreconnecting((error: Error) => {
            Log.info("[SignalR] reconnecting.  Error: " + error);
        });
        this.connection.onclose((error: Error) => {
            Log.info("[SignalR] closed.  Error: " + error);
        });

        await this.connection.start();
        this.localCid = this.connection.connectionId;

        Log.info(`[SignalR] connected as ${this.localCid}`);

        await this.connection.send("joinEvent", eid);
    }

    async Disconnect(eid: string) {
        if (!this.IsConnected()) {
            return;
        }

        await this.connection.send("leaveEvent", eid);
        await this.connection.stop();
        this.connection = null;
    }

    async SendTelemetry(event: Telemetry.Event) 
    {
        if (!this.IsConnected()) {
            return;
        }

        try
        {
            event.Cid = this.connection.connectionId;
            event.Eid = Log.eid;
            event.UserAgent = navigator.userAgent;
            await this.connection.send("clientTelemetry", event);
        } catch (e) {
            Log.error(`[SignalR] failed to send telemetry: ${e}`);
        }        
    }

    async StartMedia(eid: string)
    {
        if (!this.IsConnected()) {
            return;
        }

        Log.info(`[SignalR] called startMedia`);
        await this.connection.send("startMedia", eid);
    }

    async SendChatMsg(eid: string, msg: string)
    {
        if (!this.IsConnected()) {
            return;
        }

        if (!msg || msg.length == 0)
        {
            Log.info('[SignalR] called sendChatMsg with empty msg, ignoring');
            return;
        }

        Log.info(`[SignalR] called sendChatMsg with len ${msg.length}`);
        await this.connection.send("sendChatMsg", eid, msg);
    }

    async SendSDP(eid: string, cidTo: string, msg: string) {
        if (!this.IsConnected()) {
            return;
        }

        const cidFrom: string = this.GetCid();
        Log.info(`[SignalR] called sendSDP from ${cidFrom} to ${cidTo}`);
        await this.connection.send("sendSDP", eid, cidFrom, cidTo, msg);
    }

    async SendICE(eid: string, cidTo: string, msg: string) {
        if (!this.IsConnected()) {
            return;
        }

        const cidFrom: string = this.GetCid();
        Log.info(`[SignalR] called sendICE from ${cidFrom} to ${cidTo}`);
        await this.connection.send("sendICE", eid, cidFrom, cidTo, msg);
    }

    private IsConnected()
    {
        return !!this.connection && this.connection.state == SignalR.HubConnectionState.Connected;
    }
}