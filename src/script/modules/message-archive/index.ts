import { SettingIds } from '../../lib/constants';
import messageArchive from '../../lib/messageArchive';
import Module from '../../lib/module';
import settings from '../../lib/settings';
import { getSnapchatStore } from '../../utils/snapchat';

const store = getSnapchatStore();
let unsubscribe: (() => void) | null = null;

class MessageArchiveModule extends Module {
  constructor() {
    super('Message Archive');
    settings.on(`${SettingIds.MESSAGE_ARCHIVE}.setting:update`, this.load.bind(this));
    settings.on(`${SettingIds.MESSAGE_DELETE_LOGGING}.setting:update`, this.load.bind(this));
    settings.on(`${SettingIds.MESSAGE_ARCHIVE_LIMIT}.setting:update`, this.load.bind(this));
  }

  load() {
    const archiveEnabled = settings.getSetting(SettingIds.MESSAGE_ARCHIVE);
    const deleteLoggingEnabled = settings.getSetting(SettingIds.MESSAGE_DELETE_LOGGING);
    const enabled = archiveEnabled || deleteLoggingEnabled;

    messageArchive.prune();

    if (!enabled && unsubscribe != null) {
      unsubscribe();
      unsubscribe = null;
      messageArchive.resetLiveState();
      return;
    }

    if (!enabled || store == null) {
      return;
    }

    messageArchive.syncConversations(store.getState().messaging?.conversations);

    if (unsubscribe == null) {
      unsubscribe = store.subscribe(
        (storeState: any) => storeState.messaging?.conversations,
        (conversations: any) => messageArchive.syncConversations(conversations),
      );
    }
  }
}

export default new MessageArchiveModule();
