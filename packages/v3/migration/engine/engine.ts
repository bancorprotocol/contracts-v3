import Contracts, { ContractBuilder, ContractsType, Contract } from '../../components/Contracts';
import { FORK_CONFIG, FORK_PREFIX } from '../../hardhat.extended.config';
import { ProxyAdmin } from '../../typechain';
import { log } from './logger';
import { defaultArgs, ExecutionSettings, Migration, MigrationData, SystemDeployments, SystemState } from './types';
import { importCsjOrEsModule } from './utils';
import { ContractFactory, ContractReceipt, ContractTransaction, Overrides, Signer } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import fs from 'fs';
import { network } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

const NETWORK_NAME = FORK_CONFIG ? FORK_CONFIG.networkName : network.name;

type initializeArgs = Parameters<any> | 'skipInit';
type proxy<F extends ContractFactory> = { proxy: Contract<F>; logicContractAddress: string };

export class Engine {
    readonly hre: HardhatRuntimeEnvironment;

    readonly pathToNetworkFolder: string;

    readonly signer: Signer;
    readonly executionSettings: ExecutionSettings;
    readonly overrides: Overrides;
    readonly contracts: ContractsType;

    state!: SystemState;
    deployments!: SystemDeployments;

    networkConfig = {
        networkName: NETWORK_NAME,
        isFork: NETWORK_NAME.startsWith(FORK_PREFIX),
        isHardhat: NETWORK_NAME === 'hardhat',
        isTestnet: NETWORK_NAME === 'rinkeby',
        originalNetwork: NETWORK_NAME.startsWith(FORK_PREFIX)
            ? NETWORK_NAME.substring(FORK_PREFIX.length)
            : NETWORK_NAME
    };

    readonly migrationsData: MigrationData[] = [];

    constructor(hre: HardhatRuntimeEnvironment, args: defaultArgs, signer: Signer, signerAddress: string) {
        this.hre = hre;

        this.pathToNetworkFolder = path.join(
            hre.config.paths.root,
            MIGRATION_DATA_FOLDER,
            this.networkConfig.networkName
        );

        this.signer = signer;
        this.executionSettings = {
            confirmationToWait: args.minBlockConfirmations
        };
        this.overrides = {
            gasPrice: args.gasPrice === 0 ? undefined : parseUnits(args.gasPrice.toString(), 'gwei')
        };
        this.contracts = Contracts.connect(signer);

        this.healthcheck();
        this.initIO();
        this.initMigration();

        log.migrationConfig(signerAddress, args.ledger, this.networkConfig, this.executionSettings, this.overrides);
    }

    healthcheck = () => {
        const isForkOrHardhat = this.networkConfig.isFork || this.networkConfig.networkName === 'hardhat';
        if (this.executionSettings.confirmationToWait <= 1 && !isForkOrHardhat) {
            throw new Error(
                `Transaction confirmation should be higher than 1 for ${this.networkConfig.networkName} use. Aborting`
            );
        }
        if (!this.overrides.gasPrice && !isForkOrHardhat) {
            throw new Error(`Gas Price shouldn't be equal to 0 for ${this.networkConfig.networkName} use. Aborting`);
        }
    };

    IO = {
        state: {
            write: (state: SystemState) => {
                fs.writeFileSync(
                    path.join(this.pathToNetworkFolder, 'state.json'),
                    JSON.stringify(state, null, 4) + `\n`
                );
                this.state = state;
            },
            fetch: (pathToState: string) => {
                return JSON.parse(fs.readFileSync(path.join(pathToState, 'state.json'), 'utf-8')) as SystemState;
            }
        },
        deployment: {
            write: (deployments: SystemDeployments) => {
                fs.writeFileSync(
                    path.join(this.pathToNetworkFolder, 'deployment.json'),
                    JSON.stringify(deployments, null, 4) + `\n`
                );
                this.deployments = deployments;
            },
            fetch: (pathToState: string) => {
                return JSON.parse(
                    fs.readFileSync(path.join(pathToState, 'deployment.json'), 'utf-8')
                ) as SystemDeployments;
            }
        }
    };

    resetIO = () => {
        log.warning(`Resetting ${this.networkConfig.networkName} migratation folder`);
        fs.rmSync(this.pathToNetworkFolder, {
            recursive: true,
            force: true
        });

        this.initIO();
    };
    initIO = () => {
        let defaultState: SystemState = {
            migrationState: {
                latestMigration: -1
            },
            networkState: {}
        };
        let defaultDeployment: SystemDeployments = {};

        // if network folder doesn't exist, create it
        if (!fs.existsSync(this.pathToNetworkFolder)) {
            fs.mkdirSync(this.pathToNetworkFolder);
        }

        // read all files into the folder and fetch needed files
        const pathToStateFolder = fs.readdirSync(this.pathToNetworkFolder);

        let state = defaultState;
        let deployment = defaultDeployment;

        // if there is no state file in the network's folder, create it
        if (!pathToStateFolder.find((fileName: string) => fileName === 'state.json')) {
            if (this.networkConfig.isFork) {
                try {
                    const pathToOriginalNetworkFolder = path.join(
                        this.hre.config.paths.root,
                        MIGRATION_DATA_FOLDER,
                        this.networkConfig.originalNetwork
                    );
                    console.log(pathToOriginalNetworkFolder);
                    log.warning(`Fetching initial state from ${this.networkConfig.originalNetwork}`);
                    state = this.IO.state.fetch(pathToOriginalNetworkFolder);
                    log.warning(`Fetching initial deployments from ${this.networkConfig.originalNetwork}`);
                    deployment = this.IO.deployment.fetch(pathToOriginalNetworkFolder);
                } catch (e) {
                    log.error(
                        `${this.networkConfig.originalNetwork} doesn't have a config (needed if you want to fork it), aborting.`
                    );
                    process.exit();
                }
            }
        }
        this.IO.state.write(state);
        this.IO.deployment.write(deployment);
    };

    initMigration = () => {
        // generate migration files
        const pathToMigrationFiles = path.join(this.hre.config.paths.root, MIGRATION_FOLDER);
        const allMigrationFiles = fs.readdirSync(pathToMigrationFiles);
        const migrationFiles = allMigrationFiles.filter((fileName: string) => fileName.endsWith('.ts'));
        const migrationFilesPath = migrationFiles.map((fileName: string) => path.join(pathToMigrationFiles, fileName));
        for (const migrationFilePath of migrationFilesPath) {
            const fileName = path.basename(migrationFilePath);
            const migrationId = Number(fileName.split('_')[0]);
            if (migrationId > this.state.migrationState.latestMigration) {
                this.migrationsData.push({
                    fullPath: migrationFilePath,
                    fileName: fileName,
                    migrationTimestamp: migrationId
                });
            }
        }

        // even if migrations should be automatically sorted by the dir fetching, sort again just in case
        this.migrationsData.sort((a, b) =>
            a.migrationTimestamp > b.migrationTimestamp ? 1 : b.migrationTimestamp > a.migrationTimestamp ? -1 : 0
        );
    };

    migrate = async () => {
        // if there is no migration to run, exit
        if (this.migrationsData.length === 0) {
            log.done(`Nothing to migrate ⚡️`);
            return;
        }

        let stateSaves: SystemState[] = [];

        stateSaves.push({ ...this.state });

        let index = 0;
        for (; index < this.migrationsData.length; index++) {
            const migrationData = this.migrationsData[index];

            const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

            log.info(`Executing ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

            try {
                this.state.networkState = await migration.up(this.state.networkState);

                try {
                    await migration.healthCheck(stateSaves[index].networkState, this.state.networkState);
                    log.success('Health check success ✨ ');
                } catch (e) {
                    log.error('Health check failed');
                    log.error(e.stack);
                    break;
                }

                // if health check passed, update the state and write it to the system
                this.state = {
                    migrationState: { latestMigration: migrationData.migrationTimestamp },
                    networkState: this.state.networkState
                };
                this.IO.state.write(this.state);
                stateSaves.push({ ...this.state });
            } catch (e) {
                log.error('Migration execution failed');
                log.error(e.stack);
                log.error('Aborting.');
                return;
            }
        }

        // if the index of the latest migration is not equal to the length of the migrationsData array then an error occured an we should revert
        if (index != this.migrationsData.length) {
            log.warning('Reverting ...');

            const migrationData = this.migrationsData[index];
            log.info(`Reverting ${migrationData.fileName}, timestamp: ${migrationData.migrationTimestamp}`);

            const migration: Migration = importCsjOrEsModule(migrationData.fullPath);

            this.state.networkState = await migration.down(stateSaves[index].networkState, this.state.networkState);

            // if revert passed, update the state and write it to the system
            this.state.migrationState = { latestMigration: stateSaves[index].migrationState.latestMigration };

            this.IO.state.write(this.state);
            log.success(`${migrationData.fileName} reverted`);
        }

        log.done(`\nMigration(s) complete ⚡️`);
    };

    deploy = async <F extends ContractFactory>(
        factory: ContractBuilder<F>,
        ...args: Parameters<ContractBuilder<F>['deploy']>
    ): Promise<ReturnType<ContractBuilder<F>['deploy']>> => {
        log.basicExecutionHeader('Deploying', `${factory.contractName} 🚀 `, args);
        const contract = await factory.deploy(...([...args, this.overrides] as any));

        log.debug(`Deployment Tx: `, contract.deployTransaction.hash);
        log.greyed(`Waiting to be mined...`);

        const receipt = await contract.deployTransaction.wait(this.executionSettings.confirmationToWait);
        if (receipt.status !== 1) {
            throw new Error(`Error deploying, tx: ${contract.deployTransaction.hash}`);
        }

        log.success(`Deployed ${factory.contractName} at ${contract.address} 🚀 !`);
        return contract;
    };

    execute = async <T extends (...args: any[]) => Promise<ContractTransaction>>(
        executionInstruction: string,
        func: T,
        ...args: Parameters<T>
    ): Promise<ContractReceipt> => {
        log.basicExecutionHeader('Executing', executionInstruction, args);

        const tx = await func(...args, this.overrides);
        log.debug(`Executing tx: `, tx.hash);

        const receipt = await tx.wait(this.executionSettings.confirmationToWait);
        if (receipt.status !== 1) {
            throw new Error(`Error executing, tx: ${tx.hash}`);
        }

        log.success(`Executed ✨`);
        return receipt;
    };

    deployProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        initializeArgs: initializeArgs,
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<proxy<F>> => {
        log.debug('Deploying proxy');
        const logicContract = await this.deploy(logicContractToDeploy, ...ctorArgs);

        const data =
            initializeArgs === 'skipInit'
                ? []
                : logicContract.interface.encodeFunctionData('initialize', initializeArgs);

        const proxy = await this.deploy(
            this.contracts.TransparentUpgradeableProxy,
            logicContract.address,
            admin.address,
            data
        );

        log.success('Proxy deployed 🚀 ');
        return {
            proxy: await logicContractToDeploy.attach(proxy.address),
            logicContractAddress: logicContract.address
        };
    };

    upgradeProxy = async <F extends ContractFactory>(
        admin: ProxyAdmin,
        logicContractToDeploy: ContractBuilder<F>,
        proxyAddress: string,
        initializeArgs:
            | {
                  params: Parameters<any>;
                  initializeFctName: string;
              }
            | 'skipInit',
        ...ctorArgs: Parameters<F['deploy']>
    ): Promise<proxy<F>> => {
        log.debug('Upgrading proxy');
        const newLogicContract = await this.deploy(logicContractToDeploy, ...ctorArgs);

        const data =
            initializeArgs === 'skipInit'
                ? []
                : newLogicContract.interface.encodeFunctionData(
                      initializeArgs.initializeFctName,
                      initializeArgs.params
                  );

        if (initializeArgs === 'skipInit')
            await this.execute('Upgrading proxy', admin.upgrade, proxyAddress, newLogicContract.address);
        else
            await this.execute(
                `Upgrading proxy and call ${initializeArgs.initializeFctName}`,
                admin.upgradeAndCall,
                proxyAddress,
                newLogicContract.address,
                data
            );

        log.success('Proxy upgraded 🚀 ');
        return {
            proxy: await logicContractToDeploy.attach(proxyAddress),
            logicContractAddress: newLogicContract.address
        };
    };
}
