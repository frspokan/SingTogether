using System;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Runtime.Remoting;
using System.Threading;
using Microsoft.Extensions.Logging;

namespace SingTogether
{
    public class Log
    {
        private static ConcurrentDictionary<string, AsyncLocal<string>> Context = new ConcurrentDictionary<string, AsyncLocal<string>>();

        public static void SetContext(string eid, string contextName = "context") =>
            Context.GetOrAdd(contextName, _ => new AsyncLocal<string>()).Value = eid;
        
        public static string GetContext(string contextName = "context") =>
            Context.TryGetValue(contextName, out AsyncLocal<string> data) ? data.Value : string.Empty;

        public static void Error(ILogger logger, string msg, [CallerMemberName] string callerName = "")
        {
            logger.LogError(FormatString(msg, callerName));
        }
        
        public static void Warn(ILogger logger, string msg, [CallerMemberName] string callerName = "")
        {
            logger.LogWarning(FormatString(msg, callerName));
        }

        public static void Info(ILogger logger, string msg, [CallerMemberName] string callerName = "")
        {
            logger.LogInformation(FormatString(msg, callerName));
        }

        public static void Verbose(ILogger logger, string msg, [CallerMemberName] string callerName = "")
        {
            logger.LogDebug(FormatString(msg, callerName));
        }

        private static string FormatString(string msg, string callerName)
        {
            return $"{DateTime.UtcNow} ({GetContext()}) [{callerName}] - {msg}";
        }
    }
}