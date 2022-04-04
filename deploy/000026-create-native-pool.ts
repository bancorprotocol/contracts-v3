import { PoolType } from '../utils/Constants';
import { ContractInstance, execute, isMainnet, isMainnetFork, setDeploymentMetadata } from '../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toPPM, toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

// make sure to update the limits and the rates before running the script in production
const CENTS = 100;
const NATIVE_TOKEN_PRICE_IN_CENTS = 2921 * CENTS;
const BNT_TOKEN_PRICE_IN_CENTS = 2.37 * CENTS;
const DEPOSIT_LIMIT = toWei(500_000 * CENTS).div(NATIVE_TOKEN_PRICE_IN_CENTS);
const FUNDING_LIMIT = toWei(500_000 * CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);
const TRADING_FEE = toPPM(0.2);
const BNT_VIRTUAL_BALANCE = NATIVE_TOKEN_PRICE_IN_CENTS;
const NATIVE_TOKEN_VIRTUAL_RATE = BNT_TOKEN_PRICE_IN_CENTS;
const MIN_LIQUIDITY_FOR_TRADING = toWei(10_000);
const INITIAL_DEPOSIT = MIN_LIQUIDITY_FOR_TRADING.mul(NATIVE_TOKEN_VIRTUAL_RATE).div(BNT_VIRTUAL_BALANCE).mul(10);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, ethWhale } = await getNamedAccounts();

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'addTokenToWhitelist',
        args: [NATIVE_TOKEN_ADDRESS],
        from: deployer
    });

    await execute({
        name: ContractInstance.BancorNetwork,
        methodName: 'createPool',
        args: [PoolType.Standard, NATIVE_TOKEN_ADDRESS],
        from: deployer
    });

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'setFundingLimit',
        args: [NATIVE_TOKEN_ADDRESS, FUNDING_LIMIT],
        from: deployer
    });

    await execute({
        name: ContractInstance.PoolCollectionType1V1,
        methodName: 'setDepositLimit',
        args: [NATIVE_TOKEN_ADDRESS, DEPOSIT_LIMIT],
        from: deployer
    });

    await execute({
        name: ContractInstance.PoolCollectionType1V1,
        methodName: 'setTradingFeePPM',
        args: [NATIVE_TOKEN_ADDRESS, TRADING_FEE],
        from: deployer
    });

    if (!isMainnet() || isMainnetFork()) {
        await execute({
            name: ContractInstance.BancorNetwork,
            methodName: 'deposit',
            args: [NATIVE_TOKEN_ADDRESS, INITIAL_DEPOSIT],
            from: isMainnetFork() ? ethWhale : deployer,
            value: INITIAL_DEPOSIT
        });

        await execute({
            name: ContractInstance.PoolCollectionType1V1,
            methodName: 'enableTrading',
            args: [NATIVE_TOKEN_ADDRESS, BNT_VIRTUAL_BALANCE, NATIVE_TOKEN_VIRTUAL_RATE],
            from: deployer
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
