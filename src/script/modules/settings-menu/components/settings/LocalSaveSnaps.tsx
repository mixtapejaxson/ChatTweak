import { LocalSaveSnaps } from '../../../local-save-snaps/index';

const localSaveSnapsModule = new LocalSaveSnaps();

export default {
    name: localSaveSnapsModule.name,
    component: localSaveSnapsModule.getSettingsComponent(),
};