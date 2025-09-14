export default function (METRICS_URL: string, SPOTLIGHT_URL: string, SNAP_OPEN_URL: string, settings: any) {
    const logInfo = console.log;

    const originalFetch = self.fetch;
    const BROADCAST_CHANNEL = new BroadcastChannel('ChatTweak');
    BROADCAST_CHANNEL.onmessage = (event) => {logInfo(event.data)};
    logInfo('Worker script injected');

    const disableTelemetry = true; 
    const disableMetrics = settings.disableMetrics;
    const blockSpotlight = settings.blockSpotlight;

    self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

        if (disableTelemetry && url.includes(SNAP_OPEN_URL)){logInfo('Blocked snap open request:', url); return new Response(null, { status: 204 });}
        return originalFetch!(input, init);
    };
};