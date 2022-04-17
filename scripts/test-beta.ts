import Contracts from '../components/Contracts';
import { DeployedContracts, execute, InstanceName, isTenderlyFork } from '../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toCents, toWei } from '../utils/Types';
import { BigNumber } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';

// NOTE: this script is used for testing the beta (on a mainnet fork), after its partial deployment (i.e., up to the
// 000030-enable-beta-pools script)
const BNT_TOKEN_PRICE_IN_CENTS = toCents(2.7);

enum BetaTokens {
    ETH = 'ETH',
    DAI = 'DAI',
    LINK = 'LINK'
}

const BETA_TOKEN_PRICES_IN_CENTS = {
    [BetaTokens.ETH]: toCents(3266),
    [BetaTokens.DAI]: toCents(1),
    [BetaTokens.LINK]: toCents(15.67)
};

const TKN_DEPOSIT_LIMIT_IN_CENTS = toCents(171_000);
const BNT_FUNDING_LIMIT_IN_CENTS = toCents(156_000);
const FUNDING_LIMIT = toWei(BNT_FUNDING_LIMIT_IN_CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const { deployer, dai, link, ethWhale, daiWhale, linkWhale } = await getNamedAccounts();

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
        console.log(`Configuring ${tokenSymbol} (${address}) for testing...`);

        const isNativeToken = tokenSymbol === BetaTokens.ETH;

        const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'setFundingLimit',
            args: [address, FUNDING_LIMIT],
            from: deployer
        });

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

        // fund the pools and enable trading for testing

        const bntVirtualBalance = tokenPriceInCents;
        const tokenVirtualBalance = BNT_TOKEN_PRICE_IN_CENTS;
        const initialDeposit = minLiquidityForTrading.mul(tokenVirtualBalance).div(bntVirtualBalance).mul(3);

        if (!isNativeToken) {
            const token = await Contracts.ERC20.attach(address);
            await token.connect(await ethers.getSigner(whale)).approve(network.address, initialDeposit);
        }

        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'deposit',
            args: [address, initialDeposit],
            from: whale,
            value: isNativeToken ? initialDeposit : BigNumber.from(0)
        });

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'enableTrading',
            args: [address, bntVirtualBalance, tokenVirtualBalance],
            from: deployer
        });
    }

    return true;
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
