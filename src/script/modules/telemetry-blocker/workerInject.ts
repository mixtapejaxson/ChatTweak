
export default function (SNAP_OPEN_URL: string, infiniteRewatchEnabled: boolean, unreadEnabled: boolean) {
    // Minified logInfo - looking for a better way...
    const PREFIX="[SnapTweak - WebWorker Hook]";function logInfo(...n: any[]){console.log(`%c${PREFIX}`,"color: #3b5bdb",...n)}
    logInfo('Worker script injected');

    const originalFetch = self.fetch;
    const BROADCAST_CHANNEL = new BroadcastChannel('ChatTweak');
    BROADCAST_CHANNEL.onmessage = (event) => { 
        logInfo("Received Broadcast Message: ", event.data)
        infiniteRewatchEnabled = event.data.infiniteRewatch
        unreadEnabled = event.data.unread
    };

    self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

        if (infiniteRewatchEnabled && url.includes(SNAP_OPEN_URL)) { 
            logInfo('Blocked snap open request:', url); 
            return new Response(null, { status: 204 }); 
        } else if (unreadEnabled && url.includes("messagingcoreservice.MessagingCoreService/UpdateConversation")){
            logInfo('Blocked UpdateConversation request:', url); 
            return new Response(null, { status: 204})
        }

        return originalFetch!(input, init);
    };
};