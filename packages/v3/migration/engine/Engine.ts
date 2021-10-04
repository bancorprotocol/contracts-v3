import Contracts, { ContractsType } from '../../components/Contracts';
import LegacyContracts, { LegacyContractsType } from '../../components/LegacyContracts';
import { CONFIG } from '../../hardhat.extended.config';
import { defaultMigration, MIGRATION_DATA_DIR, MIGRATION_DEPLOYMENTS_DIR, MIGRATION_DIR } from './Constants';
import { initExecutionFunctions } from './Execution';
import { initIO } from './Io';
import { log } from './Logger';
import { migrate, migrateOneDown, migrateOneUp } from './Migrate';
import { defaultArgs, ExecutionSettings, NetworkSettings } from './Types';
import { isMigrationDirValid } from './Utils';
import { Overrides, Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import fs from 'fs-extra';
import { network } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export class Engine {
    readonly hre: HardhatRuntimeEnvironment;

    readonly networkSettings: NetworkSettings;

    readonly signer: Signer;
    readonly signerAddress: string;
    readonly contracts: ContractsType;
    readonly legacyContracts: LegacyContractsType;
    readonly executionSettings: ExecutionSettings;
    readonly overrides: Overrides;

    readonly pathToRoot: string;
    readonly pathToNetworkDir: string;
    readonly pathToMigrationsDir: string;
    readonly pathToNetworkDeploymentsDir: string;

    readonly IO = initIO(this);
    readonly executionFunctions = initExecutionFunctions(this);

    readonly migrate = () => migrate(this);

    readonly migrateOneUp = migrateOneUp;
    readonly migrateOneDown = migrateOneDown;

    migration = defaultMigration;

    constructor(hre: HardhatRuntimeEnvironment, args: defaultArgs, signer: Signer, signerAddress: string) {
        this.hre = hre;

        const { hardhatForkConfig } = CONFIG;

        const networkName = hardhatForkConfig?.networkName || network.name;
        this.networkSettings = {
            networkName: networkName,
            originalNetwork: hardhatForkConfig?.originalNetworkName || networkName,
            isFork: hardhatForkConfig?.isFork || false
        };

        this.pathToRoot = path.resolve(__dirname, '../../');
        this.pathToMigrationsDir = path.join(this.pathToRoot, MIGRATION_DIR);
        this.pathToNetworkDir = path.join(this.pathToRoot, MIGRATION_DATA_DIR, this.networkSettings.networkName);
        this.pathToNetworkDeploymentsDir = path.join(this.pathToNetworkDir, MIGRATION_DEPLOYMENTS_DIR);

        this.signer = signer;
        this.signerAddress = signerAddress;
        this.contracts = Contracts.connect(signer);
        this.legacyContracts = LegacyContracts.connect(signer);
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
        }

        this.init();
    }

    checkForFailures = () => {
        // some configuration should only reserve for forked network or hardhat networks
        const isForkOrHardhat = this.networkSettings.isFork || this.networkSettings.networkName === 'hardhat';
        if (this.executionSettings.confirmationToWait <= 1 && !isForkOrHardhat) {
            throw new Error(
                `Transaction confirmation should be higher than 1 for ${this.networkSettings.networkName} use. Aborting`
            );
        }

        if (!this.overrides.gasPrice && !isForkOrHardhat) {
            throw new Error(`Gas Price should be larger than 0 for ${this.networkSettings.networkName} use. Aborting`);
        }
    };

    reset = () => {
        log.warning(`Resetting ${this.networkSettings.networkName} migration directory`);

        fs.rmSync(this.pathToNetworkDir, {
            recursive: true,
            force: true
        });
        this.migration = defaultMigration;
    };

    initMigrationDefaultDir = () => {
        // init the network directory
        fs.mkdirSync(this.pathToNetworkDir);

        // init the network deployment directory
        fs.mkdirSync(path.join(this.pathToNetworkDir, MIGRATION_DEPLOYMENTS_DIR));

        // initialize the first state to default
        this.IO.state.write(defaultMigration.state);
    };

    init = () => {
        // if network doesn't exist
        if (!fs.existsSync(this.pathToNetworkDir)) {
            if (this.networkSettings.isFork) {
                // check if the original network directory is valid and copy it into the current network directory
                try {
                    const pathToOriginalNetworkDir = path.join(
                        this.pathToRoot,
                        MIGRATION_DATA_DIR,
                        this.networkSettings.originalNetwork
                    );

                    if (!isMigrationDirValid(pathToOriginalNetworkDir)) {
                        throw Error('Invalid migration directory');
                    }

                    fs.copySync(pathToOriginalNetworkDir, this.pathToNetworkDir);
                } catch {
                    log.error(
                        `${this.networkSettings.originalNetwork} doesn't have a correct config (needed if you want to fork it). Aborting`
                    );

                    process.exit();
                }
            } else {
                // if not a fork initialize the directory accordingly
                this.initMigrationDefaultDir();
            }
        }

        // if network directory does exist but isn't valid, resetting it
        if (!isMigrationDirValid(this.pathToNetworkDir)) {
            log.warning(`${this.networkSettings.networkName} migration directory is invalid. Resetting...`);

            this.reset();
            this.initMigrationDefaultDir();
        }

        // update current state to the network directory
        this.migration.state = this.IO.state.fetch(this.pathToNetworkDir);

        // create migrations dir if it doesn't exist
        if (!fs.existsSync(this.pathToMigrationsDir)) {
            fs.mkdirSync(this.pathToMigrationsDir);
        }

        // generate migration files
        const allMigrationFiles = fs.readdirSync(this.pathToMigrationsDir);
        const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
        const migrationFilesPath = migrationFiles.map((fileName: string) =>
            path.join(this.pathToMigrationsDir, fileName)
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

        // even if migrations should be automatically sorted by the directory fetching, sort again just in case
        this.migration.migrationsData.sort((a, b) =>
            a.migrationTimestamp > b.migrationTimestamp ? 1 : b.migrationTimestamp > a.migrationTimestamp ? -1 : 0
        );
    };
}
