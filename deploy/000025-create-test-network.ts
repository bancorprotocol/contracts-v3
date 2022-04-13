import { MAX_UINT256, PoolType } from '../utils/Constants';
import { deploy, DeployedContracts, execute, InstanceName, isLive, setDeploymentMetadata } from '../utils/Deploy';
import { duration } from '../utils/Time';
import { DEFAULT_DECIMALS, TokenData, TokenSymbol } from '../utils/TokenData';
import { toPPM, toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const TRADING_FEE = toPPM(0.2);
const BNT_VIRTUAL_BALANCE = 1;
const BASE_TOKEN_VIRTUAL_BALANCE = 2;

const TOKENS = [
    {
        symbol: TokenSymbol.TKN1,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken1,
        initialDeposit: toWei(50_000),
        depositLimit: toWei(5_000_000),
        fundingLimit: toWei(10_000_000)
    },
    {
        symbol: TokenSymbol.TKN2,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken2,
        initialDeposit: toWei(500_000),
        depositLimit: toWei(5_000_000),
        fundingLimit: toWei(10_000_000)
    },
    {
        symbol: TokenSymbol.TKN3,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken3,
        initialDeposit: toWei(1_000_000),
        depositLimit: toWei(5_000_000),
        fundingLimit: toWei(10_000_000)
    },
    {
        symbol: TokenSymbol.TKN4,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken4,
        initialDeposit: toWei(2_000_000),
        depositLimit: toWei(5_000_000),
        fundingLimit: toWei(10_000_000),
        tradingDisabled: true
    },
    {
        symbol: TokenSymbol.TKN5,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken5,
        initialDeposit: toWei(3_000_000),
        depositLimit: toWei(5_000_000),
        fundingLimit: toWei(10_000_000),
        depositingDisabled: true
    },
    {
        symbol: TokenSymbol.TKN6,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken6,
        initialDeposit: toWei(100_000, new TokenData(TokenSymbol.TKN6).decimals()),
        depositLimit: toWei(5_000_000),
        fundingLimit: toWei(10_000_000)
    },
    {
        symbol: TokenSymbol.TKN7,
        initialSupply: toWei(1_000_000_000),
        instanceName: InstanceName.TestToken7,
        initialDeposit: toWei(1_000_000),
        depositLimit: MAX_UINT256,
        fundingLimit: MAX_UINT256
    }
];

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();

    for (const {
        symbol,
        initialSupply,
        instanceName,
        initialDeposit,
        depositLimit,
        fundingLimit,
        tradingDisabled,
        depositingDisabled
    } of TOKENS) {
        const tokenData = new TokenData(symbol);

        await deploy({
            name: instanceName,
            contract: 'TestERC20Token',
            args: [tokenData.name(), tokenData.symbol(), initialSupply],
            from: deployer
        });

        if (tokenData.decimals() !== DEFAULT_DECIMALS) {
            await execute({
                name: instanceName,
                methodName: 'updateDecimals',
                args: [tokenData.decimals()],
                from: deployer
            });
        }

        const testToken = await DeployedContracts[instanceName].deployed();

        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'addTokenToWhitelist',
            args: [testToken.address],
            from: deployer
        });

        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'createPool',
            args: [PoolType.Standard, testToken.address],
            from: deployer
        });

        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'setFundingLimit',
            args: [testToken.address, fundingLimit],
            from: deployer
        });

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'setDepositLimit',
            args: [testToken.address, depositLimit],
            from: deployer
        });

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'setTradingFeePPM',
            args: [testToken.address, TRADING_FEE],
            from: deployer
        });

        await execute({
            name: instanceName,
            methodName: 'approve',
            args: [network.address, initialDeposit],
            from: deployer
        });

        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'deposit',
            args: [testToken.address, initialDeposit],
            from: deployer
        });

        if (!tradingDisabled) {
            await execute({
                name: InstanceName.PoolCollectionType1V1,
                methodName: 'enableTrading',
                args: [testToken.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE],
                from: deployer
            });
        }

        if (depositingDisabled) {
            await execute({
                name: InstanceName.PoolCollectionType1V1,
                methodName: 'enableDepositing',
                args: [testToken.address, false],
                from: deployer
            });
        }
    }

    await execute({
        name: InstanceName.PendingWithdrawals,
        methodName: 'setLockDuration',
        args: [duration.minutes(10)],
        from: deployer
    });

    return true;
};

func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
