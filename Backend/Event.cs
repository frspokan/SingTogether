using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SingTogether.Hubs;
using SingTogether.Media;

namespace SingTogether
{
    public class Event
    {
        public DateTime CreatedTime { get; set; }

        public string Eid { get; set; }     

        private MediaManager MediaMgr;
        
        private readonly IHubContext<CommHub> CommHubContext;
        
        private readonly ILogger Logger;

        public Event(IHubContext<CommHub> hubContext, ILogger logger, string eid)
        {
            this.CommHubContext = hubContext;
            this.Logger = logger;
            this.Eid = eid;
            this.CreatedTime = DateTime.UtcNow;
            this.MediaMgr = new MediaManager(eid, logger);
            this.MediaMgr.SDPAnswerReadyEvent += this.OnSDPAnswerReady;
            this.MediaMgr.ICECandidateReadyEvent += this.OnICECandidateReady;
        }

        private void OnSDPAnswerReady(object sender, MediaManager.SDPAnswerReadyEventArgs sdpAnswerEventArgs)
        {
            try
            {
                // TODO run in task
                // TODO abstract SignalR calls to client (and call from here and in CommHub) to ensure consistent API
                this.CommHubContext.Clients.Client(sdpAnswerEventArgs.Cid).SendAsync("sdpReceived", CommHub.ServerCID, sdpAnswerEventArgs.Sdp).Wait();
            }
            catch (Exception ex)
            {
                Log.Error(this.Logger, $"Exception sending SDP answer to {sdpAnswerEventArgs?.Cid}. Ex: {ex}");
            }
        }

        private void OnICECandidateReady(object sender, MediaManager.ICECandidateReadyEventArgs iceCandidateEventArgs)
        {
            try
            {
                // TODO run in task
                // TODO abstract SignalR calls to client (and call from here and in CommHub) to ensure consistent API
                this.CommHubContext.Clients.Client(iceCandidateEventArgs.Cid).SendAsync("iceReceived", CommHub.ServerCID, iceCandidateEventArgs.Ice).Wait();
            }
            catch (Exception ex)
            {
                Log.Error(this.Logger, $"Exception sending ICe candidate to {iceCandidateEventArgs?.Cid}. Ex: {ex}");
            }
        }

        public void Add(string cid)
        {
            this.MediaMgr.Add(cid);
        }

        public void Remove(string cid)
        {
            this.MediaMgr.Remove(cid);
        }

        public string[] GetCids()
        {
            return this.MediaMgr.GetCids();
        }
        
        public async Task SDPReceived(string cidFrom, string sdpOffer)
        {
            await this.MediaMgr.SDPReceived(cidFrom, sdpOffer);
        }

        public void ICEReceived(string cidFrom, string ice)
        {
            this.MediaMgr.ICEReceived(cidFrom, ice);
        }
    }
}