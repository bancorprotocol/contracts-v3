import { PoolType } from '../utils/Constants';
import { ContractName, DeploymentTag, execute, isMainnet, isMainnetFork, toDeployTag } from '../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toPPM, toWei } from '../utils/Types';
import SetNetworkSettings from './1642682516-set-network-settings';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

// make sure to update the limits and the rates before running the script in production
const CENTS = 100;
const NATIVE_TOKEN_PRICE_IN_CENTS = 2921 * CENTS;
const BNT_TOKEN_PRICE_IN_CENTS = 2.37 * CENTS;
const DEPOSIT_LIMIT = toWei(500_000 * CENTS).div(NATIVE_TOKEN_PRICE_IN_CENTS);
const FUNDING_LIMIT = toWei(500_000 * CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);
const TRADING_FEE = toPPM(0.2);
const BNT_FUNDING_RATE = NATIVE_TOKEN_PRICE_IN_CENTS;
const NATIVE_TOKEN_FUNDING_RATE = BNT_TOKEN_PRICE_IN_CENTS;
const MIN_LIQUIDITY_FOR_TRADING = toWei(10_000);
const INITIAL_DEPOSIT = MIN_LIQUIDITY_FOR_TRADING.mul(NATIVE_TOKEN_FUNDING_RATE).div(BNT_FUNDING_RATE).mul(10);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, ethWhale } = await getNamedAccounts();

    await execute({
        name: ContractName.NetworkSettingsV1,
        methodName: 'addTokenToWhitelist',
        args: [NATIVE_TOKEN_ADDRESS],
        from: deployer
    });

    await execute({
        name: ContractName.BancorNetworkV1,
        methodName: 'createPool',
        args: [PoolType.Standard, NATIVE_TOKEN_ADDRESS],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettingsV1,
        methodName: 'setFundingLimit',
        args: [NATIVE_TOKEN_ADDRESS, FUNDING_LIMIT],
        from: deployer
    });

    await execute({
        name: ContractName.PoolCollectionType1V1,
        methodName: 'setDepositLimit',
        args: [NATIVE_TOKEN_ADDRESS, DEPOSIT_LIMIT],
        from: deployer
    });

    await execute({
        name: ContractName.PoolCollectionType1V1,
        methodName: 'setTradingFeePPM',
        args: [NATIVE_TOKEN_ADDRESS, TRADING_FEE],
        from: deployer
    });

    if (!isMainnet() || isMainnetFork()) {
        await execute({
            name: ContractName.BancorNetworkV1,
            methodName: 'deposit',
            args: [NATIVE_TOKEN_ADDRESS, INITIAL_DEPOSIT],
            from: isMainnetFork() ? ethWhale : deployer,
            value: INITIAL_DEPOSIT
        });

        await execute({
            name: ContractName.PoolCollectionType1V1,
            methodName: 'enableTrading',
            args: [NATIVE_TOKEN_ADDRESS, BNT_FUNDING_RATE, NATIVE_TOKEN_FUNDING_RATE],
            from: deployer
        });
    }

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.dependencies = [
    SetNetworkSettings.id!,
    ContractName.NetworkSettingsV1,
    ContractName.BancorNetworkV1,
    ContractName.PoolCollectionType1V1
];
func.tags = [DeploymentTag.V3, tag];

export default func;
