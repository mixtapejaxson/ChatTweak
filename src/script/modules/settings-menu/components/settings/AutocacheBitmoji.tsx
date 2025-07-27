import React from 'react';
import { Switch } from '@mantine/core';
import { SettingIds } from '../../../../lib/constants';
import useSettingState from '../../../../hooks/useSettingState';
import { type SettingModule } from '../../../../../types/client';

function AutocacheBitmoji() {
  const [autocacheBitmoji, setAutocacheBitmoji] = useSettingState(SettingIds.BITMOJI_AUTOCACHE);

  return (
    <Switch
      label="Autocache Bitmoji Icons"
      description="Automatically cache Bitmoji icons for faster loading and a snappier experience."
      checked={autocacheBitmoji}
      onChange={(event) => setAutocacheBitmoji(event.currentTarget.checked)}
    />
  );
}

export default {
  name: 'Autocache Bitmoji Icons',
  description: 'Automatically cache Bitmoji icons for faster loading and a snappier experience.',
  component: AutocacheBitmoji,
} satisfies SettingModule;