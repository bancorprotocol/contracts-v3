import { MAX_UINT256, PoolType } from '../utils/Constants';
import {
    deploy,
    DeployedContracts,
    execute,
    InstanceName,
    isLive,
    save,
    setDeploymentMetadata,
    TestTokenInstanceName
} from '../utils/Deploy';
import { duration } from '../utils/Time';
import { DEFAULT_DECIMALS, TokenData, TokenSymbol } from '../utils/TokenData';
import { min, toPPM, toWei } from '../utils/Types';
import { BigNumberish } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const TRADING_FEE = toPPM(0.2);
const BNT_VIRTUAL_BALANCE = 1;
const BASE_TOKEN_VIRTUAL_BALANCE = 2;

interface TokenPoolConfig {
    symbol: TokenSymbol;
    instanceName: TestTokenInstanceName;
    initialSupply: BigNumberish;
    initialDeposit: BigNumberish;
    depositLimit: BigNumberish;
    fundingLimit: BigNumberish;
    tradingDisabled?: boolean;
    depositingDisabled?: boolean;
}

const normalizeAmounts = (config: TokenPoolConfig) => {
    const decimals = new TokenData(config.symbol).decimals();

    return {
        symbol: config.symbol,
        instanceName: config.instanceName,
        initialSupply: toWei(config.initialSupply, decimals),
        initialDeposit: toWei(config.initialDeposit, decimals),
        depositLimit: min(toWei(config.depositLimit, decimals), MAX_UINT256),
        fundingLimit: min(toWei(config.fundingLimit, decimals), MAX_UINT256),
        tradingDisabled: config.tradingDisabled,
        depositingDisabled: config.depositingDisabled
    };
};

const TOKENS = [
    normalizeAmounts({
        symbol: TokenSymbol.TKN1,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken1,
        initialDeposit: 50_000,
        depositLimit: 5_000_000,
        fundingLimit: 10_000_000
    }),
    normalizeAmounts({
        symbol: TokenSymbol.TKN2,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken2,
        initialDeposit: 500_000,
        depositLimit: 5_000_000,
        fundingLimit: 10_000_000
    }),
    normalizeAmounts({
        symbol: TokenSymbol.TKN3,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken3,
        initialDeposit: 1_000_000,
        depositLimit: 5_000_000,
        fundingLimit: 10_000_000
    }),
    normalizeAmounts({
        symbol: TokenSymbol.TKN4,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken4,
        initialDeposit: 2_000_000,
        depositLimit: 5_000_000,
        fundingLimit: 10_000_000,
        tradingDisabled: true
    }),
    normalizeAmounts({
        symbol: TokenSymbol.TKN5,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken5,
        initialDeposit: 3_000_000,
        depositLimit: 5_000_000,
        fundingLimit: 10_000_000,
        depositingDisabled: true
    }),
    normalizeAmounts({
        symbol: TokenSymbol.TKN6,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken6,
        initialDeposit: 100_000,
        depositLimit: 5_000_000,
        fundingLimit: 10_000_000
    }),
    normalizeAmounts({
        symbol: TokenSymbol.TKN7,
        initialSupply: 1_000_000_000,
        instanceName: InstanceName.TestToken7,
        initialDeposit: 50_000,
        depositLimit: MAX_UINT256,
        fundingLimit: 200_000
    })
];

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();

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

        await save({
            name: `bn${symbol}` as InstanceName,
            contract: 'PoolToken',
            address: await poolCollection.poolToken(testToken.address)
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
