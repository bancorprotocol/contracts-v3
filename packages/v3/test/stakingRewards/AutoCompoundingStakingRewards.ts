import Contracts from '../../components/Contracts';
import {
    IERC20,
    BancorVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestNetworkTokenPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolCollectionUpgrader,
    ExternalProtectionVault,
    TestAutoCompoundingStakingRewards,
    ExternalRewardsVault
} from '../../typechain-types';
import { roles } from '../helpers/AccessControl';
import { MAX_UINT256, NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS } from '../helpers/Constants';
import { createPool, createProxy, createSystem, depositToPool, setupSimplePool } from '../helpers/Factory';
import { mulDivF } from '../helpers/MathUtils';
import { latest } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { TokenWithAddress, createTokenBySymbol, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const ONE = new Decimal(1);

const EXP_VAL_TOO_HIGH = 16;

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe('AutoCompoundingStakingRewards', () => {
    const TOTAL_REWARDS = 90_000;

    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let user4: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    let autoCompoundingStakingRewards: TestAutoCompoundingStakingRewards;

    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let networkToken: IERC20;
    let govToken: IERC20;
    let networkTokenPool: TestNetworkTokenPool;
    let poolCollectionUpgrader: TestPoolCollectionUpgrader;
    let bancorVault: BancorVault;
    let poolCollection: TestPoolCollection;
    let externalProtectionVault: ExternalProtectionVault;
    let pendingWithdrawals: TestPendingWithdrawals;
    let networkPoolToken: PoolToken;
    let externalRewardsVault: ExternalRewardsVault;

    before(async () => {
        [user1, user2, user3, user4, stakingRewardsProvider] = await ethers.getSigners();
    });

    let token: TokenWithAddress;
    let poolToken: PoolToken;

    beforeEach(async () => {
        ({
            network,
            networkSettings,
            networkToken,
            govToken,
            networkTokenPool,
            poolCollectionUpgrader,
            bancorVault,
            externalProtectionVault,
            poolCollection,
            pendingWithdrawals,
            networkPoolToken,
            externalRewardsVault
        } = await createSystem());
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));

        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

        autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
            ctorArgs: [network.address, networkTokenPool.address]
        });

        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

        ({ token, poolToken } = await setupSimplePool(
            {
                symbol: 'TKN',
                balance: BigNumber.from(10_000),
                initialRate: INITIAL_RATE
            },
            user1,
            network,
            networkSettings,
            poolCollection
        ));

        // lambda user deposit funds to pool
        await depositToPool(user2, token, BigNumber.from(10_000), network);

        // lambda user deposit funds to pool
        await depositToPool(user3, token, BigNumber.from(10_000), network);

        await externalRewardsVault.grantRole(
            roles.ExternalRewardsVault.ROLE_ASSET_MANAGER,
            autoCompoundingStakingRewards.address
        );

        // sr provider deposit funds to pool
        await depositToPool(stakingRewardsProvider, token, BigNumber.from(TOTAL_REWARDS), network);

        // sr provider transfer pool token to external reward vault
        const tx = await transfer(
            stakingRewardsProvider,
            poolToken,
            externalRewardsVault,
            BigNumber.from(TOTAL_REWARDS)
        );
    });

    it('', async () => {
        const TOTAL_DURATION = 10 * MONTH;

        const currentTime = await latest();

        await autoCompoundingStakingRewards.createProgram(
            token.address,
            externalRewardsVault.address,
            TOTAL_REWARDS,
            0, // flat
            currentTime,
            currentTime.add(TOTAL_DURATION)
        );

        let program = await autoCompoundingStakingRewards.program(token.address);
        let poolTokenTotalSupply = await poolToken.totalSupply();
        let tokenStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
        let poolTokenUserBalance = await poolToken.balanceOf(user2.address);

        console.log(
            'current pool token protec vault balance: ',
            (await poolToken.balanceOf(externalRewardsVault.address)).toString()
        );
        console.log('start program available rewards: ', program.availableRewards.toString());
        console.log(
            'token ownable: ',
            mulDivF(poolTokenUserBalance, tokenStakedBalance, poolTokenTotalSupply).toString()
        );
        console.log('');

        for (let i = 1; i <= 10; i++) {
            // lambda user deposit funds to pool
            // await depositToPool(user4, token, BigNumber.from(10_000), network);

            await autoCompoundingStakingRewards.setTime(currentTime.add(i * MONTH + i * DAY));

            await autoCompoundingStakingRewards.processRewards(token.address);

            poolTokenTotalSupply = await poolToken.totalSupply();
            tokenStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
            poolTokenUserBalance = await poolToken.balanceOf(user2.address);

            program = await autoCompoundingStakingRewards.program(token.address);

            const currentAvailableRewards = program.availableRewards.toString();
            console.log('current available rewards: ', currentAvailableRewards);

            const currentPoolTokenProtecVaultBalance = await poolToken.balanceOf(externalRewardsVault.address);
            console.log('current pool token protec vault balance: ', currentPoolTokenProtecVaultBalance.toString());

            console.log(
                'token ownable: ',
                mulDivF(poolTokenUserBalance, tokenStakedBalance, poolTokenTotalSupply).toString()
            );
            console.log('');
        }
    });
});
