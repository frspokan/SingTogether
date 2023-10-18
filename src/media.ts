import * as $ from 'jQuery';
import { resolve } from 'path';
import * as Constants from "./consts";
import { Log } from "./log"
import { SignalingClient } from "./signalingClient";

export class MediaEndpoint
{
    connectionStateChangedCallback: (cid: string, state: string) => void;

    private signalingClient: SignalingClient;
    private localStream: MediaStream;   
    private isExpectingAnswer: Map<string, boolean>;
    private remoteStreams: Map<string, MediaStream>;
    private peerConnections: Map<string, RTCPeerConnection>;

    private readonly offerOptions: RTCOfferOptions = { offerToReceiveAudio: true, offerToReceiveVideo: false, voiceActivityDetection: !this.isVADDisabled };
    private readonly connectionConfig: RTCConfiguration = { "iceServers":[{"urls":["stun:stun.l.google.com:19302","stun:turn2.l.google.com"]}] };

    constructor(signalRClient: SignalingClient,
                public eid: string,
                public audioEncLatency: number = 0.01,
                public sampleRate: number = 24000,
                public isFECDisabled: boolean = true,
                public isDTXDisabled: boolean = false,
                public isVADDisabled: boolean = true) {
        this.peerConnections = new Map<string, RTCPeerConnection>();
        this.isExpectingAnswer = new Map<string, boolean>();
        this.remoteStreams = new Map<string, MediaStream>();
        this.signalingClient = signalRClient;
        this.signalingClient.sdpReceivedCallback = (cidFrom: string, msg: string) => this.OnSDPMessage(cidFrom, msg);
        this.signalingClient.iceReceivedCallback = (cidFrom: string, msg: string) => this.OnICEMessage(cidFrom, msg);
    }

    async OpenMic() {        
        try
        {
            this.localStream = await navigator.mediaDevices.getUserMedia({video: false, audio: {
                    latency: { ideal: this.audioEncLatency },
                    channelCount: { exact: 1 },
                    //sampleRate: { exact: this.sampleRate },
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: false
                }});

            Log.info("[Media] getUserMedia media for local stream");
        }
        catch (e) {
            Log.error(`[Media] Failed to getUserMedia: ${e}`);
            alert("Failed to access mic");
            throw e;
        }
    }

    ToggleMute() {
        if (!this.localStream)
        {
            Log.error("[Media] No stream, cannot toggle mute");
            return;
        }

        let audioTrack = this.localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        
        Log.info("[Media] Local mute changed to: " + audioTrack.enabled);
    }

    IsMuted(): boolean {
        if (!this.localStream)
        {
            Log.error("[Media] No stream, cannot get muted state");
            return false;
        }

        return this.localStream.getAudioTracks()[0].muted;
    }

    GetConnectionState(cid: string): string
    {
        if (this.signalingClient && this.signalingClient.GetCid() == cid)
        {
            return "this is you";
        }

        if (this.peerConnections.has(cid))
        {
            return this.peerConnections.get(cid).connectionState;
        }

        return "no connection";
    }

    HasConnected(): boolean
    {
        return this.remoteStreams.size > 0;
    }

    Disconnect() {
        this.peerConnections.forEach((pc: RTCPeerConnection, key: string) => {
            pc.close();                
            Log.info(`[Media] Peer connection ${key} closed`);
        });

        this.peerConnections.clear();
    }

    async Connect(cidTo: string) {
        if (!this.localStream)
        {
            Log.error("[Media] No stream, cannot connect");
            return;
        }

        let tracks = this.localStream.getAudioTracks();

        if (!tracks || tracks.length == 0)
        {
            Log.error("[Media] No audio tracks, cannot connect"); 
            return;
        }

        Log.info("[Media] Audio tracks: " + tracks[0].label);

        if (this.peerConnections.has(cidTo))
        {
            Log.error(`[Media] Peer connection with ${cidTo} already exists, cannot connect`);
            return;
        }

        this.peerConnections.set(cidTo, new RTCPeerConnection(this.connectionConfig));
        this.peerConnections.get(cidTo).addEventListener("connectionstatechange", e => this.OnConnectionStateChange(e, cidTo));
        this.peerConnections.get(cidTo).addEventListener("icecandidate", e => this.OnICECandidate(e, cidTo));
        this.peerConnections.get(cidTo).addEventListener("iceconnectionstatechange", e => this.OnIceConnectionStateChange(e, cidTo));
        this.peerConnections.get(cidTo).addEventListener("track", e => this.OnTrack(e, cidTo));

        this.peerConnections.get(cidTo).addTrack(tracks[0]);
        Log.info("[Media] Added local stream to local connection");

        let offer: RTCSessionDescriptionInit;
        try
        {
            offer = await this.peerConnections.get(cidTo).createOffer(this.offerOptions);

        } catch (e) {
            Log.error("[Media] Failed to create SDP offer, cannot connect: " + e.toString());
            return;
        }
        
        this.ModifySDPSettings(offer);

        Log.info("Created SDP offer");
        Log.verbose(offer.sdp);
        try {
            await this.peerConnections.get(cidTo).setLocalDescription(offer);
        } catch (e) {
            Log.error("[Media] Failed to set local connection local description with SDP offer, cannot connect: " + e.toString());
            return;
        }
        
        this.isExpectingAnswer.set(cidTo, true);
        this.signalingClient.SendSDP(this.eid, cidTo, offer.sdp);
    }

    private StartStatsWatcher() {
        const connectionStatsTimer = window.setInterval(() => {
            if (this.peerConnections.size == 0) {
                window.clearInterval(connectionStatsTimer);
                return;
            }

            // Just check the server connection
            if (!this.peerConnections.has(Constants.ServerCid)) {
                return;
            }

            this.peerConnections.get(Constants.ServerCid).getSenders()[0].getStats().then(result => {
                result.forEach((value, key: string) => {
                    if (key.toLowerCase().startsWith("rtcaudiosource") ||
                    key.toLowerCase().startsWith("rtccodec") ||
                    key.toLowerCase().startsWith("rtctransport") ||
                    key.toLowerCase().startsWith("rtcoutboundrtpaudiostream") ||
                    key.toLowerCase().startsWith("rtcremoteinboundrtpaudiostream")) {
                        // TODO send stats to server
                        Log.verbose("[Media][Stats] " + key + " : " + JSON.stringify(value));
                    }
                });
            });
        }, 10000);
    }

    private async OnSDPMessage(cidFrom: string, sdpMsg: string) {
        if (!this.localStream)
        {
            Log.error("[Media] No stream, cannot negotiate SDP");
            return;
        }        

        if (this.isExpectingAnswer.has(cidFrom)) {
            this.isExpectingAnswer.delete(cidFrom);
            
            Log.info(`[Media] Received SDP answer from ${cidFrom}`);
            Log.verbose(`[Media] ${sdpMsg}`);

            try {
                const sdpDesc: RTCSessionDescriptionInit = { type: "answer", sdp: sdpMsg };
                await this.peerConnections.get(cidFrom).setRemoteDescription(sdpDesc);                
            } catch (e) {
                Log.error("[Media] Failed to set peer connection remote description with SDP answer, cannot connect: " + e.toString());
                return;
            }

            Log.info("[Media] Set peer connection remote description with SDP answer");
            this.StartStatsWatcher();
        } else {            
            Log.info(`[Media] Received SDP offer from ${cidFrom}`);
            Log.verbose(sdpMsg);

            let tracks = this.localStream.getAudioTracks();
    
            if (!tracks || tracks.length == 0)
            {
                Log.error("[Media] No audio tracks, cannot negotiate SDP"); 
                return;
            }

            this.peerConnections.set(cidFrom, new RTCPeerConnection(this.connectionConfig));
            this.peerConnections.get(cidFrom).addEventListener("connectionstatechange", e => this.OnConnectionStateChange(e, cidFrom));
            this.peerConnections.get(cidFrom).addEventListener("icecandidate", e => this.OnICECandidate(e, cidFrom));
            this.peerConnections.get(cidFrom).addEventListener("iceconnectionstatechange", e => this.OnIceConnectionStateChange(e, cidFrom));
            this.peerConnections.get(cidFrom).addEventListener("track", e => this.OnTrack(e, cidFrom));
            
            this.peerConnections.get(cidFrom).addTrack(tracks[0]);
            Log.info("[Media] Added local stream audio track [" + tracks[0].label + "]");

            try {
                const sdpDesc: RTCSessionDescriptionInit = { type: "offer", sdp: sdpMsg };
                await this.peerConnections.get(cidFrom).setRemoteDescription(sdpDesc);                
            } catch (e) {
                Log.error("[Media] Failed to set peer connection remote description with SDP offer, cannot connect: " + e.toString());
                return;
            }

            let answer: RTCSessionDescriptionInit;
            try
            {
                answer = await this.peerConnections.get(cidFrom).createAnswer(this.offerOptions);

            } catch (e) {
                Log.error("[Media] Failed to create SDP answer, cannot connect: " + e.toString());
                return;
            }

            this.ModifySDPSettings(answer);
            Log.info("[Media] Created SDP answer");
            Log.verbose(answer.sdp);

            try {
                await this.peerConnections.get(cidFrom).setLocalDescription(answer);                
            } catch (e) {
                Log.error("[Media] Failed to set peer connection local description with SDP offer, cannot connect: " + e.toString());
                return;
            }

            this.signalingClient.SendSDP(this.eid, cidFrom, answer.sdp);

            this.StartStatsWatcher();
        }
    }

    private OnTrack(e: RTCTrackEvent, cid: string)
    {
        let remoteMS: MediaStream;
        if (e.streams && e.streams[0]) {
            remoteMS = e.streams[0];
        } else {
            remoteMS = new MediaStream();
            remoteMS.addTrack(e.track);
        }            
        this.remoteStreams.set(cid, remoteMS);

        // TODO cleanup the remoteStreams later
        const audioTagName: string = `remoteAudio${cid}`;
        $("#audioContainer").append(`<audio id="${audioTagName}" autoplay></audio>`);

        const audioContainerTag: HTMLMediaElement = document.querySelector(`#${audioTagName}`)
        audioContainerTag.srcObject = remoteMS;
        Log.info(`[Media] Added remote stream for ${cid} with audio track ${e.track.label}`);
    }

    private async OnICECandidate(e: RTCPeerConnectionIceEvent, cidTo: string) {
        if (!e.candidate)
        {
            Log.info(`[Media] Got null local ICE candidate for ${cidTo}`);
            return;
        }

        if (!this.peerConnections.has(cidTo))
        {
            Log.error(`[Media] Got local ICE candidate but no peer connection for ${cidTo}`);
            return;
        }

        Log.info(`[Media] Got local ICE candidate, sending to ${cidTo}`);

        let iceCandidate: string = JSON.stringify(e.candidate);
        Log.verbose(`[Media] ${iceCandidate}`);
        try {
            await this.signalingClient.SendICE(this.eid, cidTo, iceCandidate);
        } catch (e) {
            Log.error(`[Media] Failed to send local ICE candidate to ${cidTo}.  Error: ${e.toString()}`);
        }
    }
    
    private async OnICEMessage(cidFrom: string, msg: string) {
        Log.info(`[Media] Got remote ICE candidate from ${cidFrom}`);
        Log.verbose(`[Media] ${msg}`);

        if (!this.peerConnections.has(cidFrom))
        {
            Log.error(`[Media] Got remote ICE candidate but no peer connection for ${cidFrom}`);
            return;
        }

        let iceCandidate: RTCIceCandidate;
        try {
            iceCandidate = JSON.parse(msg);
            await this.peerConnections.get(cidFrom).addIceCandidate(iceCandidate);
        } catch (e) {
            Log.error(`[Media] Failed to add remote ${cidFrom} ICE candidate ${iceCandidate}.  Error: ${e.toString()}`);
        }
    }

    private OnConnectionStateChange(e: Event, cid: string) {
        if (this.peerConnections.get(cid)) {
            const newState: string = this.peerConnections.get(cid).connectionState;
            Log.info(`[Media] Connection ${cid} state changed to: ${newState}.  Event: ${JSON.stringify(e)}`);
            this.connectionStateChangedCallback(cid, newState);
        }
    }

    private OnIceConnectionStateChange(e: Event, cid: string) {
        if (this.peerConnections.get(cid)) {
            Log.info(`[Media] ICE connection ${cid} state changed to: ${this.peerConnections.get(cid).iceConnectionState}.  Event: ${JSON.stringify(e)}`);
        }
    }

    private ModifySDPSettings(sdp: RTCSessionDescriptionInit)
    {
        sdp.sdp = sdp.sdp.replace('useinbandfec=1', `useinbandfec=1;stereo=0;maxplaybackrate=${this.sampleRate};sprop-maxcapturerate=${this.sampleRate}`);

        if (!this.isDTXDisabled) {
            Log.info("[Media] Enabling DTX in SDP " + sdp.type);
            sdp.sdp = sdp.sdp.replace('useinbandfec=1', 'useinbandfec=1;usedtx=1');
        } else {            
            Log.info("[Media] Not enabling DTX in SDP " + sdp.type);
        }

        if (this.isFECDisabled)
        {
            Log.info("[Media] Disabling FEC in SDP " + sdp.type);
            sdp.sdp = sdp.sdp.replace('useinbandfec=1', 'useinbandfec=0');
        } else {
            Log.info("[Media] Not disabling FEC in SDP " + sdp.type);
        }
    }
}