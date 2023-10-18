import "./css/main.css";
import * as $ from 'jQuery';
import { Log } from "./log"
import * as Telemetry from './telemetry'
import { MediaEndpoint } from "./media"
import { SignalingClient } from "./signalingClient";
import { ChatClient } from "./chatClient"

const btnMute: HTMLButtonElement = document.querySelector("#btnMute");

btnMute.innerText = "Unmuted";

let chatClient: ChatClient;
let srClient: SignalingClient;
let localEndpoint: MediaEndpoint;

async function init() {
    const eid = (new URLSearchParams(location.search)).get('eid');
    if (!eid || eid == '')
    {
        Log.error('Url is missing event id');
        alert('Url is missing event id');
        throw 'Url is missing event id';
    }

    Log.eid = eid;
    let hasDisconnected = false;

    srClient = new SignalingClient();
    try {
        await srClient.Connect("/hub", eid);
        $(window).on("unload", async () => {
            localEndpoint.Disconnect();
            await srClient.Disconnect(eid);
        });
    } catch (e) {
        Log.error('Failed signaling connection');
        alert("Failed signaling connection");
        throw e;
    }

    chatClient = new ChatClient(srClient, eid);

    localEndpoint = new MediaEndpoint(srClient, eid);

    // TODO roster class
    let roster: string[] = [];
    srClient.rosterUpdateReceivedCallback = (rosterUpdate: string[]) => {
        roster = rosterUpdate;
        updateRosterView();
    };    

    localEndpoint.connectionStateChangedCallback = () => {
        updateRosterView();
    }

    function updateRosterView() {
        let rosterStr: string = "";
        if (!hasDisconnected) {
            roster.forEach((cid: string) => {
                let conState = "no connection";
                if (localEndpoint) {
                    conState = localEndpoint.GetConnectionState(cid);
                }
                rosterStr += `${cid} - ${conState}\n`;
            });
        }
        $("#roster").text(rosterStr);
    }

    btnMute.addEventListener("click", () => {
        localEndpoint.ToggleMute();
        btnMute.innerText = btnMute.innerText == "Unmuted" ? "Muted" : "Unmuted";
    });

    srClient.connectToReceivedCallback = (cids: string[]) => {
        const localCid = srClient.GetCid();
        cids.forEach(async (cidTo: string) => {
            if (cidTo == localCid)
            {
                Log.error(`Cannot connect to ourself: ${cidTo}`);
            }
            else if (localEndpoint)
            {
                await localEndpoint.Connect(cidTo);
            }
            else
            {
                Log.error(`Failed to connect to ${cidTo} due to empty local endpoint`);
            }
        });
    };

    await localEndpoint.OpenMic();
    await srClient.StartMedia(eid);
}

let pageloadEvent = new Telemetry.Event();
pageloadEvent.Name = 'PageLoad';

Log.info(`Initialization start`);
init().then(() => {
    Log.info("Initialization end: success");
    pageloadEvent.Success = true;
    srClient?.SendTelemetry(pageloadEvent);
}).catch((reason) => {
    Log.info(`Initialization end: failure: ${reason}`);
    pageloadEvent.Success = false;
    pageloadEvent.Message = JSON.stringify(reason);
    srClient?.SendTelemetry(pageloadEvent);
});