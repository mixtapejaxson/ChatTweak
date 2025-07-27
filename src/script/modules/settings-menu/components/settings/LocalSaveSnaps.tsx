import { LocalSaveSnaps } from '../../../local-save-snaps/index';
import React from 'react';
import useSettingState from '../../../../hooks/useSettingState'; // Corrected path
import { SettingIds } from '../../../../lib/constants';

const localSaveSnapsModule = new LocalSaveSnaps();
const LocalSaveSnapsToggle = localSaveSnapsModule.getSettingsComponent(); // Get the component

const LocalSaveSnapsCacheDuration: React.FC = () => {
    const [cacheDuration, setCacheDuration] = useSettingState(SettingIds.LOCAL_SAVE_SNAPS_CACHE_DURATION);

    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setCacheDuration(parseInt(event.target.value, 10));
    };

    return (
        <div>
            <label htmlFor="cacheDuration">Cache Snaps For:</label>
            <select id="cacheDuration" value={cacheDuration} onChange={handleChange}>
                <option value={0}>On Refresh</option>
                <option value={60}>1 Hour</option>
                <option value={1440}>24 Hours</option>
                <option value={-1}>Never</option>
            </select>
        </div>
    );
};

export default {
    name: localSaveSnapsModule.name,
    component: () => (
        <>
            <LocalSaveSnapsToggle /> {/* Render the component */}
            <LocalSaveSnapsCacheDuration />
        </>
    ),
};