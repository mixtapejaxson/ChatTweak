import { BitmojiPresence } from '../../lib/constants';
import settings from '../../lib/settings';
import Module from '../../lib/module';
import { logError } from '../../lib/debug';
import { getSnapchatStore } from '../../utils/snapchat';

const store = getSnapchatStore();

let oldCreatePresenceSession: any = null;

// Same result the web client returns when its presence service isn't initialized: no session, no-op cleanup.
// Without a session nothing is published to the other participants, so no Bitmoji is shown.
const newCreatePresenceSession = () => () => {};

class BitmojiHide extends Module {
  constructor() {
    super('Bitmoji Hide');
    store?.subscribe(
      (storeState: any) => storeState.presence,
      () => this.load(),
    );
    settings.on(`BITMOJI_PRESENCE.setting:update`, () => this.load());
  }

  load() {
    if (store == null) {
      logError('Bitmoji Hide: store not found');
      return;
    }

    const presenceClient = store.getState().presence;
    if (presenceClient == null) {
      return;
    }

    const bitmojiPresence = settings.getSetting('BITMOJI_PRESENCE');
    const enabled = bitmojiPresence === BitmojiPresence.HIDE;
    const changedValues: any = {};

    if (enabled && presenceClient.createPresenceSession !== newCreatePresenceSession) {
      if (typeof presenceClient.createPresenceSession !== 'function') {
        logError('Bitmoji Hide: presence.createPresenceSession not found');
        return;
      }

      oldCreatePresenceSession = presenceClient.createPresenceSession;
      changedValues.createPresenceSession = newCreatePresenceSession;
    }

    if (!enabled && oldCreatePresenceSession != null) {
      changedValues.createPresenceSession = oldCreatePresenceSession;
      oldCreatePresenceSession = null;
    }

    if (Object.keys(changedValues).length === 0) {
      return;
    }

    store.setState({ presence: { ...presenceClient, ...changedValues } });

    // Sessions are only created when a chat opens, so end the one already running for the open chat.
    // dispose() clears presence.presenceSession, so the client's own cleanup skips it later.
    if (enabled) {
      store.getState().presence.presenceSession?.dispose();
    }
  }
}

export default new BitmojiHide();
