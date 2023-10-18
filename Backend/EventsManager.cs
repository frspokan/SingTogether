
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SingTogether.Hubs;

namespace SingTogether
{
    public interface IEventsManager
    {
        void AddUser(string eid, string cid);
        void RemoveUser(string eid, string cid);
        string[] ProposeConnections(string eid, string cid);
        string[] GetUsers(string eid);
        string GetEventsAsString();
        void ClearEvents();
        Task SDPReceived(string eid, string cidFrom, string sdp);
        void ICEReceived(string eid, string cidFrom, string sdp);
    }

    public class EventsManager : IEventsManager
    {
        private ConcurrentDictionary<string, Event> Events = new ConcurrentDictionary<string, Event>();
        
        private readonly IHubContext<CommHub> CommHubContext;
        
        private readonly ILogger<EventsManager> Logger;

        private const int MaxConnections = 6;

        public EventsManager(IHubContext<CommHub> hubContext, ILogger<EventsManager> logger)
        {
            this.CommHubContext = hubContext;
            this.Logger = logger;
        }

        public void AddUser(string eid, string cid)
        {
            if (!Events.ContainsKey(eid))
            {
                Events.TryAdd(eid, new Event(this.CommHubContext, this.Logger, eid));
            }

            Events[eid].Add(cid);
        }

        public void RemoveUser(string eid, string cid)
        {
            if (!Events.ContainsKey(eid))
            {
                return;
            }
            
            Events[eid].Remove(cid);
        }

        public async Task SDPReceived(string eid, string cidFrom, string sdp)
        {
            if (!Events.ContainsKey(eid))
            {
                return;
            }

            await Events[eid].SDPReceived(cidFrom, sdp);
        }

        public void ICEReceived(string eid, string cidFrom, string sdp)
        {
            if (!Events.ContainsKey(eid))
            {
                return;
            }

            Events[eid].ICEReceived(cidFrom, sdp);
        }

        public string[] ProposeConnections(string eid, string cid)
        {
            var list = new string[0];

            if (!Events.ContainsKey(eid))
            {
                return list;
            }

            var cids = Events[eid].GetCids();
            if (cids == null || cids.Length < 2 || cids.Length >= MaxConnections)
            {
                return list;
            }

            // Just connect to everyone for now
            return cids.Except(new string[] { cid }).ToArray();
        }

        public string[] GetUsers(string eid)
        {
            if (!Events.ContainsKey(eid))
            {
                return new string[0];
            }
        
            return Events[eid].GetCids();
        }

        public string GetEventsAsString()
        {
            StringBuilder sb = new StringBuilder("Events: ");
            foreach (string evt in Events.Keys)
            {
                sb.Append($"{evt}: {Events[evt].GetCids().Count()} users, ");
            }

            return sb.ToString();
        }

        public void ClearEvents()
        {
            Events = new ConcurrentDictionary<string, Event>();
        }
    }
}