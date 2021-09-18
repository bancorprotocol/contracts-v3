import Contracts, { ContractsType } from '../../components/Contracts';
import { CONFIG } from '../../hardhat.extended.config';
import { defaultMigration, MIGRATION_DATA_FOLDER, MIGRATION_FOLDER } from './Constants';
import { initExecutionFunctions } from './ExecutionFunctions';
import { initIO } from './Io';
import { log } from './Logger';
import { migrate, migrateOneDown, migrateOneUp } from './Migrate';
import { defaultArgs, ExecutionSettings, NetworkSettings } from './Types';
import { isMigrationFolderValid } from './Utils';
import { Overrides, Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import fs from 'fs-extra';
import { network } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export class Engine {
    readonly hre: HardhatRuntimeEnvironment;

    readonly networkSettings: NetworkSettings;

    // basics
    readonly signer: Signer;
    readonly contracts: ContractsType;
    readonly executionSettings: ExecutionSettings;
    readonly overrides: Overrides;

    // needed paths
    readonly pathToRoot: string;
    readonly pathToNetworkFolder: string;
    readonly pathToMigrationsFolder: string;
    readonly pathToNetworkDeploymentsFolder: string;

    // init additional functionalities
    readonly IO = initIO(this);
    readonly executionFunctions = initExecutionFunctions(this);

    // main functions
    readonly migrate = () => migrate(this);

    // secondary functions
    readonly migrateOneUp = migrateOneUp;
    readonly migrateOneDown = migrateOneDown;

    // migration info
    migration = defaultMigration;

    constructor(
        hre: HardhatRuntimeEnvironment,
        args: defaultArgs,
        signer: Signer,
        signerAddress: string,
        pathToRoot: string
    ) {
        this.hre = hre;

        // init network settings
        const { hardhatForkConfig } = CONFIG;

        const networkName = hardhatForkConfig?.networkName || network.name;
        this.networkSettings = {
            networkName: networkName,
            originalNetwork: hardhatForkConfig?.originalNetworkName || networkName,
            isFork: hardhatForkConfig?.isFork || false
        };

        // init paths
        this.pathToRoot = pathToRoot;
        this.pathToMigrationsFolder = path.join(pathToRoot, MIGRATION_FOLDER);
        this.pathToNetworkFolder = path.join(this.pathToRoot, MIGRATION_DATA_FOLDER, this.networkSettings.networkName);
        this.pathToNetworkDeploymentsFolder = path.join(this.pathToNetworkFolder, 'deployments');

        // init basics
        this.signer = signer;
        this.contracts = Contracts.connect(signer);
        this.executionSettings = {
            confirmationToWait: args.minBlockConfirmations
        };
        this.overrides = {
            gasPrice: args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei')
        };

        this.checkForFailures();

        log.migrationConfig(signerAddress, args.ledger, this.networkSettings, this.executionSettings, this.overrides);

        if (args.reset) {
            this.reset();

            return;
        }

        this.init();
    }

    // engine health-check
    checkForFailures = () => {
        // some configuration should only reserve for forked network or hardhat networks
        const isForkOrHardhat = this.networkSettings.isFork || this.networkSettings.networkName === 'hardhat';
        if (this.executionSettings.confirmationToWait <= 1 && !isForkOrHardhat) {
            throw new Error(
                `Transaction confirmation should be higher than 1 for ${this.networkSettings.networkName} use. Aborting`
            );
        }
        if (!this.overrides.gasPrice && !isForkOrHardhat) {
            throw new Error(`Gas Price shouldn't be equal to 0 for ${this.networkSettings.networkName} use. Aborting`);
        }
    };

    reset = () => {
        log.warning(`Resetting ${this.networkSettings.networkName} migration folder`);
        fs.rmSync(this.pathToNetworkFolder, {
            recursive: true,
            force: true
        });
        this.migration = defaultMigration;
    };

    initMigrationDefaultFolder = () => {
        // init the network folder
        fs.mkdirSync(this.pathToNetworkFolder);

        // init the network deployment folder
        fs.mkdirSync(path.join(this.pathToNetworkFolder, 'deployments'));

        // initialize the first state to default
        this.IO.state.write(defaultMigration.state);
    };

    init = () => {
        // if network doesn't exist
        if (!fs.existsSync(this.pathToNetworkFolder)) {
            if (this.networkSettings.isFork) {
                // check if the original network folder is valid and copy it into the current network folder
                try {
                    const pathToOriginalNetworkFolder = path.join(
                        this.pathToRoot,
                        MIGRATION_DATA_FOLDER,
                        this.networkSettings.originalNetwork
                    );

                    if (!isMigrationFolderValid(pathToOriginalNetworkFolder)) {
                        throw Error();
                    }

                    fs.copySync(pathToOriginalNetworkFolder, this.pathToNetworkFolder);
                } catch {
                    log.error(
                        `${this.networkSettings.originalNetwork} doesn't have a correct config (needed if you want to fork it). Aborting`
                    );
                    process.exit();
                }
            } else {
                // if not a fork initialize the folder accordingly
                this.initMigrationDefaultFolder();
            }
        }

        // if network folder does exist but isn't valid, resetting it.
        if (!isMigrationFolderValid(this.pathToNetworkFolder)) {
            log.warning(`${this.networkSettings.networkName} migration folder is invalid, resetting it...`);
            this.reset();
            this.initMigrationDefaultFolder();
        }

        // update current state to the network folder
        this.migration.state = this.IO.state.fetch(this.pathToNetworkFolder);

        // generate migration files
        const allMigrationFiles = fs.readdirSync(this.pathToMigrationsFolder);
        const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
        const migrationFilesPath = migrationFiles.map((fileName: string) =>
            path.join(this.pathToMigrationsFolder, fileName)
        );
        for (const migrationFilePath of migrationFilesPath) {
            const fileName = path.basename(migrationFilePath);
            const migrationId = Number(fileName.split('_')[0]);

            // store migration that are only after the latest migration
            if (migrationId > this.migration.state.migrationState.latestMigration) {
                this.migration.migrationsData.push({
                    fullPath: migrationFilePath,
                    fileName: fileName,
                    migrationTimestamp: migrationId
                });
            }
        }

        // even if migrations should be automatically sorted by the dir fetching, sort again just in case
        this.migration.migrationsData.sort((a, b) =>
            a.migrationTimestamp > b.migrationTimestamp ? 1 : b.migrationTimestamp > a.migrationTimestamp ? -1 : 0
        );
    };
}
