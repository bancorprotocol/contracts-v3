import { PoolType } from '../utils/Constants';
import { ContractName, deploy, DeployedContracts, DeploymentTag, execute, isLive, toDeployTag } from '../utils/Deploy';
import { duration } from '../utils/Time';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toPPM, toWei } from '../utils/Types';
import SetNetworkSettings from './1642682516-set-network-settings';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const DEPOSIT_LIMIT = toWei(5_000_000);
const FUNDING_LIMIT = toWei(10_000_000);
const TRADING_FEE = toPPM(0.2);
const BNT_VIRTUAL_BALANCE = 1;
const BASE_TOKEN_VIRTUAL_BALANCE = 2;

const InitialDeposits = {
    [ContractName.TestToken1]: toWei(50_000),
    [ContractName.TestToken2]: toWei(500_000),
    [ContractName.TestToken3]: toWei(1_000_000),
    [ContractName.TestToken4]: toWei(2_000_000),
    [ContractName.TestToken5]: toWei(3_000_000)
};

const TOKENS = [
    { symbol: TokenSymbol.TKN1, contractName: ContractName.TestToken1 },
    { symbol: TokenSymbol.TKN2, contractName: ContractName.TestToken2 },
    { symbol: TokenSymbol.TKN3, contractName: ContractName.TestToken3 },
    { symbol: TokenSymbol.TKN4, contractName: ContractName.TestToken4, tradingDisabled: true },
    { symbol: TokenSymbol.TKN5, contractName: ContractName.TestToken5, depositingDisabled: true }
];

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();

    for (const { symbol, contractName, tradingDisabled, depositingDisabled } of TOKENS) {
        const tokenData = new TokenData(symbol);

        await deploy({
            name: contractName,
            contract: 'TestERC20Token',
            args: [tokenData.name(), tokenData.symbol(), INITIAL_SUPPLY],
            from: deployer
        });

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

        if (!tradingDisabled) {
            await execute({
                name: ContractName.PoolCollectionType1V1,
                methodName: 'enableTrading',
                args: [testToken.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE],
                from: deployer
            });
        }

        if (depositingDisabled) {
            await execute({
                name: ContractName.PoolCollectionType1V1,
                methodName: 'enableDepositing',
                args: [testToken.address, false],
                from: deployer
            });
        }
    }

    await execute({
        name: ContractName.PendingWithdrawalsV1,
        methodName: 'setLockDuration',
        args: [duration.minutes(10)],
        from: deployer
    });

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.skip = async () => isLive();
func.dependencies = [
    ContractName.NetworkSettingsV1,
    SetNetworkSettings.id!,
    ContractName.BancorNetworkV1,
    ContractName.PoolCollectionType1V1
];
func.tags = [DeploymentTag.V3, tag, ...TOKENS.map((t) => t.contractName)];

export default func;
