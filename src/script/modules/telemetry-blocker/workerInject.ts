

export default function (SNAP_OPEN_URL: string, infiniteRewatchEnabled: boolean) {
    const logInfo = console.log;
    const originalFetch = self.fetch;

    const BROADCAST_CHANNEL = new BroadcastChannel('ChatTweak');
    BROADCAST_CHANNEL.onmessage = (event) => { 
        logInfo("Toggled infiniteRewatch to: ", event.data.enabled)
        infiniteRewatchEnabled = event.data.enabled
    };


    logInfo('Worker script injected');

    self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

        if (infiniteRewatchEnabled && url.includes(SNAP_OPEN_URL)) { 
            logInfo('Blocked snap open request:', url); 
            return new Response(null, { status: 204 }); 
        }

        return originalFetch!(input, init);
    };
};