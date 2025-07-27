import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Block Spotlight';
const DESCRIPTION = 'Blocks all requests to Snapchat Spotlight.';

function BlockSpotlight() {
  const [enabled, setEnabled] = useSettingState('BLOCK_SPOTLIGHT');
  return <Switch label={NAME} description={DESCRIPTION} checked={enabled} onChange={() => setEnabled(!enabled)} />;
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: BlockSpotlight,
};