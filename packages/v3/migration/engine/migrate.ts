import { defaultParam, Migration } from './types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { importCsjOrEsModule } from 'components/Tasks';
import { deployExecute, getDefaultParams } from './utils';
import chalk from 'chalk';

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    const { signer, migrationsData, state, writeState, executionConfig, overrides } = await getDefaultParams(hre, args);

    if (migrationsData.length === 0) {
        console.log(chalk.yellowBright`Nothing to migrate ⚡️`);
        return;
    }

    let networkState: any = state.networkState;
    for (const migrationFilePath in migrationsData) {
        const migrationData = migrationsData[migrationFilePath];

        const migration = importCsjOrEsModule(migrationData.fullPath) as Migration;

        console.log(chalk.blueBright`Executing ${migrationData.fileName}, id: ${migrationData.migrationId}`);

        try {
            networkState = await migration.up(signer, networkState, deployExecute(executionConfig, overrides));

            // If healthcheck doesn't pass
            if (!(await migration.healthcheck(signer, networkState, deployExecute(executionConfig, overrides)))) {
                // migration down
            }
            // Update migration state
            const newMigrationState = state.migrationState;
            newMigrationState.latestMigration = migrationData.migrationId;

            writeState(newMigrationState, networkState);
        } catch (e) {
            console.log(chalk.red(e));
            // migration down
            return;
        }
    }
    console.log(chalk.yellowBright`Migration(s) complete ⚡️`);
};
