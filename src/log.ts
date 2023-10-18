export class Log
{
    static eid: string = "";

    static verbose(msg: string)
    {
        console.debug(Log.buildmsg(msg));
    }

    static info(msg: string)
    {
        console.info(Log.buildmsg(msg));
    }
    
    static warn(msg: string)
    {
        console.warn(Log.buildmsg(msg));
    }
    
    static error(msg: string)
    {
        console.error(Log.buildmsg(msg));
    }

    private static buildmsg(msg: string): string
    {
        return `${(new Date()).toLocaleString()} [${Log.eid}] ${msg}`;
    }
}