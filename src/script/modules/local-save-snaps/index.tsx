import Module from '../../lib/module';
import settings from '../../lib/settings';
import useSettingState from '../../hooks/useSettingState';
import { getSnapchatStore } from '../../utils/snapchat';
import React from 'react';

export class LocalSaveSnaps extends Module {
    public id: string;

    constructor() {
        super('Local Save Snaps (Experimental)');
        this.id = 'local-save-snaps';
    }

    async onEnabled() {
        console.log('Local Save Snaps module enabled.');
        this.load();
    }

    async onDisabled() {
        console.log('Local Save Snaps module disabled.');
        this.unload();
    }

    private unsubscribe: (() => void) | null = null;

    load() {
        const store = getSnapchatStore();
        if (store == null) {
            console.warn('Snapchat store not available, cannot load Local Save Snaps module.');
            return;
        }

        if (this.unsubscribe != null) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        this.unsubscribe = store.subscribe(
            (storeState: any) => storeState.messaging.conversations,
            this.handleConversationsUpdate.bind(this),
        );
        console.log('Subscribed to Snapchat store for conversations updates.');
    }

    unload() {
        if (this.unsubscribe != null) {
            this.unsubscribe();
            this.unsubscribe = null;
            console.log('Unsubscribed from Snapchat store conversations updates.');
        }
    }

    private handleConversationsUpdate(conversations: any) {
        if (!settings.getSetting(this.id)) {
            return; // Only process if the module is enabled
        }

        if (conversations == null) {
            return;
        }

        for (const conversationId in conversations) {
            const conversation = conversations[conversationId];
            if (conversation && conversation.messages) {
                for (const messageId in conversation.messages) {
                    const message = conversation.messages[messageId];
                    // Check if it's a snap message and if it has media data
                    if (message.messageType === 'SNAP' && message.media && message.media.url) {
                        const snapId = message.id; // Assuming message.id is unique for the snap
                        const snapUrl = message.media.url;

                        // Check if the snap is already saved locally
                        if (this.getSnap(snapId) === null) {
                            // Fetch the snap data and save it
                            fetch(snapUrl)
                                .then(response => response.blob())
                                .then(blob => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                        if (reader.result) {
                                            this.saveSnap(snapId, reader.result as string);
                                        }
                                    };
                                    reader.readAsDataURL(blob);
                                })
                                .catch(error => console.error(`Failed to fetch snap ${snapId}:`, error));
                        }
                    }
                }
            }
        }
    }

    private getSnapKey(snapId: string): string {
        return `snap-tweak-local-snap-${snapId}`;
    }

    public saveSnap(snapId: string, data: string): void {
        try {
            localStorage.setItem(this.getSnapKey(snapId), data);
            console.log(`Snap ${snapId} saved locally.`);
        } catch (e) {
            console.error(`Failed to save snap ${snapId} locally:`, e);
        }
    }

    public getSnap(snapId: string): string | null {
        try {
            const data = localStorage.getItem(this.getSnapKey(snapId));
            if (data) {
                console.log(`Snap ${snapId} retrieved locally.`);
            }
            return data;
        } catch (e) {
            console.error(`Failed to retrieve snap ${snapId} locally:`, e);
            return null;
        }
    }

    public deleteSnap(snapId: string): void {
        try {
            localStorage.removeItem(this.getSnapKey(snapId));
            console.log(`Snap ${snapId} deleted locally.`);
        } catch (e) {
            console.error(`Failed to delete snap ${snapId} locally:`, e);
        }
    }

    getSettingsComponent(): React.FC {
        return () => {
            const [enabled, setEnabled] = useSettingState(this.id);
            return (
                <div>
                    <label>
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                        />
                        Enable Local Save Snaps
                    </label>
                </div>
            );
        };
    }
}

export default new LocalSaveSnaps();