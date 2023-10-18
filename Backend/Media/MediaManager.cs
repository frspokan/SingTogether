using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.MixedReality.WebRTC;
using SingTogether.Hubs;

namespace SingTogether.Media
{
    public class MediaManager
    {
        public ConcurrentDictionary<string, PeerConnection> PeerConnections { get; set; } = new ConcurrentDictionary<string, PeerConnection>();

        public event EventHandler<SDPAnswerReadyEventArgs> SDPAnswerReadyEvent;

        public event EventHandler<ICECandidateReadyEventArgs> ICECandidateReadyEvent;

        public class SDPAnswerReadyEventArgs : EventArgs
        {
            public string Cid;
            public string Sdp;
        }

        public class ICECandidateReadyEventArgs : EventArgs
        {
            public string Cid;
            public string Ice;
        }

        private readonly PeerConnectionConfiguration PeerConnectionConfig = new PeerConnectionConfiguration
        {
            IceServers = new List<IceServer> {
                    new IceServer{ Urls = { "stun:stun.l.google.com:19302", "stun:turn2.l.google.com" } }
            }
        };

        private readonly ILogger Logger;

        private readonly string Eid;

        public MediaManager(string eid, ILogger logger)
        {
            this.Eid = eid;
            this.Logger = logger;
        }

        public void Add(string cid)
        {
            if (!PeerConnections.ContainsKey(cid))
            {
                PeerConnections.TryAdd(cid, new PeerConnection());
            }
        }

        public void Remove(string cid)
        {
            if (PeerConnections.TryRemove(cid, out var peerConnection))
            {
                peerConnection.Dispose();
            }
        }

        public string[] GetCids()
        {
            return PeerConnections.Keys.ToArray();
        }
        
        public async Task SDPReceived(string cidFrom, string sdpOffer)
        {
            if (!PeerConnections.ContainsKey(cidFrom))
            {
                Log.Error(this.Logger, $"No peer connection for {cidFrom}");
                return;
            }

            var pc = PeerConnections[cidFrom];
            await pc.InitializeAsync(PeerConnectionConfig);

            await pc.SetRemoteDescriptionAsync(new SdpMessage() { Type = SdpMessageType.Offer, Content = sdpOffer });

            pc.AudioTrackAdded += (RemoteAudioTrack track) =>
            {
                track.OutputToDevice(false);
                track.AudioFrameReady += (frame) => this.OnAudioFrameReady(cidFrom, frame);
            };
            pc.LocalSdpReadytoSend += (SdpMessage sdpMessage) =>
            {
                this.SDPAnswerReadyEvent?.Invoke(this, new SDPAnswerReadyEventArgs() { Cid = cidFrom, Sdp = sdpMessage.Content });
            };
            pc.IceCandidateReadytoSend += (IceCandidate candidate) => {
                var clientIce = new ClientIceCandidate() { candidate = candidate.Content, sdpMid = candidate.SdpMid, sdpMLineIndex = candidate.SdpMlineIndex };
                string ice = JsonSerializer.Serialize(clientIce);
                this.ICECandidateReadyEvent?.Invoke(this, new ICECandidateReadyEventArgs() { Cid = cidFrom, Ice = ice });
            };
            pc.Connected += () =>
            {
                Log.SetContext(this.Eid);
                Log.Info(this.Logger, $"Connected to {cidFrom}");
            };
            pc.IceStateChanged += (IceConnectionState newState) =>
            {
                Log.SetContext(this.Eid);
                Log.Info(this.Logger, $"ICE state for {cidFrom} changed to {newState}");
            };
            
            pc.CreateAnswer();
        }

        public void ICEReceived(string cidFrom, string ice)
        {
            if (!PeerConnections.ContainsKey(cidFrom))
            {
                Log.Error(this.Logger, $"No peer connection for {cidFrom}");
                return;
            }

            var clientIce = JsonSerializer.Deserialize<ClientIceCandidate>(ice);
            var pc = PeerConnections[cidFrom];
            pc.AddIceCandidate(new IceCandidate() { Content = clientIce.candidate, SdpMid = clientIce.sdpMid, SdpMlineIndex = clientIce.sdpMLineIndex });
        }

        private class ClientIceCandidate
        {
            public string candidate { get; set; }
            public string sdpMid { get; set; }
            public int sdpMLineIndex { get; set; }
        }

        private void OnAudioFrameReady(string cidFrom, AudioFrame frame)
        {
            // TODO save for recording
        }
    }
}