import Contracts, {
    BancorNetworkInfo,
    ExternalProtectionVault,
    IERC20,
    MasterVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestBNTPool,
    TestERC20Burnable,
    TestFlashLoanRecipient,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolMigrator
} from '../../components/Contracts';
import LegacyContracts, {
    BancorNetworkV1,
    DSToken,
    LiquidityProtectionSettings,
    LiquidityProtectionStats,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore,
    TestCheckpointStore,
    TestLiquidityProtection,
    TestStandardPoolConverter,
    TokenGovernance,
    TokenHolder
} from '../../components/LegacyContracts';
import { TradeAmountAndFeeStructOutput } from '../../typechain-types/TestPoolCollection';
import { MAX_UINT256, PoolType, PPM_RESOLUTION, ZERO_ADDRESS, ZERO_BYTES } from '../../utils/Constants';
import { permitSignature } from '../../utils/Permit';
import { DEFAULT_DECIMALS, NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { fromPPM, toPPM, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import {
    createBurnableToken,
    createPool,
    createPoolCollection,
    createProxy,
    createSystem,
    createTestToken,
    createToken,
    depositToPool,
    initWithdraw,
    PoolSpec,
    setupFundedPool,
    specToString,
    TokenWithAddress,
    upgradeProxy
} from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { createWallet, getBalance, getTransactionCost, transfer } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, ContractTransaction, Signer, utils, Wallet } from 'ethers';
import fs from 'fs';
import { ethers } from 'hardhat';
import { camelCase } from 'lodash';
import { Context } from 'mocha';
import path from 'path';

const { solidityKeccak256, formatBytes32String } = utils;

describe('BancorNetwork', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const FUNDING_LIMIT = toWei(10_000_000);
    const WITHDRAWAL_FEE = toPPM(5);
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const DEPOSIT_LIMIT = toWei(1_000_000_000);
    const CONTEXT_ID = formatBytes32String('CTX');
    const MIN_RETURN_AMOUNT = BigNumber.from(1);
    const MAX_SOURCE_AMOUNT = MAX_UINT256;

    shouldHaveGap('BancorNetwork', '_bntPool');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    const tradeBySourceAmount = async (
        trader: SignerWithAddress,
        sourceToken: TokenWithAddress,
        targetToken: TokenWithAddress,
        amount: BigNumberish,
        minReturnAmount: BigNumberish,
        deadline: BigNumberish,
        beneficiary: string,
        network: TestBancorNetwork
    ) => {
        let value = BigNumber.from(0);
        if (sourceToken.address === NATIVE_TOKEN_ADDRESS) {
            value = BigNumber.from(amount);
        } else {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            await reserveToken.transfer(await trader.getAddress(), amount);
            await reserveToken.connect(trader).approve(network.address, amount);
        }

        return network
            .connect(trader)
            .tradeBySourceAmount(
                sourceToken.address,
                targetToken.address,
                amount,
                minReturnAmount,
                deadline,
                beneficiary,
                {
                    value
                }
            );
    };

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let bntPool: TestBNTPool;
        let poolMigrator: TestPoolMigrator;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let bntPoolToken: PoolToken;

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                bnt,
                bntGovernance,
                vbntGovernance,
                bntPool,
                poolMigrator,
                masterVault,
                externalProtectionVault,
                pendingWithdrawals,
                bntPoolToken
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    ZERO_ADDRESS,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT governance contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    bntGovernance.address,
                    vbntGovernance.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    externalProtectionVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address,
                    bntPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external protection vault contract', async () => {
            const { bntGovernance, vbntGovernance, networkSettings, masterVault, bntPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS,
                    bntPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool token contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to initialize with an invalid BNT pool contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                bntPoolToken.address
            );

            await expect(
                network.initialize(ZERO_ADDRESS, pendingWithdrawals.address, poolMigrator.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to initialize with an invalid pending withdrawals contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                bntPoolToken.address
            );

            await expect(network.initialize(bntPool.address, ZERO_ADDRESS, poolMigrator.address)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to initialize with an invalid pool migrator contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                bntPoolToken.address
            );

            await expect(
                network.initialize(bntPool.address, pendingWithdrawals.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(
                network.initialize(bntPool.address, pendingWithdrawals.address, poolMigrator.address)
            ).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await network.version()).to.equal(2);

            await expectRoles(network, Roles.BancorNetwork);

            await expectRole(network, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer.address]);
            await expectRole(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER, Roles.Upgradeable.ROLE_ADMIN);

            expect(await network.isPaused()).to.be.false;
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
            expect(await network.isPoolValid(bnt.address)).to.be.true;
        });
    });

    describe('upgrade', () => {
        let network: BancorNetworkV1;

        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let bntPool: TestBNTPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolMigrator: TestPoolMigrator;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let bntPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: IERC20;

        beforeEach(async () => {
            ({
                networkSettings,
                bnt,
                bntGovernance,
                vbntGovernance,
                bntPool,
                poolTokenFactory,
                poolMigrator,
                masterVault,
                externalProtectionVault,
                pendingWithdrawals,
                bntPoolToken
            } = await createSystem());

            network = await createProxy(LegacyContracts.BancorNetworkV1, {
                initArgs: [bntPool.address, pendingWithdrawals.address, poolMigrator.address],
                ctorArgs: [
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    bntPoolToken.address
                ]
            });

            await masterVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);
            await masterVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, network.address);

            await externalProtectionVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);
            await externalProtectionVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, network.address);

            await bntPool.grantRole(Roles.Upgradeable.ROLE_ADMIN, network.address);

            poolCollection = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator,
                1
            );

            await network.addPoolCollection(poolCollection.address);
            reserveToken = await createTestToken();
            await networkSettings.addTokenToWhitelist(reserveToken.address);
            await network.createPool(await poolCollection.poolType(), reserveToken.address);
        });

        it('should upgrade and preserve existing settings', async () => {
            const upgradedNetwork = await upgradeProxy(network, Contracts.TestBancorNetwork, {
                ctorArgs: [
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    bntPoolToken.address
                ]
            });

            expect(await upgradedNetwork.bntPool()).to.equal(bntPool.address);
            expect(await upgradedNetwork.pendingWithdrawals()).to.equal(pendingWithdrawals.address);

            expect(await network.poolCollections()).to.include(poolCollection.address);
            expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(poolCollection.address);
            expect(await network.liquidityPools()).to.have.members([reserveToken.address]);
            expect(await network.collectionByPool(reserveToken.address)).to.equal(poolCollection.address);
        });
    });

    describe('pausing/unpausing', () => {
        let network: TestBancorNetwork;

        let sender: SignerWithAddress;
        let emergencyStopper: SignerWithAddress;

        before(async () => {
            [deployer, sender, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network } = await createSystem());

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                const res = await network.connect(sender).pause();

                await expect(res).to.emit(network, 'Paused').withArgs(sender.address);
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await network.connect(emergencyStopper).pause();
                });

                it('should resume the contract', async () => {
                    const res = await network.connect(sender).resume();

                    await expect(res).to.emit(network, 'Unpaused').withArgs(sender.address);

                    expect(await network.isPaused()).to.be.false;
                });
            });
        };

        const testPauseRestricted = () => {
            it('should revert when a non-emergency stopper is attempting to pause', async () => {
                await expect(network.connect(sender).pause()).to.be.revertedWith('AccessDenied');
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await network.connect(emergencyStopper).pause();
                });

                it('should revert when attempting to resume', async () => {
                    await expect(network.connect(sender).resume()).to.be.revertedWith('AccessDenied');
                });
            });
        };

        context('emergency stopper', () => {
            beforeEach(async () => {
                await network.connect(deployer).grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, sender.address);
            });

            testPause();
        });

        context('regular account', () => {
            testPauseRestricted();
        });
    });

    describe('pool collections', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolMigrator: TestPoolMigrator;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;

        let poolType: number;

        beforeEach(async () => {
            ({
                network,
                bnt,
                networkSettings,
                bntPool,
                poolTokenFactory,
                poolCollection,
                poolMigrator,
                masterVault,
                externalProtectionVault
            } = await createSystem());

            poolType = await poolCollection.poolType();
        });

        const verifyPoolCollectionRoles = async (poolCollection: TestPoolCollection, state: boolean) => {
            expect(await bntPool.hasRole(Roles.BNTPool.ROLE_BNT_MANAGER, poolCollection.address)).to.equal(state);
            expect(await bntPool.hasRole(Roles.BNTPool.ROLE_VAULT_MANAGER, poolCollection.address)).to.equal(state);
            expect(await bntPool.hasRole(Roles.BNTPool.ROLE_FUNDING_MANAGER, poolCollection.address)).to.equal(state);
            expect(await masterVault.hasRole(Roles.Vault.ROLE_ASSET_MANAGER, poolCollection.address)).to.equal(state);
            expect(
                await externalProtectionVault.hasRole(Roles.Vault.ROLE_ASSET_MANAGER, poolCollection.address)
            ).to.equal(state);
        };

        describe('adding new pool collection', () => {
            it('should revert when a non-owner attempts to add a new pool collection', async () => {
                await expect(network.connect(nonOwner).addPoolCollection(poolCollection.address)).to.be.revertedWith(
                    'AccessDenied'
                );
            });

            it('should revert when attempting to add an invalid pool collection', async () => {
                await expect(network.connect(nonOwner).addPoolCollection(ZERO_ADDRESS)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            it('should add a new pool collections', async () => {
                expect(await network.poolCollections()).to.be.empty;
                expect(await network.latestPoolCollection(poolType)).to.equal(ZERO_ADDRESS);

                const res = await network.addPoolCollection(poolCollection.address);
                await expect(res).to.emit(network, 'PoolCollectionAdded').withArgs(poolType, poolCollection.address);
                await expect(res)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, ZERO_ADDRESS, poolCollection.address);

                await verifyPoolCollectionRoles(poolCollection, true);

                expect(await network.poolCollections()).to.have.members([poolCollection.address]);
                expect(await network.latestPoolCollection(poolType)).to.equal(poolCollection.address);
            });

            context('with an existing pool collection', () => {
                beforeEach(async () => {
                    await network.addPoolCollection(poolCollection.address);
                });

                it('should revert when attempting to add the same pool collection', async () => {
                    await expect(network.addPoolCollection(poolCollection.address)).to.be.revertedWith('AlreadyExists');
                });

                it('should revert when attempting to add a pool collection with the same version', async () => {
                    const newPoolCollection = await createPoolCollection(
                        network,
                        bnt,
                        networkSettings,
                        masterVault,
                        bntPool,
                        externalProtectionVault,
                        poolTokenFactory,
                        poolMigrator,
                        await poolCollection.version()
                    );

                    await expect(network.addPoolCollection(newPoolCollection.address)).to.be.revertedWith(
                        'AlreadyExists'
                    );
                });

                it('should add a new pool collection with the same type', async () => {
                    expect(await network.poolCollections()).to.have.members([poolCollection.address]);

                    const newPoolCollection = await createPoolCollection(
                        network,
                        bnt,
                        networkSettings,
                        masterVault,
                        bntPool,
                        externalProtectionVault,
                        poolTokenFactory,
                        poolMigrator,
                        (await poolCollection.version()) + 1
                    );
                    const poolType = await newPoolCollection.poolType();

                    const res = await network.addPoolCollection(newPoolCollection.address);
                    await expect(res)
                        .to.emit(network, 'PoolCollectionAdded')
                        .withArgs(poolType, newPoolCollection.address);
                    await expect(res)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, poolCollection.address, newPoolCollection.address);

                    expect(await network.poolCollections()).to.have.members([
                        poolCollection.address,
                        newPoolCollection.address
                    ]);
                });
            });
        });

        describe('removing existing pool collections', () => {
            beforeEach(async () => {
                await network.addPoolCollection(poolCollection.address);
            });

            it('should add another new pool collection with the same type', async () => {
                expect(await network.poolCollections()).to.have.members([poolCollection.address]);

                const newPoolCollection = await createPoolCollection(
                    network,
                    bnt,
                    networkSettings,
                    masterVault,
                    bntPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolMigrator,
                    (await poolCollection.version()) + 1
                );
                const poolType = await newPoolCollection.poolType();

                const res = await network.addPoolCollection(newPoolCollection.address);
                await expect(res).to.emit(network, 'PoolCollectionAdded').withArgs(poolType, newPoolCollection.address);
                await expect(res)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, poolCollection.address, newPoolCollection.address);

                expect(await network.poolCollections()).to.have.members([
                    poolCollection.address,
                    newPoolCollection.address
                ]);
            });

            it('should revert when a attempting to remove a pool with a non-existing alternative pool collection', async () => {
                const newPoolCollection = await createPoolCollection(
                    network,
                    bnt,
                    networkSettings,
                    masterVault,
                    bntPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolMigrator,
                    (await poolCollection.version()) + 1
                );
                await expect(
                    network.removePoolCollection(poolCollection.address, newPoolCollection.address)
                ).to.be.revertedWith('DoesNotExist');
            });

            context('with an exiting alternative pool collection', () => {
                let newPoolCollection: TestPoolCollection;
                let lastCollection: TestPoolCollection;

                beforeEach(async () => {
                    newPoolCollection = await createPoolCollection(
                        network,
                        bnt,
                        networkSettings,
                        masterVault,
                        bntPool,
                        externalProtectionVault,
                        poolTokenFactory,
                        poolMigrator,
                        (await poolCollection.version()) + 1
                    );
                    lastCollection = await createPoolCollection(
                        network,
                        bnt,
                        networkSettings,
                        masterVault,
                        bntPool,
                        externalProtectionVault,

                        poolTokenFactory,
                        poolMigrator,
                        (await newPoolCollection.version()) + 1
                    );

                    await network.addPoolCollection(newPoolCollection.address);
                    await network.addPoolCollection(lastCollection.address);
                });

                it('should revert when a non-owner attempts to remove an existing pool collection', async () => {
                    await expect(
                        network
                            .connect(nonOwner)
                            .removePoolCollection(poolCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when attempting to remove a non-existing pool collection', async () => {
                    await expect(
                        network.removePoolCollection(ZERO_ADDRESS, newPoolCollection.address)
                    ).to.be.revertedWith('InvalidAddress');

                    const otherCollection = await createPoolCollection(
                        network,
                        bnt,
                        networkSettings,
                        masterVault,
                        bntPool,
                        externalProtectionVault,
                        poolTokenFactory,
                        poolMigrator
                    );
                    await expect(
                        network.removePoolCollection(otherCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('DoesNotExist');
                });

                it('should remove an existing pool collection', async () => {
                    expect(await network.poolCollections()).to.have.members([
                        poolCollection.address,
                        newPoolCollection.address,
                        lastCollection.address
                    ]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(lastCollection.address);

                    const res = await network.removePoolCollection(poolCollection.address, newPoolCollection.address);
                    await expect(res)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, poolCollection.address);
                    await expect(res)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, lastCollection.address, newPoolCollection.address);

                    expect(await network.poolCollections()).to.have.members([
                        newPoolCollection.address,
                        lastCollection.address
                    ]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(newPoolCollection.address);

                    await verifyPoolCollectionRoles(poolCollection, false);

                    const res2 = await network.removePoolCollection(newPoolCollection.address, lastCollection.address);
                    await expect(res2)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, newPoolCollection.address);
                    await expect(res2)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, newPoolCollection.address, lastCollection.address);

                    expect(await network.poolCollections()).to.have.members([lastCollection.address]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(lastCollection.address);

                    await verifyPoolCollectionRoles(newPoolCollection, false);

                    const res3 = await network.removePoolCollection(lastCollection.address, ZERO_ADDRESS);
                    await expect(res3)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, lastCollection.address);
                    await expect(res3)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, lastCollection.address, ZERO_ADDRESS);

                    expect(await network.poolCollections()).to.be.empty;
                    expect(await network.latestPoolCollection(poolType)).to.equal(ZERO_ADDRESS);

                    await verifyPoolCollectionRoles(lastCollection, false);
                });

                it('should revert when attempting to remove a pool collection with associated pools', async () => {
                    const reserveToken = await createTestToken();
                    await createPool(reserveToken, network, networkSettings, lastCollection);

                    await expect(
                        network.removePoolCollection(lastCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('NotEmpty');
                });

                // eslint-disable-next-line @typescript-eslint/no-empty-function
                it.skip('should revert when attempting to remove a pool collection with an alternative with a different type', async () => {});
            });
        });

        describe('setting the latest pool collections', () => {
            let newPoolCollection: TestPoolCollection;

            beforeEach(async () => {
                newPoolCollection = await createPoolCollection(
                    network,
                    bnt,
                    networkSettings,
                    masterVault,
                    bntPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolMigrator,
                    (await poolCollection.version()) + 1
                );

                await network.addPoolCollection(newPoolCollection.address);
                await network.addPoolCollection(poolCollection.address);
            });

            it('should revert when a non-owner attempts to set the latest pool collection', async () => {
                await expect(
                    network.connect(nonOwner).setLatestPoolCollection(poolCollection.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to set the latest pool collection to an invalid pool collection', async () => {
                await expect(network.connect(nonOwner).setLatestPoolCollection(ZERO_ADDRESS)).to.be.revertedWith(
                    'InvalidAddress'
                );

                const newPoolCollection2 = await createPoolCollection(
                    network,
                    bnt,
                    networkSettings,
                    masterVault,
                    bntPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolMigrator
                );
                await expect(network.setLatestPoolCollection(newPoolCollection2.address)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should ignore setting to the same latest pool collection', async () => {
                await network.setLatestPoolCollection(newPoolCollection.address);

                const res = await network.setLatestPoolCollection(newPoolCollection.address);
                await expect(res).not.to.emit(network, 'LatestPoolCollectionReplaced');
            });

            it('should set the latest pool collection', async () => {
                expect(await network.latestPoolCollection(poolType)).to.equal(poolCollection.address);

                const res = await network.setLatestPoolCollection(newPoolCollection.address);
                await expect(res)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, poolCollection.address, newPoolCollection.address);

                expect(await network.latestPoolCollection(poolType)).to.equal(newPoolCollection.address);

                const res2 = await network.setLatestPoolCollection(poolCollection.address);
                await expect(res2)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, newPoolCollection.address, poolCollection.address);

                expect(await network.latestPoolCollection(poolType)).to.equal(poolCollection.address);
            });
        });
    });

    describe('create pool', () => {
        let reserveToken: TokenWithAddress;
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let poolCollection: TestPoolCollection;
        let poolType: number;

        const testCreatePool = (tokenData: TokenData) => {
            beforeEach(async () => {
                ({ network, networkSettings, bnt, poolCollection } = await createSystem());

                if (tokenData.isBNT()) {
                    reserveToken = bnt;
                } else {
                    reserveToken = await createToken(tokenData);
                }

                poolType = await poolCollection.poolType();
            });

            it('should revert when attempting to create a pool for an invalid reserve token', async () => {
                await expect(network.createPool(poolType, ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to create a pool for an unsupported type', async () => {
                await expect(network.createPool(12_345, reserveToken.address)).to.be.revertedWith('InvalidType');
            });

            context('with an associated pool collection', () => {
                beforeEach(async () => {
                    await network.addPoolCollection(poolCollection.address);
                });

                it('should revert when a non-owner attempts to create a pool', async () => {
                    await expect(
                        network.connect(nonOwner).createPool(poolType, reserveToken.address)
                    ).to.be.revertedWith('AccessDenied');
                });

                context('with a whitelisted token', () => {
                    beforeEach(async () => {
                        await networkSettings.addTokenToWhitelist(reserveToken.address);
                    });

                    it('should create a pool', async () => {
                        expect(await network.isPoolValid(reserveToken.address)).to.be.false;
                        expect(await network.collectionByPool(reserveToken.address)).to.equal(ZERO_ADDRESS);
                        expect(await network.liquidityPools()).to.be.empty;
                        expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.false;

                        const res = await network.createPool(poolType, reserveToken.address);
                        await expect(res)
                            .to.emit(network, 'PoolAdded')
                            .withArgs(reserveToken.address, poolCollection.address);

                        expect(await network.isPoolValid(reserveToken.address)).to.be.true;
                        expect(await network.collectionByPool(reserveToken.address)).to.equal(poolCollection.address);
                        expect(await network.liquidityPools()).to.have.members([reserveToken.address]);
                        expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.true;
                    });

                    it('should revert when attempting to create a pool for the same reserve token twice', async () => {
                        await network.createPool(poolType, reserveToken.address);
                        await expect(network.createPool(poolType, reserveToken.address)).to.be.revertedWith(
                            'AlreadyExists'
                        );
                    });
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testCreatePool(new TokenData(symbol));
            });
        }

        context(TokenSymbol.BNT, () => {
            beforeEach(async () => {
                ({ network, bnt } = await createSystem());
            });

            it('should revert when attempting to create a pool', async () => {
                await expect(network.createPool(1, bnt.address)).to.be.revertedWith('InvalidToken');
            });
        });
    });

    describe('migrate pool', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolMigrator: TestPoolMigrator;
        let targetPoolCollection: TestPoolCollection;

        const reserveTokenSymbol = [TokenSymbol.TKN, TokenSymbol.ETH, TokenSymbol.TKN];
        let reserveTokenAddresses: string[];

        const INITIAL_LIQUIDITY = toWei(50_000_000);

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        beforeEach(async () => {
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                bntPool,
                masterVault,
                externalProtectionVault,
                pendingWithdrawals,
                poolCollection,
                poolMigrator,
                poolTokenFactory
            } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            reserveTokenAddresses = [];

            for (const symbol of reserveTokenSymbol) {
                const { token } = await setupFundedPool(
                    {
                        tokenData: new TokenData(symbol),
                        balance: INITIAL_LIQUIDITY,
                        requestedLiquidity: INITIAL_LIQUIDITY.mul(1000),
                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                );

                reserveTokenAddresses.push(token.address);
            }

            targetPoolCollection = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator,
                (await poolCollection.version()) + 1
            );

            await network.addPoolCollection(targetPoolCollection.address);
            await network.setLatestPoolCollection(targetPoolCollection.address);

            await network.setTime(await latest());
        });

        it('should revert when attempting to migrate a pool that was already migrated', async () => {
            await network.migratePools(reserveTokenAddresses);

            await expect(network.migratePools(reserveTokenAddresses)).to.be.revertedWith('InvalidPoolCollection');
        });

        it('should revert when attempting to migrate invalid pools', async () => {
            const reserveTokenAddresses2 = [ZERO_ADDRESS, ZERO_ADDRESS, ...reserveTokenAddresses, ZERO_ADDRESS];
            await expect(network.migratePools(reserveTokenAddresses2)).to.be.revertedWith('InvalidPool');
        });

        it('should migrate pools', async () => {
            expect(await poolCollection.poolCount()).to.equal(reserveTokenAddresses.length);
            expect(await targetPoolCollection.poolCount()).to.equal(0);

            for (const reserveTokenAddress of reserveTokenAddresses) {
                expect(await network.collectionByPool(reserveTokenAddress)).to.equal(poolCollection.address);
            }

            await network.migratePools(reserveTokenAddresses);

            expect(await poolCollection.poolCount()).to.equal(0);
            expect(await targetPoolCollection.poolCount()).to.equal(reserveTokenAddresses.length);

            for (const reserveTokenAddress of reserveTokenAddresses) {
                const isNativeToken = reserveTokenAddress === NATIVE_TOKEN_ADDRESS;

                expect(await network.collectionByPool(reserveTokenAddress)).to.equal(targetPoolCollection.address);

                // perform deposit, withdraw, and trade sanity checks
                const token = { address: reserveTokenAddress };
                const pool = await targetPoolCollection.poolData(reserveTokenAddress);
                const poolToken = await Contracts.PoolToken.attach(pool.poolToken);

                const prevPoolTokenBalance = await poolToken.balanceOf(deployer.address);
                await depositToPool(deployer, token, toWei(1_000_000), network);
                expect(await poolToken.balanceOf(deployer.address)).to.be.gte(prevPoolTokenBalance);

                const poolTokenAmount = await toWei(1);
                const { id, creationTime } = await initWithdraw(
                    deployer,
                    network,
                    pendingWithdrawals,
                    poolToken,
                    poolTokenAmount
                );
                expect(await poolToken.balanceOf(deployer.address)).to.be.gte(
                    prevPoolTokenBalance.sub(poolTokenAmount)
                );

                let prevTokenBalance = await getBalance(token, deployer);

                await setTime(creationTime + (await pendingWithdrawals.lockDuration()) + 1);

                await network.withdraw(id);
                await expect(await getBalance(token, deployer)).to.be.gte(prevTokenBalance);

                const tradeAmount = toWei(1);

                let prevBNTBalance = await bnt.balanceOf(deployer.address);
                prevTokenBalance = await getBalance(token, deployer);

                let transactionCost = BigNumber.from(0);
                const res = await tradeBySourceAmount(
                    deployer,
                    token,
                    bnt,
                    tradeAmount,
                    MIN_RETURN_AMOUNT,
                    MAX_UINT256,
                    ZERO_ADDRESS,
                    network
                );

                if (isNativeToken) {
                    transactionCost = await getTransactionCost(res);
                }

                expect(await bnt.balanceOf(deployer.address)).to.be.gte(prevBNTBalance);
                expect(await getBalance(token, deployer)).to.equal(
                    prevTokenBalance.sub(tradeAmount.add(transactionCost))
                );

                prevBNTBalance = await bnt.balanceOf(deployer.address);
                prevTokenBalance = await getBalance(token, deployer);

                transactionCost = BigNumber.from(0);
                const res2 = await tradeBySourceAmount(
                    deployer,
                    bnt,
                    token,
                    tradeAmount,
                    MIN_RETURN_AMOUNT,
                    MAX_UINT256,
                    ZERO_ADDRESS,
                    network
                );

                if (isNativeToken) {
                    transactionCost = await getTransactionCost(res2);
                }

                expect(await getBalance(token, deployer)).to.be.gte(prevTokenBalance.sub(transactionCost));
                expect(await bnt.balanceOf(deployer.address)).to.equal(prevBNTBalance.sub(tradeAmount));
            }
        });
    });

    describe('deposit', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let vbnt: IERC20;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let bntPoolToken: PoolToken;

        let emergencyStopper: SignerWithAddress;

        before(async () => {
            [, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                bnt,
                vbnt,
                bntPool,
                poolCollection,
                masterVault,
                pendingWithdrawals,
                bntPoolToken
            } = await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
        });

        const testDeposits = (tokenData: TokenData) => {
            let poolToken: PoolToken;
            let token: TokenWithAddress;

            const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                .div(BNT_VIRTUAL_BALANCE)
                .mul(2);

            beforeEach(async () => {
                if (tokenData.isBNT()) {
                    token = bnt;

                    poolToken = bntPoolToken;
                } else {
                    token = await createToken(tokenData);

                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
                    await poolCollection.setDepositLimit(token.address, MAX_UINT256);

                    // ensure that the trading is enabled with sufficient funding
                    if (tokenData.isNative()) {
                        await network.deposit(token.address, INITIAL_LIQUIDITY, { value: INITIAL_LIQUIDITY });
                    } else {
                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                        await reserveToken.approve(network.address, INITIAL_LIQUIDITY);

                        await network.deposit(token.address, INITIAL_LIQUIDITY);
                    }

                    await poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);
                }

                await setTime(await latest());
            });

            const setTime = async (time: number) => {
                await network.setTime(time);
                await pendingWithdrawals.setTime(time);
            };

            const verifyDeposit = async (
                provider: Signer | Wallet,
                sender: Signer | Wallet,
                amount: BigNumber,
                deposit: (amount: BigNumber) => Promise<ContractTransaction>
            ) => {
                const providerAddress = await provider.getAddress();
                const senderAddress = await sender.getAddress();

                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevProviderPoolTokenBalance = await poolToken.balanceOf(providerAddress);

                const prevProviderTokenBalance = await getBalance(token, providerAddress);
                const prevSenderTokenBalance = await getBalance(token, senderAddress);
                const prevVaultTokenBalance = await getBalance(token, masterVault.address);

                const prevBNTTotalSupply = await bnt.totalSupply();

                const prevVBNTTotalSupply = await vbnt.totalSupply();
                const prevProviderVBNTBalance = await vbnt.balanceOf(providerAddress);
                const prevSenderVBNTBalance = await vbnt.balanceOf(senderAddress);

                let expectedPoolTokenAmount;
                let transactionCost = BigNumber.from(0);

                if (tokenData.isBNT()) {
                    expectedPoolTokenAmount = amount
                        .mul(await poolToken.totalSupply())
                        .div(await bntPool.stakedBalance());

                    await deposit(amount);

                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);

                    expect(await getBalance(token, masterVault.address)).to.equal(prevVaultTokenBalance);

                    expect(await bnt.totalSupply()).to.equal(prevBNTTotalSupply.sub(amount));

                    expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply.add(expectedPoolTokenAmount));
                    expect(await vbnt.balanceOf(providerAddress)).to.equal(
                        prevProviderVBNTBalance.add(expectedPoolTokenAmount)
                    );
                } else {
                    const prevPoolLiquidity = await poolCollection.poolLiquidity(token.address);

                    if (prevPoolTokenTotalSupply.isZero()) {
                        expectedPoolTokenAmount = amount;
                    } else {
                        expectedPoolTokenAmount = amount
                            .mul(prevPoolTokenTotalSupply)
                            .div(prevPoolLiquidity.stakedBalance);
                    }

                    const res = await deposit(amount);

                    if (tokenData.isNative()) {
                        transactionCost = await getTransactionCost(res);
                    }

                    expect(await poolToken.totalSupply()).to.equal(
                        prevPoolTokenTotalSupply.add(expectedPoolTokenAmount)
                    );

                    expect(await getBalance(token, masterVault.address)).to.equal(prevVaultTokenBalance.add(amount));

                    expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply);
                    expect(await vbnt.balanceOf(providerAddress)).to.equal(prevProviderVBNTBalance);
                }

                expect(await poolToken.balanceOf(providerAddress)).to.equal(
                    prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                );

                if (provider !== sender) {
                    expect(await getBalance(token, providerAddress)).to.equal(prevProviderTokenBalance);

                    expect(await vbnt.balanceOf(senderAddress)).to.equal(prevSenderVBNTBalance);
                }

                expect(await getBalance(token, senderAddress)).to.equal(
                    prevSenderTokenBalance.sub(amount).sub(transactionCost)
                );
            };

            const testDeposit = () => {
                context('regular deposit', () => {
                    enum Method {
                        Deposit,
                        DepositFor
                    }

                    let provider: SignerWithAddress;

                    before(async () => {
                        [, provider] = await ethers.getSigners();
                    });

                    it('should revert when attempting to deposit for an invalid provider', async () => {
                        await expect(network.depositFor(ZERO_ADDRESS, token.address, 1)).to.be.revertedWith(
                            'InvalidAddress'
                        );
                    });

                    for (const method of [Method.Deposit, Method.DepositFor]) {
                        context(`using ${camelCase(Method[method])} method`, () => {
                            let sender: SignerWithAddress;

                            before(async () => {
                                switch (method) {
                                    case Method.Deposit:
                                        sender = provider;

                                        break;

                                    case Method.DepositFor:
                                        sender = deployer;

                                        break;
                                }
                            });

                            interface Overrides {
                                value?: BigNumber;
                                poolAddress?: string;
                            }

                            const deposit = async (amount: BigNumberish, overrides: Overrides = {}) => {
                                let { value, poolAddress = token.address } = overrides;

                                if (!value) {
                                    value = BigNumber.from(0);

                                    // if we aren't overriding which token we want to deposit and it's the native token -
                                    // ensure to add to the transaction
                                    if (poolAddress === token.address && tokenData.isNative()) {
                                        value = BigNumber.from(amount);
                                    }
                                }

                                switch (method) {
                                    case Method.Deposit:
                                        return network.connect(sender).deposit(poolAddress, amount, { value });

                                    case Method.DepositFor:
                                        return network
                                            .connect(sender)
                                            .depositFor(provider.address, poolAddress, amount, { value });
                                }
                            };

                            it('should revert when attempting to deposit an invalid amount', async () => {
                                await expect(deposit(0)).to.be.revertedWith('ZeroValue');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(deposit(1, { poolAddress: ZERO_ADDRESS })).to.be.revertedWith(
                                    'InvalidAddress'
                                );
                            });

                            it('should revert when attempting to deposit into a non-existing pool', async () => {
                                const token2 = await createTestToken();

                                const amount = 1;
                                await token2.transfer(sender.address, amount);
                                await token2.connect(sender).approve(network.address, amount);

                                await expect(deposit(amount, { poolAddress: token2.address })).to.be.revertedWith(
                                    'InvalidToken'
                                );
                            });

                            context('when paused', () => {
                                beforeEach(async () => {
                                    await network.connect(emergencyStopper).pause();
                                });

                                it('should revert when attempting to deposit', async () => {
                                    await expect(deposit(1)).to.be.revertedWith('Pausable: paused');
                                });
                            });

                            const testDepositAmount = (amount: BigNumber) => {
                                const COUNT = 3;

                                const testMultipleDeposits = async () => {
                                    for (let i = 0; i < COUNT; i++) {
                                        await verifyDeposit(provider, sender, amount, deposit);
                                    }
                                };

                                context(`${amount} tokens`, () => {
                                    if (!tokenData.isNative()) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                            await reserveToken.transfer(sender.address, amount.mul(COUNT));
                                        });

                                        it('should revert when attempting to deposit without approving the network', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith(
                                                tokenData.errors().exceedsAllowance
                                            );
                                        });
                                    }

                                    context('with an approval', () => {
                                        if (!tokenData.isNative()) {
                                            beforeEach(async () => {
                                                const reserveToken = await Contracts.TestERC20Token.attach(
                                                    token.address
                                                );
                                                await reserveToken
                                                    .connect(sender)
                                                    .approve(network.address, amount.mul(COUNT));
                                            });
                                        }

                                        if (tokenData.isBNT()) {
                                            context('with requested funding', () => {
                                                beforeEach(async () => {
                                                    const reserveToken = await createTestToken();

                                                    await createPool(
                                                        reserveToken,
                                                        network,
                                                        networkSettings,
                                                        poolCollection
                                                    );
                                                    await networkSettings.setFundingLimit(
                                                        reserveToken.address,
                                                        FUNDING_LIMIT
                                                    );

                                                    await poolCollection.requestFundingT(
                                                        CONTEXT_ID,
                                                        reserveToken.address,
                                                        amount.mul(COUNT)
                                                    );
                                                });

                                                it('should complete multiple deposits', async () => {
                                                    await testMultipleDeposits();
                                                });
                                            });
                                        } else {
                                            it('should complete multiple deposits', async () => {
                                                await testMultipleDeposits();
                                            });

                                            if (tokenData.isNative()) {
                                                it('should revert when attempting to deposit more than what was actually sent', async () => {
                                                    const missingAmount = 1;

                                                    await expect(
                                                        deposit(amount, {
                                                            value: amount.sub(missingAmount)
                                                        })
                                                    ).to.be.revertedWith('EthAmountMismatch');

                                                    await expect(
                                                        deposit(amount, { value: BigNumber.from(0) })
                                                    ).to.be.revertedWith('EthAmountMismatch');
                                                });

                                                it('should refund when attempting to deposit less than what was actually sent', async () => {
                                                    const extraAmount = 100_000;
                                                    const prevSenderBalance = await getBalance(token, sender);

                                                    const res = await deposit(amount, {
                                                        value: amount.add(extraAmount)
                                                    });

                                                    const transactionCost = await getTransactionCost(res);

                                                    expect(await getBalance(token, sender)).equal(
                                                        prevSenderBalance.sub(amount).sub(transactionCost)
                                                    );
                                                });
                                            } else {
                                                it('should revert when attempting to deposit ETH into a non ETH pool', async () => {
                                                    await expect(
                                                        deposit(amount, { value: BigNumber.from(1) })
                                                    ).to.be.revertedWith('EthAmountMismatch');
                                                });
                                            }
                                        }
                                    });
                                });
                            };

                            for (const amount of [toWei(1_000_000)]) {
                                testDepositAmount(BigNumber.from(amount));
                            }
                        });
                    }
                });
            };

            const testDepositPermitted = () => {
                context('permitted deposit', () => {
                    enum Method {
                        DepositPermitted,
                        DepositForPermitted
                    }

                    const DEADLINE = MAX_UINT256;

                    let provider: Wallet;
                    let providerAddress: string;

                    beforeEach(async () => {
                        provider = await createWallet();
                        providerAddress = await provider.getAddress();
                    });

                    it('should revert when attempting to deposit for an invalid provider', async () => {
                        const amount = BigNumber.from(1);
                        const signature = await permitSignature(
                            provider,
                            token.address,
                            network,
                            bnt,
                            amount,
                            DEADLINE
                        );

                        await expect(
                            network.depositForPermitted(
                                ZERO_ADDRESS,
                                token.address,
                                amount,
                                DEADLINE,
                                signature.v,
                                signature.r,
                                signature.s
                            )
                        ).to.be.revertedWith('InvalidAddress');
                    });

                    for (const method of [Method.DepositPermitted, Method.DepositForPermitted]) {
                        context(`using ${camelCase(Method[method])} method`, () => {
                            let sender: Wallet;
                            let senderAddress: string;

                            beforeEach(async () => {
                                switch (method) {
                                    case Method.DepositPermitted:
                                        sender = provider;

                                        break;

                                    case Method.DepositForPermitted:
                                        sender = await createWallet();

                                        break;
                                }

                                senderAddress = await sender.getAddress();
                            });

                            interface Overrides {
                                poolAddress?: string;
                            }

                            const deposit = async (amount: BigNumberish, overrides: Overrides = {}) => {
                                const { poolAddress = token.address } = overrides;

                                const signature = await permitSignature(
                                    sender,
                                    poolAddress,
                                    network,
                                    bnt,
                                    amount,
                                    DEADLINE
                                );

                                switch (method) {
                                    case Method.DepositPermitted:
                                        return network
                                            .connect(sender)
                                            .depositPermitted(
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                signature.v,
                                                signature.r,
                                                signature.s
                                            );

                                    case Method.DepositForPermitted:
                                        return network
                                            .connect(sender)
                                            .depositForPermitted(
                                                providerAddress,
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                signature.v,
                                                signature.r,
                                                signature.s
                                            );
                                }
                            };

                            it('should revert when attempting to deposit an invalid amount', async () => {
                                await expect(deposit(0)).to.be.revertedWith('ZeroValue');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(deposit(1, { poolAddress: ZERO_ADDRESS })).to.be.revertedWith(
                                    'InvalidAddress'
                                );
                            });

                            it('should revert when attempting to deposit into a non-existing pool', async () => {
                                const token2 = await createTestToken();

                                const amount = 1;
                                await token2.transfer(senderAddress, amount);
                                await token2.connect(sender).approve(network.address, amount);

                                await expect(
                                    deposit(amount, {
                                        poolAddress: token2.address
                                    })
                                ).to.be.revertedWith('InvalidToken');
                            });

                            context('when paused', () => {
                                beforeEach(async () => {
                                    await network.connect(emergencyStopper).pause();
                                });

                                it('should revert when attempting to deposit', async () => {
                                    await expect(deposit(1)).to.be.revertedWith('Pausable: paused');
                                });
                            });

                            const testDepositAmount = (amount: BigNumber) => {
                                const COUNT = 3;

                                const testMultipleDeposits = async () => {
                                    for (let i = 0; i < 3; i++) {
                                        await verifyDeposit(provider, sender, amount, deposit);
                                    }
                                };

                                context(`${amount} tokens`, () => {
                                    if (tokenData.isBNT() || tokenData.isNative()) {
                                        it('should revert when attempting to deposit', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith(
                                                tokenData.isNative() ? 'PermitUnsupported' : ''
                                            );
                                        });

                                        return;
                                    }

                                    beforeEach(async () => {
                                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                        await reserveToken.transfer(senderAddress, amount.mul(COUNT));
                                    });

                                    it('should complete multiple deposits', async () => {
                                        await testMultipleDeposits();
                                    });
                                });
                            };

                            for (const amount of [toWei(1_000_000)]) {
                                testDepositAmount(BigNumber.from(amount));
                            }
                        });
                    }
                });
            };

            testDeposit();
            testDepositPermitted();
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testDeposits(new TokenData(symbol));
            });
        }
    });

    describe('withdraw', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let vbnt: IERC20;
        let bntPool: TestBNTPool;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let pendingWithdrawals: TestPendingWithdrawals;
        let bntPoolToken: PoolToken;

        let emergencyStopper: SignerWithAddress;

        before(async () => {
            [, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                vbnt,
                bntPool,
                masterVault,
                poolCollection,
                pendingWithdrawals,
                bntPoolToken
            } = await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);

            await setTime(await latest());
        });

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        it('should revert when attempting to withdraw a non-existing withdrawal request', async () => {
            await expect(network.withdraw(12_345)).to.be.revertedWith('AccessDenied');
        });

        interface Request {
            id: BigNumber;
            poolTokenAmount: BigNumber;
            creationTime: number;
        }

        const testWithdraw = (tokenData: TokenData) => {
            let provider: SignerWithAddress;
            let poolToken: PoolToken;
            let token: TokenWithAddress;
            let requests: Request[];

            const INITIAL_LIQUIDITY = toWei(222_222_222);
            const COUNT = 3;

            before(async () => {
                [, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                if (tokenData.isBNT()) {
                    token = bnt;
                    poolToken = bntPoolToken;

                    const reserveToken = await createTestToken();
                    await createPool(reserveToken, network, networkSettings, poolCollection);
                    await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

                    await poolCollection.requestFundingT(CONTEXT_ID, reserveToken.address, INITIAL_LIQUIDITY);
                } else {
                    token = await createToken(tokenData);
                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);
                    await poolCollection.setDepositLimit(token.address, MAX_UINT256);
                }

                await depositToPool(provider, token, INITIAL_LIQUIDITY, network);

                const totalPoolTokenAmount = await poolToken.balanceOf(provider.address);
                const poolTokenAmount = totalPoolTokenAmount.div(COUNT);

                requests = [];

                for (let i = 0; i < COUNT; i++) {
                    const { id, creationTime } = await initWithdraw(
                        provider,
                        network,
                        pendingWithdrawals,
                        poolToken,
                        poolTokenAmount
                    );

                    requests.push({
                        id,
                        poolTokenAmount,
                        creationTime
                    });
                }

                if (!tokenData.isBNT()) {
                    await poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);
                }
            });

            it('should revert when attempting to withdraw from a different provider', async () => {
                await expect(network.connect(deployer).withdraw(requests[0].id)).to.be.revertedWith('AccessDenied');
            });

            context('after the lock duration', () => {
                const test = async (index: number) => {
                    const request = requests[index];
                    const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                    const prevPoolPoolTokenBalance = await poolToken.balanceOf(bntPool.address);
                    const prevCollectionPoolTokenBalance = await poolToken.balanceOf(poolCollection.address);
                    const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);

                    const prevProviderBNTBalance = await bnt.balanceOf(provider.address);
                    const prevProviderTokenBalance = await getBalance(token, provider.address);

                    const prevVBNTTotalSupply = await vbnt.totalSupply();
                    const prevPoolVBNTBalance = await vbnt.balanceOf(bntPool.address);
                    const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                    let transactionCost = BigNumber.from(0);

                    if (tokenData.isBNT()) {
                        const { totalAmount, baseTokenAmount, bntAmount } = await networkInfo.withdrawalAmounts(
                            bnt.address,
                            request.poolTokenAmount
                        );
                        await network.connect(provider).withdraw(request.id);

                        const currProviderBNTBalance = await bnt.balanceOf(provider.address);
                        expect(totalAmount).to.equal(currProviderBNTBalance.sub(prevProviderBNTBalance));
                        expect(bntAmount).to.equal(currProviderBNTBalance.sub(prevProviderBNTBalance));
                        expect(baseTokenAmount).to.equal(0);

                        expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                        expect(await poolToken.balanceOf(bntPool.address)).to.equal(
                            prevPoolPoolTokenBalance.add(request.poolTokenAmount)
                        );

                        expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply.sub(request.poolTokenAmount));

                        expect(await vbnt.balanceOf(provider.address)).to.equal(
                            prevProviderVBNTBalance.sub(request.poolTokenAmount)
                        );
                    } else {
                        const { totalAmount, baseTokenAmount, bntAmount } = await networkInfo.withdrawalAmounts(
                            token.address,
                            request.poolTokenAmount
                        );
                        const res = await network.connect(provider).withdraw(request.id);

                        if (tokenData.isNative()) {
                            transactionCost = await getTransactionCost(res);
                        }

                        const currProviderBNTBalance = await bnt.balanceOf(provider.address);
                        const currProviderTokenBalance = await getBalance(token, provider.address);
                        expect(currProviderBNTBalance).to.equal(prevProviderBNTBalance);
                        expect(totalAmount).to.equal(
                            currProviderTokenBalance.sub(prevProviderTokenBalance).add(transactionCost.toString())
                        );
                        expect(baseTokenAmount).to.equal(totalAmount);
                        expect(bntAmount).to.equal(0); // currProviderBNTBalance.sub(prevProviderBNTBalance)

                        expect(await poolToken.totalSupply()).to.equal(
                            prevPoolTokenTotalSupply.sub(request.poolTokenAmount)
                        );
                        expect(await poolToken.balanceOf(bntPool.address)).to.equal(prevPoolPoolTokenBalance);

                        expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply);
                        expect(await vbnt.balanceOf(provider.address)).to.equal(prevProviderVBNTBalance);
                    }

                    expect(await poolToken.balanceOf(poolCollection.address)).to.equal(prevCollectionPoolTokenBalance);
                    expect(await poolToken.balanceOf(provider.address)).to.equal(prevProviderPoolTokenBalance);

                    expect(await vbnt.balanceOf(bntPool.address)).to.equal(prevPoolVBNTBalance);

                    // sanity test
                    expect(await getBalance(token, provider.address)).to.be.gte(
                        prevProviderTokenBalance.sub(transactionCost)
                    );
                };

                const testMultipleWithdrawals = async () => {
                    for (let i = 0; i < COUNT; i++) {
                        await test(i);
                    }
                };

                beforeEach(async () => {
                    await setTime(requests[0].creationTime + (await pendingWithdrawals.lockDuration()) + 1);
                });

                if (tokenData.isBNT()) {
                    it('should revert when attempting to withdraw without approving VBNT', async () => {
                        await expect(network.connect(provider).withdraw(requests[0].id)).to.be.revertedWith(
                            new TokenData(TokenSymbol.VBNT).errors().exceedsAllowance
                        );
                    });
                }

                context('with approvals', () => {
                    beforeEach(async () => {
                        if (tokenData.isBNT()) {
                            await vbnt.connect(provider).approve(
                                network.address,
                                requests.reduce((res, r) => res.add(r.poolTokenAmount), BigNumber.from(0))
                            );
                        }
                    });

                    if (tokenData.isBNT()) {
                        it('should revert when attempting to withdraw with an insufficient VBNT amount', async () => {
                            // ensure that there isn't enough VBNT left to process a single withdrawal
                            await vbnt
                                .connect(provider)
                                .transfer(deployer.address, (await vbnt.balanceOf(provider.address)).sub(1));

                            await expect(network.connect(provider).withdraw(requests[0].id)).to.be.revertedWith(
                                new TokenData(TokenSymbol.VBNT).errors().exceedsBalance
                            );
                        });

                        it('should complete multiple withdrawals', async () => {
                            await testMultipleWithdrawals();
                        });
                    } else {
                        context(
                            'when the matched target network liquidity is above the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    const extraLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                                        .div(BNT_VIRTUAL_BALANCE)
                                        .mul(10_000);

                                    await transfer(deployer, token, masterVault, extraLiquidity);

                                    await network.depositToPoolCollectionForT(
                                        poolCollection.address,
                                        CONTEXT_ID,
                                        provider.address,
                                        token.address,
                                        extraLiquidity
                                    );
                                });

                                it('should complete a withdraw', async () => {
                                    await testMultipleWithdrawals();
                                });
                            }
                        );

                        context(
                            'when the matched target network liquidity is below the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                                });

                                it('should complete multiple withdrawals', async () => {
                                    await testMultipleWithdrawals();
                                });
                            }
                        );
                    }
                });
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await network.connect(emergencyStopper).pause();
                });

                it('should revert when attempting to withdraw', async () => {
                    await expect(network.connect(provider).withdraw(requests[0].id)).to.be.revertedWith(
                        'Pausable: paused'
                    );
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testWithdraw(new TokenData(symbol));
            });
        }
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;
        let emergencyStopper: SignerWithAddress;

        before(async () => {
            [, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, bntPool, poolCollection, masterVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec, networkFeePPM: number) => {
            trader = await createWallet();

            ({ token: sourceToken } = await setupFundedPool(
                source,
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupFundedPool(
                target,
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            if (networkFeePPM) {
                await networkSettings.setNetworkFeePPM(networkFeePPM);
            }

            // increase BNT liquidity by the growth factor a few times
            for (let i = 0; i < 5; i++) {
                await depositToPool(deployer, sourceToken, 1, network);
            }

            await network.setTime(await latest());
        };

        interface TradeOverrides {
            value?: BigNumberish;
            limit?: BigNumberish;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const tradeBySourceAmount = async (amount: BigNumberish, overrides: TradeOverrides = {}) => {
            let {
                value,
                limit: minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            value ||= sourceTokenAddress === NATIVE_TOKEN_ADDRESS ? amount : BigNumber.from(0);

            return network
                .connect(trader)
                .tradeBySourceAmount(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary,
                    {
                        value
                    }
                );
        };

        const tradeByTargetAmount = async (amount: BigNumberish, overrides: TradeOverrides = {}) => {
            let {
                value,
                limit: maxSourceAmount,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            // fetch the required source amount if it wasn't provided
            maxSourceAmount ||= await networkInfo.tradeInputByTargetAmount(
                sourceTokenAddress,
                targetTokenAddress,
                amount
            );

            // when providing the target amount, the send value (i.e., the amount to trade) is represented by the
            // maximum source amount
            if (!value) {
                value = BigNumber.from(0);

                if (sourceTokenAddress === NATIVE_TOKEN_ADDRESS) {
                    value = BigNumber.from(maxSourceAmount);
                }
            }

            return network
                .connect(trader)
                .tradeByTargetAmount(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    maxSourceAmount,
                    deadline,
                    beneficiary,
                    {
                        value
                    }
                );
        };

        interface TradePermittedOverrides {
            limit?: BigNumberish;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
            approvedAmount?: BigNumberish;
        }

        const tradeBySourceAmountPermitted = async (amount: BigNumberish, overrides: TradePermittedOverrides = {}) => {
            const {
                limit: minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount = amount
            } = overrides;

            const signature = await permitSignature(trader, sourceTokenAddress, network, bnt, approvedAmount, deadline);

            return network
                .connect(trader)
                .tradeBySourceAmountPermitted(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary,
                    signature.v,
                    signature.r,
                    signature.s
                );
        };

        const tradeByTargetAmountPermitted = async (amount: BigNumberish, overrides: TradePermittedOverrides = {}) => {
            let {
                limit: maxSourceAmount,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount
            } = overrides;

            // fetch the required source amount if it wasn't provided
            maxSourceAmount ||= await networkInfo.tradeInputByTargetAmount(
                sourceTokenAddress,
                targetTokenAddress,
                amount
            );
            approvedAmount ||= maxSourceAmount;

            const signature = await permitSignature(trader, sourceTokenAddress, network, bnt, approvedAmount, deadline);

            return network
                .connect(trader)
                .tradeByTargetAmountPermitted(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    maxSourceAmount,
                    deadline,
                    beneficiary,
                    signature.v,
                    signature.r,
                    signature.s
                );
        };

        const verifyTrade = async (
            trader: Signer | Wallet,
            beneficiaryAddress: string,
            amount: BigNumberish,
            tradeFunc: (
                amount: BigNumberish,
                options: TradeOverrides | TradePermittedOverrides
            ) => Promise<ContractTransaction>
        ) => {
            const isSourceNativeToken = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetNativeToken = targetToken.address === NATIVE_TOKEN_ADDRESS;
            const isSourceBNT = sourceToken.address === bnt.address;
            const isTargetBNT = targetToken.address === bnt.address;

            const bySourceAmount = [tradeBySourceAmount, tradeBySourceAmountPermitted].includes(tradeFunc as any);

            const traderAddress = await trader.getAddress();
            const deadline = MAX_UINT256;
            const beneficiary = beneficiaryAddress !== ZERO_ADDRESS ? beneficiaryAddress : traderAddress;

            const prevTraderSourceTokenAmount = await getBalance(sourceToken, traderAddress);
            const prevVaultSourceTokenAmount = await getBalance(sourceToken, masterVault.address);

            const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiary);
            const prevVaultTargetTokenAmount = await getBalance(targetToken, masterVault.address);

            const prevTraderBNTAmount = await getBalance(bnt, traderAddress);
            const prevBeneficiaryBNTAmount = await getBalance(bnt, beneficiary);
            const prevVaultBNTAmount = await getBalance(bnt, masterVault.address);

            const prevBNTPoolStakedBalance = await bntPool.stakedBalance();

            let hop1!: TradeAmountAndFeeStructOutput;
            let hop2!: TradeAmountAndFeeStructOutput;

            let limit: BigNumber;

            if (bySourceAmount) {
                limit = MIN_RETURN_AMOUNT;

                if (isSourceBNT || isTargetBNT) {
                    hop1 = await network.callStatic.tradeBySourcePoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        targetToken.address,
                        amount,
                        MIN_RETURN_AMOUNT
                    );

                    hop2 = hop1;
                } else {
                    hop1 = await network.callStatic.tradeBySourcePoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        bnt.address,
                        amount,
                        MIN_RETURN_AMOUNT
                    );

                    hop2 = await network.callStatic.tradeBySourcePoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        bnt.address,
                        targetToken.address,
                        hop1.amount,
                        MIN_RETURN_AMOUNT
                    );
                }
            } else {
                if (isSourceBNT || isTargetBNT) {
                    hop2 = await network.callStatic.tradeByTargetPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        targetToken.address,
                        amount,
                        MAX_SOURCE_AMOUNT
                    );

                    hop1 = hop2;
                } else {
                    hop2 = await network.callStatic.tradeByTargetPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        bnt.address,
                        targetToken.address,
                        amount,
                        MAX_SOURCE_AMOUNT
                    );

                    hop1 = await network.callStatic.tradeByTargetPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        sourceToken.address,
                        bnt.address,
                        hop2.amount,
                        MAX_SOURCE_AMOUNT
                    );
                }

                // set the maximum source amount to twice the actually required amount in order to test that only the
                // required amount was debited
                limit = hop1.amount.mul(2);
            }

            let sourceAmount: BigNumber;
            let targetAmount: BigNumber;

            if (bySourceAmount) {
                // when providing the source amount, the input amount represents the source amount we are willing to trade
                sourceAmount = BigNumber.from(amount);
                targetAmount = await networkInfo.tradeOutputBySourceAmount(
                    sourceToken.address,
                    targetToken.address,
                    amount
                );
                expect(targetAmount).to.equal(hop2.amount);
            } else {
                // when providing the target amount, the input amount represents the target amount we are looking to receive
                sourceAmount = await networkInfo.tradeInputByTargetAmount(
                    sourceToken.address,
                    targetToken.address,
                    amount
                );
                targetAmount = BigNumber.from(amount);
                expect(sourceAmount).to.equal(hop1.amount);
            }

            let pendingNetworkFeeAmount = await network.pendingNetworkFeeAmount();
            if (isSourceBNT || isTargetBNT) {
                pendingNetworkFeeAmount = pendingNetworkFeeAmount.add(hop1.networkFeeAmount);
            } else {
                pendingNetworkFeeAmount = pendingNetworkFeeAmount.add(hop1.networkFeeAmount.add(hop2.networkFeeAmount));
            }

            const res = await tradeFunc(amount, {
                limit,
                beneficiary: beneficiaryAddress,
                deadline
            });

            const transactionCost = await getTransactionCost(res);

            const contextId = solidityKeccak256(
                ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint256', 'address'],
                [
                    traderAddress,
                    await network.currentTime(),
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    limit,
                    bySourceAmount,
                    deadline,
                    beneficiary
                ]
            );

            const bntPoolStakedBalance = await bntPool.stakedBalance();

            if (isSourceBNT) {
                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        bnt.address,
                        targetToken.address,
                        sourceAmount,
                        targetAmount,
                        sourceAmount,
                        hop2.tradingFeeAmount,
                        hop2.networkFeeAmount,
                        traderAddress
                    );
            } else if (isTargetBNT) {
                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        bnt.address,
                        sourceAmount,
                        targetAmount,
                        targetAmount,
                        hop2.tradingFeeAmount,
                        hop2.tradingFeeAmount,
                        traderAddress
                    );

                expect(bntPoolStakedBalance).to.equal(
                    prevBNTPoolStakedBalance.add(hop2.tradingFeeAmount.sub(hop2.networkFeeAmount))
                );
            } else {
                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        bnt.address,
                        sourceAmount,
                        // when providing the source amount, the target amount represents how much BNT we have received,
                        // while when providing the source target, it represents how many source tokens we were required
                        // to trade
                        bySourceAmount ? hop1.amount : hop2.amount,
                        bySourceAmount ? hop1.amount : hop2.amount,
                        hop1.tradingFeeAmount,
                        hop1.tradingFeeAmount,
                        traderAddress
                    );

                expect(bntPoolStakedBalance).to.equal(
                    prevBNTPoolStakedBalance.add(hop1.tradingFeeAmount.sub(hop1.networkFeeAmount))
                );

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        bnt.address,
                        targetToken.address,
                        // when providing the source amount, the source amount represents how much BNT we were required
                        // to trade, while when providing the target amount, it represents how many target tokens we
                        // have received by trading BNT for them
                        bySourceAmount ? hop1.amount : hop2.amount,
                        targetAmount,
                        bySourceAmount ? hop1.amount : hop2.amount,
                        hop2.tradingFeeAmount,
                        hop2.networkFeeAmount,
                        traderAddress
                    );
            }

            expect(await network.pendingNetworkFeeAmount()).to.equal(pendingNetworkFeeAmount);

            // ensure that the correct amount was transferred from the trader to the vault
            expect(await getBalance(sourceToken, traderAddress)).to.equal(
                prevTraderSourceTokenAmount.sub(
                    sourceAmount.add(isSourceNativeToken ? transactionCost : BigNumber.from(0))
                )
            );
            expect(await getBalance(sourceToken, masterVault.address)).to.equal(
                prevVaultSourceTokenAmount.add(sourceAmount)
            );

            // ensure that the correct amount was sent back to the trader
            expect(await getBalance(targetToken, beneficiary)).to.equal(
                prevBeneficiaryTargetTokenAmount.add(
                    targetAmount.sub(
                        traderAddress === beneficiary && isTargetNativeToken ? transactionCost : BigNumber.from(0)
                    )
                )
            );
            expect(await getBalance(targetToken, masterVault.address)).to.equal(
                prevVaultTargetTokenAmount.sub(targetAmount)
            );

            // if neither the source nor the target tokens is BNT - ensure that no BNT have left the system
            if (!isSourceBNT && !isTargetBNT) {
                expect(await getBalance(bnt, traderAddress)).to.equal(prevTraderBNTAmount);
                expect(await getBalance(bnt, beneficiary)).to.equal(prevBeneficiaryBNTAmount);
                expect(await getBalance(bnt, masterVault.address)).to.equal(prevVaultBNTAmount);
            }
        };

        const approve = async (amount: BigNumberish, bySourceAmount: boolean) => {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            let sourceAmount;
            if (bySourceAmount) {
                sourceAmount = amount;
            } else {
                sourceAmount = await networkInfo.tradeInputByTargetAmount(
                    sourceToken.address,
                    targetToken.address,
                    amount
                );
            }

            await reserveToken.transfer(await trader.getAddress(), sourceAmount);
            await reserveToken.connect(trader).approve(network.address, sourceAmount);
        };

        const testTradesBasic = (source: PoolSpec, target: PoolSpec, networkFeePPM: number) => {
            const isSourceNativeToken = source.tokenData.isNative();
            const isSourceBNT = source.tokenData.isBNT();

            context(
                `basic trades from ${source.tokenData.symbol()} to ${target.tokenData.symbol()}, network fee=${fromPPM(
                    networkFeePPM
                )}%`,
                () => {
                    const testAmount = BigNumber.from(10_000);

                    beforeEach(async () => {
                        await setupPools(source, target, networkFeePPM);
                    });

                    for (const bySourceAmount of [true, false]) {
                        context(`by providing the ${bySourceAmount ? 'source' : 'target'} amount`, () => {
                            const tradeDirectFunc = bySourceAmount ? tradeBySourceAmount : tradeByTargetAmount;

                            beforeEach(async () => {
                                if (isSourceNativeToken) {
                                    return;
                                }

                                await approve(testAmount, bySourceAmount);
                            });

                            if (isSourceNativeToken) {
                                it('should revert when attempting to trade more than what was actually sent', async () => {
                                    const missingAmount = 1;

                                    await expect(
                                        tradeDirectFunc(testAmount, {
                                            value: testAmount.sub(missingAmount)
                                        })
                                    ).to.be.revertedWith('EthAmountMismatch');

                                    await expect(
                                        tradeDirectFunc(testAmount, { value: BigNumber.from(0) })
                                    ).to.be.revertedWith('EthAmountMismatch');
                                });

                                it('should refund when attempting to trade less than what was actually sent', async () => {
                                    let sourceAmount;
                                    if (bySourceAmount) {
                                        sourceAmount = testAmount;
                                    } else {
                                        sourceAmount = await networkInfo.tradeInputByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            testAmount
                                        );
                                    }

                                    const extraAmount = 100_000;
                                    const prevTraderBalance = await getBalance(sourceToken, trader);

                                    const res = await tradeDirectFunc(testAmount, {
                                        value: sourceAmount.add(extraAmount)
                                    });

                                    const transactionCost = await getTransactionCost(res);

                                    expect(await getBalance(sourceToken, trader)).equal(
                                        prevTraderBalance.sub(sourceAmount).sub(transactionCost)
                                    );
                                });
                            } else {
                                it('should revert when passing ETH with a non ETH trade', async () => {
                                    await expect(tradeDirectFunc(testAmount, { value: 100 })).to.be.revertedWith(
                                        'EthAmountMismatch'
                                    );
                                });
                            }

                            const options = isSourceBNT || isSourceNativeToken ? [false] : [false, true];
                            for (const permitted of options) {
                                context(`${permitted ? 'permitted' : 'direct'} trade`, () => {
                                    const tradeBySourceAmountPermittedFunc = bySourceAmount
                                        ? tradeBySourceAmountPermitted
                                        : tradeByTargetAmountPermitted;
                                    const tradeFunc = permitted ? tradeBySourceAmountPermittedFunc : tradeDirectFunc;

                                    it('should revert when attempting to trade using an invalid source token', async () => {
                                        await expect(
                                            tradeFunc(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                        ).to.be.revertedWith('InvalidAddress');
                                    });

                                    it('should revert when attempting to trade using an invalid target token', async () => {
                                        await expect(
                                            tradeFunc(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                        ).to.be.revertedWith('InvalidAddress');
                                    });

                                    it('should revert when attempting to trade using an invalid amount', async () => {
                                        await expect(tradeFunc(BigNumber.from(0))).to.be.revertedWith('ZeroValue');
                                    });

                                    it('should revert when attempting to trade using an invalid limit', async () => {
                                        await expect(
                                            tradeFunc(testAmount, { limit: BigNumber.from(0) })
                                        ).to.be.revertedWith('ZeroValue');
                                    });

                                    it('should revert when attempting to trade using an expired deadline', async () => {
                                        const deadline = (await latest()) - 1000;

                                        await expect(tradeFunc(testAmount, { deadline })).to.be.revertedWith(
                                            'DeadlineExpired'
                                        );
                                    });

                                    it('should revert when attempting to trade unsupported tokens', async () => {
                                        const reserveToken2 = await createTestToken();

                                        if (!permitted) {
                                            await reserveToken2.transfer(await trader.getAddress(), testAmount);
                                            await reserveToken2.connect(trader).approve(network.address, testAmount);
                                        }

                                        // unknown source token
                                        await expect(
                                            tradeFunc(testAmount, { sourceTokenAddress: reserveToken2.address })
                                        ).to.be.revertedWith('InvalidToken');

                                        // unknown target token
                                        await expect(
                                            tradeFunc(testAmount, { targetTokenAddress: reserveToken2.address })
                                        ).to.be.revertedWith('InvalidToken');
                                    });

                                    it('should revert when attempting to trade using same source and target tokens', async () => {
                                        await expect(
                                            tradeFunc(testAmount, { targetTokenAddress: sourceToken.address })
                                        ).to.be.revertedWith('InvalidTokens');
                                    });

                                    it('should support a custom beneficiary', async () => {
                                        const trader2 = (await ethers.getSigners())[9];

                                        await verifyTrade(trader, trader2.address, testAmount, tradeFunc);
                                    });

                                    if (!isSourceNativeToken) {
                                        context('with an insufficient approval', () => {
                                            it('should revert when attempting to trade', async () => {
                                                const missingAmount = 10;

                                                let sourceAmount;

                                                if (bySourceAmount) {
                                                    sourceAmount = testAmount;
                                                } else {
                                                    sourceAmount = await networkInfo.tradeInputByTargetAmount(
                                                        sourceToken.address,
                                                        targetToken.address,
                                                        testAmount
                                                    );
                                                }

                                                if (permitted) {
                                                    // perform a permitted trade while signing a permit over an amount lower
                                                    // than the required amount
                                                    await expect(
                                                        tradeBySourceAmountPermittedFunc(testAmount, {
                                                            approvedAmount: sourceAmount.sub(missingAmount)
                                                        })
                                                    ).to.be.revertedWith('ERC20Permit: invalid signature');
                                                } else {
                                                    // reduce the approved amount and perform a trade by providing the source
                                                    // amount
                                                    const reserveToken = await Contracts.TestERC20Token.attach(
                                                        sourceToken.address
                                                    );
                                                    await reserveToken.connect(trader).approve(network.address, 0);
                                                    await reserveToken
                                                        .connect(trader)
                                                        .approve(network.address, sourceAmount.sub(missingAmount));

                                                    await expect(tradeFunc(testAmount)).to.be.revertedWith(
                                                        source.tokenData.errors().exceedsAllowance
                                                    );
                                                }
                                            });
                                        });
                                    }

                                    context('when paused', () => {
                                        beforeEach(async () => {
                                            await network.connect(emergencyStopper).pause();
                                        });

                                        it('should revert when attempting to trade', async () => {
                                            await expect(tradeFunc(testAmount)).to.be.revertedWith('Pausable: paused');
                                        });
                                    });
                                });
                            }
                        });
                    }
                }
            );

            // perform permitted trades suite over a fixed input
            testPermittedTrades(source, target, toPPM(20), toWei(1000));
        };

        const testTrades = (source: PoolSpec, target: PoolSpec, networkFeePPM: number, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNative();

            context(
                `trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}, network fee=${fromPPM(
                    networkFeePPM
                )}%`,
                () => {
                    beforeEach(async () => {
                        await setupPools(source, target, networkFeePPM);
                    });

                    for (const bySourceAmount of [true, false]) {
                        context(`by providing the ${bySourceAmount ? 'source' : 'target'} amount`, () => {
                            const tradeFunc = bySourceAmount ? tradeBySourceAmount : tradeByTargetAmount;

                            const TRADES_COUNT = 2;

                            it('should complete multiple trades', async () => {
                                const currentBlockNumber = await poolCollection.currentBlockNumber();

                                for (let i = 0; i < TRADES_COUNT; i++) {
                                    if (!isSourceNativeToken) {
                                        await approve(amount, bySourceAmount);
                                    }

                                    await verifyTrade(trader, ZERO_ADDRESS, amount, tradeFunc);
                                    await poolCollection.setBlockNumber(currentBlockNumber + i + 1);
                                }
                            });
                        });
                    }
                }
            );
        };

        const testPermittedTrades = (source: PoolSpec, target: PoolSpec, networkFeePPM: number, amount: BigNumber) => {
            const isSourceNativeToken = source.tokenData.isNative();
            const isSourceBNT = source.tokenData.isBNT();

            context(
                `permitted trade ${amount} tokens from ${specToString(source)} to ${specToString(
                    target
                )}, network fee=${fromPPM(networkFeePPM)}%`,
                () => {
                    beforeEach(async () => {
                        await setupPools(source, target, networkFeePPM);
                    });

                    for (const bySourceAmount of [true, false]) {
                        context(`by providing the ${bySourceAmount ? 'source' : 'target'} amount`, () => {
                            const tradeFunc = bySourceAmount
                                ? tradeBySourceAmountPermitted
                                : tradeByTargetAmountPermitted;

                            beforeEach(async () => {
                                if (!isSourceNativeToken) {
                                    await approve(amount, bySourceAmount);
                                }
                            });

                            if (isSourceNativeToken || isSourceBNT) {
                                it('should revert when attempting a permitted trade', async () => {
                                    await expect(tradeFunc(amount)).to.be.revertedWith(
                                        isSourceNativeToken ? 'PermitUnsupported' : ''
                                    );
                                });
                            } else {
                                it('should complete a permitted trade', async () => {
                                    await verifyTrade(trader, ZERO_ADDRESS, amount, tradeFunc);
                                });
                            }
                        });
                    }
                }
            );
        };

        for (const [sourceSymbol, targetSymbol] of [
            [TokenSymbol.TKN, TokenSymbol.BNT],
            [TokenSymbol.TKN, TokenSymbol.ETH],
            [TokenSymbol.TKN1, TokenSymbol.TKN2],
            [TokenSymbol.BNT, TokenSymbol.ETH],
            [TokenSymbol.BNT, TokenSymbol.TKN],
            [TokenSymbol.ETH, TokenSymbol.BNT],
            [TokenSymbol.ETH, TokenSymbol.TKN]
        ]) {
            const sourceTokenData = new TokenData(sourceSymbol);
            const targetTokenData = new TokenData(targetSymbol);

            // perform a basic/sanity suite over a fixed input
            testTradesBasic(
                {
                    tokenData: sourceTokenData,
                    balance: toWei(1_000_000),
                    requestedLiquidity: toWei(1_000_000).mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                {
                    tokenData: targetTokenData,
                    balance: toWei(5_000_000),
                    requestedLiquidity: toWei(5_000_000).mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                0
            );

            for (const sourceBalance of [toWei(1_000_000)]) {
                for (const targetBalance of [toWei(100_000_000)]) {
                    for (const amount of [toWei(1000)]) {
                        for (const tradingFeePercent of [5]) {
                            for (const networkFeePercent of [20]) {
                                // if either the source or the target token is BNT - only test fee in one of the
                                // directions
                                if (sourceTokenData.isBNT() || targetTokenData.isBNT()) {
                                    testTrades(
                                        {
                                            tokenData: new TokenData(sourceSymbol),
                                            balance: sourceBalance,
                                            requestedLiquidity: sourceBalance.mul(1000),
                                            tradingFeePPM: sourceTokenData.isBNT()
                                                ? undefined
                                                : toPPM(tradingFeePercent),
                                            bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                            baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                        },
                                        {
                                            tokenData: new TokenData(targetSymbol),
                                            balance: targetBalance,
                                            requestedLiquidity: targetBalance.mul(1000),
                                            tradingFeePPM: targetTokenData.isBNT()
                                                ? undefined
                                                : toPPM(tradingFeePercent),
                                            bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                            baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                        },
                                        toPPM(networkFeePercent),
                                        BigNumber.from(amount)
                                    );
                                } else {
                                    for (const tradingFeePercent2 of [10]) {
                                        testTrades(
                                            {
                                                tokenData: new TokenData(sourceSymbol),
                                                balance: sourceBalance,
                                                requestedLiquidity: sourceBalance.mul(1000),
                                                tradingFeePPM: toPPM(tradingFeePercent),
                                                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                            },
                                            {
                                                tokenData: new TokenData(targetSymbol),
                                                balance: targetBalance,
                                                requestedLiquidity: targetBalance.mul(1000),
                                                tradingFeePPM: toPPM(tradingFeePercent2),
                                                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                                            },
                                            toPPM(networkFeePercent),
                                            BigNumber.from(amount)
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    describe('flash-loans', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;

        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;
        let emergencyStopper: SignerWithAddress;

        before(async () => {
            [, emergencyStopper] = await ethers.getSigners();
        });

        const BALANCE = toWei(100_000_000);
        const LOAN_AMOUNT = toWei(123_456);

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, poolCollection, masterVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);

            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
        });

        describe('basic tests', () => {
            beforeEach(async () => {
                ({ token } = await setupFundedPool(
                    {
                        tokenData: new TokenData(TokenSymbol.TKN),
                        balance: BALANCE,
                        requestedLiquidity: BALANCE.mul(1000),
                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                ));
            });

            it('should revert when attempting to request a flash-loan of an invalid token', async () => {
                await expect(
                    network.flashLoan(ZERO_ADDRESS, LOAN_AMOUNT, recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to request a flash-loan of a non-whitelisted token', async () => {
                const reserveToken = await createTestToken();
                await expect(
                    network.flashLoan(reserveToken.address, LOAN_AMOUNT, recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('NotWhitelisted');
            });

            it('should revert when attempting to request a flash-loan of an invalid amount', async () => {
                await expect(
                    network.flashLoan(token.address, BigNumber.from(0), recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('ZeroValue');
            });

            it('should revert when attempting to request a flash-loan for an invalid recipient', async () => {
                await expect(
                    network.flashLoan(token.address, LOAN_AMOUNT, ZERO_ADDRESS, ZERO_BYTES)
                ).to.be.revertedWith('InvalidAddress');
            });

            context('reentering', () => {
                beforeEach(async () => {
                    await recipient.setReenter(true);
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(
                        network.flashLoan(token.address, LOAN_AMOUNT, recipient.address, ZERO_BYTES)
                    ).to.be.revertedWith('ReentrancyGuard: reentrant call');
                });
            });

            it('should revert when attempting to request a flash-loan of more than the pool has', async () => {
                await expect(
                    network.flashLoan(token.address, BALANCE.add(1), recipient.address, ZERO_BYTES)
                ).to.be.revertedWith(new TokenData(TokenSymbol.TKN).errors().exceedsBalance);
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await network.connect(emergencyStopper).pause();
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(network.flashLoan(token.address, 1, recipient.address, ZERO_BYTES)).to.be.revertedWith(
                        'Pausable: paused'
                    );
                });
            });
        });

        const testFlashLoan = (tokenData: TokenData, flashLoanFeePPM: number) => {
            const FEE_AMOUNT = LOAN_AMOUNT.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                ({ token } = await setupFundedPool(
                    {
                        tokenData,
                        balance: BALANCE,
                        requestedLiquidity: BALANCE.mul(1000),
                        bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                        baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                    },
                    deployer,
                    network,
                    networkInfo,
                    networkSettings,
                    poolCollection
                ));

                await networkSettings.setFlashLoanFeePPM(token.address, flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, FEE_AMOUNT);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const prevVaultBalance = await getBalance(token, masterVault.address);
                const prevBNTBalance = await getBalance(token, network.address);

                const data = '0x1234';

                const res = network.flashLoan(token.address, LOAN_AMOUNT, recipient.address, data);

                await expect(res)
                    .to.emit(network, 'FlashLoanCompleted')
                    .withArgs(token.address, deployer.address, LOAN_AMOUNT, FEE_AMOUNT);

                const callbackData = await recipient.callbackData();
                expect(callbackData.caller).to.equal(deployer.address);
                expect(callbackData.token).to.equal(token.address);
                expect(callbackData.amount).to.equal(LOAN_AMOUNT);
                expect(callbackData.feeAmount).to.equal(FEE_AMOUNT);
                expect(callbackData.data).to.equal(data);
                expect(callbackData.receivedAmount).to.equal(LOAN_AMOUNT);

                expect(await getBalance(token, masterVault.address)).to.be.gte(prevVaultBalance.add(FEE_AMOUNT));
                expect(await getBalance(token, network.address)).to.equal(prevBNTBalance);
            };

            context('not repaying the original amount', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(LOAN_AMOUNT.sub(1));
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(
                        network.flashLoan(token.address, LOAN_AMOUNT, recipient.address, ZERO_BYTES)
                    ).to.be.revertedWith('InsufficientFlashLoanReturn');
                });
            });

            if (flashLoanFeePPM > 0) {
                context('not repaying the fee', () => {
                    beforeEach(async () => {
                        await recipient.setAmountToReturn(LOAN_AMOUNT);
                    });

                    it('should revert when attempting to request a flash-loan', async () => {
                        await expect(
                            network.flashLoan(token.address, LOAN_AMOUNT, recipient.address, ZERO_BYTES)
                        ).to.be.revertedWith('InsufficientFlashLoanReturn');
                    });
                });
            }

            context('repaying more than required', () => {
                beforeEach(async () => {
                    const extraReturn = toWei(12_345);

                    await transfer(deployer, token, recipient.address, extraReturn);
                    await recipient.snapshot(token.address);

                    await recipient.setAmountToReturn(LOAN_AMOUNT.add(FEE_AMOUNT).add(extraReturn));
                });

                it('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });

            context('returning just about right', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(LOAN_AMOUNT.add(FEE_AMOUNT));
                });

                it('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            for (const flashLoanFee of [0, 2.5]) {
                context(`${symbol} with fee=${flashLoanFee}%`, () => {
                    testFlashLoan(new TokenData(symbol), toPPM(flashLoanFee));
                });
            }
        }
    });

    describe('migrate liquidity', () => {
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let vbnt: IERC20;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;

        let emergencyStopper: SignerWithAddress;

        before(async () => {
            [, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ bntGovernance, vbntGovernance, network, networkSettings, bnt, vbnt, poolCollection, masterVault } =
                await createSystem());

            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network.grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
        });

        const testLiquidityMigration = (
            totalSupply: BigNumber,
            reserve1Amount: BigNumber,
            reserve2Amount: BigNumber,
            maxRelativeError: Decimal,
            maxOffset: { negative: number; positive: number }
        ) => {
            let now: number;
            let checkpointStore: TestCheckpointStore;
            let liquidityProtectionSettings: LiquidityProtectionSettings;
            let liquidityProtectionStore: LiquidityProtectionStore;
            let liquidityProtectionStats: LiquidityProtectionStats;
            let liquidityProtectionSystemStore: LiquidityProtectionSystemStore;
            let liquidityProtectionWallet: TokenHolder;
            let liquidityProtection: TestLiquidityProtection;
            let converter: TestStandardPoolConverter;
            let poolToken: DSToken;
            let baseToken: IERC20;
            let owner: SignerWithAddress;
            let provider: SignerWithAddress;

            const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                .div(BNT_VIRTUAL_BALANCE)
                .mul(2);

            const expectInRange = (x: BigNumber, y: BigNumber) => {
                expect(x).to.gte(y.sub(maxOffset.negative));
                expect(x).to.lte(y.add(maxOffset.positive));
            };

            const addProtectedLiquidity = async (
                poolToken: DSToken,
                reserveToken: IERC20,
                isNativeToken: boolean,
                amount: BigNumber,
                from: SignerWithAddress
            ) => {
                let value = BigNumber.from(0);
                if (isNativeToken) {
                    value = amount;
                } else {
                    await reserveToken.connect(from).approve(liquidityProtection.address, amount);
                }

                return liquidityProtection
                    .connect(from)
                    .addLiquidity(poolToken.address, reserveToken.address, amount, { value });
            };

            const getProtection = async (protectionId: BigNumber) => {
                const protection = await liquidityProtectionStore.protectedLiquidity(protectionId);
                return {
                    provider: protection[0],
                    poolToken: protection[1],
                    reserveToken: protection[2],
                    poolAmount: protection[3],
                    reserveAmount: protection[4],
                    reserveRateN: protection[5],
                    reserveRateD: protection[6],
                    timestamp: protection[7]
                };
            };

            const getPoolStats = async (
                poolToken: TokenWithAddress,
                reserveToken: TokenWithAddress,
                isNativeToken: boolean
            ) => {
                const poolTokenAddress = poolToken.address;
                const reserveTokenAddress = isNativeToken ? NATIVE_TOKEN_ADDRESS : reserveToken.address;
                return {
                    totalPoolAmount: await liquidityProtectionStats.totalPoolAmount(poolTokenAddress),
                    totalReserveAmount: await liquidityProtectionStats.totalReserveAmount(
                        poolTokenAddress,
                        reserveTokenAddress
                    )
                };
            };

            const getProviderStats = async (
                provider: SignerWithAddress,
                poolToken: TokenWithAddress,
                reserveToken: TokenWithAddress,
                isNativeToken: boolean
            ) => {
                const poolTokenAddress = poolToken.address;
                const reserveTokenAddress = isNativeToken ? NATIVE_TOKEN_ADDRESS : reserveToken.address;
                return {
                    totalProviderAmount: await liquidityProtectionStats.totalProviderAmount(
                        provider.address,
                        poolTokenAddress,
                        reserveTokenAddress
                    ),
                    providerPools: await liquidityProtectionStats.providerPools(provider.address)
                };
            };

            const initLegacySystem = async (isNativeToken: boolean) => {
                [owner, provider] = await ethers.getSigners();

                baseToken = (await createToken(
                    new TokenData(isNativeToken ? TokenSymbol.ETH : TokenSymbol.TKN)
                )) as IERC20;

                ({
                    checkpointStore,
                    liquidityProtectionStore,
                    liquidityProtectionStats,
                    liquidityProtectionSystemStore,
                    liquidityProtectionWallet,
                    liquidityProtectionSettings,
                    liquidityProtection,
                    poolToken,
                    converter
                } = await createLegacySystem(
                    owner,
                    network,
                    masterVault,
                    bnt,
                    bntGovernance,
                    vbntGovernance,
                    baseToken
                ));

                await bntGovernance.mint(owner.address, totalSupply);

                await liquidityProtectionSettings.setMinNetworkTokenLiquidityForMinting(100);
                await liquidityProtectionSettings.setMinNetworkCompensation(3);

                await network.grantRole(Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, liquidityProtection.address);
                await bntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);
                await vbntGovernance.grantRole(Roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);

                await createPool(baseToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(baseToken.address, FUNDING_LIMIT);
                await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);

                // ensure that the trading is enabled with sufficient funding
                if (isNativeToken) {
                    await network.deposit(baseToken.address, INITIAL_LIQUIDITY, { value: INITIAL_LIQUIDITY });
                } else {
                    await baseToken.approve(network.address, INITIAL_LIQUIDITY);

                    await network.deposit(baseToken.address, INITIAL_LIQUIDITY);
                }

                await poolCollection.enableTrading(baseToken.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);

                await bnt.approve(converter.address, reserve2Amount);

                let value = BigNumber.from(0);
                if (isNativeToken) {
                    value = reserve1Amount;
                } else {
                    await baseToken.approve(converter.address, reserve1Amount);
                }

                await converter.addLiquidity([baseToken.address, bnt.address], [reserve1Amount, reserve2Amount], 1, {
                    value
                });

                await liquidityProtectionSettings.addPoolToWhitelist(poolToken.address);

                now = await latest();
                await converter.setTime(now);
                await checkpointStore.setTime(now);
                await liquidityProtection.setTime(now);
            };

            for (const tokenSymbol of [TokenSymbol.TKN, TokenSymbol.ETH]) {
                const isNativeToken = tokenSymbol === TokenSymbol.ETH;
                describe(tokenSymbol, () => {
                    beforeEach(async () => {
                        await initLegacySystem(isNativeToken);

                        await addProtectedLiquidity(poolToken, baseToken, isNativeToken, BigNumber.from(1000), owner);
                    });

                    it('verifies that the funds-migrated event is emitted correctly', async () => {
                        const amount = 1000;
                        const availableAmount = 2000;
                        const originalAmount = 4500;
                        const value = isNativeToken ? availableAmount : 0;

                        const contextId = solidityKeccak256(
                            ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
                            [
                                deployer.address,
                                await network.currentTime(),
                                baseToken.address,
                                deployer.address,
                                amount,
                                availableAmount,
                                originalAmount
                            ]
                        );

                        await network.grantRole(Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, deployer.address);
                        await bnt.approve(network.address, MAX_UINT256);
                        await poolToken.approve(network.address, MAX_UINT256);
                        if (!isNativeToken) {
                            await baseToken.approve(network.address, MAX_UINT256);
                        }

                        const res = await network.migrateLiquidity(
                            baseToken.address,
                            deployer.address,
                            amount,
                            availableAmount,
                            originalAmount,
                            { value }
                        );

                        await expect(res)
                            .to.emit(network, 'FundsMigrated')
                            .withArgs(
                                contextId,
                                baseToken.address,
                                deployer.address,
                                amount,
                                availableAmount,
                                originalAmount
                            );
                    });

                    it('verifies that the caller cannot migrate a position more than once in the same transaction', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                        await liquidityProtection.setTime(now + duration.seconds(1));
                        await expect(
                            liquidityProtection.migratePositions([protectionId, protectionId])
                        ).to.be.revertedWith('ERR_ACCESS_DENIED');
                    });

                    it('verifies that the caller cannot migrate a position more than once in different transactions', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                        await liquidityProtection.setTime(now + duration.seconds(1));
                        await liquidityProtection.migratePositions([protectionId]);
                        await expect(liquidityProtection.migratePositions([protectionId])).to.be.revertedWith(
                            'ERR_ACCESS_DENIED'
                        );
                    });

                    it('verifies that the caller can migrate positions', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                        const protection = await getProtection(protectionId);

                        const prevPoolStats = await getPoolStats(poolToken, baseToken, isNativeToken);
                        const prevProviderStats = await getProviderStats(owner, poolToken, baseToken, isNativeToken);

                        const prevSystemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);

                        const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const prevVaultBNTBalance = await getBalance(bnt, masterVault.address);

                        await liquidityProtection.setTime(now + duration.seconds(1));

                        const prevWalletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);
                        const prevBalance = await getBalance(baseToken, owner.address);
                        const prevGovBalance = await vbnt.balanceOf(owner.address);

                        const res = await liquidityProtection.migratePositions([protectionId]);
                        const transactionCost = isNativeToken ? await getTransactionCost(res) : BigNumber.from(0);

                        // verify event
                        await expect(res).to.emit(network, 'FundsMigrated');

                        // verify protected liquidities
                        expect(await liquidityProtectionStore.protectedLiquidityIds(owner.address)).to.be.empty;

                        // verify stats
                        const poolStats = await getPoolStats(poolToken, baseToken, isNativeToken);
                        expect(poolStats.totalPoolAmount).to.equal(
                            prevPoolStats.totalPoolAmount.sub(protection.poolAmount)
                        );
                        expect(poolStats.totalReserveAmount).to.equal(
                            prevPoolStats.totalReserveAmount.sub(protection.reserveAmount)
                        );

                        const providerStats = await getProviderStats(owner, poolToken, baseToken, isNativeToken);
                        expect(providerStats.totalProviderAmount).to.equal(
                            prevProviderStats.totalProviderAmount.sub(protection.reserveAmount)
                        );
                        expect(providerStats.providerPools).to.deep.equal([poolToken.address]);

                        // verify balances
                        const systemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                        expectInRange(systemBalance, prevSystemBalance.sub(protection.poolAmount));

                        const vaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const vaultBNTBalance = await getBalance(bnt, masterVault.address);
                        expectInRange(vaultBaseBalance, prevVaultBaseBalance.add(protection.reserveAmount));
                        expectInRange(vaultBNTBalance, prevVaultBNTBalance.add(protection.reserveAmount.div(2)));

                        const walletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);

                        // double since system balance was also liquidated
                        const delta = protection.poolAmount.mul(2);
                        expectInRange(walletBalance, prevWalletBalance.sub(delta));

                        const balance = await getBalance(baseToken, owner.address);
                        expect(balance).to.equal(prevBalance.sub(transactionCost));

                        const vbntBalance = await vbnt.balanceOf(owner.address);
                        expect(vbntBalance).to.equal(prevGovBalance);

                        const protectionPoolBalance = await poolToken.balanceOf(liquidityProtection.address);
                        expect(protectionPoolBalance).to.equal(0);

                        const protectionBaseBalance = await getBalance(baseToken, liquidityProtection.address);
                        expect(protectionBaseBalance).to.equal(0);

                        const protectionBNTBalance = await bnt.balanceOf(liquidityProtection.address);
                        expect(protectionBNTBalance).to.equal(0);
                    });

                    it('verifies that the owner can migrate system pool tokens', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                        const protection = await getProtection(protectionId);

                        const prevSystemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);

                        const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const prevVaultBNTBalance = await getBalance(bnt, masterVault.address);

                        await liquidityProtection.setTime(now + duration.seconds(1));

                        const prevGovBalance = await vbnt.balanceOf(owner.address);

                        await liquidityProtection.migrateSystemPoolTokens([poolToken.address]);

                        // verify balances
                        const systemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                        expect(systemBalance).to.equal(prevSystemBalance.sub(protection.poolAmount));

                        const vaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const vaultBNTBalance = await getBalance(bnt, masterVault.address);
                        expect(vaultBaseBalance).to.equal(prevVaultBaseBalance.add(protection.reserveAmount.div(2)));
                        expect(vaultBNTBalance).to.equal(prevVaultBNTBalance);

                        const vbntBalance = await vbnt.balanceOf(owner.address);
                        expect(vbntBalance).to.equal(prevGovBalance);

                        const protectionPoolBalance = await poolToken.balanceOf(liquidityProtection.address);
                        expect(protectionPoolBalance).to.equal(0);

                        const protectionBaseBalance = await getBalance(baseToken, liquidityProtection.address);
                        expect(protectionBaseBalance).to.equal(0);

                        const protectionBNTBalance = await bnt.balanceOf(liquidityProtection.address);
                        expect(protectionBNTBalance).to.equal(0);
                    });

                    context('when paused', () => {
                        beforeEach(async () => {
                            await network.connect(emergencyStopper).pause();

                            await liquidityProtection.setTime(now + duration.seconds(1));
                        });

                        it('should revert when attempting to migrate positions', async () => {
                            const protectionId = (
                                await liquidityProtectionStore.protectedLiquidityIds(owner.address)
                            )[0];

                            await expect(liquidityProtection.migratePositions([protectionId])).to.be.revertedWith(
                                'Pausable: paused'
                            );
                        });
                    });
                });
            }

            describe(TokenSymbol.BNT, () => {
                beforeEach(async () => {
                    await initLegacySystem(false);

                    const amount = BigNumber.from(100_000);
                    await baseToken.transfer(provider.address, amount);
                    await baseToken.connect(provider).approve(network.address, amount);
                    await network.connect(provider).deposit(baseToken.address, amount);

                    const amount1 = BigNumber.from(5000);
                    await baseToken.transfer(provider.address, amount1);
                    await addProtectedLiquidity(poolToken, baseToken, false, amount1, provider);

                    const amount2 = BigNumber.from(1000);
                    await addProtectedLiquidity(poolToken, bnt, false, amount2, owner);
                });

                it('verifies that the funds-migrated event is emitted correctly', async () => {
                    const amount = 1000;
                    const availableAmount = 2000;
                    const originalAmount = 4500;

                    const contextId = solidityKeccak256(
                        ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
                        [
                            deployer.address,
                            await network.currentTime(),
                            bnt.address,
                            deployer.address,
                            amount,
                            availableAmount,
                            originalAmount
                        ]
                    );

                    await network.grantRole(Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, deployer.address);
                    await bnt.approve(network.address, MAX_UINT256);
                    await poolToken.approve(network.address, MAX_UINT256);
                    await baseToken.approve(network.address, MAX_UINT256);

                    const res = await network.migrateLiquidity(
                        bnt.address,
                        deployer.address,
                        amount,
                        availableAmount,
                        originalAmount
                    );

                    await expect(res)
                        .to.emit(network, 'FundsMigrated')
                        .withArgs(contextId, bnt.address, deployer.address, amount, availableAmount, originalAmount);
                });

                it('verifies that the caller cannot migrate a position more than once in the same transaction', async () => {
                    const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                    await liquidityProtection.setTime(now + duration.seconds(1));
                    await expect(liquidityProtection.migratePositions([protectionId, protectionId])).to.be.revertedWith(
                        'ERR_ACCESS_DENIED'
                    );
                });

                it('verifies that the caller cannot migrate a position more than once in different transactions', async () => {
                    const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                    await liquidityProtection.setTime(now + duration.seconds(1));
                    await liquidityProtection.migratePositions([protectionId]);
                    await expect(liquidityProtection.migratePositions([protectionId])).to.be.revertedWith(
                        'ERR_ACCESS_DENIED'
                    );
                });

                it('verifies that the caller can migrate positions', async () => {
                    const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                    const protection = await getProtection(protectionId);

                    const prevPoolStats = await getPoolStats(poolToken, bnt, false);
                    const prevProviderStats = await getProviderStats(owner, poolToken, bnt, false);
                    const prevSystemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                    const prevWalletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);
                    const prevBalance = await getBalance(bnt, owner.address);
                    const prevGovBalance = await vbnt.balanceOf(owner.address);

                    const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
                    const prevVaultBNTBalance = await getBalance(bnt, masterVault.address);

                    await liquidityProtection.setTime(now + duration.seconds(1));
                    const res = await liquidityProtection.migratePositions([protectionId]);

                    // verify event
                    await expect(res).to.emit(network, 'FundsMigrated');

                    // verify protected liquidities
                    expect(await liquidityProtectionStore.protectedLiquidityIds(owner.address)).to.be.empty;

                    // verify stats
                    const poolStats = await getPoolStats(poolToken, bnt, false);
                    expect(poolStats.totalPoolAmount).to.equal(prevSystemBalance.add(protection.poolAmount));
                    expect(poolStats.totalReserveAmount).to.equal(
                        prevPoolStats.totalReserveAmount.sub(protection.reserveAmount)
                    );

                    const providerStats = await getProviderStats(owner, poolToken, bnt, false);
                    expect(providerStats.totalProviderAmount).to.equal(
                        prevProviderStats.totalProviderAmount.sub(protection.reserveAmount)
                    );
                    expect(prevProviderStats.providerPools).to.deep.equal([poolToken.address]);

                    // verify balances
                    const systemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                    expect(systemBalance).to.equal(prevSystemBalance.add(protection.poolAmount));

                    const vaultBaseBalance = await getBalance(baseToken, masterVault.address);
                    const vaultBNTBalance = await getBalance(bnt, masterVault.address);
                    expect(vaultBaseBalance).to.equal(prevVaultBaseBalance);
                    expect(vaultBNTBalance).to.equal(prevVaultBNTBalance);

                    const walletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);
                    expect(walletBalance).to.equal(prevWalletBalance);

                    const balance = await getBalance(bnt, owner.address);
                    expect(balance).to.almostEqual(prevBalance.add(protection.reserveAmount), {
                        maxRelativeError,
                        relation: Relation.LesserOrEqual
                    });

                    const vbntBalance = await vbnt.balanceOf(owner.address);
                    expect(vbntBalance).to.equal(prevGovBalance);

                    const protectionPoolBalance = await poolToken.balanceOf(liquidityProtection.address);
                    expect(protectionPoolBalance).to.equal(0);

                    const protectionBaseBalance = await getBalance(baseToken, liquidityProtection.address);
                    expect(protectionBaseBalance).to.equal(0);

                    const protectionBNTBalance = await bnt.balanceOf(liquidityProtection.address);
                    expectInRange(protectionBNTBalance, BigNumber.from(0));
                });

                context('when paused', () => {
                    beforeEach(async () => {
                        await network.connect(emergencyStopper).pause();

                        await liquidityProtection.setTime(now + duration.seconds(1));
                    });

                    it('should revert when attempting to migrate positions', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];

                        await expect(liquidityProtection.migratePositions([protectionId])).to.be.revertedWith(
                            'Pausable: paused'
                        );
                    });
                });
            });
        };

        for (const { totalSupply, reserve1Amount, reserve2Amount, maxRelativeError, maxOffset } of [
            {
                totalSupply: BigNumber.from(10_000_000),
                reserve1Amount: BigNumber.from(1_000_000),
                reserve2Amount: BigNumber.from(2_500_000),
                maxRelativeError: new Decimal('0.000000000000000000000001'),
                maxOffset: { negative: 0, positive: 0 }
            },
            {
                totalSupply: toWei(10_000_000),
                reserve1Amount: BigNumber.from(1_000_000),
                reserve2Amount: BigNumber.from(2_500_000),
                maxRelativeError: new Decimal('0.000000000000000000000001'),
                maxOffset: { negative: 0, positive: 0 }
            },
            {
                totalSupply: BigNumber.from(10_000_000),
                reserve1Amount: toWei(1_000_000),
                reserve2Amount: toWei(2_500_000),
                maxRelativeError: new Decimal('0.000000000000000000000001003'),
                maxOffset: { negative: 1, positive: 1 }
            },
            {
                totalSupply: toWei(10_000_000),
                reserve1Amount: toWei(1_000_000),
                reserve2Amount: toWei(2_500_000),
                maxRelativeError: new Decimal('0.000000000000000000000001'),
                maxOffset: { negative: 1, positive: 1 }
            }
        ]) {
            context(
                `totalSupply = ${totalSupply}, reserve1Amount = ${reserve1Amount}, reserve2Amount = ${reserve2Amount}`,
                () => {
                    testLiquidityMigration(totalSupply, reserve1Amount, reserve2Amount, maxRelativeError, maxOffset);
                }
            );
        }
    });

    describe('pending withdrawals', () => {
        let poolToken: PoolToken;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolCollection: TestPoolCollection;

        let provider: Wallet;
        let poolTokenAmount: BigNumber;
        let emergencyStopper: SignerWithAddress;

        const BALANCE = toWei(1_000_000);

        before(async () => {
            [, emergencyStopper] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, bnt, networkInfo, networkSettings, poolCollection, pendingWithdrawals } = await createSystem());

            provider = await createWallet();

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);

            await pendingWithdrawals.setTime(await latest());

            ({ poolToken } = await setupFundedPool(
                {
                    tokenData: new TokenData(TokenSymbol.TKN),
                    balance: BALANCE,
                    requestedLiquidity: BALANCE.mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                provider as any as SignerWithAddress,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            poolTokenAmount = await poolToken.balanceOf(provider.address);
        });

        it('should initiate a withdrawal request', async () => {
            await poolToken.connect(provider).approve(network.address, poolTokenAmount);

            const retId = await network.connect(provider).callStatic.initWithdrawal(poolToken.address, poolTokenAmount);
            await network.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount);

            const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
            const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
            expect(id).to.equal(retId);

            const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
            expect(withdrawalRequest.provider).to.equal(provider.address);
            expect(withdrawalRequest.createdAt).to.equal(await pendingWithdrawals.currentTime());
        });

        it('should initiate a permitted withdrawal request', async () => {
            const signature = await permitSignature(
                provider as Wallet,
                poolToken.address,
                network,
                bnt,
                poolTokenAmount,
                MAX_UINT256
            );

            const retId = await network
                .connect(provider)
                .callStatic.initWithdrawalPermitted(
                    poolToken.address,
                    poolTokenAmount,
                    MAX_UINT256,
                    signature.v,
                    signature.r,
                    signature.s
                );
            await network
                .connect(provider)
                .initWithdrawalPermitted(
                    poolToken.address,
                    poolTokenAmount,
                    MAX_UINT256,
                    signature.v,
                    signature.r,
                    signature.s
                );

            const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
            const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
            expect(id).to.equal(retId);

            const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
            expect(withdrawalRequest.provider).to.equal(provider.address);
            expect(withdrawalRequest.createdAt).to.equal(await pendingWithdrawals.currentTime());
        });

        context('when paused', () => {
            beforeEach(async () => {
                await network.connect(emergencyStopper).pause();
            });

            it('should revert when attempting to initiate a withdrawal request', async () => {
                await expect(
                    network.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount)
                ).to.be.revertedWith('Pausable: paused');
            });

            it('should revert when attempting to initiate a permitted withdrawal request', async () => {
                const signature = await permitSignature(
                    provider as Wallet,
                    poolToken.address,
                    network,
                    bnt,
                    poolTokenAmount,
                    MAX_UINT256
                );

                await expect(
                    network
                        .connect(provider)
                        .initWithdrawalPermitted(
                            poolToken.address,
                            poolTokenAmount,
                            MAX_UINT256,
                            signature.v,
                            signature.r,
                            signature.s
                        )
                ).to.be.revertedWith('Pausable: paused');
            });
        });

        context('with an initiated withdrawal request', () => {
            let id: BigNumber;

            beforeEach(async () => {
                ({ id } = await initWithdraw(provider, network, pendingWithdrawals, poolToken, poolTokenAmount));
            });

            it('should cancel a pending withdrawal request', async () => {
                await network.connect(provider).cancelWithdrawal(id);

                const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                expect(withdrawalRequestIds).to.be.empty;
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await network.connect(emergencyStopper).pause();
                });

                it('should revert when attempting to cancel a pending withdrawal request', async () => {
                    await expect(network.connect(provider).cancelWithdrawal(id)).to.be.revertedWith('Pausable: paused');
                });
            });
        });
    });

    describe('network fees management', () => {
        let network: TestBancorNetwork;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let bnt: IERC20;
        let poolCollection: TestPoolCollection;
        let token: TokenWithAddress;

        let emergencyStopper: SignerWithAddress;
        let networkFeeManager: SignerWithAddress;

        const INITIAL_LIQUIDITY = toWei(50_000_000);
        const TRADING_FEE_PPM = toPPM(10);
        const NETWORK_FEE_PPM = toPPM(20);

        before(async () => {
            [, emergencyStopper, networkFeeManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setNetworkFeePPM(NETWORK_FEE_PPM);

            ({ token } = await setupFundedPool(
                {
                    tokenData: new TokenData(TokenSymbol.TKN),
                    balance: INITIAL_LIQUIDITY,
                    requestedLiquidity: INITIAL_LIQUIDITY.mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE,
                    tradingFeePPM: TRADING_FEE_PPM
                },
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
            await network
                .connect(deployer)
                .grantRole(Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER, networkFeeManager.address);
        });

        it('should revert when a non-network fee manager is attempting to withdraw the fees', async () => {
            await expect(network.connect(deployer).pause()).to.be.revertedWith('AccessDenied');
        });

        context('without any pending network fees', () => {
            it('should not withdraw any pending network fees', async () => {
                const prevBNTBalance = await bnt.balanceOf(networkFeeManager.address);

                const res = await network.connect(networkFeeManager).withdrawNetworkFees(networkFeeManager.address);

                await expect(res).to.not.emit(network, 'NetworkFeesWithdrawn');

                expect(await bnt.balanceOf(networkFeeManager.address)).to.equal(prevBNTBalance);
            });
        });

        context('with pending network fees', () => {
            beforeEach(async () => {
                await tradeBySourceAmount(deployer, bnt, token, toWei(1000), 1, MAX_UINT256, deployer.address, network);

                expect(await network.pendingNetworkFeeAmount()).to.be.gt(0);
            });

            it('should revert when the withdrawal caller is not a network-fee manager', async () => {
                await expect(
                    network.connect(deployer).withdrawNetworkFees(networkFeeManager.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when the withdrawal recipient is invalid', async () => {
                await expect(network.connect(networkFeeManager).withdrawNetworkFees(ZERO_ADDRESS)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            it('should withdraw all the pending network fees', async () => {
                const recipient = nonOwner.address;
                const prevBNTBalance = await bnt.balanceOf(networkFeeManager.address);
                const pendingNetworkFeeAmount = await network.pendingNetworkFeeAmount();

                const res = await network.connect(networkFeeManager).withdrawNetworkFees(recipient);

                await expect(res)
                    .to.emit(network, 'NetworkFeesWithdrawn')
                    .withArgs(networkFeeManager.address, recipient, pendingNetworkFeeAmount);

                expect(await bnt.balanceOf(recipient)).to.equal(prevBNTBalance.add(pendingNetworkFeeAmount));

                expect(await network.pendingNetworkFeeAmount()).to.equal(0);
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await network.connect(emergencyStopper).pause();
                });

                it('should revert when attempting to withdraw the pending network fees', async () => {
                    await expect(
                        network.connect(networkFeeManager).withdrawNetworkFees(networkFeeManager.address)
                    ).to.be.revertedWith('Pausable: paused');
                });
            });
        });
    });
});

describe('BancorNetwork Financial Verification', () => {
    interface User {
        id: string;
        tknBalance: number;
        bntBalance: number;
    }

    interface State {
        tknBalances: Record<string, Decimal>;
        bntBalances: Record<string, Decimal>;
        bntknBalances: Record<string, Decimal>;
        bnbntBalances: Record<string, Decimal>;
        bntCurrentPoolFunding: Decimal;
        tknStakedBalance: Decimal;
        bntStakedBalance: Decimal;
        tknTradingLiquidity: Decimal;
        bntTradingLiquidity: Decimal;
    }

    interface Operation {
        type: string;
        userId: string;
        amount: string;
        mined: boolean;
        expected: State;
    }

    interface Flow {
        tradingFee: string;
        networkFee: string;
        withdrawalFee: string;
        epVaultBalance: number;
        tknDecimals: number;
        bntMinLiquidity: number;
        bntFundingLimit: number;
        users: User[];
        operations: Operation[];
    }

    let users: { [id: string]: SignerWithAddress };
    let flow: Flow;

    let network: TestBancorNetwork;
    let bnt: IERC20;
    let networkSettings: NetworkSettings;
    let bntPool: TestBNTPool;
    let bntGovernance: TokenGovernance;
    let pendingWithdrawals: TestPendingWithdrawals;
    let poolCollection: TestPoolCollection;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let baseToken: TestERC20Burnable;
    let basePoolToken: PoolToken;
    let bntPoolToken: PoolToken;
    let vbnt: IERC20;
    let tknDecimals: number;
    let bntDecimals: number;
    let bntknDecimals: number;
    let bnbntDecimals: number;
    let blockNumber: number;

    const decimalToInteger = (value: string | number, decimals: number) => {
        return BigNumber.from(new Decimal(`${value}e+${decimals}`).toFixed());
    };

    const integerToDecimal = (value: BigNumber, decimals: number) => {
        return new Decimal(`${value}e-${decimals}`);
    };

    const percentageToPPM = (percentage: string) => {
        return decimalToInteger(percentage.replace('%', ''), 4);
    };

    const toWei = async (userId: string, amount: string, decimals: number, token: IERC20) => {
        if (amount.endsWith('%')) {
            const balance = await token.balanceOf(users[userId].address);
            return balance.mul(percentageToPPM(amount)).div(PPM_RESOLUTION);
        }
        return decimalToInteger(amount, decimals);
    };

    const depositTKN = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, tknDecimals, baseToken);
        await network.connect(users[userId]).deposit(baseToken.address, wei);
    };

    const depositBNT = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bntDecimals, bnt);
        await network.connect(users[userId]).deposit(bnt.address, wei);
    };

    const withdrawTKN = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bntknDecimals, basePoolToken);
        const { id } = await initWithdraw(users[userId], network, pendingWithdrawals, basePoolToken, wei);
        await network.connect(users[userId]).withdraw(id);
    };

    const withdrawBNT = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bnbntDecimals, bntPoolToken);
        const { id } = await initWithdraw(users[userId], network, pendingWithdrawals, bntPoolToken, wei);
        await network.connect(users[userId]).withdraw(id);
    };

    const tradeTKN = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, tknDecimals, baseToken);
        await network
            .connect(users[userId])
            .tradeBySourceAmount(baseToken.address, bnt.address, wei, 1, MAX_UINT256, users[userId].address);
    };

    const tradeBNT = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bntDecimals, bnt);
        await network
            .connect(users[userId])
            .tradeBySourceAmount(bnt.address, baseToken.address, wei, 1, MAX_UINT256, users[userId].address);
    };

    const enableTrading = async (bntVirtualBalance: number, baseTokenVirtualBalance: number) => {
        await poolCollection.enableTrading(baseToken.address, bntVirtualBalance, baseTokenVirtualBalance);
    };

    /* eslint-disable indent */
    const decimalize = (obj: any): any =>
        Array.isArray(obj)
            ? obj.map(decimalize)
            : Object(obj) === obj
            ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, decimalize(v)]))
            : new Decimal(obj);
    /* eslint-enable indent */

    const verifyState = async (expected: State) => {
        const actual: State = {
            tknBalances: {},
            bntBalances: {},
            bntknBalances: {},
            bnbntBalances: {},
            bntCurrentPoolFunding: new Decimal(0),
            tknStakedBalance: new Decimal(0),
            bntStakedBalance: new Decimal(0),
            tknTradingLiquidity: new Decimal(0),
            bntTradingLiquidity: new Decimal(0)
        };

        for (const userId in users) {
            actual.tknBalances[userId] = integerToDecimal(
                await baseToken.balanceOf(users[userId].address),
                tknDecimals
            );
            actual.bntBalances[userId] = integerToDecimal(await bnt.balanceOf(users[userId].address), bntDecimals);
            actual.bntknBalances[userId] = integerToDecimal(
                await basePoolToken.balanceOf(users[userId].address),
                bntknDecimals
            );
            actual.bnbntBalances[userId] = integerToDecimal(
                await bntPoolToken.balanceOf(users[userId].address),
                bnbntDecimals
            );
        }

        actual.tknBalances.masterVault = integerToDecimal(await baseToken.balanceOf(masterVault.address), tknDecimals);
        actual.tknBalances.epVault = integerToDecimal(
            await baseToken.balanceOf(externalProtectionVault.address),
            tknDecimals
        );
        actual.bntBalances.masterVault = integerToDecimal(await bnt.balanceOf(masterVault.address), bntDecimals);
        actual.bnbntBalances.bntPool = integerToDecimal(await bntPoolToken.balanceOf(bntPool.address), bnbntDecimals);

        const poolData = await poolCollection.poolData(baseToken.address);
        actual.bntCurrentPoolFunding = integerToDecimal(
            await bntPool.currentPoolFunding(baseToken.address),
            bntDecimals
        );
        actual.tknStakedBalance = integerToDecimal(poolData.liquidity.stakedBalance, tknDecimals);
        actual.bntStakedBalance = integerToDecimal(await bntPool.stakedBalance(), bntDecimals);
        actual.tknTradingLiquidity = integerToDecimal(poolData.liquidity.baseTokenTradingLiquidity, tknDecimals);
        actual.bntTradingLiquidity = integerToDecimal(poolData.liquidity.bntTradingLiquidity, bntDecimals);

        expect(actual).to.deep.equal(expected);
    };

    const init = async (fileName: string) => {
        const signers = await ethers.getSigners();

        users = {};
        flow = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', 'data', `${fileName}.json`), { encoding: 'utf8' })
        );

        tknDecimals = flow.tknDecimals;
        bntDecimals = DEFAULT_DECIMALS;
        bntknDecimals = DEFAULT_DECIMALS;
        bnbntDecimals = DEFAULT_DECIMALS;

        const tknAmount = flow.users
            .reduce((sum, user) => sum.add(user.tknBalance), BigNumber.from(flow.epVaultBalance))
            .mul(BigNumber.from(10).pow(tknDecimals));
        const bntAmount = flow.users
            .reduce((sum, user) => sum.add(user.bntBalance), BigNumber.from(0))
            .mul(BigNumber.from(10).pow(bntDecimals));

        ({
            network,
            bnt,
            networkSettings,
            bntPool,
            bntPoolToken,
            bntGovernance,
            vbnt,
            pendingWithdrawals,
            poolCollection,
            masterVault,
            externalProtectionVault
        } = await createSystem());

        baseToken = await createBurnableToken(new TokenData(TokenSymbol.TKN), tknAmount);
        basePoolToken = await createPool(baseToken, network, networkSettings, poolCollection);

        await baseToken.updateDecimals(tknDecimals);

        await bntGovernance.burn(await bnt.balanceOf(signers[0].address));
        await bntGovernance.mint(signers[0].address, bntAmount);

        await networkSettings.setNetworkFeePPM(percentageToPPM(flow.networkFee));
        await networkSettings.setWithdrawalFeePPM(percentageToPPM(flow.withdrawalFee));
        await networkSettings.setMinLiquidityForTrading(decimalToInteger(flow.bntMinLiquidity, bntDecimals));
        await networkSettings.setFundingLimit(baseToken.address, decimalToInteger(flow.bntFundingLimit, bntDecimals));

        await pendingWithdrawals.setLockDuration(0);

        await poolCollection.setTradingFeePPM(baseToken.address, percentageToPPM(flow.tradingFee));
        await poolCollection.setDepositLimit(baseToken.address, MAX_UINT256);

        await baseToken.transfer(externalProtectionVault.address, decimalToInteger(flow.epVaultBalance, tknDecimals));

        for (const [i, { id, tknBalance, bntBalance }] of flow.users.entries()) {
            expect(id in users).to.equal(false, `user id '${id}' is not unique`);
            users[id] = signers[1 + i];
            await vbnt.connect(users[id]).approve(network.address, MAX_UINT256);
            await baseToken.connect(users[id]).approve(network.address, MAX_UINT256);
            await bnt.connect(users[id]).approve(network.address, MAX_UINT256);
            await basePoolToken.connect(users[id]).approve(network.address, MAX_UINT256);
            await bntPoolToken.connect(users[id]).approve(network.address, MAX_UINT256);
            await baseToken.transfer(users[id].address, decimalToInteger(tknBalance, tknDecimals));
            await bnt.transfer(users[id].address, decimalToInteger(bntBalance, bntDecimals));
        }

        expect(await baseToken.balanceOf(signers[0].address)).to.equal(0);
        expect(await bnt.balanceOf(signers[0].address)).to.equal(0);

        blockNumber = await poolCollection.currentBlockNumber();
    };

    const execute = async () => {
        for (const [n, { type, userId, amount, mined, expected }] of flow.operations.entries()) {
            console.log(`${n + 1} out of ${flow.operations.length}: ${type}(${amount})`);

            if (mined) {
                await poolCollection.setBlockNumber(++blockNumber);
            }

            switch (type) {
                case 'depositTKN':
                    await depositTKN(userId, amount);
                    break;

                case 'depositBNT':
                    await depositBNT(userId, amount);
                    break;

                case 'withdrawTKN':
                    await withdrawTKN(userId, amount);
                    break;

                case 'withdrawBNT':
                    await withdrawBNT(userId, amount);
                    break;

                case 'tradeTKN':
                    await tradeTKN(userId, amount);
                    break;

                case 'tradeBNT':
                    await tradeBNT(userId, amount);
                    break;

                case 'enableTrading': {
                    const { bntVirtualBalance, baseTokenVirtualBalance } = amount as any;
                    await enableTrading(bntVirtualBalance, baseTokenVirtualBalance);

                    break;
                }
            }

            await verifyState(decimalize(expected) as State);
        }
    };

    const test = (fileName: string) => {
        context(fileName, () => {
            before(async () => {
                await init(fileName);
            });

            it('should complete successfully', async function (this: Context) {
                this.timeout(0);
                await execute();
            });
        });
    };

    describe('quick tests', () => {
        test('BancorNetworkSimpleFinancialScenario1');
        test('BancorNetworkSimpleFinancialScenario2');
        test('BancorNetworkSimpleFinancialScenario3');
    });

    describe('@stress test', () => {
        test('BancorNetworkComplexFinancialScenario1');
        test('BancorNetworkComplexFinancialScenario2');
    });
});
