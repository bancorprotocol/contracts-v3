import Contracts from '../../components/Contracts';
import { DeployedContracts, execute, getNamedSigners, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { DEFAULT_DECIMALS, NATIVE_TOKEN_ADDRESS, TokenSymbol } from '../../utils/TokenData';
import { toCents, toWei } from '../../utils/Types';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const BNT_TOKEN_PRICE_IN_CENTS = toCents(2.26);

enum BetaTokens {
    ETH = 'ETH',
    DAI = 'DAI',
    LINK = 'LINK'
}

const BETA_TOKEN_PRICES_IN_CENTS = {
    [BetaTokens.ETH]: toCents(3007),
    [BetaTokens.DAI]: toCents(1),
    [BetaTokens.LINK]: toCents(13.84)
};

const TKN_DEPOSIT_LIMIT_IN_CENTS = toCents(171_875);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, dai, link } = await getNamedAccounts();
    const { ethWhale, daiWhale, linkWhale } = await getNamedSigners();

    const BETA_TOKENS = {
        [BetaTokens.ETH]: {
            address: NATIVE_TOKEN_ADDRESS,
            whale: ethWhale
        },
        [BetaTokens.DAI]: {
            address: dai,
            whale: daiWhale
        },
        [BetaTokens.LINK]: {
            address: link,
            whale: linkWhale
        }
    };

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();

    for (const [tokenSymbol, { address, whale }] of Object.entries(BETA_TOKENS)) {
        const isNativeToken = tokenSymbol === BetaTokens.ETH;

        const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

        const tokenPriceInCents = BETA_TOKEN_PRICES_IN_CENTS[tokenSymbol as BetaTokens];
        const depositLimit = toWei(TKN_DEPOSIT_LIMIT_IN_CENTS).div(tokenPriceInCents);

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'setDepositLimit',
            args: [address, depositLimit],
            from: deployer
        });

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'enableDepositing',
            args: [address, true],
            from: deployer
        });

        const bntVirtualBalance = tokenPriceInCents;
        const tokenVirtualBalance = BNT_TOKEN_PRICE_IN_CENTS;
        const initialDeposit = minLiquidityForTrading.mul(tokenVirtualBalance).div(bntVirtualBalance).mul(3);

        if (!isNativeToken) {
            const token = await Contracts.ERC20.attach(address);
            await token.connect(whale).approve(network.address, initialDeposit);
        }

        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'deposit',
            args: [address, initialDeposit],
            from: whale.address,
            value: isNativeToken ? initialDeposit : BigNumber.from(0)
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
