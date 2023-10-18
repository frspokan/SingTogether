using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace SingTogether.Hubs
{
    public class CommHub : Hub
    {
        public static readonly string ServerCID = "SRVCID" ;

        public static int ConnectedCount { get { return _ConnectedCount; } }

        private static int _ConnectedCount;

        private readonly IEventsManager EventsMgr;

        private readonly ILogger<CommHub> Logger;

        public CommHub(IEventsManager eventsManager, ILogger<CommHub> logger)
        {
            this.EventsMgr = eventsManager;
            this.Logger = logger;
        }

        public override async Task OnConnectedAsync()
        {
            Interlocked.Increment(ref _ConnectedCount);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception exception)
        {
            Interlocked.Decrement(ref _ConnectedCount);
            await base.OnDisconnectedAsync(exception);
        }

        public class ClientTelemetryEvent
        {
            public string Name { get; set; }
            public string Eid { get; set; }
            public string Cid { get; set; }
            public string UserAgent { get; set; }
            public bool Success { get; set; }
            public string Message { get; set; }
        }

        public void ClientTelemetry(ClientTelemetryEvent evt)
        {
            Log.SetContext(evt.Eid);
            Log.Info(this.Logger, $"User {evt.Cid} sent telemetry event: {evt.Name}, Success: {evt.Success}, UA: {evt.UserAgent}, Msg: {evt.Message}");
        }

        public async Task JoinEvent(string eid)
        {
            Log.SetContext(eid);
            Log.Verbose(this.Logger, $"User {Context.ConnectionId} joining");

            await Groups.AddToGroupAsync(Context.ConnectionId, eid);
            this.EventsMgr.AddUser(eid, Context.ConnectionId);
            var rosterUpdate = this.EventsMgr.GetUsers(eid);
            await Clients.Group(eid).SendAsync("rosterUpdateReceived", rosterUpdate);
                
            Log.Info(this.Logger, $"User {Context.ConnectionId} joined");
        }

        public async Task LeaveEvent(string eid)
        {
            Log.SetContext(eid);
            Log.Verbose(this.Logger, $"User {Context.ConnectionId} leaving");

            this.EventsMgr.RemoveUser(eid, Context.ConnectionId);
            var rosterUpdate = this.EventsMgr.GetUsers(eid);
            await Clients.Group(eid).SendAsync("rosterUpdateReceived", rosterUpdate);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, eid);
            
            Log.Info(this.Logger, $"User {Context.ConnectionId} left");
        }

        public async Task StartMedia(string eid)
        {
            Log.SetContext(eid);

            var connections = this.EventsMgr.ProposeConnections(eid, Context.ConnectionId);
            Log.Info(this.Logger, $"User {Context.ConnectionId} started media and will connect to: {string.Join(",", connections)}");            
            await Clients.Client(Context.ConnectionId).SendAsync("connectTo", connections);
        }

        public async Task SendChatMsg(string eid, string msg)
        {
            Log.SetContext(eid);
            Log.Verbose(this.Logger, $"User {Context.ConnectionId} sending chat msg with len {msg.Length}");
            await Clients.Group(eid).SendAsync("chatMsgReceived", Context.ConnectionId, DateTime.UtcNow.ToString(), msg);
        }

        public async Task SendSDP(string eid, string cidFrom, string cidTo, string msg)
        {
            Log.SetContext(eid);
            Log.Verbose(this.Logger, $"User {Context.ConnectionId} sending SDP from {cidFrom} to {cidTo}");

            // P2P case
            if (cidTo != ServerCID)
            {
                await Clients.Client(cidTo).SendAsync("sdpReceived", cidFrom, msg);
                return;
            }
            
            // Server case
            await this.EventsMgr.SDPReceived(eid, cidFrom, msg);
        }

        public async Task SendICE(string eid, string cidFrom, string cidTo, string msg)
        {
            Log.SetContext(eid);
            Log.Verbose(this.Logger, $"User {Context.ConnectionId} sending ICE candidate from {cidFrom} to {cidTo}");

            // P2P case
            if (cidTo != ServerCID)
            {
                await Clients.Client(cidTo).SendAsync("iceReceived", cidFrom, msg);
                return;
            }
            
            // Server case
            this.EventsMgr.ICEReceived(eid, cidFrom, msg);
        }
    }
}