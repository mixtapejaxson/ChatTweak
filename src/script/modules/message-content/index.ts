import settings from '../../lib/settings';
import Module from '../../lib/module';
import { SettingIds } from '../../lib/constants';
import { getSnapchatStore } from '../../utils/snapchat';

const store = getSnapchatStore();

function modifyExternalMediaToSnapContent(arr: Uint8Array): Uint8Array {
  const newArr = new Uint8Array(arr.length - 2 + 1); // Original length - 2 (sliced) + 1 (new 0x5a byte)
  newArr[0] = 0x5a;
  newArr.set(arr.slice(2), 1);
  return newArr;
}

let oldGetConversationManager: any = null;
let newGetConversationManager: any = null;

function patchSendMessageWithContent(mananger: any) {
  return new Proxy(mananger, {
    get(target, prop, receiver) {
      if (prop !== 'sendMessageWithContent') {
        return Reflect.get(target, prop, receiver);
      }

      return new Proxy(target[prop], {
        apply(targetFunc, thisArg, args) {
          const [, message] = args;

          if (settings.getSetting('UPLOAD_SNAPS')) {
            message.contentType = 1;
            message.savePolicy = 2;
            if (!settings.getSetting(SettingIds.DISABLE_METRICS)) {
              message.platformAnalytics.metricsMessageType = 3;
            }
            // Ensure message.content is a Uint8Array before modification
            if (message.content instanceof ArrayBuffer) {
              message.content = new Uint8Array(message.content);
            } else if (! (message.content instanceof Uint8Array)) {
              // Attempt to convert to Uint8Array if it's a regular array or other type
              message.content = new Uint8Array(message.content);
            }
            message.content = modifyExternalMediaToSnapContent(message.content as Uint8Array);
          }

          if (settings.getSetting('SEND_UNSAVEABLE_MESSAGES')) {
            message.savePolicy = 0;
          }

          return Reflect.apply(targetFunc, thisArg, args);
        },
      });
    },
  });
}

class MessageContent extends Module {
  constructor() {
    super('Message Content');
    store.subscribe((storeState: any) => storeState.messaging, this.load.bind(this));
    settings.on('UPLOAD_SNAPS.setting:update', () => this.load());
    settings.on('SEND_UNSAVEABLE_MESSAGES.setting:update', () => this.load());
  }

  load() {
    const messagingClient = store.getState().messaging;
    if (messagingClient?.client == null) {
      return;
    }

    const uploadSnapsEnabled = settings.getSetting('UPLOAD_SNAPS');
    const sendUnsaveableMessagesEnabled = settings.getSetting('SEND_UNSAVEABLE_MESSAGES');
    const enabled = uploadSnapsEnabled || sendUnsaveableMessagesEnabled;

    const changedValues: any = {};

    if (!enabled && oldGetConversationManager != null) {
      changedValues.getConversationManager = oldGetConversationManager;
      oldGetConversationManager = null;
      newGetConversationManager = null;
    }

    if (enabled && messagingClient.client.getConversationManager !== newGetConversationManager) {
      oldGetConversationManager = messagingClient.client.getConversationManager;

      newGetConversationManager = new Proxy(oldGetConversationManager, {
        apply: (targetFunc, thisArg, args) => {
          const conversationManager = Reflect.apply(targetFunc, thisArg, args);
          return patchSendMessageWithContent(conversationManager);
        },
      });

      changedValues.getConversationManager = newGetConversationManager;
    }

    if (Object.keys(changedValues).length === 0) {
      return;
    }

    store.setState({ messaging: { ...messagingClient, client: { ...messagingClient.client, ...changedValues } } });
  }
}

export default new MessageContent();
