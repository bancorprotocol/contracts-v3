import Contracts, { ContractsType } from '../../components/Contracts';
import { FORK_CONFIG, FORK_PREFIX } from '../../hardhat.extended.config';
import { initExecutionFunctions } from './executionFunctions';
import { initIO } from './io';
import { log } from './logger';
import { migrate } from './migrate';
import { defaultArgs, ExecutionSettings, Migration, MigrationData, SystemDeployments, SystemState } from './types';
import { importCsjOrEsModule } from './utils';
import { Overrides, Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import fs from 'fs';
import { network } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

const NETWORK_NAME = FORK_CONFIG ? FORK_CONFIG.networkName : network.name;

const defaultMigration: {
    state: SystemState;
    deployment: SystemDeployments;
    migrationsData: MigrationData[];
    stateSaves: SystemState[];
} = {
    state: {
        migrationState: {
            latestMigration: -1
        },
        networkState: {}
    },
    deployment: {},
    migrationsData: [],
    stateSaves: []
};

export class Engine {
    readonly hre: HardhatRuntimeEnvironment;

    readonly pathToNetworkFolder: string;

    readonly signer: Signer;
    readonly executionSettings: ExecutionSettings;
    readonly overrides: Overrides;
    readonly contracts: ContractsType;

    networkConfig = {
        networkName: NETWORK_NAME,
        isFork: NETWORK_NAME.startsWith(FORK_PREFIX),
        isHardhat: NETWORK_NAME === 'hardhat',
        isTestnet: NETWORK_NAME === 'rinkeby',
        originalNetwork: NETWORK_NAME.startsWith(FORK_PREFIX)
            ? NETWORK_NAME.substring(FORK_PREFIX.length)
            : NETWORK_NAME
    };

    // migration info
    migration = defaultMigration;

    // init additional functionnalities
    IO = initIO(this);
    executionFunctions = initExecutionFunctions(this);

    constructor(hre: HardhatRuntimeEnvironment, args: defaultArgs, signer: Signer, signerAddress: string) {
        this.hre = hre;
        this.signer = signer;
        this.pathToNetworkFolder = path.join(
            hre.config.paths.root,
            MIGRATION_DATA_FOLDER,
            this.networkConfig.networkName
        );
        this.executionSettings = {
            confirmationToWait: args.minBlockConfirmations
        };
        this.overrides = {
            gasPrice: args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei')
        };
        this.contracts = Contracts.connect(signer);

        // system settings healthcheck
        const isForkOrHardhat = this.networkConfig.isFork || this.networkConfig.networkName === 'hardhat';
        if (this.executionSettings.confirmationToWait <= 1 && !isForkOrHardhat) {
            throw new Error(
                `Transaction confirmation should be higher than 1 for ${this.networkConfig.networkName} use. Aborting`
            );
        }
        if (!this.overrides.gasPrice && !isForkOrHardhat) {
            throw new Error(`Gas Price shouldn't be equal to 0 for ${this.networkConfig.networkName} use. Aborting`);
        }

        log.migrationConfig(signerAddress, args.ledger, this.networkConfig, this.executionSettings, this.overrides);

        if (args.reset) {
            this.reset();
        } else {
            this.init();
        }
    }

    // reset then init
    reset = () => {
        log.warning(`Resetting ${this.networkConfig.networkName} migratation folder`);
        fs.rmSync(this.pathToNetworkFolder, {
            recursive: true,
            force: true
        });

        this.migration = defaultMigration;
        this.init();
    };

    init = () => {
        // if network folder doesn't exist, create it
        if (!fs.existsSync(this.pathToNetworkFolder)) {
            fs.mkdirSync(this.pathToNetworkFolder);
        }

        // read all files into the folder and fetch needed files
        const pathToNetworkFolderFiles = fs.readdirSync(this.pathToNetworkFolder);

        // if there is no state file in the network's folder, create it along with deployment file
        const pathToNetworkFolderState = pathToNetworkFolderFiles.find((f: string) => f === 'state.json');
        if (!pathToNetworkFolderState) {
            this.migration.state = this.IO.state.write(defaultMigration.state);
            this.migration.deployment = this.IO.deployment.write(defaultMigration.deployment);
        }

        // if it's a fork we need to get state and deployment files from the original network,
        // if not just load the current state and deployment into the engine
        if (this.networkConfig.isFork) {
            try {
                const pathToOriginalNetworkFolder = path.join(
                    this.hre.config.paths.root,
                    MIGRATION_DATA_FOLDER,
                    this.networkConfig.originalNetwork
                );
                console.log(pathToOriginalNetworkFolder);
                log.warning(`Fetching initial state from ${this.networkConfig.originalNetwork}`);
                this.migration.state = this.IO.state.write(this.IO.state.fetch(pathToOriginalNetworkFolder));
                log.warning(`Fetching initial deployments from ${this.networkConfig.originalNetwork}`);
                this.migration.deployment = this.IO.deployment.write(
                    this.IO.deployment.fetch(pathToOriginalNetworkFolder)
                );
            } catch (e) {
                log.error(
                    `${this.networkConfig.originalNetwork} doesn't have a config (needed if you want to fork it), aborting.`
                );
                process.exit();
            }
        } else {
            this.migration.state = this.IO.state.fetch(this.pathToNetworkFolder);
            this.migration.deployment = this.IO.deployment.fetch(this.pathToNetworkFolder);
        }

        // generate migration files
        const pathToMigrationFiles = path.join(this.hre.config.paths.root, MIGRATION_FOLDER);
        const allMigrationFiles = fs.readdirSync(pathToMigrationFiles);
        const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
        const migrationFilesPath = migrationFiles.map((fileName: string) => path.join(pathToMigrationFiles, fileName));
        for (const migrationFilePath of migrationFilesPath) {
            const fileName = path.basename(migrationFilePath);
            const migrationId = Number(fileName.split('_')[0]);
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

    migrate = () => migrate(this);
}
