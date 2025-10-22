import Module from '../../lib/module';
import settings from '../../lib/settings';
import injectFunction from './workerInject'
import { SettingIds } from '../../lib/constants';
import { logInfo } from '../../lib/debug';


const METRICS_URL = 'https://gcp.api.snapchat.com/web/metrics';
const SPOTLIGHT_URL = 'https://web.snapchat.com/context/spotlight';
const SNAP_OPEN_URL = 'messagingcoreservice.MessagingCoreService/UpdateContentMessage'
const BROADCAST_CHANNEL = new BroadcastChannel('ChatTweak');


class TelemetryBlocker extends Module {
  private originalFetch: typeof window.fetch | null = null;
  private originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  

  constructor() {
    super('Telemetry Blocker');

    // injection into webworker, required to block certain requests
    const oldBlobClass = window.Blob;
      window.Blob = class HookedBlob extends Blob {
        constructor(...args: any[]) {
          const data = args[0][0];
          if (typeof data === "string" && data.startsWith("importScripts")) {
            args[0][0] += `\n(${injectFunction})("${SNAP_OPEN_URL}", ${settings.getSetting("INFINITE_SNAP_REWATCH")}, ${settings.getSetting("NO_READ_RECEIPTS")});`;
            window.Blob = oldBlobClass;
          }
          super(...args);
        }
      };

    this.load = this.load.bind(this);
    this.enableBlocking = this.enableBlocking.bind(this);
    this.disableBlocking = this.disableBlocking.bind(this);

    settings.on(`${SettingIds.DISABLE_TELEMETRY}.setting:update`, this.load);
    settings.on(`${SettingIds.DISABLE_METRICS}.setting:update`, this.load);
    settings.on(`${SettingIds.BLOCK_SPOTLIGHT}.setting:update`, this.load);
    settings.on(`${SettingIds.INFINITE_SNAP_REWATCH}.setting:update`, this.load);
    settings.on(`${SettingIds.NO_READ_RECEIPTS}.setting:update`, this.load);

    this.load();
  }

  load() {
    const disableTelemetry = settings.getSetting(SettingIds.DISABLE_TELEMETRY);
    const disableMetrics = settings.getSetting(SettingIds.DISABLE_METRICS);
    const blockSpotlight = settings.getSetting(SettingIds.BLOCK_SPOTLIGHT);
    const infiniteRewatchSnap = settings.getSetting(SettingIds.INFINITE_SNAP_REWATCH);
    const unread = settings.getSetting(SettingIds.NO_READ_RECEIPTS);

    logInfo(infiniteRewatchSnap, unread)

    BROADCAST_CHANNEL.postMessage({ infiniteRewatchSnap: infiniteRewatchSnap, unread: unread });

    if (disableTelemetry || disableMetrics || blockSpotlight) {
      this.enableBlocking();
    }  else {
      this.disableBlocking();
    }
  }

  enableBlocking() {

    if (this.originalFetch === null) {
      this.originalFetch = window.fetch;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const disableTelemetry = settings.getSetting(SettingIds.DISABLE_TELEMETRY);
        const disableMetrics = settings.getSetting(SettingIds.DISABLE_METRICS);
        const blockSpotlight = settings.getSetting(SettingIds.BLOCK_SPOTLIGHT);

        if (url.includes(METRICS_URL) && (disableTelemetry || disableMetrics)) {
          logInfo('Blocked telemetry/metrics request:', url);
          return new Response(null, { status: 204 }); // Return a successful but empty response
        }


        try {
          const parsedUrl = new URL(url, window.location.origin);
          if (
            parsedUrl.origin === 'https://web.snapchat.com' &&
            parsedUrl.pathname.startsWith('/context/spotlight') &&
            blockSpotlight
          ) {
            logInfo('Blocked Spotlight request:', url);
            return new Response(null, { status: 204 }); // Return a successful but empty response
          }
        } catch (e) {
          // If URL parsing fails, do not block (fail open).
        }

        return this.originalFetch!(input, init);
      };
    }

    if (this.originalXhrOpen === null) {
      this.originalXhrOpen = XMLHttpRequest.prototype.open;
      const _this = this; // Capture the instance's 'this'
      XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
        const urlString = typeof url === 'string' ? url : url.href;
        const disableTelemetry = settings.getSetting(SettingIds.DISABLE_TELEMETRY);
        const disableMetrics = settings.getSetting(SettingIds.DISABLE_METRICS);
        const blockSpotlight = settings.getSetting(SettingIds.BLOCK_SPOTLIGHT);

        logInfo('XHR request to:', url);

        if (urlString.includes(METRICS_URL) && (disableTelemetry || disableMetrics)) {
          logInfo('Blocked XHR telemetry/metrics request:', urlString);
          return;
        }
        try {
          const parsedUrl = new URL(urlString, window.location.origin);
          if (
            parsedUrl.origin === 'https://web.snapchat.com' &&
            parsedUrl.pathname.startsWith('/context/spotlight') &&
            blockSpotlight
          ) {
            logInfo('Blocked XHR Spotlight request:', urlString);
            return;
          }
        } catch (e) {
          // If URL parsing fails, do not block (fail open).
        }

        const effectiveAsync = async !== undefined ? async : true;
        return _this.originalXhrOpen!.apply(this, [method, url, effectiveAsync, username, password]);
      };
    }
  }

  disableBlocking() {
    if (this.originalFetch !== null) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    if (this.originalXhrOpen !== null) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
      this.originalXhrOpen = null;
    }
  }
}

export default new TelemetryBlocker();