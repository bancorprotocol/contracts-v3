import { PoolType } from '../utils/Constants';
import {
    ContractName,
    DeployedContracts,
    DeploymentTag,
    execute,
    isMainnet,
    isMainnetFork,
    toDeployTag
} from '../utils/Deploy';
import { toPPM, toWei } from '../utils/Types';
import SetNetworkSettings from './1642682516-set-network-settings';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const DEPOSIT_LIMIT = toWei(1_000_000);
const FUNDING_LIMIT = toWei(10_000_000);
const TRADING_FEE = toPPM(0.2);
const BNT_VIRTUAL_BALANCE = 1;
const BASE_TOKEN_VIRTUAL_BALANCE = 2;

const InitialDeposits = {
    [ContractName.TestToken1]: toWei(50_000),
    [ContractName.TestToken2]: toWei(500_000),
    [ContractName.TestToken3]: toWei(1_000_000)
};

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();

    for (const contractName of [ContractName.TestToken1, ContractName.TestToken2, ContractName.TestToken3]) {
        const testToken = await DeployedContracts[contractName].deployed();

        await execute({
            name: ContractName.NetworkSettingsV1,
            methodName: 'addTokenToWhitelist',
            args: [testToken.address],
            from: deployer
        });

        await execute({
            name: ContractName.BancorNetworkV1,
            methodName: 'createPool',
            args: [PoolType.Standard, testToken.address],
            from: deployer
        });

        await execute({
            name: ContractName.NetworkSettingsV1,
            methodName: 'setFundingLimit',
            args: [testToken.address, FUNDING_LIMIT],
            from: deployer
        });

        await execute({
            name: ContractName.PoolCollectionType1V1,
            methodName: 'setDepositLimit',
            args: [testToken.address, DEPOSIT_LIMIT],
            from: deployer
        });

        await execute({
            name: ContractName.PoolCollectionType1V1,
            methodName: 'setTradingFeePPM',
            args: [testToken.address, TRADING_FEE],
            from: deployer
        });

        await execute({
            name: contractName,
            methodName: 'approve',
            args: [network.address, InitialDeposits[contractName]],
            from: deployer
        });

        await execute({
            name: ContractName.BancorNetworkV1,
            methodName: 'deposit',
            args: [testToken.address, InitialDeposits[contractName]],
            from: deployer
        });

        await execute({
            name: ContractName.PoolCollectionType1V1,
            methodName: 'enableTrading',
            args: [testToken.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE],
            from: deployer
        });
    }

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.skip = async () => isMainnet() && !isMainnetFork();
func.dependencies = [
    SetNetworkSettings.id!,
    ContractName.TestToken1,
    ContractName.TestToken2,
    ContractName.TestToken3,
    ContractName.NetworkSettingsV1,
    ContractName.BancorNetworkV1,
    ContractName.PoolCollectionType1V1
];
func.tags = [DeploymentTag.V3, tag];

export default func;
