import Module from '../../lib/module';
import settings from '../../lib/settings';
import useSettingState from '../../hooks/useSettingState';
import { getSnapchatStore } from '../../utils/snapchat';
import React from 'react';
import { SettingId, SettingIds } from '../../lib/constants'; // Import SettingId and SettingIds

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
        if (!settings.getSetting(this.id as SettingId)) { // Cast to SettingId
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
            const snapData = {
                data: data,
                timestamp: Date.now(), // Store current timestamp
            };
            localStorage.setItem(this.getSnapKey(snapId), JSON.stringify(snapData));
            console.log(`Snap ${snapId} saved locally with timestamp.`);
        } catch (e) {
            console.error(`Failed to save snap ${snapId} locally:`, e);
        }
    }

    public getSnap(snapId: string): string | null {
        try {
            const stored = localStorage.getItem(this.getSnapKey(snapId));
            if (!stored) {
                return null;
            }

            const snapData = JSON.parse(stored);
            // Placeholder for cache duration. Will be replaced by actual setting.
            // For now, let's assume a very long duration or no expiration for testing.
            // The "on refresh" default will be handled by clearing cache on load or not saving.
            const cacheDurationMinutes = settings.getSetting(SettingIds.LOCAL_SAVE_SNAPS_CACHE_DURATION);

            if (cacheDurationMinutes === 0) { // "On refresh" or no persistent cache
                console.log(`Snap ${snapId} not retrieved from persistent cache (on refresh mode).`);
                return null;
            }

            if (cacheDurationMinutes === -1) { // "Never" expire
                console.log(`Snap ${snapId} retrieved locally from cache (never expires).`);
                return snapData.data;
            }

            const cacheDurationMs = cacheDurationMinutes * 60 * 1000; // Convert minutes to ms

            if (Date.now() - snapData.timestamp > cacheDurationMs) {
                this.deleteSnap(snapId); // Snap expired
                console.log(`Snap ${snapId} expired and deleted from local cache.`);
                return null;
            }

            console.log(`Snap ${snapId} retrieved locally from cache.`);
            return snapData.data;
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
            // This component specifically manages the boolean 'enabled' state of the module.
            // The cache duration setting will be a separate component.
            const [enabled, setEnabled] = useSettingState(this.id as SettingId);
            return (
                <div>
                    <label>
                        <input
                            type="checkbox"
                            checked={!!enabled} // Ensure 'enabled' is treated as a boolean
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