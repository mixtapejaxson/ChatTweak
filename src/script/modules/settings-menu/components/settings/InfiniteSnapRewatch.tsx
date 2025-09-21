import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Infinite Snap Rewatch';
const DESCRIPTION = 'Only opens the snap client side, allows us to rewatch it infinitly. You currently need to reload the page to rewatch it';

function InfiniteRewatchSnap() {
  const [enabled, setEnabled] = useSettingState('INFINITE_SNAP_REWATCH');
  return <Switch label={NAME} description={DESCRIPTION} checked={enabled} onChange={() => setEnabled(!enabled)} />;
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: InfiniteRewatchSnap,
};