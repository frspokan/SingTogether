export class Event
{
    Name: 'PageLoad';        // Event name
    Eid: string;            // Event id
    Cid: string;            // Connection id
    UserAgent: string;      // Browser user agent
    Success: boolean;       // Success / fail flag
    Message: string;        // Freeform text
}