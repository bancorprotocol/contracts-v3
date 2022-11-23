import Contracts, {
    AccessControlEnumerable,
    AutoCompoundingRewards,
    BancorNetwork,
    BancorNetworkInfo,
    BancorPortal,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolMigrator,
    PoolToken,
    PoolTokenFactory,
    StandardRewards
} from '../../components/Contracts';
import LegacyContracts, {
    BNT,
    IUniswapV2Factory,
    IUniswapV2Factory__factory,
    IUniswapV2Router02,
    IUniswapV2Router02__factory,
    LegacyBancorNetwork,
    Registry as LegacyRegistry,
    LiquidityProtection,
    LiquidityProtectionSettings,
    LiquidityProtectionStore,
    Owned,
    StakingRewardsClaim,
    STANDARD_CONVERTER_TYPE,
    STANDARD_POOL_CONVERTER_WEIGHT,
    TokenGovernance,
    VBNT
} from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { getBalance, getTransactionCost } from '../../test/helpers/Utils';
import { MAX_UINT256, PPM_RESOLUTION, RATE_MAX_DEVIATION_PPM, ZERO_ADDRESS } from '../../utils/Constants';
import { DeployedContracts, fundAccount, getNamedSigners, isMainnet, runPendingDeployments } from '../../utils/Deploy';
import Logger from '../../utils/Logger';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { Fraction, toWei } from '../../utils/Types';
import { IERC20, StandardPoolConverter } from '@bancor/contracts-solidity';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { getNamedAccounts } from 'hardhat';

(isMainnet() ? describe : describe.skip)('network', async () => {
    let network: BancorNetwork;
    let networkSettings: NetworkSettings;
    let networkInfo: BancorNetworkInfo;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let bnt: BNT;
    let vbnt: VBNT;
    let bntPool: BNTPool;
    let masterVault: MasterVault;
    let poolCollection: PoolCollection;
    let pendingWithdrawals: PendingWithdrawals;
    let autoCompoundingRewards: AutoCompoundingRewards;

    let deployer: SignerWithAddress;
    let daoMultisig: SignerWithAddress;
    let foundationMultisig: SignerWithAddress;
    let bntWhale: SignerWithAddress;
    let ethWhale: SignerWithAddress;

    before(async () => {
        ({ deployer, daoMultisig, foundationMultisig, ethWhale, bntWhale } = await getNamedSigners());

        await fundAccount(bntWhale);
    });

    beforeEach(async () => {
        await runPendingDeployments();

        network = await DeployedContracts.BancorNetwork.deployed();
        networkSettings = await DeployedContracts.NetworkSettings.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        bnt = await DeployedContracts.BNT.deployed();
        vbnt = await DeployedContracts.VBNT.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V10.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        autoCompoundingRewards = await DeployedContracts.AutoCompoundingRewards.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
    });

    describe('roles', () => {
        let externalProtectionVault: ExternalProtectionVault;
        let externalAutoCompoundingRewardsVault: ExternalRewardsVault;
        let poolTokenFactory: PoolTokenFactory;
        let poolMigrator: PoolMigrator;
        let standardRewards: StandardRewards;
        let bancorPortal: BancorPortal;
        let liquidityProtection: LiquidityProtection;
        let stakingRewardsClaim: StakingRewardsClaim;

        beforeEach(async () => {
            externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
            externalAutoCompoundingRewardsVault =
                await DeployedContracts.ExternalAutoCompoundingRewardsVault.deployed();
            poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
            poolMigrator = await DeployedContracts.PoolMigrator.deployed();
            standardRewards = await DeployedContracts.StandardRewards.deployed();
            bancorPortal = await DeployedContracts.BancorPortal.deployed();
            liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
            stakingRewardsClaim = await DeployedContracts.StakingRewardsClaim.deployed();
        });

        it('should have the correct set of roles', async () => {
            const { deployer, deployerV2 } = await getNamedAccounts();

            // ensure that ownership transfer to the DAO was initiated
            expect(await liquidityProtection.newOwner()).to.equal(daoMultisig.address);

            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_SUPERVISOR,
                [foundationMultisig.address]
            );
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                isMainnet() ? [deployerV2] : [deployer]
            );

            const expectedRoles = isMainnet()
                ? [standardRewards.address, bntPool.address, liquidityProtection.address, stakingRewardsClaim.address]
                : [standardRewards.address, bntPool.address];
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                expectedRoles
            );

            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_SUPERVISOR,
                [foundationMultisig.address]
            );
            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                isMainnet() ? [deployerV2] : [deployer]
            );
            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                isMainnet() ? [bntPool.address, liquidityProtection.address] : [bntPool.address]
            );

            await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address, network.address]);
            await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                network.address,
                poolCollection.address
            ]);

            await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [
                daoMultisig.address,
                network.address
            ]);
            await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                network.address,
                poolCollection.address
            ]);

            await expectRoleMembers(externalAutoCompoundingRewardsVault, Roles.Upgradeable.ROLE_ADMIN, [
                daoMultisig.address
            ]);
            await expectRoleMembers(externalAutoCompoundingRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                autoCompoundingRewards.address
            ]);

            await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);

            await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);

            await expectRoleMembers(bntPool, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address, network.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, [
                autoCompoundingRewards.address
            ]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [poolCollection.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);

            await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);

            await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);

            await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, [liquidityProtection.address]);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER, [daoMultisig.address]);

            await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);

            await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);

            await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig.address]);
        });
    });

    describe('health checks', () => {
        let legacyNetwork: LegacyBancorNetwork;
        let liquidityProtection: LiquidityProtection;
        let liquidityProtectionStore: LiquidityProtectionStore;
        let liquidityProtectionSettings: LiquidityProtectionSettings;

        enum TestPools {
            BNT = 'BNT',
            ETH = 'ETH',
            DAI = 'DAI',
            LINK = 'LINK',
            USDC = 'USDC',
            WBTC = 'WBTC'
        }

        interface Pool {
            token: string;
            whale: SignerWithAddress;
            decimals?: number;
        }

        let pools: Record<string, Pool>;
        let bnBNT: PoolToken;

        const isInRange = (
            averageRate: Fraction<BigNumber>,
            spotRate: Fraction<BigNumber>,
            maxDeviationPPM: number
        ) => {
            const min = averageRate.n.mul(spotRate.d.mul(PPM_RESOLUTION - maxDeviationPPM));
            const mid = averageRate.d.mul(spotRate.n.mul(PPM_RESOLUTION));
            const max = averageRate.n.mul(spotRate.d.mul(PPM_RESOLUTION + maxDeviationPPM));

            return min.lte(mid) && mid.lte(max);
        };

        // TODO: replace this method with an exact single trade method
        const stabilizePoolV3 = async (pool: string, decimals: number | undefined, tokenWhale: SignerWithAddress) => {
            while (true) {
                const poolData = await poolCollection.poolData(pool);
                const { averageRates, liquidity } = poolData;
                const { rate: emaRate } = averageRates;
                const spotRate = { n: liquidity.bntTradingLiquidity, d: liquidity.baseTokenTradingLiquidity };

                if (isInRange(emaRate, spotRate, RATE_MAX_DEVIATION_PPM)) {
                    break;
                }

                let sourceToken: string;
                let targetToken: string;
                let trader: SignerWithAddress;
                let tradeAmount;
                if (emaRate.n.mul(spotRate.d).gt(spotRate.n.mul(emaRate.d))) {
                    // EMA > SPOT: stabilizing by trading TKN to BNT
                    sourceToken = pool;
                    targetToken = bnt.address;
                    tradeAmount = toWei(1, decimals);
                    trader = tokenWhale;
                } else {
                    // SPOT > EMA: Stabilizing by trading BNT to TKN
                    sourceToken = bnt.address;
                    targetToken = pool;
                    tradeAmount = toWei(1);
                    trader = bntWhale;
                }

                const isNativeSourceToken = sourceToken === NATIVE_TOKEN_ADDRESS;

                if (!isNativeSourceToken) {
                    const tokenContract = await Contracts.ERC20.attach(sourceToken);
                    await tokenContract.connect(trader).approve(network.address, tradeAmount);
                }

                await network
                    .connect(trader)
                    .tradeBySourceAmount(sourceToken, targetToken, tradeAmount, 1, MAX_UINT256, ZERO_ADDRESS, {
                        value: isNativeSourceToken ? tradeAmount : BigNumber.from(0)
                    });
            }
        };

        const stabilizePoolV2 = async (
            pool: string,
            anchor: Owned,
            converter: StandardPoolConverter,
            tokenWhale: SignerWithAddress
        ) => {
            while (true) {
                const spotRate = {
                    n: await converter.getConnectorBalance(bnt.address),
                    d: await converter.getConnectorBalance(pool)
                };

                const rawAverageRate = await converter.recentAverageRate(pool);
                const smaRate = { n: rawAverageRate[0], d: rawAverageRate[1] };
                const rateMaxDeviation = await liquidityProtectionSettings.averageRateMaxDeviation();

                if (isInRange(smaRate, spotRate, rateMaxDeviation)) {
                    break;
                }

                let sourceToken: string;
                let targetToken: string;
                let trader: SignerWithAddress;
                if (smaRate.n.mul(spotRate.d).gt(spotRate.n.mul(smaRate.d))) {
                    // SMA > SPOT: stabilizing by trading TKN to BNT
                    sourceToken = pool;
                    targetToken = bnt.address;
                    trader = tokenWhale;
                } else {
                    // SPOT > SMA: Stabilizing by trading BNT to TKN
                    sourceToken = bnt.address;
                    targetToken = pool;
                    trader = bntWhale;
                }

                const isNativeSourceToken = sourceToken === NATIVE_TOKEN_ADDRESS;

                const tradeAmount = toWei(1);
                if (!isNativeSourceToken) {
                    const tokenContract = await Contracts.ERC20.attach(sourceToken);
                    await tokenContract.connect(trader).approve(legacyNetwork.address, tradeAmount);
                }

                await legacyNetwork
                    .connect(trader)
                    .convertByPath(
                        [sourceToken, anchor.address, targetToken],
                        tradeAmount,
                        1,
                        ZERO_ADDRESS,
                        ZERO_ADDRESS,
                        0,
                        {
                            value: isNativeSourceToken ? tradeAmount : BigNumber.from(0)
                        }
                    );
            }
        };

        const depositTKN = async (token: string, tokenWhale: SignerWithAddress, depositAmount: BigNumber) => {
            const isNativeToken = token === NATIVE_TOKEN_ADDRESS;

            if (!isNativeToken) {
                const tokenContract = await Contracts.ERC20.attach(token);
                await tokenContract.connect(tokenWhale).approve(network.address, depositAmount);
            }

            await network.connect(tokenWhale).deposit(token, depositAmount, {
                value: isNativeToken ? depositAmount : BigNumber.from(0)
            });
        };

        const depositBNT = async (depositAmount: BigNumber) => {
            await bnt.connect(bntWhale).approve(network.address, depositAmount);
            await network.connect(bntWhale).deposit(bnt.address, depositAmount);
        };

        beforeEach(async () => {
            legacyNetwork = await DeployedContracts.LegacyBancorNetwork.deployed();
            liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
            liquidityProtectionStore = await DeployedContracts.LiquidityProtectionStore.deployed();
            liquidityProtectionSettings = await DeployedContracts.LiquidityProtectionSettings.deployed();

            const { dai, link, usdc, wbtc } = await getNamedAccounts();
            const { daiWhale, linkWhale, usdcWhale, wbtcWhale } = await getNamedSigners();

            pools = {
                [TestPools.ETH]: {
                    token: NATIVE_TOKEN_ADDRESS,
                    whale: ethWhale
                },
                [TestPools.DAI]: {
                    token: dai,
                    whale: daiWhale
                },
                [TestPools.LINK]: {
                    token: link,
                    whale: linkWhale
                },
                [TestPools.USDC]: {
                    token: usdc,
                    whale: usdcWhale,
                    decimals: 6
                },
                [TestPools.WBTC]: {
                    token: wbtc,
                    whale: wbtcWhale,
                    decimals: 8
                }
            };

            bnBNT = await DeployedContracts.bnBNT.deployed();

            await network.connect(daoMultisig).enableDepositing(true);
        });

        describe('deposits', () => {
            it('should perform deposits', async () => {
                for (const { token, whale, decimals } of Object.values(pools)) {
                    const tknDepositAmount = toWei(500, decimals);

                    for (let i = 0; i < 5; i++) {
                        const { liquidity: prevLiquidity } = await poolCollection.poolData(token);

                        await depositTKN(token, whale, tknDepositAmount);

                        const liquidity = await poolCollection.poolLiquidity(token);
                        expect(liquidity.stakedBalance).to.equal(prevLiquidity.stakedBalance.add(tknDepositAmount));
                    }
                }

                // perform a few BNT deposit tests
                const bntDepositAmount = toWei(10);

                for (let i = 0; i < 5; i++) {
                    const prevBNBNTAmount = await bnBNT.balanceOf(bntWhale.address);
                    const prevVBNTTokenAmount = await vbnt.balanceOf(bntWhale.address);
                    const prevTotalSupply = await bnt.totalSupply();

                    await depositBNT(bntDepositAmount);

                    const receivedBNBNTAmount = (await bnBNT.balanceOf(bntWhale.address)).sub(prevBNBNTAmount);

                    expect(receivedBNBNTAmount).to.be.gt(0);
                    expect(await vbnt.balanceOf(bntWhale.address)).to.equal(
                        prevVBNTTokenAmount.add(receivedBNBNTAmount)
                    );

                    expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(bntDepositAmount));
                }
            });
        });

        describe('withdrawals', () => {
            context('with no locking duration', () => {
                beforeEach(async () => {
                    const { daoMultisig } = await getNamedSigners();

                    await pendingWithdrawals.connect(daoMultisig).setLockDuration(0);
                });

                context('with existing deposits', () => {
                    let testPools: Record<string, Pool> = {};

                    beforeEach(async () => {
                        testPools = {
                            ...pools,
                            BNT: {
                                token: bnt.address,
                                whale: bntWhale
                            }
                        };

                        for (const [tokenSymbol, { token, whale, decimals }] of Object.entries(testPools)) {
                            const isNativeToken = tokenSymbol === TestPools.ETH;
                            const isBNT = tokenSymbol === TestPools.BNT;

                            const poolToken = await Contracts.PoolToken.attach(await networkInfo.poolToken(token));
                            const prevPoolTokenAmount = await poolToken.balanceOf(whale.address);
                            const initialVBNTAmount = await vbnt.balanceOf(whale.address);

                            // ensure that there is a position to withdraw
                            const depositAmount = toWei(500, isBNT ? 18 : decimals);

                            if (!isNativeToken) {
                                const tokenContract = await Contracts.ERC20.attach(token);
                                await tokenContract.connect(whale).approve(network.address, depositAmount);
                            }

                            const poolTokenAmount = await network
                                .connect(whale)
                                .callStatic.deposit(token, depositAmount, {
                                    value: isNativeToken ? depositAmount : BigNumber.from(0)
                                });

                            await network.connect(whale).deposit(token, depositAmount, {
                                value: isNativeToken ? depositAmount : BigNumber.from(0)
                            });

                            expect(await poolToken.balanceOf(whale.address)).to.equal(
                                prevPoolTokenAmount.add(poolTokenAmount)
                            );
                            expect(await vbnt.balanceOf(whale.address)).to.equal(
                                isBNT ? initialVBNTAmount.add(poolTokenAmount) : initialVBNTAmount
                            );

                            if (!isBNT) {
                                await stabilizePoolV3(token, decimals, whale);
                            }
                        }
                    });

                    it('should perform withdrawals', async () => {
                        for (const [tokenSymbol, { token, whale }] of Object.entries(testPools)) {
                            const isNativeToken = tokenSymbol === TestPools.ETH;
                            const isBNT = tokenSymbol === TestPools.BNT;

                            const prevVBNTAmount = await vbnt.balanceOf(whale.address);
                            const poolToken = await Contracts.PoolToken.attach(await networkInfo.poolToken(token));
                            const poolTokenAmount = await poolToken.balanceOf(whale.address);

                            await poolToken.connect(whale).approve(network.address, poolTokenAmount);

                            const id = await network
                                .connect(whale)
                                .callStatic.initWithdrawal(poolToken.address, poolTokenAmount);
                            await network.connect(whale).initWithdrawal(poolToken.address, poolTokenAmount);

                            expect(await poolToken.balanceOf(whale.address)).to.equal(0);

                            if (isBNT) {
                                await vbnt.connect(whale).approve(network.address, poolTokenAmount);
                            }

                            const prevTokenAmount = await getBalance({ address: token }, whale);

                            const withdrawnAmount = await network.connect(whale).callStatic.withdraw(id);
                            const res = await network.connect(whale).withdraw(id);

                            let transactionCost = BigNumber.from(0);
                            if (isNativeToken) {
                                transactionCost = await getTransactionCost(res);
                            }

                            expect(await poolToken.balanceOf(whale.address)).to.equal(0);
                            expect(await getBalance({ address: token }, whale)).to.equal(
                                prevTokenAmount.add(withdrawnAmount).sub(transactionCost)
                            );

                            expect(await vbnt.balanceOf(whale.address)).to.equal(
                                isBNT ? prevVBNTAmount.sub(poolTokenAmount) : prevVBNTAmount
                            );
                        }
                    });

                    it('should cancel an initiated withdrawal', async () => {
                        for (const { token, whale } of Object.values(testPools)) {
                            const poolToken = await Contracts.PoolToken.attach(await networkInfo.poolToken(token));
                            const initialPoolTokenAmount = await poolToken.balanceOf(whale.address);

                            await poolToken.connect(whale).approve(network.address, initialPoolTokenAmount);

                            const id = await network
                                .connect(whale)
                                .callStatic.initWithdrawal(poolToken.address, initialPoolTokenAmount);
                            await network.connect(whale).initWithdrawal(poolToken.address, initialPoolTokenAmount);

                            expect(await poolToken.balanceOf(whale.address)).to.equal(0);

                            const receivedPoolTokenAmount = await network
                                .connect(whale)
                                .callStatic.cancelWithdrawal(id);
                            await network.connect(whale).cancelWithdrawal(id);

                            expect(receivedPoolTokenAmount).to.equal(initialPoolTokenAmount);
                            expect(await poolToken.balanceOf(whale.address)).to.equal(receivedPoolTokenAmount);
                        }
                    });
                });
            });
        });

        describe('trades', () => {
            it('should perform trades', async () => {
                for (const [tokenSymbol, { token, whale, decimals }] of Object.entries(pools)) {
                    if (!(await networkInfo.tradingEnabled(token))) {
                        Logger.log(`Skipping disabled pool ${token}...`);

                        continue;
                    }

                    const isNativeToken = tokenSymbol === TestPools.ETH;
                    const tokenWithAddress = { address: token };

                    const tradeAmount = toWei(2500, decimals);

                    for (let i = 0; i < 5; i++) {
                        if (!isNativeToken) {
                            const tokenContract = await Contracts.ERC20.attach(token);
                            await tokenContract.connect(whale).approve(network.address, tradeAmount);
                        }

                        const prevTokenBalance = await getBalance(tokenWithAddress, whale);
                        const prevBNTBalance = await bnt.balanceOf(whale.address);

                        const hop1Params = [
                            token,
                            bnt.address,
                            tradeAmount,
                            1,
                            MAX_UINT256,
                            ZERO_ADDRESS,
                            {
                                value: isNativeToken ? tradeAmount : BigNumber.from(0)
                            }
                        ] as const;
                        const receivedBNTAmount = await network
                            .connect(whale)
                            .callStatic.tradeBySourceAmount(...hop1Params);
                        const res = await network.connect(whale).tradeBySourceAmount(...hop1Params);

                        let transactionCost = BigNumber.from(0);
                        if (isNativeToken) {
                            transactionCost = await getTransactionCost(res);
                        }

                        const newBNTBalance = await bnt.balanceOf(whale.address);

                        expect(await getBalance(tokenWithAddress, whale)).to.equal(
                            prevTokenBalance.sub(tradeAmount).sub(transactionCost)
                        );
                        expect(receivedBNTAmount).to.be.gt(0);
                        expect(newBNTBalance).to.equal(prevBNTBalance.add(receivedBNTAmount));

                        await bnt.connect(whale).approve(network.address, newBNTBalance);

                        const prevTokenBalance2 = await getBalance(tokenWithAddress, whale);

                        const hop2Params = [bnt.address, token, newBNTBalance, 1, MAX_UINT256, ZERO_ADDRESS] as const;
                        const receivedTokenAmount = await network
                            .connect(whale)
                            .callStatic.tradeBySourceAmount(...hop2Params);
                        const res2 = await network.connect(whale).tradeBySourceAmount(...hop2Params);
                        let transactionCost2 = BigNumber.from(0);
                        if (isNativeToken) {
                            transactionCost2 = await getTransactionCost(res2);
                        }

                        expect(receivedTokenAmount).to.be.gt(0);
                        expect(await getBalance(tokenWithAddress, whale)).to.equal(
                            prevTokenBalance2.add(receivedTokenAmount).sub(transactionCost2)
                        );
                        expect(await bnt.balanceOf(whale.address)).to.be.equal(0);
                    }
                }
            });
        });

        describe('portal', () => {
            describe('Uniswap V2-like pools', () => {
                let bancorPortal: BancorPortal;
                let linkWhale: SignerWithAddress;
                let weth: string;
                let link: string;

                before(async () => {
                    ({ linkWhale } = await getNamedSigners());
                    ({ link, weth } = await getNamedAccounts());
                });

                beforeEach(async () => {
                    bancorPortal = await DeployedContracts.BancorPortal.deployed();
                });

                enum PoolType {
                    UniswapV2 = 'UniswapV2',
                    SushiSwap = 'SushiSwap'
                }

                const testUniswapV2Migration = (type: PoolType) => {
                    describe(type, () => {
                        let router: IUniswapV2Router02;
                        let factory: IUniswapV2Factory;
                        let poolToken: IERC20;
                        let poolTokenAmount: BigNumber;

                        let depositedNativeTokenAmount: BigNumber;
                        let depositedLinkAmount: BigNumber;

                        const NATIVE_TOKEN_DESIRED_AMOUNT = toWei(10);

                        beforeEach(async () => {
                            const { uniswapV2Router02, uniswapV2Factory, sushiSwapRouter, sushiSwapFactory } =
                                await getNamedAccounts();

                            await ethWhale.sendTransaction({
                                value: NATIVE_TOKEN_DESIRED_AMOUNT,
                                to: linkWhale.address
                            });

                            /* eslint-disable camelcase */
                            switch (type) {
                                case PoolType.UniswapV2: {
                                    router = await IUniswapV2Router02__factory.connect(
                                        uniswapV2Router02,
                                        linkWhale
                                    ).deployed();

                                    factory = await IUniswapV2Factory__factory.connect(
                                        uniswapV2Factory,
                                        linkWhale
                                    ).deployed();

                                    break;
                                }

                                case PoolType.SushiSwap: {
                                    router = await IUniswapV2Router02__factory.connect(
                                        sushiSwapRouter,
                                        linkWhale
                                    ).deployed();

                                    factory = await IUniswapV2Factory__factory.connect(
                                        sushiSwapFactory,
                                        linkWhale
                                    ).deployed();

                                    break;
                                }

                                default:
                                    throw new Error(`Unsupported type: ${type}`);
                            }
                            /* eslint-enable camelcase */

                            // create an ETH-LINK position
                            const token = await Contracts.ERC20.attach(link);
                            await token.connect(linkWhale).approve(router.address, MAX_UINT256);

                            ({
                                amountETH: depositedNativeTokenAmount,
                                amountToken: depositedLinkAmount,
                                liquidity: poolTokenAmount
                            } = await router
                                .connect(linkWhale)
                                .callStatic.addLiquidityETH(
                                    token.address,
                                    NATIVE_TOKEN_DESIRED_AMOUNT,
                                    1,
                                    1,
                                    linkWhale.address,
                                    MAX_UINT256,
                                    {
                                        value: NATIVE_TOKEN_DESIRED_AMOUNT
                                    }
                                ));

                            await router
                                .connect(linkWhale)
                                .addLiquidityETH(
                                    token.address,
                                    NATIVE_TOKEN_DESIRED_AMOUNT,
                                    1,
                                    1,
                                    linkWhale.address,
                                    MAX_UINT256,
                                    {
                                        value: NATIVE_TOKEN_DESIRED_AMOUNT
                                    }
                                );

                            const poolTokenAddress = await factory.getPair(weth, link);
                            poolToken = await Contracts.ERC20.attach(poolTokenAddress);

                            await poolToken.connect(linkWhale).approve(bancorPortal.address, poolTokenAmount);
                        });

                        it('should perform portal migrations', async () => {
                            const { liquidity: prevLinkLiquidity } = await poolCollection.poolData(link);
                            const { liquidity: prevNativeTokenLiquidity } = await poolCollection.poolData(
                                NATIVE_TOKEN_ADDRESS
                            );

                            switch (type) {
                                case PoolType.UniswapV2: {
                                    await bancorPortal
                                        .connect(linkWhale)
                                        .migrateUniswapV2Position(weth, link, poolTokenAmount);
                                    break;
                                }

                                case PoolType.SushiSwap: {
                                    await bancorPortal
                                        .connect(linkWhale)
                                        .migrateSushiSwapPosition(weth, link, poolTokenAmount);
                                    break;
                                }

                                default:
                                    throw new Error(`Unsupported type: ${type}`);
                            }

                            const { liquidity: newLinkLiquidity } = await poolCollection.poolData(link);

                            expect(newLinkLiquidity.stakedBalance).to.be.almostEqual(
                                prevLinkLiquidity.stakedBalance.add(depositedLinkAmount),
                                {
                                    maxRelativeError: new Decimal('0.0000000000000000001')
                                }
                            );

                            const { liquidity: newNativeTokenLiquidity } = await poolCollection.poolData(
                                NATIVE_TOKEN_ADDRESS
                            );

                            expect(newNativeTokenLiquidity.stakedBalance).to.be.almostEqual(
                                prevNativeTokenLiquidity.stakedBalance.add(depositedNativeTokenAmount),
                                {
                                    maxRelativeError: new Decimal('0.0000000000000000001')
                                }
                            );
                        });
                    });
                };

                for (const type of [PoolType.UniswapV2, PoolType.SushiSwap]) {
                    testUniswapV2Migration(type);
                }
            });
        });
    });
});
