import Contracts, {
    AccessControlEnumerable,
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
    Registry as LegacyRegistry,
    LiquidityProtection,
    LiquidityProtectionStore,
    Owned,
    StakingRewards,
    STANDARD_CONVERTER_TYPE,
    STANDARD_POOL_CONVERTER_WEIGHT,
    TokenGovernance,
    VBNT
} from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { getBalance, getTransactionCost } from '../../test/helpers/Utils';
import { MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import { DeployedContracts, fundAccount, getNamedSigners, isMainnet, runPendingDeployments } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { getNamedAccounts } from 'hardhat';

(isMainnet() ? describe : describe.skip)('network', async () => {
    let network: BancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let bnt: BNT;
    let vbnt: VBNT;
    let bntPool: BNTPool;
    let masterVault: MasterVault;
    let poolCollection: PoolCollection;
    let pendingWithdrawals: PendingWithdrawals;

    beforeEach(async () => {
        await runPendingDeployments();

        network = await DeployedContracts.BancorNetwork.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        bnt = await DeployedContracts.BNT.deployed();
        vbnt = await DeployedContracts.VBNT.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
    });

    describe('roles', () => {
        let networkSettings: NetworkSettings;
        let externalProtectionVault: ExternalProtectionVault;
        let externalRewardsVault: ExternalRewardsVault;
        let poolTokenFactory: PoolTokenFactory;
        let poolMigrator: PoolMigrator;
        let standardRewards: StandardRewards;
        let bancorPortal: BancorPortal;
        let legacyStakingRewards: StakingRewards;
        let liquidityProtection: LiquidityProtection;

        beforeEach(async () => {
            networkSettings = await DeployedContracts.NetworkSettings.deployed();
            externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
            externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
            poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
            poolMigrator = await DeployedContracts.PoolMigrator.deployed();
            poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
            standardRewards = await DeployedContracts.StandardRewards.deployed();
            networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
            bancorPortal = await DeployedContracts.BancorPortal.deployed();
            legacyStakingRewards = await DeployedContracts.StakingRewards.deployed();
            liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
        });

        it('should have the correct set of roles', async () => {
            const { deployer, deployerV2, foundationMultisig, daoMultisig } = await getNamedAccounts();

            // ensure that ownership transfer to the DAO was initiated
            expect(await liquidityProtection.newOwner()).to.equal(daoMultisig);

            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_SUPERVISOR,
                [foundationMultisig]
            );
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                isMainnet() ? [deployerV2] : [deployer]
            );

            const expectedRoles = isMainnet()
                ? [standardRewards.address, bntPool.address, liquidityProtection.address, legacyStakingRewards.address]
                : [standardRewards.address, bntPool.address];
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                expectedRoles
            );

            await expectRoleMembers(
                vbntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_SUPERVISOR,
                [foundationMultisig]
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

            await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
            await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                network.address,
                poolCollection.address
            ]);

            await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [
                daoMultisig,
                network.address
            ]);
            await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
                network.address,
                poolCollection.address
            ]);

            await expectRoleMembers(externalRewardsVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
            await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [standardRewards.address]);

            await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(bntPool, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [poolCollection.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
            await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);

            await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, [liquidityProtection.address]);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER);
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER);

            await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

            await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
        });
    });

    describe('health checks', () => {
        enum TestPools {
            BNT = 'BNT',
            ETH = 'ETH',
            DAI = 'DAI',
            LINK = 'LINK'
        }

        interface Pool {
            token: string;
            whale: SignerWithAddress;
        }

        let pools: Record<string, Pool>;
        let bnBNT: PoolToken;

        const stabilizePool = async (pool: string, sender: SignerWithAddress) => {
            const isNativeToken = pool === NATIVE_TOKEN_ADDRESS;

            // perform a few small trades to stabilize the EMA
            const tradeCount = 10;
            const tradeAmount = toWei(1);
            if (!isNativeToken) {
                const tokenContract = await Contracts.ERC20.attach(pool);
                await tokenContract.connect(sender).approve(network.address, tradeAmount.mul(tradeCount));
            }

            for (let i = 0; i < tradeCount; i++) {
                await network
                    .connect(sender)
                    .tradeBySourceAmount(pool, bnt.address, tradeAmount, 1, MAX_UINT256, ZERO_ADDRESS, {
                        value: isNativeToken ? tradeAmount : BigNumber.from(0)
                    });
            }
        };

        beforeEach(async () => {
            const { dai, link } = await getNamedAccounts();
            const { daoMultisig, ethWhale, daiWhale, linkWhale } = await getNamedSigners();

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
                }
            };

            bnBNT = await DeployedContracts.bnBNT.deployed();

            for (const { token } of Object.values(pools)) {
                await poolCollection.connect(daoMultisig).setDepositLimit(token, MAX_UINT256);
            }
        });

        describe('deposits', () => {
            it('should perform deposits', async () => {
                for (const [tokenSymbol, { token, whale }] of Object.entries(pools)) {
                    await stabilizePool(token, whale);

                    const isNativeToken = tokenSymbol === TestPools.ETH;

                    const depositAmount = toWei(1000);

                    for (let i = 0; i < 5; i++) {
                        const { liquidity: prevLiquidity } = await poolCollection.poolData(token);

                        if (!isNativeToken) {
                            const tokenContract = await Contracts.ERC20.attach(token);
                            await tokenContract.connect(whale).approve(network.address, depositAmount);
                        }

                        await network.connect(whale).deposit(token, depositAmount, {
                            value: isNativeToken ? depositAmount : BigNumber.from(0)
                        });

                        const { liquidity } = await poolCollection.poolData(token);
                        expect(liquidity.stakedBalance).to.equal(prevLiquidity.stakedBalance.add(depositAmount));

                        expect({
                            n: prevLiquidity.bntTradingLiquidity,
                            d: prevLiquidity.baseTokenTradingLiquidity
                        }).to.be.almostEqual(
                            {
                                n: liquidity.bntTradingLiquidity,
                                d: liquidity.baseTokenTradingLiquidity
                            },
                            {
                                maxRelativeError: new Decimal(i === 0 ? '0.01' : '0.0000000000000000001')
                            }
                        );
                    }
                }

                const { bntWhale } = await getNamedSigners();

                // perform a few BNT deposit tests
                const bntAmount = toWei(10);

                for (let i = 0; i < 5; i++) {
                    const prevBNBNTAmount = await getBalance(bnBNT, bntWhale);
                    const prevVBNTTokenAmount = await getBalance(vbnt, bntWhale);
                    const prevTotalSupply = await bnt.totalSupply();

                    await bnt.connect(bntWhale).approve(network.address, bntAmount);
                    await network.connect(bntWhale).deposit(bnt.address, bntAmount);

                    const receivedBNBNTAmount = (await getBalance(bnBNT, bntWhale)).sub(prevBNBNTAmount);

                    expect(receivedBNBNTAmount).to.be.gt(0);
                    expect(await getBalance(vbnt, bntWhale)).to.equal(prevVBNTTokenAmount.add(receivedBNBNTAmount));

                    expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(bntAmount));
                }
            });
        });

        describe('withdrawals', () => {
            it('should perform withdrawals', async () => {
                const { daoMultisig, bntWhale } = await getNamedSigners();

                await pendingWithdrawals.connect(daoMultisig).setLockDuration(0);

                const testPools = {
                    ...pools,
                    BNT: {
                        token: bnt.address,
                        whale: bntWhale
                    }
                };

                for (const [tokenSymbol, { token, whale }] of Object.entries(testPools)) {
                    const isNativeToken = tokenSymbol === TestPools.ETH;
                    if (isNativeToken) {
                        continue;
                    }
                    const isBNT = tokenSymbol === TestPools.BNT;

                    const poolToken = await Contracts.PoolToken.attach(await networkInfo.poolToken(token));
                    const prevPoolTokenAmount = await poolToken.balanceOf(whale.address);
                    const initialVBNTAmount = await vbnt.balanceOf(whale.address);

                    // ensure that there is a position to withdraw
                    const depositAmount = toWei(10);

                    if (!isNativeToken) {
                        const tokenContract = await Contracts.ERC20.attach(token);
                        await tokenContract.connect(whale).approve(network.address, depositAmount);
                    }

                    const poolTokenAmount = await network.connect(whale).callStatic.deposit(token, depositAmount, {
                        value: isNativeToken ? depositAmount : BigNumber.from(0)
                    });

                    await network
                        .connect(whale)
                        .deposit(token, depositAmount, { value: isNativeToken ? depositAmount : BigNumber.from(0) });

                    expect(await poolToken.balanceOf(whale.address)).to.equal(prevPoolTokenAmount.add(poolTokenAmount));
                    expect(await vbnt.balanceOf(whale.address)).to.equal(
                        isBNT ? initialVBNTAmount.add(poolTokenAmount) : initialVBNTAmount
                    );

                    if (!isBNT) {
                        await stabilizePool(token, whale);
                    }

                    // initiate withdrawal
                    const prevTokenAmount = await getBalance({ address: token }, whale);

                    await poolToken.connect(whale).approve(network.address, poolTokenAmount);

                    const id = await network
                        .connect(whale)
                        .callStatic.initWithdrawal(poolToken.address, poolTokenAmount);
                    await network.connect(whale).initWithdrawal(poolToken.address, poolTokenAmount);

                    expect(await poolToken.balanceOf(whale.address)).to.equal(prevPoolTokenAmount);

                    if (isBNT) {
                        await vbnt.connect(whale).approve(network.address, poolTokenAmount);
                    }

                    const withdrawnAmount = await network.connect(whale).callStatic.withdraw(id);
                    await network.connect(whale).withdraw(id);

                    expect(await poolToken.balanceOf(whale.address)).to.equal(prevPoolTokenAmount);
                    expect(await getBalance({ address: token }, whale)).to.equal(prevTokenAmount.add(withdrawnAmount));
                    expect(await vbnt.balanceOf(whale.address)).to.equal(initialVBNTAmount);
                }
            });
        });

        describe('trades', () => {
            it('should perform trades', async () => {
                for (const [tokenSymbol, { token, whale }] of Object.entries(pools)) {
                    const isNativeToken = tokenSymbol === TestPools.ETH;
                    const tokenWithAddress = { address: token };

                    const tradeAmount = toWei(2500);

                    for (let i = 0; i < 5; i++) {
                        if (!isNativeToken) {
                            const tokenContract = await Contracts.ERC20.attach(token);
                            await tokenContract.connect(whale).approve(network.address, tradeAmount);
                        }

                        const prevTokenBalance = await getBalance(tokenWithAddress, whale);
                        const prevBNTBalance = await getBalance(bnt, whale);

                        const res = await network
                            .connect(whale)
                            .tradeBySourceAmount(token, bnt.address, tradeAmount, 1, MAX_UINT256, ZERO_ADDRESS, {
                                value: isNativeToken ? tradeAmount : BigNumber.from(0)
                            });

                        let transactionCost = BigNumber.from(0);
                        if (isNativeToken) {
                            transactionCost = await getTransactionCost(res);
                        }

                        const newBNTBalance = await getBalance(bnt, whale);

                        expect(await getBalance(tokenWithAddress, whale)).to.equal(
                            prevTokenBalance.sub(tradeAmount).sub(transactionCost)
                        );
                        expect(newBNTBalance).to.be.gt(prevBNTBalance);

                        await bnt.connect(whale).approve(network.address, newBNTBalance);

                        const prevTokenBalance2 = await getBalance(tokenWithAddress, whale);

                        await network
                            .connect(whale)
                            .tradeBySourceAmount(bnt.address, token, newBNTBalance, 1, MAX_UINT256, ZERO_ADDRESS);

                        expect(await getBalance(tokenWithAddress, whale)).to.gte(prevTokenBalance2);
                        expect(await getBalance(bnt, whale)).to.be.equal(0);
                    }
                }
            });
        });

        describe('migrations', () => {
            context('from v2', () => {
                let liquidityProtection: LiquidityProtection;
                let liquidityProtectionStore: LiquidityProtectionStore;
                let anchor: Owned;
                let bnTKN: PoolToken;

                let bntWhale: SignerWithAddress;

                before(async () => {
                    ({ bntWhale } = await getNamedSigners());
                });

                beforeEach(async () => {
                    await fundAccount(bntWhale);

                    liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
                    liquidityProtectionStore = await DeployedContracts.LiquidityProtectionStore.deployed();

                    bnTKN = await Contracts.PoolToken.attach(await poolCollection.poolToken(NATIVE_TOKEN_ADDRESS));

                    const contractRegistry = await DeployedContracts.ContractRegistry.deployed();
                    const converterRegistryAddress = await contractRegistry.getAddress(
                        LegacyRegistry.CONVERTER_REGISTRY
                    );
                    const converterRegistry = await LegacyContracts.ConverterRegistry.attach(converterRegistryAddress);

                    const anchorAddress = await converterRegistry.getLiquidityPoolByConfig(
                        STANDARD_CONVERTER_TYPE,
                        [bnt.address, NATIVE_TOKEN_ADDRESS],
                        [STANDARD_POOL_CONVERTER_WEIGHT, STANDARD_POOL_CONVERTER_WEIGHT]
                    );

                    anchor = await LegacyContracts.Owned.attach(anchorAddress);
                });

                it('should migrate positions from V2', async () => {
                    const initialTotalSupply = await bnt.totalSupply();

                    // add some BNT to the V2 ETH-BNT pool
                    const bntAmount = toWei(100);
                    await bnt.connect(bntWhale).approve(liquidityProtection.address, bntAmount);
                    const id1 = await liquidityProtection
                        .connect(bntWhale)
                        .callStatic.addLiquidity(anchor.address, bnt.address, bntAmount);
                    await liquidityProtection.connect(bntWhale).addLiquidity(anchor.address, bnt.address, bntAmount);

                    // add some ETH to the V2 ETH-BNT pool
                    const nativeTokenAmount = toWei(100);
                    const id2 = await liquidityProtection
                        .connect(bntWhale)
                        .callStatic.addLiquidity(anchor.address, NATIVE_TOKEN_ADDRESS, nativeTokenAmount, {
                            value: nativeTokenAmount
                        });
                    await liquidityProtection
                        .connect(bntWhale)
                        .addLiquidity(anchor.address, NATIVE_TOKEN_ADDRESS, nativeTokenAmount, {
                            value: nativeTokenAmount
                        });

                    const ids = [id1, id2].map((i) => i.toNumber());
                    const prevIds = (await liquidityProtectionStore.protectedLiquidityIds(bntWhale.address)).map((i) =>
                        i.toNumber()
                    );
                    expect(prevIds).to.include.members(ids);

                    const nativeToken = { address: NATIVE_TOKEN_ADDRESS };

                    const prevBNTBalance = await bnt.balanceOf(bntWhale.address);
                    const prevTokenBalance = await getBalance(nativeToken, bntWhale);

                    const prevBNBNTAmount = await getBalance(bnBNT, bntWhale);
                    const prevVBNTTokenAmount = await getBalance(vbnt, bntWhale);
                    const prevBNTKNAmount = await getBalance(bnTKN, bntWhale);

                    const prevVaultTokenBalance = await getBalance(nativeToken, masterVault.address);

                    // migration both the BNT and ETH positions
                    const res = await liquidityProtection.connect(bntWhale).migratePositions([
                        {
                            poolToken: anchor.address,
                            reserveToken: bnt.address,
                            positionIds: [id1]
                        },
                        {
                            poolToken: anchor.address,
                            reserveToken: NATIVE_TOKEN_ADDRESS,
                            positionIds: [id2]
                        }
                    ]);

                    const transactionCost = await getTransactionCost(res);

                    const newIds = (await liquidityProtectionStore.protectedLiquidityIds(bntWhale.address)).map((i) =>
                        i.toNumber()
                    );
                    expect(newIds).not.to.include.members(ids);

                    expect(await bnt.balanceOf(bntWhale.address)).to.equal(prevBNTBalance);
                    expect(await getBalance(nativeToken, bntWhale)).to.equal(prevTokenBalance.sub(transactionCost));

                    expect(await getBalance(bnBNT, bntWhale)).to.be.gt(prevBNBNTAmount);
                    expect(await getBalance(vbnt, bntWhale)).to.equal(prevVBNTTokenAmount);
                    expect(await getBalance(bnTKN, bntWhale)).to.be.gt(prevBNTKNAmount);

                    expect(await bnt.totalSupply()).to.be.almostEqual(initialTotalSupply.sub(bntAmount), {
                        maxRelativeError: new Decimal('0.0000000000000000001')
                    });

                    expect(await getBalance(nativeToken, masterVault.address)).to.be.almostEqual(
                        prevVaultTokenBalance.add(nativeTokenAmount),
                        {
                            maxRelativeError: new Decimal('0.0000000000000000001')
                        }
                    );
                });
            });
        });
    });
});
