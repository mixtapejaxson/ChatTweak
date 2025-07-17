import React from 'react';
import { ActionIcon, Anchor, Button, FocusTrap, Input, Modal, Text } from '@mantine/core';
import { IconSearch, IconX, IconSettingsFilled } from '@tabler/icons-react';
import DiscordIcon from './icons/Discord';
import Fuse from 'fuse.js';
import { type SettingModule } from '../../../../types/client';
// @ts-ignore glob-import
import * as migrations from './settings/*.tsx';
import { defaultSettingValues, ExternalUrls, SettingIds, SettingsButtonLayout } from '../../../lib/constants';
import settingsManager from '../../../lib/settings';
import ThemeProvider from './ThemeProvider';
import { useDisclosure } from '@mantine/hooks';
import useSettingState from '../../../hooks/useSettingState';
import SettingsTabs from './SettingsTabs';

const { default: settingsDefault } = migrations;
const allSettings = settingsDefault.map(({ default: setting }: { default: SettingModule }) => setting);

function ModalSettings({ search }: { search: string }) {
  const fuse = React.useMemo(() => new Fuse(allSettings, { keys: ['name', 'description'] }), []);

  const filteredSettings = React.useMemo(() => {
    if (search.length > 0) {
      return fuse.search(search).map((result) => result.item);
    }
    return allSettings;
  }, [search, fuse]);

  return (
    <div className="modalSettings">
      {search.length > 0 && filteredSettings.length === 0 ? (
        <Text className="emptySettings">No settings found matching "{search}".</Text>
      ) : null}
      {filteredSettings.map((setting: SettingModule) => {
        const SettingComponent = setting.component;
        const settingId = Array.isArray(setting.name) ? setting.name.join('-') : setting.name;
        return <SettingComponent key={settingId} />;
      })}
      {search.length === 0 ? (
        <Anchor
          className="resetButton"
          component="button"
          onClick={() => settingsManager.setSettings(defaultSettingValues)}
        >
          Reset Settings
        </Anchor>
      ) : null}
    </div>
  );
}

function ModalHeader({
  onClose,
  search,
  setSearch,
}: {
  onClose: () => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="modalSection">
      <FocusTrap active>
        <Input
          variant="default"
          size="sm"
          autoFocus
          placeholder="Search settings"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </FocusTrap>
      <ActionIcon size="md" color="gray" variant="transparent" onClick={onClose} className="closeButton">
        <IconX />
      </ActionIcon>
    </div>
  );
}

function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [search, setSearch] = React.useState('');
  return (
    <Modal
      withCloseButton={false}
      opened={isOpen}
      onClose={onClose}
      centered
      size="lg"
      lockScroll={false}
      withinPortal={false}
    >
      <ModalHeader onClose={onClose} search={search} setSearch={setSearch} />
      {search.length > 0 ? <ModalSettings search={search} /> : <SettingsTabs allSettings={allSettings} />}
      <div className="modalSection">
        <Button leftSection={<DiscordIcon size={18} />} variant="light" component="a" href={ExternalUrls.DISCORD}>
          Join our Discord
        </Button>
        <Text
          className="footerText"
          component="a"
          href={`https://github.com/mixtapejaxson/SnapTweak/releases/tag/v${process.env.VERSION}`}
        >
          SnapTweak v{process.env.VERSION} ❤️
        </Text>
      </div>
    </Modal>
  );
}

const MemoSettingsModal = React.memo(SettingsModal, (prevProps, nextProps) => {
  return prevProps.isOpen === nextProps.isOpen && prevProps.onClose === nextProps.onClose;
});

function SettingsMenu() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const [setting] = useSettingState(SettingIds.SETTINGS_BUTTON_LAYOUT);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey || event.key !== 'Q') {
        return;
      }

      toggle();
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return (
    <ThemeProvider>
      {setting !== SettingsButtonLayout.HIDDEN ? (
        <ActionIcon size="xl" radius="md" className="settingsButton" variant="filled" onClick={toggle}>
          <IconSettingsFilled size={18} />
        </ActionIcon>
      ) : null}
      <MemoSettingsModal isOpen={opened} onClose={close} />
    </ThemeProvider>
  );
}

export default SettingsMenu;
