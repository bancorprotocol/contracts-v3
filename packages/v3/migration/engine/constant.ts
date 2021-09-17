import { MigrationData, SystemDeployments, SystemState } from './Types';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

export const defaultMigration: {
    state: SystemState;
    deployment: SystemDeployments;
    migrationsData: MigrationData[];
    stateSaves: SystemState[];
    currentMigrationData: MigrationData;
} = {
    state: {
        migrationState: {
            latestMigration: -1
        },
        networkState: {}
    },
    deployment: {},
    migrationsData: [],
    stateSaves: [],
    currentMigrationData: {
        fullPath: '',
        fileName: '',
        migrationTimestamp: -1
    }
};
