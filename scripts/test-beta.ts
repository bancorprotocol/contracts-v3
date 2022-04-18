import Contracts from '../components/Contracts';
import { DeployedContracts, isTenderlyFork } from '../utils/Deploy';
import { duration } from '../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import { toCents, toWei } from '../utils/Types';
import { BigNumber } from 'ethers';
import { ethers, getNamedAccounts } from 'hardhat';

// NOTE: this script is used for testing the beta (on a mainnet fork), after its partial deployment (i.e., up to the
// enable-beta-pools script)
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
const BNT_FUNDING_LIMIT_IN_CENTS = toCents(156_250);
const FUNDING_LIMIT = toWei(BNT_FUNDING_LIMIT_IN_CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);

const PROGRAM_START_DELAY = duration.hours(1);
const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(44_500);

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const { deployer: deployerAddress, dai, link, ethWhale, daiWhale, linkWhale } = await getNamedAccounts();

    const deployer = await ethers.getSigner(deployerAddress);

    const BETA_TOKENS = {
        [BetaTokens.ETH]: {
            pool: NATIVE_TOKEN_ADDRESS,
            whale: await ethers.getSigner(ethWhale)
        },
        [BetaTokens.DAI]: {
            pool: dai,
            whale: await ethers.getSigner(daiWhale)
        },
        [BetaTokens.LINK]: {
            pool: link,
            whale: await ethers.getSigner(linkWhale)
        }
    };

    const network = await DeployedContracts.BancorNetwork.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();

    // enable the beta pools
    for (const [tokenSymbol, { pool, whale }] of Object.entries(BETA_TOKENS)) {
        const isNativeToken = tokenSymbol === BetaTokens.ETH;

        const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

        await networkSettings.connect(deployer).setFundingLimit(pool, FUNDING_LIMIT);

        const tokenPriceInCents = BETA_TOKEN_PRICES_IN_CENTS[tokenSymbol as BetaTokens];
        const depositLimit = toWei(TKN_DEPOSIT_LIMIT_IN_CENTS).div(tokenPriceInCents);

        await poolCollection.connect(deployer).setDepositLimit(pool, depositLimit);
        await poolCollection.connect(deployer).enableDepositing(pool, true);

        const bntVirtualBalance = tokenPriceInCents;
        const tokenVirtualBalance = BNT_TOKEN_PRICE_IN_CENTS;
        const initialDeposit = minLiquidityForTrading.mul(tokenVirtualBalance).div(bntVirtualBalance).mul(3);

        if (!isNativeToken) {
            const token = await Contracts.ERC20.attach(pool);
            await token.connect(whale).approve(network.address, initialDeposit);
        }

        await network
            .connect(whale)
            .deposit(pool, initialDeposit, { value: isNativeToken ? initialDeposit : BigNumber.from(0) });

        await poolCollection.connect(deployer).enableTrading(pool, bntVirtualBalance, tokenVirtualBalance);
    }

    // create staking rewards programs for the beta pools
    const standardRewards = await DeployedContracts.StandardRewards.deployed();

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
        await standardRewards
            .connect(deployer)
            .createProgram(
                pool,
                bnt.address,
                TOTAL_REWARDS,
                now + PROGRAM_START_DELAY,
                now + PROGRAM_START_DELAY + PROGRAM_DURATION
            );
    }

    return true;
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
