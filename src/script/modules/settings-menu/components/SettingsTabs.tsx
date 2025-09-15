import React from 'react';
import { Tabs } from '@mantine/core';
import { type SettingModule } from '../../../../types/client';
import BlockSpotlight from './settings/BlockSpotlight';

interface TabConfig {
  value: string;
  label: string;
  settings: SettingModule[];
}

interface SettingsTabsProps {
  allSettings: SettingModule[];
}

const tabConfigurations: TabConfig[] = [
  {
    value: 'general',
    label: 'General',
    settings: [], // Will be filtered in the component
  },
  {
    value: 'chat-messaging',
    label: 'Chat & Messaging',
    settings: [], // Will be filtered in the component
  },
  {
    value: 'media-snaps',
    label: 'Media & Snaps',
    settings: [], // Will be filtered in the component
  },
  {
    value: 'presence-privacy',
    label: 'Presence & Privacy',
    settings: [], // Will be filtered in the component
  },
];

function SettingsTabs({ allSettings }: SettingsTabsProps) {
  const filteredTabConfigurations = React.useMemo(() => {
    return tabConfigurations.map(tabConfig => {
      let filteredSettings: SettingModule[] = [];
      switch (tabConfig.value) {
        case 'general':
          filteredSettings = allSettings.filter((setting: SettingModule) => {
            const effectiveSettingName = (Array.isArray(setting.name) ? (setting.name.length > 0 ? setting.name[0] : '') : setting.name ?? '') as string;
            return ['Always Present', 'Cross-Tab Support'].includes(effectiveSettingName);
          });
          break;
        case 'chat-messaging':
          filteredSettings = allSettings.filter((setting: SettingModule) => {
            const effectiveSettingName = (Array.isArray(setting.name) ? (setting.name.length > 0 ? setting.name[0] : '') : setting.name ?? '') as string;
            return ['Chat Handling', 'Peeking Notification', 'Send Unsaveable Messages', 'Story Read Receipt', 'Typing Animation', 'Typing Notification', 'Block Spotlight', 'Unread'].includes(effectiveSettingName);
          });
          break;
        case 'media-snaps':
          filteredSettings = allSettings.filter((setting: SettingModule) => {
            const effectiveSettingName = (Array.isArray(setting.name) ? (setting.name.length > 0 ? setting.name[0] : '') : setting.name ?? '') as string;
            return ['Local Save Snaps', 'Media Saving', 'Screenshot Prevention', 'Send Snaps as Mobile', 'Unlimited File Size', 'Upload Image Snaps', 'Infinite Snap Rewatch'].includes(effectiveSettingName);
          });
          break;
        case 'presence-privacy':
          filteredSettings = allSettings.filter((setting: SettingModule) => {
            const effectiveSettingName = (Array.isArray(setting.name) ? (setting.name.length > 0 ? setting.name[0] : '') : setting.name ?? '') as string;
            return ['Bitmoji Presence', 'Presence Logging', 'View Private Stories', 'Disable Telemetry', 'Disable Metrics'].includes(effectiveSettingName);
          });
          break;
        default:
          filteredSettings = [];
          break;
      }
      return { ...tabConfig, settings: filteredSettings };
    });
  }, [allSettings]);

  return (
    <Tabs defaultValue="general" className="settingsTabs">
      <Tabs.List className="settingsTabList">
        {filteredTabConfigurations.map(tab => (
          <Tabs.Tab key={tab.value} value={tab.value} className="settingsTab">
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {filteredTabConfigurations.map(tab => (
        <Tabs.Panel key={tab.value} value={tab.value} className="settingsTabPanel">
          <div className="modalSettings">
            {tab.settings.map((setting: SettingModule) => {
              const SettingComponent = setting.component;
              const settingId = Array.isArray(setting.name) ? setting.name.join('-') : setting.name;
              return <SettingComponent key={settingId} />;
            })}
          </div>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

export default SettingsTabs;