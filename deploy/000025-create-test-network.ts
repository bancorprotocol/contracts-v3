import { PoolType } from '../utils/Constants';
import { ContractInstance, deploy, DeployedContracts, execute, isLive, setDeploymentMetadata } from '../utils/Deploy';
import { duration } from '../utils/Time';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toPPM, toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const DEPOSIT_LIMIT = toWei(5_000_000);
const FUNDING_LIMIT = toWei(10_000_000);
const TRADING_FEE = toPPM(0.2);
const BNT_VIRTUAL_BALANCE = 1;
const BASE_TOKEN_VIRTUAL_BALANCE = 2;

const INITIAL_DEPOSITS = {
    [ContractInstance.TestToken1]: toWei(50_000),
    [ContractInstance.TestToken2]: toWei(500_000),
    [ContractInstance.TestToken3]: toWei(1_000_000),
    [ContractInstance.TestToken4]: toWei(2_000_000),
    [ContractInstance.TestToken5]: toWei(3_000_000)
};

const TOKENS = [
    { symbol: TokenSymbol.TKN1, contractName: ContractInstance.TestToken1 },
    { symbol: TokenSymbol.TKN2, contractName: ContractInstance.TestToken2 },
    { symbol: TokenSymbol.TKN3, contractName: ContractInstance.TestToken3 },
    { symbol: TokenSymbol.TKN4, contractName: ContractInstance.TestToken4, tradingDisabled: true },
    { symbol: TokenSymbol.TKN5, contractName: ContractInstance.TestToken5, depositingDisabled: true }
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
            name: ContractInstance.NetworkSettings,
            methodName: 'addTokenToWhitelist',
            args: [testToken.address],
            from: deployer
        });

        await execute({
            name: ContractInstance.BancorNetwork,
            methodName: 'createPool',
            args: [PoolType.Standard, testToken.address],
            from: deployer
        });

        await execute({
            name: ContractInstance.NetworkSettings,
            methodName: 'setFundingLimit',
            args: [testToken.address, FUNDING_LIMIT],
            from: deployer
        });

        await execute({
            name: ContractInstance.PoolCollectionType1V1,
            methodName: 'setDepositLimit',
            args: [testToken.address, DEPOSIT_LIMIT],
            from: deployer
        });

        await execute({
            name: ContractInstance.PoolCollectionType1V1,
            methodName: 'setTradingFeePPM',
            args: [testToken.address, TRADING_FEE],
            from: deployer
        });

        const initialDeposit = (INITIAL_DEPOSITS as any)[contractName] as number;

        await execute({
            name: contractName,
            methodName: 'approve',
            args: [network.address, initialDeposit],
            from: deployer
        });

        await execute({
            name: ContractInstance.BancorNetwork,
            methodName: 'deposit',
            args: [testToken.address, initialDeposit],
            from: deployer
        });

        if (!tradingDisabled) {
            await execute({
                name: ContractInstance.PoolCollectionType1V1,
                methodName: 'enableTrading',
                args: [testToken.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE],
                from: deployer
            });
        }

        if (depositingDisabled) {
            await execute({
                name: ContractInstance.PoolCollectionType1V1,
                methodName: 'enableDepositing',
                args: [testToken.address, false],
                from: deployer
            });
        }
    }

    await execute({
        name: ContractInstance.PendingWithdrawals,
        methodName: 'setLockDuration',
        args: [duration.minutes(10)],
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

func.skip = async () => isLive();

export default func;
