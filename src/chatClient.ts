import * as $ from 'jQuery';
import { SignalingClient } from "./signalingClient";

export class ChatClient
{
    private signalingClient: SignalingClient;

    constructor(signalRClient: SignalingClient, eid: string) {
        this.signalingClient = signalRClient;

        this.signalingClient.chatMsgReceivedCallback = (timestamp: string, id: string, msg: string) => {
            let el = $("#chatbox");
            el.append(`<div class='msgln'><span class='chat-time'>${timestamp}</span><b class='user-name'>${id}</b>${msg}<br></div>`);
            el.scrollTop = el.scrollHeight;
        };

        $("#submitmsg").on('click',  () => {
            const clientmsg: string = $("#usermsg").val().toString();
            this.signalingClient.SendChatMsg(eid, clientmsg);
            $("#usermsg").val("");
            return false;
        });
    }
}