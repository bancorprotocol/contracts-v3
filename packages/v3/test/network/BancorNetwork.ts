import { AsyncReturnType } from '../../components/ContractBuilder';
import Contracts from '../../components/Contracts';
import {
    DSToken,
    TokenHolder,
    LiquidityProtectionSettings,
    LiquidityProtectionStats,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore,
    TestCheckpointStore,
    TestLiquidityProtection,
    TestStandardPoolConverter,
    TokenGovernance
} from '../../components/LegacyContracts';
import {
    BancorNetworkInformation,
    MasterVault,
    ExternalProtectionVault,
    IERC20,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolCollectionUpgrader,
    TestERC20Burnable,
    PendingWithdrawals
} from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import {
    DEFAULT_DECIMALS,
    FeeTypes,
    MAX_UINT256,
    NATIVE_TOKEN_ADDRESS,
    PPM_RESOLUTION,
    ZERO_ADDRESS
} from '../helpers/Constants';
import { BNT, ETH, TKN } from '../helpers/Constants';
import {
    createPool,
    createPoolCollection,
    createSystem,
    depositToPool,
    initWithdraw,
    setupSimplePool,
    PoolSpec,
    specToString
} from '../helpers/Factory';
import { createLegacySystem } from '../helpers/LegacyFactory';
import { permitContractSignature } from '../helpers/Permit';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest, duration } from '../helpers/Time';
import { toWei, toPPM } from '../helpers/Types';
import {
    createTokenBySymbol,
    createWallet,
    errorMessageTokenExceedsAllowance,
    getBalance,
    getTransactionCost,
    transfer,
    TokenWithAddress
} from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, ContractTransaction, Signer, utils, Wallet } from 'ethers';
import fs from 'fs';
import { ethers, waffle } from 'hardhat';
import { camelCase } from 'lodash';
import { Context } from 'mocha';
import path from 'path';

const { Upgradeable: UpgradeableRoles, BancorNetwork: BancorNetworkRoles } = roles;
const { solidityKeccak256, formatBytes32String } = utils;

describe('BancorNetwork', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const INITIAL_RATE = { n: 1, d: 2 };

    shouldHaveGap('BancorNetwork', '_masterPool');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    const trade = async (
        trader: SignerWithAddress,
        sourceToken: TokenWithAddress,
        targetToken: TokenWithAddress,
        amount: BigNumber,
        minReturnAmount: BigNumber,
        deadline: BigNumberish,
        beneficiary: string,
        network: TestBancorNetwork
    ) => {
        let value = BigNumber.from(0);
        if (sourceToken.address === NATIVE_TOKEN_ADDRESS) {
            value = amount;
        } else {
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

            await reserveToken.transfer(await trader.getAddress(), amount);
            await reserveToken.connect(trader).approve(network.address, amount);
        }

        return network
            .connect(trader)
            .trade(sourceToken.address, targetToken.address, amount, minReturnAmount, deadline, beneficiary, {
                value
            });
    };

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let masterPool: TestMasterPool;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                networkToken,
                networkTokenGovernance,
                govTokenGovernance,
                masterPool,
                poolCollectionUpgrader,
                masterVault,
                externalProtectionVault,
                pendingWithdrawals,
                masterPoolToken
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network token governance contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    ZERO_ADDRESS,
                    govTokenGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid governance token governance contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    externalProtectionVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external protection vault contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, masterVault, masterPoolToken } =
                await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool token contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    externalProtectionVault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to initialize with an invalid master pool contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                masterPoolToken.address
            );

            await expect(
                network.initialize(ZERO_ADDRESS, pendingWithdrawals.address, poolCollectionUpgrader.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to initialize with an invalid pending withdrawals contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                masterPoolToken.address
            );

            await expect(
                network.initialize(masterPool.address, ZERO_ADDRESS, poolCollectionUpgrader.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to initialize with an invalid pool collection upgrader contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                masterPoolToken.address
            );

            await expect(
                network.initialize(masterPool.address, pendingWithdrawals.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(
                network.initialize(masterPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address)
            ).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await network.version()).to.equal(1);

            await expectRole(network, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);

            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
            expect(await network.isPoolValid(networkToken.address)).to.be.true;
        });
    });

    describe('pool collections', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let poolType: number;

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, poolTokenFactory, poolCollection, poolCollectionUpgrader } =
                await createSystem());

            poolType = await poolCollection.poolType();
        });

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
                        networkToken,
                        networkSettings,
                        poolTokenFactory,
                        poolCollectionUpgrader,
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
                        networkToken,
                        networkSettings,
                        poolTokenFactory,
                        poolCollectionUpgrader,
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
                    networkToken,
                    networkSettings,
                    poolTokenFactory,
                    poolCollectionUpgrader,
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
                    networkToken,
                    networkSettings,
                    poolTokenFactory,
                    poolCollectionUpgrader,
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
                        networkToken,
                        networkSettings,
                        poolTokenFactory,
                        poolCollectionUpgrader,
                        (await poolCollection.version()) + 1
                    );
                    lastCollection = await createPoolCollection(
                        network,
                        networkToken,
                        networkSettings,
                        poolTokenFactory,
                        poolCollectionUpgrader,
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
                        networkToken,
                        networkSettings,
                        poolTokenFactory,
                        poolCollectionUpgrader
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

                    const res2 = await network.removePoolCollection(newPoolCollection.address, lastCollection.address);
                    await expect(res2)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, newPoolCollection.address);
                    await expect(res2)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, newPoolCollection.address, lastCollection.address);

                    expect(await network.poolCollections()).to.have.members([lastCollection.address]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(lastCollection.address);

                    const res3 = await network.removePoolCollection(lastCollection.address, ZERO_ADDRESS);
                    await expect(res3)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, lastCollection.address);
                    await expect(res3)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, lastCollection.address, ZERO_ADDRESS);

                    expect(await network.poolCollections()).to.be.empty;
                    expect(await network.latestPoolCollection(poolType)).to.equal(ZERO_ADDRESS);
                });

                it('should revert when attempting to remove a pool collection with associated pools', async () => {
                    const reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
                    await createPool(reserveToken, network, networkSettings, lastCollection);

                    await expect(
                        network.removePoolCollection(lastCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('NotEmpty');
                });

                it.skip('should revert when attempting to remove a pool collection with an alternative with a different type', async () => {});
            });
        });

        describe('setting the latest pool collections', () => {
            let newPoolCollection: TestPoolCollection;

            beforeEach(async () => {
                newPoolCollection = await createPoolCollection(
                    network,
                    networkToken,
                    networkSettings,
                    poolTokenFactory,
                    poolCollectionUpgrader,
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
                    networkToken,
                    networkSettings,
                    poolTokenFactory,
                    poolCollectionUpgrader
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
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let poolType: number;

        const testCreatePool = async (symbol: string) => {
            beforeEach(async () => {
                ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

                if (symbol === BNT) {
                    reserveToken = networkToken;
                } else {
                    reserveToken = await createTokenBySymbol(symbol);
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
                            .withArgs(poolType, reserveToken.address, poolCollection.address);

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

        for (const symbol of [ETH, TKN]) {
            context(symbol, () => {
                testCreatePool(symbol);
            });
        }

        context(BNT, () => {
            beforeEach(async () => {
                ({ network, networkToken } = await createSystem());
            });

            it('should revert when attempting to create a pool', async () => {
                await expect(network.createPool(1, networkToken.address)).to.be.revertedWith('InvalidToken');
            });
        });
    });

    describe('upgrade pool', () => {
        let network: TestBancorNetwork;
        let networkInformation: BancorNetworkInformation;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let targetPoolCollection: TestPoolCollection;

        const MIN_RETURN_AMOUNT = BigNumber.from(1);
        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);

        const reserveTokenSymbols = [TKN, ETH, TKN];
        let reserveTokenAddresses: string[];

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        const setup = async () => {
            ({
                network,
                networkInformation,
                networkSettings,
                networkToken,
                pendingWithdrawals,
                poolCollection,
                poolCollectionUpgrader,
                poolTokenFactory
            } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            reserveTokenAddresses = [];

            for (const symbol of reserveTokenSymbols) {
                const { token } = await setupSimplePool(
                    {
                        symbol,
                        balance: toWei(50_000_000),
                        initialRate: INITIAL_RATE
                    },
                    deployer,
                    network,
                    networkInformation,
                    networkSettings,
                    poolCollection
                );

                reserveTokenAddresses.push(token.address);
            }

            targetPoolCollection = await createPoolCollection(
                network,
                networkToken,
                networkSettings,
                poolTokenFactory,
                poolCollectionUpgrader,
                (await poolCollection.version()) + 1
            );

            await network.addPoolCollection(targetPoolCollection.address);
            await network.setLatestPoolCollection(targetPoolCollection.address);

            await depositToPool(deployer, networkToken, toWei(100_000), network);

            await network.setTime(await latest());
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        it('should revert when attempting to upgrade already upgraded pools', async () => {
            await network.upgradePools(reserveTokenAddresses);

            await expect(network.upgradePools(reserveTokenAddresses)).to.be.revertedWith('InvalidPoolCollection');
        });

        it('should revert when attempting to upgrade invalid pools', async () => {
            const reserveTokenAddresses2 = [ZERO_ADDRESS, ZERO_ADDRESS, ...reserveTokenAddresses, ZERO_ADDRESS];
            await expect(network.upgradePools(reserveTokenAddresses2)).to.be.revertedWith('InvalidPool');
        });

        it('should upgrade pools', async () => {
            expect(await poolCollection.poolCount()).to.equal(reserveTokenAddresses.length);
            expect(await targetPoolCollection.poolCount()).to.equal(0);

            for (const reserveTokenAddress of reserveTokenAddresses) {
                expect(await network.collectionByPool(reserveTokenAddress)).to.equal(poolCollection.address);
            }

            await network.upgradePools(reserveTokenAddresses);

            expect(await poolCollection.poolCount()).to.equal(0);
            expect(await targetPoolCollection.poolCount()).to.equal(reserveTokenAddresses.length);

            for (const reserveTokenAddress of reserveTokenAddresses) {
                const isETH = reserveTokenAddress === NATIVE_TOKEN_ADDRESS;

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
                    pendingWithdrawals,
                    poolToken,
                    poolTokenAmount
                );
                expect(await poolToken.balanceOf(deployer.address)).to.be.gte(
                    prevPoolTokenBalance.sub(poolTokenAmount)
                );

                let prevTokenBalance = await getBalance(token, deployer);
                const withdrawalDuration =
                    (await pendingWithdrawals.lockDuration()) + (await pendingWithdrawals.withdrawalWindowDuration());
                await setTime(creationTime + withdrawalDuration - 1);

                await network.withdraw(id);
                await expect(await getBalance(token, deployer)).to.be.gte(prevTokenBalance);

                const tradeAmount = toWei(1);

                let prevNetworkTokenBalance = await networkToken.balanceOf(deployer.address);
                prevTokenBalance = await getBalance(token, deployer);

                let transactionCost = BigNumber.from(0);
                const res = await trade(
                    deployer,
                    token,
                    networkToken,
                    tradeAmount,
                    MIN_RETURN_AMOUNT,
                    MAX_UINT256,
                    ZERO_ADDRESS,
                    network
                );

                if (isETH) {
                    transactionCost = await getTransactionCost(res);
                }

                expect(await networkToken.balanceOf(deployer.address)).to.be.gte(prevNetworkTokenBalance);
                expect(await getBalance(token, deployer)).to.equal(
                    prevTokenBalance.sub(tradeAmount.add(transactionCost))
                );

                prevNetworkTokenBalance = await networkToken.balanceOf(deployer.address);
                prevTokenBalance = await getBalance(token, deployer);

                transactionCost = BigNumber.from(0);
                const res2 = await trade(
                    deployer,
                    networkToken,
                    token,
                    tradeAmount,
                    MIN_RETURN_AMOUNT,
                    MAX_UINT256,
                    ZERO_ADDRESS,
                    network
                );

                if (isETH) {
                    transactionCost = await getTransactionCost(res2);
                }

                expect(await getBalance(token, deployer)).to.be.gte(prevTokenBalance.sub(transactionCost));
                expect(await networkToken.balanceOf(deployer.address)).to.equal(
                    prevNetworkTokenBalance.sub(tradeAmount)
                );
            }
        });
    });

    describe('deposit', () => {
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let govToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;

        const MAX_DEVIATION = toPPM(1);
        const MINTING_LIMIT = toWei(10_000_000);
        const WITHDRAWAL_FEE = toPPM(5);
        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);
        const DEPOSIT_LIMIT = toWei(100_000_000);

        const setup = async () => {
            ({
                networkTokenGovernance,
                govTokenGovernance,
                network,
                networkSettings,
                networkToken,
                govToken,
                masterPool,
                poolCollection,
                masterVault,
                pendingWithdrawals,
                masterPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        const testDeposits = (symbol: string) => {
            const isNetworkToken = symbol === BNT;
            const isETH = symbol === ETH;

            let poolToken: PoolToken;
            let token: TokenWithAddress;

            beforeEach(async () => {
                if (isNetworkToken) {
                    token = networkToken;
                } else {
                    token = await createTokenBySymbol(symbol);
                }

                if (isNetworkToken) {
                    poolToken = masterPoolToken;
                } else {
                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                    await poolCollection.setDepositLimit(token.address, DEPOSIT_LIMIT);
                    await poolCollection.setInitialRate(token.address, INITIAL_RATE);
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

                const contextId = solidityKeccak256(
                    ['address', 'uint32', 'address', 'address', 'uint256'],
                    [senderAddress, await network.currentTime(), providerAddress, token.address, amount]
                );

                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevProviderPoolTokenBalance = await poolToken.balanceOf(providerAddress);

                const prevProviderTokenBalance = await getBalance(token, providerAddress);
                const prevSenderTokenBalance = await getBalance(token, senderAddress);
                const prevVaultTokenBalance = await getBalance(token, masterVault.address);

                const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                const prevVaultNetworkTokenBalance = await networkToken.balanceOf(masterVault.address);

                const prevGovTotalSupply = await govToken.totalSupply();
                const prevProviderGovTokenBalance = await govToken.balanceOf(providerAddress);
                const prevSenderGovTokenBalance = await govToken.balanceOf(senderAddress);

                let expectedPoolTokenAmount;
                let transactionCost = BigNumber.from(0);

                if (isNetworkToken) {
                    expectedPoolTokenAmount = amount
                        .mul(await poolToken.totalSupply())
                        .div(await masterPool.stakedBalance());

                    const res = await deposit(amount);

                    await expect(res)
                        .to.emit(network, 'NetworkTokenDeposited')
                        .withArgs(contextId, providerAddress, amount, expectedPoolTokenAmount, expectedPoolTokenAmount);

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            token.address,
                            await poolToken.totalSupply(),
                            await masterPool.stakedBalance(),
                            await getBalance(token, masterVault.address)
                        );

                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);

                    expect(await getBalance(token, masterVault.address)).to.equal(prevVaultTokenBalance);

                    expect(await networkToken.totalSupply()).to.equal(prevNetworkTokenTotalSupply.sub(amount));

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.add(expectedPoolTokenAmount));
                    expect(await govToken.balanceOf(providerAddress)).to.equal(
                        prevProviderGovTokenBalance.add(expectedPoolTokenAmount)
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

                    if (isETH) {
                        transactionCost = await getTransactionCost(res);
                    }

                    await expect(res)
                        .to.emit(network, 'BaseTokenDeposited')
                        .withArgs(
                            contextId,
                            token.address,
                            providerAddress,
                            poolCollection.address,
                            amount,
                            expectedPoolTokenAmount
                        );

                    const poolLiquidity = await poolCollection.poolLiquidity(token.address);

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            token.address,
                            await poolToken.totalSupply(),
                            poolLiquidity.stakedBalance,
                            await getBalance(token, masterVault.address)
                        );

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            networkToken.address,
                            await masterPoolToken.totalSupply(),
                            await masterPool.stakedBalance(),
                            await networkToken.balanceOf(masterVault.address)
                        );

                    await expect(res)
                        .to.emit(network, 'TradingLiquidityUpdated')
                        .withArgs(contextId, token.address, token.address, poolLiquidity.baseTokenTradingLiquidity);

                    await expect(res)
                        .to.emit(network, 'TradingLiquidityUpdated')
                        .withArgs(
                            contextId,
                            token.address,
                            networkToken.address,
                            poolLiquidity.networkTokenTradingLiquidity
                        );

                    expect(await poolToken.totalSupply()).to.equal(
                        prevPoolTokenTotalSupply.add(expectedPoolTokenAmount)
                    );

                    expect(await getBalance(token, masterVault.address)).to.equal(prevVaultTokenBalance.add(amount));

                    // expect a few network tokens to be minted to the vault
                    expect(await networkToken.totalSupply()).to.be.gte(prevNetworkTokenTotalSupply);
                    expect(await networkToken.balanceOf(masterVault.address)).to.be.gte(prevVaultNetworkTokenBalance);

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply);
                    expect(await govToken.balanceOf(providerAddress)).to.equal(prevProviderGovTokenBalance);
                }

                expect(await poolToken.balanceOf(providerAddress)).to.equal(
                    prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                );

                if (provider !== sender) {
                    expect(await getBalance(token, providerAddress)).to.equal(prevProviderTokenBalance);

                    expect(await govToken.balanceOf(senderAddress)).to.equal(prevSenderGovTokenBalance);
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

                            const deposit = async (amount: BigNumber, overrides: Overrides = {}) => {
                                let { value, poolAddress = token.address } = overrides;

                                if (!value) {
                                    value = BigNumber.from(0);
                                    if (isETH) {
                                        value = amount;
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
                                await expect(deposit(BigNumber.from(0))).to.be.revertedWith('ZeroValue');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(
                                    deposit(BigNumber.from(1), { poolAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('InvalidAddress');
                            });

                            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                                token = await createTokenBySymbol(TKN);

                                await expect(deposit(BigNumber.from(1))).to.be.revertedWith('InvalidToken');
                            });

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () => verifyDeposit(provider, sender, amount, deposit);

                                context(`${amount} tokens`, () => {
                                    if (!isETH) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                            await reserveToken.transfer(sender.address, amount);
                                        });

                                        it('should revert when attempting to deposit without approving the network', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith(
                                                errorMessageTokenExceedsAllowance(symbol)
                                            );
                                        });
                                    }

                                    context('with an approval', () => {
                                        if (!isETH) {
                                            beforeEach(async () => {
                                                const reserveToken = await Contracts.TestERC20Token.attach(
                                                    token.address
                                                );
                                                await reserveToken.connect(sender).approve(network.address, amount);
                                            });
                                        }

                                        if (isNetworkToken) {
                                            context('with requested liquidity', () => {
                                                beforeEach(async () => {
                                                    const contextId = formatBytes32String('CTX');

                                                    const reserveToken = await createTokenBySymbol(TKN);

                                                    await createPool(
                                                        reserveToken,
                                                        network,
                                                        networkSettings,
                                                        poolCollection
                                                    );
                                                    await networkSettings.setPoolMintingLimit(
                                                        reserveToken.address,
                                                        MINTING_LIMIT
                                                    );

                                                    await network.requestLiquidityT(
                                                        contextId,
                                                        reserveToken.address,
                                                        amount
                                                    );
                                                });

                                                it('should complete a deposit', async () => {
                                                    await test();
                                                });
                                            });
                                        } else {
                                            context('when there is no unallocated network token liquidity', () => {
                                                beforeEach(async () => {
                                                    await networkSettings.setPoolMintingLimit(token.address, 0);
                                                });

                                                context('with a whitelisted token', async () => {
                                                    it('should complete a deposit', async () => {
                                                        await test();
                                                    });
                                                });

                                                context('with non-whitelisted token', async () => {
                                                    beforeEach(async () => {
                                                        await networkSettings.removeTokenFromWhitelist(token.address);
                                                    });

                                                    it('should revert when attempting to deposit', async () => {
                                                        const amount = BigNumber.from(1000);

                                                        await expect(deposit(amount)).to.be.revertedWith(
                                                            'NotWhitelisted'
                                                        );
                                                    });
                                                });
                                            });

                                            context('when there is enough unallocated network token liquidity', () => {
                                                beforeEach(async () => {
                                                    await networkSettings.setPoolMintingLimit(
                                                        token.address,
                                                        MAX_UINT256
                                                    );
                                                });

                                                context('with non-whitelisted token', async () => {
                                                    beforeEach(async () => {
                                                        await networkSettings.removeTokenFromWhitelist(token.address);
                                                    });

                                                    it('should revert when attempting to deposit', async () => {
                                                        const amount = BigNumber.from(1000);

                                                        await expect(deposit(amount)).to.be.revertedWith(
                                                            'NetworkLiquidityDisabled'
                                                        );
                                                    });
                                                });

                                                context('when spot rate is unstable', () => {
                                                    beforeEach(async () => {
                                                        const spotRate = {
                                                            n: toWei(1_000_000),
                                                            d: toWei(10_000_000)
                                                        };

                                                        const { stakedBalance } = await poolCollection.poolLiquidity(
                                                            token.address
                                                        );
                                                        await poolCollection.setTradingLiquidityT(token.address, {
                                                            networkTokenTradingLiquidity: spotRate.n,
                                                            baseTokenTradingLiquidity: spotRate.d,
                                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                                            stakedBalance
                                                        });
                                                        await poolCollection.setAverageRateT(token.address, {
                                                            rate: {
                                                                n: spotRate.n.mul(PPM_RESOLUTION),
                                                                d: spotRate.d.mul(
                                                                    PPM_RESOLUTION + MAX_DEVIATION + toPPM(0.5)
                                                                )
                                                            },
                                                            time: 0
                                                        });

                                                        it('should revert when attempting to deposit', async () => {
                                                            const amount = BigNumber.from(1000);

                                                            await expect(deposit(amount)).to.be.revertedWith(
                                                                'NetworkLiquidityDisabled'
                                                            );
                                                        });
                                                    });
                                                });

                                                context('when spot rate is stable', () => {
                                                    if (isETH) {
                                                        // eslint-disable-next-line max-len
                                                        it('should revert when attempting to deposit a different amount than what was actually sent', async () => {
                                                            await expect(
                                                                deposit(amount, {
                                                                    value: amount.add(1)
                                                                })
                                                            ).to.be.revertedWith('EthAmountMismatch');

                                                            await expect(
                                                                deposit(amount, {
                                                                    value: amount.sub(1)
                                                                })
                                                            ).to.be.revertedWith('EthAmountMismatch');

                                                            await expect(
                                                                deposit(amount, { value: BigNumber.from(0) })
                                                            ).to.be.revertedWith('InvalidPool');
                                                        });
                                                    } else {
                                                        it('should revert when attempting to deposit ETH into a non ETH pool', async () => {
                                                            await expect(
                                                                deposit(amount, { value: BigNumber.from(1) })
                                                            ).to.be.revertedWith('InvalidPool');
                                                        });
                                                    }

                                                    it('should complete a deposit', async () => {
                                                        await test();
                                                    });

                                                    context(
                                                        'when close to the limit of the unallocated network token liquidity',
                                                        () => {
                                                            beforeEach(async () => {
                                                                await networkSettings.setPoolMintingLimit(
                                                                    token.address,
                                                                    1000
                                                                );
                                                            });

                                                            it('should complete a deposit', async () => {
                                                                await test();
                                                            });
                                                        }
                                                    );
                                                });
                                            });
                                        }
                                    });
                                });
                            };

                            for (const amount of [10, 10_000, toWei(1_000_000)]) {
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
                        const { v, r, s } = await permitContractSignature(
                            provider,
                            token.address,
                            network,
                            networkToken,
                            amount,
                            DEADLINE
                        );

                        await expect(
                            network.depositForPermitted(ZERO_ADDRESS, token.address, amount, DEADLINE, v, r, s)
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

                            const deposit = async (amount: BigNumber, overrides: Overrides = {}) => {
                                const { poolAddress = token.address } = overrides;

                                const { v, r, s } = await permitContractSignature(
                                    sender,
                                    poolAddress,
                                    network,
                                    networkToken,
                                    amount,
                                    DEADLINE
                                );

                                switch (method) {
                                    case Method.DepositPermitted:
                                        return network
                                            .connect(sender)
                                            .depositPermitted(poolAddress, amount, DEADLINE, v, r, s);

                                    case Method.DepositForPermitted:
                                        return network
                                            .connect(sender)
                                            .depositForPermitted(
                                                providerAddress,
                                                poolAddress,
                                                amount,
                                                DEADLINE,
                                                v,
                                                r,
                                                s
                                            );
                                }
                            };

                            it('should revert when attempting to deposit an invalid amount', async () => {
                                await expect(deposit(BigNumber.from(0))).to.be.revertedWith('ZeroValue');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(
                                    deposit(BigNumber.from(1), { poolAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('InvalidAddress');
                            });

                            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                                const token2 = await createTokenBySymbol(TKN);

                                await expect(
                                    deposit(BigNumber.from(1), {
                                        poolAddress: token2.address
                                    })
                                ).to.be.revertedWith('InvalidToken');
                            });

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () => verifyDeposit(provider, sender, amount, deposit);

                                context(`${amount} tokens`, () => {
                                    if (isNetworkToken || isETH) {
                                        it('should revert when attempting to deposit', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith('PermitUnsupported');
                                        });

                                        return;
                                    }

                                    beforeEach(async () => {
                                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                                        await reserveToken.transfer(senderAddress, amount);
                                    });

                                    context('when there is no unallocated network token liquidity', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setPoolMintingLimit(token.address, 0);
                                        });

                                        context('with a whitelisted token', async () => {
                                            it('should complete a deposit', async () => {
                                                await test();
                                            });
                                        });

                                        context('with non-whitelisted token', async () => {
                                            beforeEach(async () => {
                                                await networkSettings.removeTokenFromWhitelist(token.address);
                                            });

                                            it('should revert when attempting to deposit', async () => {
                                                const amount = BigNumber.from(1000);

                                                await expect(deposit(amount)).to.be.revertedWith('NotWhitelisted');
                                            });
                                        });
                                    });

                                    context('when there is enough unallocated network token liquidity', () => {
                                        beforeEach(async () => {
                                            await networkSettings.setPoolMintingLimit(token.address, MAX_UINT256);
                                        });

                                        context('with non-whitelisted token', async () => {
                                            beforeEach(async () => {
                                                await networkSettings.removeTokenFromWhitelist(token.address);
                                            });

                                            it('should revert when attempting to deposit', async () => {
                                                const amount = BigNumber.from(1000);

                                                await expect(deposit(amount)).to.be.revertedWith(
                                                    'NetworkLiquidityDisabled'
                                                );
                                            });
                                        });

                                        context('when spot rate is unstable', () => {
                                            beforeEach(async () => {
                                                const spotRate = {
                                                    n: toWei(1_000_000),
                                                    d: toWei(10_000_000)
                                                };

                                                const { stakedBalance } = await poolCollection.poolLiquidity(
                                                    token.address
                                                );
                                                await poolCollection.setTradingLiquidityT(token.address, {
                                                    networkTokenTradingLiquidity: spotRate.n,
                                                    baseTokenTradingLiquidity: spotRate.d,
                                                    tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                                    stakedBalance
                                                });
                                                await poolCollection.setAverageRateT(token.address, {
                                                    rate: {
                                                        n: spotRate.n.mul(PPM_RESOLUTION),
                                                        d: spotRate.d.mul(PPM_RESOLUTION + MAX_DEVIATION + toPPM(0.5))
                                                    },
                                                    time: 0
                                                });

                                                it('should revert when attempting to deposit', async () => {
                                                    const amount = BigNumber.from(1000);

                                                    await expect(deposit(amount)).to.be.revertedWith(
                                                        'NetworkLiquidityDisabled'
                                                    );
                                                });
                                            });
                                        });

                                        context('when spot rate is stable', () => {
                                            it('should complete a deposit', async () => {
                                                await test();
                                            });

                                            context(
                                                'when close to the limit of the unallocated network token liquidity',
                                                () => {
                                                    beforeEach(async () => {
                                                        await networkSettings.setPoolMintingLimit(token.address, 1000);
                                                    });

                                                    it('should complete a deposit', async () => {
                                                        await test();
                                                    });
                                                }
                                            );
                                        });
                                    });
                                });
                            };

                            for (const amount of [10, 10_000, toWei(1_000_000)]) {
                                testDepositAmount(BigNumber.from(amount));
                            }
                        });
                    }
                });
            };

            testDeposit();
            testDepositPermitted();
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testDeposits(symbol);
            });
        }
    });

    describe('withdraw', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let govToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;
        let externalProtectionVault: ExternalProtectionVault;

        const MAX_DEVIATION = toPPM(1);
        const MINTING_LIMIT = toWei(10_000_000);
        const WITHDRAWAL_FEE = toPPM(5);
        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        const setup = async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                masterPool,
                poolCollection,
                masterVault,
                pendingWithdrawals,
                masterPoolToken,
                externalProtectionVault
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await setTime(await latest());
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        it('should revert when attempting to withdraw a non-existing withdrawal request', async () => {
            await expect(network.withdraw(12_345)).to.be.revertedWith('AccessDenied');
        });

        const testWithdraw = async (symbol: string) => {
            const isNetworkToken = symbol === BNT;
            const isETH = symbol === ETH;

            context('with an initiated withdrawal request', () => {
                let provider: SignerWithAddress;
                let poolToken: PoolToken;
                let token: TokenWithAddress;
                let poolTokenAmount: BigNumber;
                let id: BigNumber;
                let creationTime: number;

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    if (isNetworkToken) {
                        token = networkToken;
                    } else {
                        token = await createTokenBySymbol(symbol);
                    }

                    // create a deposit
                    const amount = toWei(222_222_222);

                    if (isNetworkToken) {
                        poolToken = masterPoolToken;

                        const contextId = formatBytes32String('CTX');
                        const reserveToken = await createTokenBySymbol(TKN);
                        await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);

                        await network.requestLiquidityT(contextId, reserveToken.address, amount);
                    } else {
                        poolToken = await createPool(token, network, networkSettings, poolCollection);

                        await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                        await poolCollection.setDepositLimit(token.address, MAX_UINT256);
                        await poolCollection.setInitialRate(token.address, INITIAL_RATE);
                    }

                    await depositToPool(provider, token, amount, network);

                    poolTokenAmount = await poolToken.balanceOf(provider.address);

                    ({ id, creationTime } = await initWithdraw(
                        provider,
                        pendingWithdrawals,
                        poolToken,
                        await poolToken.balanceOf(provider.address)
                    ));
                });

                it('should revert when attempting to withdraw from a different provider', async () => {
                    await expect(network.connect(deployer).withdraw(id)).to.be.revertedWith('AccessDenied');
                });

                context('during the lock duration', () => {
                    beforeEach(async () => {
                        await setTime(creationTime + 1000);
                    });

                    it('should revert when attempting to withdraw', async () => {
                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith('WithdrawalNotAllowed');
                    });

                    context('after the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration + 1);
                        });

                        it('should revert when attempting to withdraw', async () => {
                            await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                'WithdrawalNotAllowed'
                            );
                        });
                    });

                    context('during the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration - 1);
                        });

                        if (isNetworkToken) {
                            it('should revert when attempting to withdraw without approving the governance token amount', async () => {
                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERR_UNDERFLOW'
                                );
                            });

                            it('should revert when attempting to withdraw with an insufficient governance token amount', async () => {
                                await govToken.connect(provider).transfer(deployer.address, 1);
                                await govToken.connect(provider).approve(network.address, poolTokenAmount);

                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERR_UNDERFLOW'
                                );
                            });
                        }

                        context('with approvals', () => {
                            let contextId: string;

                            beforeEach(async () => {
                                contextId = solidityKeccak256(
                                    ['address', 'uint32', 'uint256'],
                                    [provider.address, await network.currentTime(), id]
                                );

                                if (isNetworkToken) {
                                    await govToken.connect(provider).approve(network.address, poolTokenAmount);
                                }
                            });

                            const test = async () => {
                                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                                const prevPoolPoolTokenBalance = await poolToken.balanceOf(masterPool.address);
                                const prevCollectionPoolTokenBalance = await poolToken.balanceOf(
                                    poolCollection.address
                                );
                                const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);

                                const prevProviderTokenBalance = await getBalance(token, provider.address);

                                const prevGovTotalSupply = await govToken.totalSupply();
                                const prevPoolGovTokenBalance = await govToken.balanceOf(masterPool.address);
                                const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);

                                let transactionCost = BigNumber.from(0);

                                if (isNetworkToken) {
                                    const withdrawalAmounts = await masterPool.withdrawalAmountsT(poolTokenAmount);

                                    const res = await network.connect(provider).withdraw(id);

                                    await expect(res)
                                        .to.emit(network, 'NetworkTokenWithdrawn')
                                        .withArgs(
                                            contextId,
                                            provider.address,
                                            withdrawalAmounts.networkTokenAmount,
                                            poolTokenAmount,
                                            poolTokenAmount,
                                            withdrawalAmounts.withdrawalFeeAmount
                                        );

                                    await expect(res)
                                        .to.emit(network, 'TotalLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            await poolToken.totalSupply(),
                                            await masterPool.stakedBalance(),
                                            await getBalance(token, masterVault.address)
                                        );

                                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                                    expect(await poolToken.balanceOf(masterPool.address)).to.equal(
                                        prevPoolPoolTokenBalance.add(poolTokenAmount)
                                    );

                                    expect(await govToken.totalSupply()).to.equal(
                                        prevGovTotalSupply.sub(poolTokenAmount)
                                    );

                                    expect(await govToken.balanceOf(provider.address)).to.equal(
                                        prevProviderGovTokenBalance.sub(poolTokenAmount)
                                    );
                                } else {
                                    const withdrawalAmounts = await poolCollection.poolWithdrawalAmountsT(
                                        token.address,
                                        poolTokenAmount,
                                        await getBalance(token, masterVault.address),
                                        await getBalance(token, externalProtectionVault.address)
                                    );

                                    const res = await network.connect(provider).withdraw(id);

                                    if (isETH) {
                                        transactionCost = await getTransactionCost(res);
                                    }

                                    await expect(res)
                                        .to.emit(network, 'BaseTokenWithdrawn')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            provider.address,
                                            poolCollection.address,
                                            withdrawalAmounts.baseTokensToTransferFromMasterVault.add(
                                                withdrawalAmounts.baseTokensToTransferFromEPV
                                            ),
                                            poolTokenAmount,
                                            withdrawalAmounts.baseTokensToTransferFromEPV,
                                            withdrawalAmounts.networkTokensToMintForProvider,
                                            withdrawalAmounts.baseTokensWithdrawalFee
                                        );

                                    const poolLiquidity = await poolCollection.poolLiquidity(token.address);

                                    await expect(res)
                                        .to.emit(network, 'TotalLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            await poolToken.totalSupply(),
                                            poolLiquidity.stakedBalance,
                                            await getBalance(token, masterVault.address)
                                        );

                                    await expect(res)
                                        .to.emit(network, 'TradingLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            token.address,
                                            poolLiquidity.baseTokenTradingLiquidity
                                        );

                                    await expect(res)
                                        .to.emit(network, 'TradingLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            networkToken.address,
                                            poolLiquidity.networkTokenTradingLiquidity
                                        );

                                    expect(await poolToken.totalSupply()).to.equal(
                                        prevPoolTokenTotalSupply.sub(poolTokenAmount)
                                    );
                                    expect(await poolToken.balanceOf(masterPool.address)).to.equal(
                                        prevPoolPoolTokenBalance
                                    );

                                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply);
                                    expect(await govToken.balanceOf(provider.address)).to.equal(
                                        prevProviderGovTokenBalance
                                    );
                                }

                                expect(await poolToken.balanceOf(poolCollection.address)).to.equal(
                                    prevCollectionPoolTokenBalance
                                );
                                expect(await poolToken.balanceOf(provider.address)).to.equal(
                                    prevProviderPoolTokenBalance
                                );

                                expect(await govToken.balanceOf(masterPool.address)).to.equal(prevPoolGovTokenBalance);

                                // sanity test:
                                expect(await getBalance(token, provider.address)).to.be.gte(
                                    prevProviderTokenBalance.sub(transactionCost)
                                );

                                // TODO: test actual amounts
                                // TODO: test request/renounce liquidity
                                // TODO: test vault and external storage balances
                            };

                            if (isNetworkToken) {
                                it('should complete a withdraw', async () => {
                                    await test();
                                });
                            } else {
                                context('with non-whitelisted token', async () => {
                                    beforeEach(async () => {
                                        await networkSettings.removeTokenFromWhitelist(token.address);
                                    });

                                    it('should revert when attempting to withdraw', async () => {
                                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                            'NetworkLiquidityDisabled'
                                        );
                                    });
                                });

                                context('when spot rate is unstable', () => {
                                    beforeEach(async () => {
                                        const spotRate = {
                                            n: toWei(1_000_000),
                                            d: toWei(10_000_000)
                                        };

                                        const { stakedBalance } = await poolCollection.poolLiquidity(token.address);
                                        await poolCollection.setTradingLiquidityT(token.address, {
                                            networkTokenTradingLiquidity: spotRate.n,
                                            baseTokenTradingLiquidity: spotRate.d,
                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                            stakedBalance
                                        });
                                        await poolCollection.setAverageRateT(token.address, {
                                            rate: {
                                                n: spotRate.n.mul(PPM_RESOLUTION),
                                                d: spotRate.d.mul(PPM_RESOLUTION + MAX_DEVIATION + toPPM(0.5))
                                            },
                                            time: 0
                                        });
                                    });

                                    it('should revert when attempting to withdraw', async () => {
                                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                            'NetworkLiquidityDisabled'
                                        );
                                    });
                                });

                                context('when spot rate is stable', () => {
                                    it('should complete a withdraw', async () => {
                                        await test();
                                    });
                                });
                            }
                        });
                    });
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkInformation: BancorNetworkInformation;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);
        const NETWORK_TOKEN_LIQUIDITY = toWei(100_000);
        const MIN_RETURN_AMOUNT = BigNumber.from(1);

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;

        beforeEach(async () => {
            ({ network, networkInformation, networkSettings, networkToken, masterPool, poolCollection, masterVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            trader = await createWallet();

            ({ token: sourceToken } = await setupSimplePool(
                source,
                deployer,
                network,
                networkInformation,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupSimplePool(
                target,
                deployer,
                network,
                networkInformation,
                networkSettings,
                poolCollection
            ));

            await depositToPool(deployer, networkToken, NETWORK_TOKEN_LIQUIDITY, network);

            await network.setTime(await latest());
        };

        interface TradeOverrides {
            value?: BigNumber;
            minReturnAmount?: BigNumber;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }

        const trade = async (amount: BigNumber, overrides: TradeOverrides = {}) => {
            let {
                value,
                minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address
            } = overrides;

            if (!value) {
                value = BigNumber.from(0);
                if (sourceTokenAddress === NATIVE_TOKEN_ADDRESS) {
                    value = amount;
                }
            }

            return network
                .connect(trader)
                .trade(sourceTokenAddress, targetTokenAddress, amount, minReturnAmount, deadline, beneficiary, {
                    value
                });
        };

        interface TradePermittedOverrides {
            minReturnAmount?: BigNumber;
            deadline?: BigNumberish;
            beneficiary?: string;
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
            approvedAmount?: BigNumber;
        }

        const tradePermitted = async (amount: BigNumber, overrides: TradePermittedOverrides = {}) => {
            const {
                minReturnAmount = MIN_RETURN_AMOUNT,
                deadline = MAX_UINT256,
                beneficiary = ZERO_ADDRESS,
                sourceTokenAddress = sourceToken.address,
                targetTokenAddress = targetToken.address,
                approvedAmount = amount
            } = overrides;

            const { v, r, s } = await permitContractSignature(
                trader,
                sourceTokenAddress,
                network,
                networkToken,
                approvedAmount,
                deadline
            );

            return network
                .connect(trader)
                .tradePermitted(
                    sourceTokenAddress,
                    targetTokenAddress,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary,
                    v,
                    r,
                    s
                );
        };

        const verifyTrade = async (
            trader: Signer | Wallet,
            beneficiaryAddress: string,
            amount: BigNumber,
            trade: (
                amount: BigNumber,
                options: TradeOverrides | TradePermittedOverrides
            ) => Promise<ContractTransaction>
        ) => {
            const isSourceETH = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetETH = targetToken.address === NATIVE_TOKEN_ADDRESS;
            const isSourceNetworkToken = sourceToken.address === networkToken.address;
            const isTargetNetworkToken = targetToken.address === networkToken.address;

            const traderAddress = await trader.getAddress();
            const minReturnAmount = MIN_RETURN_AMOUNT;
            const deadline = MAX_UINT256;
            const beneficiary = beneficiaryAddress !== ZERO_ADDRESS ? beneficiaryAddress : traderAddress;

            const contextId = solidityKeccak256(
                ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'address'],
                [
                    traderAddress,
                    await network.currentTime(),
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    minReturnAmount,
                    deadline,
                    beneficiary
                ]
            );

            const prevTraderSourceTokenAmount = await getBalance(sourceToken, traderAddress);
            const prevVaultSourceTokenAmount = await getBalance(sourceToken, masterVault.address);

            const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiary);
            const prevVaultTargetTokenAmount = await getBalance(targetToken, masterVault.address);

            const prevTraderNetworkTokenAmount = await getBalance(networkToken, traderAddress);
            const prevBeneficiaryNetworkTokenAmount = await getBalance(networkToken, beneficiary);
            const prevVaultNetworkTokenAmount = await getBalance(networkToken, masterVault.address);

            const prevMasterPoolStakedBalance = await masterPool.stakedBalance();

            let sourceTradeAmounts!: AsyncReturnType<TestBancorNetwork['callStatic']['tradePoolCollectionT']>;
            let tradeAmounts;
            if (isSourceNetworkToken || isTargetNetworkToken) {
                tradeAmounts = await network.callStatic.tradePoolCollectionT(
                    poolCollection.address,
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    MIN_RETURN_AMOUNT
                );
            } else {
                sourceTradeAmounts = await network.callStatic.tradePoolCollectionT(
                    poolCollection.address,
                    sourceToken.address,
                    networkToken.address,
                    amount,
                    MIN_RETURN_AMOUNT
                );

                tradeAmounts = await network.callStatic.tradePoolCollectionT(
                    poolCollection.address,
                    networkToken.address,
                    targetToken.address,
                    sourceTradeAmounts.amount,
                    MIN_RETURN_AMOUNT
                );
            }

            const targetAmount = await networkInformation.tradeTargetAmount(
                sourceToken.address,
                targetToken.address,
                amount
            );
            expect(targetAmount).to.equal(tradeAmounts.amount);

            const res = await trade(amount, { minReturnAmount, beneficiary: beneficiaryAddress, deadline });

            const transactionCost = await getTransactionCost(res);

            const masterPoolStakedBalance = await masterPool.stakedBalance();

            if (isSourceNetworkToken) {
                const poolLiquidity = await poolCollection.poolLiquidity(targetToken.address);

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        targetToken.address,
                        amount,
                        tradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        FeeTypes.Trading,
                        tradeAmounts.feeAmount,
                        poolLiquidity.stakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        targetToken.address,
                        poolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        poolLiquidity.networkTokenTradingLiquidity
                    );
            } else if (isTargetNetworkToken) {
                const poolLiquidity = await poolCollection.poolLiquidity(sourceToken.address);

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        networkToken.address,
                        amount,
                        tradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        FeeTypes.Trading,
                        tradeAmounts.feeAmount,
                        masterPoolStakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        poolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        networkToken.address,
                        poolLiquidity.networkTokenTradingLiquidity
                    );

                expect(masterPoolStakedBalance).to.equal(prevMasterPoolStakedBalance.add(tradeAmounts.feeAmount));
            } else {
                const sourcePoolLiquidity = await poolCollection.poolLiquidity(sourceToken.address);
                const targetPoolLiquidity = await poolCollection.poolLiquidity(targetToken.address);

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        networkToken.address,
                        amount,
                        sourceTradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        networkToken.address,
                        FeeTypes.Trading,
                        sourceTradeAmounts.feeAmount,
                        masterPoolStakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        sourceToken.address,
                        sourcePoolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        sourceToken.address,
                        networkToken.address,
                        sourcePoolLiquidity.networkTokenTradingLiquidity
                    );

                expect(masterPoolStakedBalance).to.equal(prevMasterPoolStakedBalance.add(sourceTradeAmounts.feeAmount));

                await expect(res)
                    .to.emit(network, 'TokensTraded')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        targetToken.address,
                        sourceTradeAmounts.amount,
                        tradeAmounts.amount,
                        traderAddress
                    );

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        FeeTypes.Trading,
                        tradeAmounts.feeAmount,
                        targetPoolLiquidity.stakedBalance
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        targetToken.address,
                        targetPoolLiquidity.baseTokenTradingLiquidity
                    );

                await expect(res)
                    .to.emit(network, 'TradingLiquidityUpdated')
                    .withArgs(
                        contextId,
                        targetToken.address,
                        networkToken.address,
                        targetPoolLiquidity.networkTokenTradingLiquidity
                    );
            }

            expect(await getBalance(sourceToken, traderAddress)).to.equal(
                prevTraderSourceTokenAmount.sub(amount.add(isSourceETH ? transactionCost : BigNumber.from(0)))
            );
            expect(await getBalance(sourceToken, masterVault.address)).to.equal(prevVaultSourceTokenAmount.add(amount));

            expect(await getBalance(targetToken, beneficiary)).to.equal(
                prevBeneficiaryTargetTokenAmount.add(
                    targetAmount.sub(traderAddress === beneficiary && isTargetETH ? transactionCost : BigNumber.from(0))
                )
            );
            expect(await getBalance(targetToken, masterVault.address)).to.equal(
                prevVaultTargetTokenAmount.sub(targetAmount)
            );

            // if neither the source or the target tokens are the network token - ensure that no network
            // token amount has left the system
            if (!isSourceNetworkToken && !isTargetNetworkToken) {
                expect(await getBalance(networkToken, traderAddress)).to.equal(prevTraderNetworkTokenAmount);
                expect(await getBalance(networkToken, beneficiary)).to.equal(prevBeneficiaryNetworkTokenAmount);
                expect(await getBalance(networkToken, masterVault.address)).to.equal(prevVaultNetworkTokenAmount);
            }
        };

        const testTradesBasic = (source: PoolSpec, target: PoolSpec) => {
            const isSourceETH = source.symbol === ETH;
            const isSourceNetworkToken = source.symbol === BNT;

            context(`basic trades from ${source.symbol} to ${target.symbol}`, () => {
                const testAmount = BigNumber.from(10_000);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

                        await reserveToken.transfer(await trader.getAddress(), testAmount);
                        await reserveToken.connect(trader).approve(network.address, testAmount);
                    }
                });

                const options = !isSourceNetworkToken && !isSourceETH ? [false, true] : [false];
                for (const permitted of options) {
                    context(`${permitted ? 'regular' : 'permitted'} trade`, () => {
                        const tradeFunc = permitted ? tradePermitted : trade;

                        it('should revert when attempting to trade using an invalid source pool', async () => {
                            await expect(
                                tradeFunc(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradePermitted(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                        });

                        it('should revert when attempting to trade using an invalid target pool', async () => {
                            await expect(
                                tradeFunc(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                        });

                        it('should revert when attempting to trade using an invalid amount', async () => {
                            const amount = BigNumber.from(0);

                            await expect(tradeFunc(amount)).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to trade using an invalid minimum return amount', async () => {
                            const minReturnAmount = BigNumber.from(0);

                            await expect(tradeFunc(testAmount, { minReturnAmount })).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to trade using an expired deadline', async () => {
                            const deadline = (await latest()) - 1000;

                            await expect(tradeFunc(testAmount, { deadline })).to.be.revertedWith(
                                permitted ? 'ERC20Permit: expired deadline' : 'DeadlineExpired'
                            );
                        });

                        it('should revert when attempting to trade using unsupported tokens', async () => {
                            const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

                            await reserveToken2.transfer(await trader.getAddress(), testAmount);
                            await reserveToken2.connect(trader).approve(network.address, testAmount);

                            // unknown source token
                            await expect(
                                trade(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');

                            // unknown target token
                            await expect(
                                trade(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                        });

                        it('should revert when attempting to trade using same source and target tokens', async () => {
                            await expect(
                                trade(testAmount, { targetTokenAddress: sourceToken.address })
                            ).to.be.revertedWith('InvalidTokens');
                        });

                        it('should support a custom beneficiary', async () => {
                            const trader2 = (await ethers.getSigners())[9];
                            await verifyTrade(trader, trader2.address, testAmount, trade);
                        });
                    });
                }

                if (isSourceETH) {
                    it('should revert when attempting to trade a different amount than what was actually sent', async () => {
                        await expect(
                            trade(testAmount, {
                                value: testAmount.add(1)
                            })
                        ).to.be.revertedWith('EthAmountMismatch');

                        await expect(
                            trade(testAmount, {
                                value: testAmount.sub(1)
                            })
                        ).to.be.revertedWith('EthAmountMismatch');

                        await expect(trade(testAmount, { value: BigNumber.from(0) })).to.be.revertedWith('InvalidPool');
                    });
                } else {
                    it('should revert when passing ETH with a non ETH trade', async () => {
                        await expect(trade(testAmount, { value: BigNumber.from(1) })).to.be.revertedWith('InvalidPool');
                    });

                    context('with an insufficient approval', () => {
                        const extraAmount = 10;
                        const testAmount2 = testAmount.add(extraAmount);

                        beforeEach(async () => {
                            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                            await reserveToken.transfer(await trader.getAddress(), extraAmount);
                        });

                        it('should revert when attempting to trade', async () => {
                            await expect(trade(testAmount2)).to.be.revertedWith(
                                errorMessageTokenExceedsAllowance(source.symbol)
                            );
                        });

                        if (!isSourceNetworkToken) {
                            it('should revert when attempting to trade permitted', async () => {
                                await expect(
                                    tradePermitted(testAmount2, { approvedAmount: testAmount })
                                ).to.be.revertedWith('ERC20Permit: invalid signature');
                            });
                        }
                    });
                }
            });

            // perform permitted trades suite over a fixed input
            testPermittedTrades(source, target, toWei(100_000));
        };

        const testTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceETH = source.symbol === ETH;

            context(`trade ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const TRADES_COUNT = 2;

                const test = async () => {
                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.connect(trader).approve(network.address, amount);
                    }

                    await verifyTrade(trader, ZERO_ADDRESS, amount, trade);
                };

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount.mul(BigNumber.from(TRADES_COUNT)));
                    }
                });

                it('should complete multiple trades', async () => {
                    for (let i = 0; i < TRADES_COUNT; i++) {
                        await test();
                    }
                });
            });
        };

        const testPermittedTrades = (source: PoolSpec, target: PoolSpec, amount: BigNumber) => {
            const isSourceETH = source.symbol === ETH;
            const isSourceNetworkToken = source.symbol === BNT;

            context(`trade permitted ${amount} tokens from ${specToString(source)} to ${specToString(target)}`, () => {
                const test = async () => verifyTrade(trader, ZERO_ADDRESS, amount, tradePermitted);

                beforeEach(async () => {
                    await setupPools(source, target);

                    if (!isSourceETH) {
                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                        await reserveToken.transfer(trader.address, amount);
                    }
                });

                if (isSourceNetworkToken || isSourceETH) {
                    it('should revert when attempting to trade', async () => {
                        await expect(tradePermitted(amount)).to.be.revertedWith('PermitUnsupported');
                    });

                    return;
                }

                it('should complete a trade', async () => {
                    await test();
                });
            });
        };

        for (const [sourceSymbol, targetSymbol] of [
            [TKN, BNT],
            [TKN, ETH],
            [`${TKN}1`, `${TKN}2`],
            [BNT, ETH],
            [BNT, TKN],
            [ETH, BNT],
            [ETH, TKN]
        ]) {
            // perform a basic/sanity suite over a fixed input
            testTradesBasic(
                {
                    symbol: sourceSymbol,
                    balance: toWei(1_000_000),
                    initialRate: INITIAL_RATE
                },
                {
                    symbol: targetSymbol,
                    balance: toWei(5_000_000),
                    initialRate: INITIAL_RATE
                }
            );

            for (const sourceBalance of [toWei(1_000_000), toWei(50_000_000)]) {
                for (const targetBalance of [toWei(1_000_000), toWei(50_000_000)]) {
                    for (const amount of [10_000, toWei(500_000)]) {
                        const TRADING_FEES = [0, 5];
                        for (const tradingFeePercent of TRADING_FEES) {
                            const isSourceNetworkToken = sourceSymbol === BNT;
                            const isTargetNetworkToken = targetSymbol === BNT;

                            // if either the source or the target token is the network token - only test fee in one of
                            // the directions
                            if (isSourceNetworkToken || isTargetNetworkToken) {
                                testTrades(
                                    {
                                        symbol: sourceSymbol,
                                        balance: sourceBalance,
                                        tradingFeePPM: isSourceNetworkToken ? undefined : toPPM(tradingFeePercent),
                                        initialRate: INITIAL_RATE
                                    },
                                    {
                                        symbol: targetSymbol,
                                        balance: targetBalance,
                                        tradingFeePPM: isTargetNetworkToken ? undefined : toPPM(tradingFeePercent),
                                        initialRate: INITIAL_RATE
                                    },
                                    BigNumber.from(amount)
                                );
                            } else {
                                for (const tradingFeePercent2 of TRADING_FEES) {
                                    testTrades(
                                        {
                                            symbol: sourceSymbol,
                                            balance: sourceBalance,
                                            tradingFeePPM: toPPM(tradingFeePercent),
                                            initialRate: INITIAL_RATE
                                        },
                                        {
                                            symbol: targetSymbol,
                                            balance: targetBalance,
                                            tradingFeePPM: toPPM(tradingFeePercent2),
                                            initialRate: INITIAL_RATE
                                        },
                                        BigNumber.from(amount)
                                    );
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
        let networkInformation: BancorNetworkInformation;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;

        const amount = toWei(123_456);

        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);
        const ZERO_BYTES = '0x';
        const ZERO_BYTES32 = formatBytes32String('');

        const setup = async () => {
            ({ network, networkInformation, networkSettings, networkToken, masterPool, poolCollection, masterVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setPoolMintingLimit(networkToken.address, MAX_UINT256);

            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        describe('basic tests', () => {
            beforeEach(async () => {
                ({ token } = await setupSimplePool(
                    {
                        symbol: TKN,
                        balance: amount,
                        initialRate: INITIAL_RATE
                    },
                    deployer,
                    network,
                    networkInformation,
                    networkSettings,
                    poolCollection
                ));
            });

            it('should revert when attempting to request a flash-loan of an invalid token', async () => {
                await expect(network.flashLoan(ZERO_ADDRESS, amount, recipient.address, ZERO_BYTES)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            it('should revert when attempting to request a flash-loan of a non-whitelisted token', async () => {
                const reserveToken = await createTokenBySymbol(TKN);
                await expect(
                    network.flashLoan(reserveToken.address, amount, recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('NotWhitelisted');
            });

            it('should revert when attempting to request a flash-loan of an invalid amount', async () => {
                await expect(
                    network.flashLoan(token.address, BigNumber.from(0), recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('ZeroValue');
            });

            it('should revert when attempting to request a flash-loan for an invalid recipient', async () => {
                await expect(network.flashLoan(token.address, amount, ZERO_ADDRESS, ZERO_BYTES)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            context('reentering', () => {
                beforeEach(async () => {
                    await recipient.setReenter(true);
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(
                        network.flashLoan(token.address, amount, recipient.address, ZERO_BYTES)
                    ).to.be.revertedWith('ReentrancyGuard: reentrant call');
                });
            });

            it('should revert when attempting to request a flash-loan of more than the pool has', async () => {
                await expect(
                    network.flashLoan(token.address, amount.add(1), recipient.address, ZERO_BYTES)
                ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
            });
        });

        const testFlashLoan = async (symbol: string, flashLoanFeePPM: number) => {
            const feeAmount = amount.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            beforeEach(async () => {
                if (symbol === BNT) {
                    token = networkToken;

                    const reserveToken = await createTokenBySymbol(TKN);

                    await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);
                    await network.requestLiquidityT(ZERO_BYTES32, reserveToken.address, amount);

                    await depositToPool(deployer, networkToken, amount, network);
                } else {
                    ({ token } = await setupSimplePool(
                        {
                            symbol,
                            balance: amount,
                            initialRate: INITIAL_RATE
                        },
                        deployer,
                        network,
                        networkInformation,
                        networkSettings,
                        poolCollection
                    ));
                }

                await networkSettings.setFlashLoanFeePPM(flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, feeAmount);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const prevVaultBalance = await getBalance(token, masterVault.address);
                const prevNetworkBalance = await getBalance(token, network.address);

                let prevStakedBalance;
                if (symbol === BNT) {
                    prevStakedBalance = await masterPool.stakedBalance();
                } else {
                    prevStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
                }

                const data = '0x1234';
                const contextId = solidityKeccak256(
                    ['address', 'uint32', 'address', 'uint256', 'address', 'bytes'],
                    [deployer.address, await network.currentTime(), token.address, amount, recipient.address, data]
                );

                const res = network.flashLoan(token.address, amount, recipient.address, data);

                await expect(res)
                    .to.emit(network, 'FlashLoanCompleted')
                    .withArgs(contextId, token.address, deployer.address, amount);

                await expect(res)
                    .to.emit(network, 'FeesCollected')
                    .withArgs(
                        contextId,
                        token.address,
                        FeeTypes.FlashLoan,
                        feeAmount,
                        prevStakedBalance.add(feeAmount)
                    );

                const callbackData = await recipient.callbackData();
                expect(callbackData.sender).to.equal(deployer.address);
                expect(callbackData.token).to.equal(token.address);
                expect(callbackData.amount).to.equal(amount);
                expect(callbackData.feeAmount).to.equal(feeAmount);
                expect(callbackData.data).to.equal(data);
                expect(callbackData.receivedAmount).to.equal(amount);

                expect(await getBalance(token, masterVault.address)).to.be.gte(prevVaultBalance.add(feeAmount));
                expect(await getBalance(token, network.address)).to.equal(prevNetworkBalance);
            };

            context('not repaying the original amount', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(amount.sub(1));
                });

                it('should revert when attempting to request a flash-loan', async () => {
                    await expect(
                        network.flashLoan(token.address, amount, recipient.address, ZERO_BYTES)
                    ).to.be.revertedWith('InsufficientFlashLoanReturn');
                });
            });

            if (flashLoanFeePPM > 0) {
                context('not repaying the fee', () => {
                    beforeEach(async () => {
                        await recipient.setAmountToReturn(amount);
                    });

                    it('should revert when attempting to request a flash-loan', async () => {
                        await expect(
                            network.flashLoan(token.address, amount, recipient.address, ZERO_BYTES)
                        ).to.be.revertedWith('InsufficientFlashLoanReturn');
                    });
                });
            }

            context('repaying more than required', () => {
                beforeEach(async () => {
                    const extraReturn = toWei(12_345);

                    await transfer(deployer, token, recipient.address, extraReturn);
                    await recipient.snapshot(token.address);

                    await recipient.setAmountToReturn(amount.add(feeAmount).add(extraReturn));
                });

                it('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });

            context('returning just about right', () => {
                beforeEach(async () => {
                    await recipient.setAmountToReturn(amount.add(feeAmount));
                });

                it('should succeed requesting a flash-loan', async () => {
                    await test();
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            for (const flashLoanFee of [0, 1, 10]) {
                context(`${symbol} with fee=${flashLoanFee}%`, () => {
                    testFlashLoan(symbol, toPPM(flashLoanFee));
                });
            }
        }
    });

    describe('migrate liquidity', () => {
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let govToken: IERC20;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;

        const MAX_DEVIATION = toPPM(1);
        const MINTING_LIMIT = toWei(10_000_000);
        const WITHDRAWAL_FEE = toPPM(5);
        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);
        const DEPOSIT_LIMIT = toWei(100_000_000);

        const setup = async () => {
            ({
                networkTokenGovernance,
                govTokenGovernance,
                network,
                networkSettings,
                networkToken,
                govToken,
                poolCollection,
                masterVault
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
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

            const expectInRange = (x: BigNumber, y: BigNumber) => {
                expect(x).to.gte(y.sub(maxOffset.negative));
                expect(x).to.lte(y.add(maxOffset.positive));
            };

            const addProtectedLiquidity = async (
                poolTokenAddress: string,
                token: IERC20,
                tokenAddress: string,
                amount: BigNumber,
                isETH: boolean,
                from: SignerWithAddress
            ) => {
                let value = BigNumber.from(0);
                if (isETH) {
                    value = amount;
                } else {
                    await token.connect(from).approve(liquidityProtection.address, amount);
                }

                return liquidityProtection
                    .connect(from)
                    .addLiquidity(poolTokenAddress, tokenAddress, amount, { value });
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
                isETH: boolean
            ) => {
                const poolTokenAddress = poolToken.address;
                const reserveTokenAddress = isETH ? NATIVE_TOKEN_ADDRESS : reserveToken.address;
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
                isETH: boolean
            ) => {
                const poolTokenAddress = poolToken.address;
                const reserveTokenAddress = isETH ? NATIVE_TOKEN_ADDRESS : reserveToken.address;
                return {
                    totalProviderAmount: await liquidityProtectionStats.totalProviderAmount(
                        provider.address,
                        poolTokenAddress,
                        reserveTokenAddress
                    ),
                    providerPools: await liquidityProtectionStats.providerPools(provider.address)
                };
            };

            const setTime = async (time: number) => {
                now = time;

                for (const t of [converter, checkpointStore, liquidityProtection]) {
                    if (t) {
                        await t.setTime(now);
                    }
                }
            };

            const initLegacySystem = async (isETH: boolean) => {
                [owner, provider] = await ethers.getSigners();

                baseToken = (await createTokenBySymbol(isETH ? ETH : TKN)) as IERC20;

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
                    networkToken,
                    networkTokenGovernance,
                    govTokenGovernance,
                    baseToken
                ));

                await networkTokenGovernance.mint(owner.address, totalSupply);

                await liquidityProtectionSettings.setMinNetworkTokenLiquidityForMinting(100);
                await liquidityProtectionSettings.setMinNetworkCompensation(3);

                await network.grantRole(BancorNetworkRoles.ROLE_MIGRATION_MANAGER, liquidityProtection.address);
                await networkTokenGovernance.grantRole(roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);
                await govTokenGovernance.grantRole(roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);

                await createPool(baseToken, network, networkSettings, poolCollection);
                await networkSettings.setPoolMintingLimit(baseToken.address, MINTING_LIMIT);
                await poolCollection.setDepositLimit(baseToken.address, DEPOSIT_LIMIT);
                await poolCollection.setInitialRate(baseToken.address, INITIAL_RATE);

                await networkToken.approve(converter.address, reserve2Amount);

                let value = BigNumber.from(0);
                if (isETH) {
                    value = reserve1Amount;
                } else {
                    await baseToken.approve(converter.address, reserve1Amount);
                }

                await converter.addLiquidity(
                    [baseToken.address, networkToken.address],
                    [reserve1Amount, reserve2Amount],
                    1,
                    {
                        value: value
                    }
                );

                await liquidityProtectionSettings.addPoolToWhitelist(poolToken.address);

                await setTime(await latest());
            };

            for (const isETH of [false, true]) {
                describe(`base token (${isETH ? 'ETH' : 'ERC20'})`, () => {
                    beforeEach(async () => {
                        await initLegacySystem(isETH);
                        await addProtectedLiquidity(
                            poolToken.address,
                            baseToken,
                            baseToken.address,
                            BigNumber.from(1000),
                            isETH,
                            owner
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

                        const prevPoolStats = await getPoolStats(poolToken, baseToken, isETH);
                        const prevProviderStats = await getProviderStats(owner, poolToken, baseToken, isETH);

                        const prevSystemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);

                        const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const prevVaultNetworkBalance = await getBalance(networkToken, masterVault.address);

                        await liquidityProtection.setTime(now + duration.seconds(1));

                        const prevWalletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);
                        const prevBalance = await getBalance(baseToken, owner.address);
                        const prevGovBalance = await govToken.balanceOf(owner.address);

                        const res = await liquidityProtection.migratePositions([protectionId]);
                        const transactionCost = isETH ? await getTransactionCost(res) : BigNumber.from(0);

                        // verify protected liquidities
                        expect(await liquidityProtectionStore.protectedLiquidityIds(owner.address)).to.be.empty;

                        // verify stats
                        const poolStats = await getPoolStats(poolToken, baseToken, isETH);
                        expect(poolStats.totalPoolAmount).to.equal(
                            prevPoolStats.totalPoolAmount.sub(protection.poolAmount)
                        );
                        expect(poolStats.totalReserveAmount).to.equal(
                            prevPoolStats.totalReserveAmount.sub(protection.reserveAmount)
                        );

                        const providerStats = await getProviderStats(owner, poolToken, baseToken, isETH);
                        expect(providerStats.totalProviderAmount).to.equal(
                            prevProviderStats.totalProviderAmount.sub(protection.reserveAmount)
                        );
                        expect(providerStats.providerPools).to.deep.equal([poolToken.address]);

                        // verify balances
                        const systemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                        expectInRange(systemBalance, prevSystemBalance.sub(protection.poolAmount));

                        const vaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const vaultNetworkBalance = await getBalance(networkToken, masterVault.address);
                        expectInRange(vaultBaseBalance, prevVaultBaseBalance.add(protection.reserveAmount));
                        expectInRange(
                            vaultNetworkBalance,
                            prevVaultNetworkBalance.add(protection.reserveAmount.div(2))
                        );

                        const walletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);

                        // double since system balance was also liquidated
                        const delta = protection.poolAmount.mul(2);
                        expectInRange(walletBalance, prevWalletBalance.sub(delta));

                        const balance = await getBalance(baseToken, owner.address);
                        expect(balance).to.equal(prevBalance.sub(transactionCost));

                        const govBalance = await govToken.balanceOf(owner.address);
                        expect(govBalance).to.equal(prevGovBalance);

                        const protectionPoolBalance = await poolToken.balanceOf(liquidityProtection.address);
                        expect(protectionPoolBalance).to.equal(0);

                        const protectionBaseBalance = await getBalance(baseToken, liquidityProtection.address);
                        expect(protectionBaseBalance).to.equal(0);

                        const protectionNetworkBalance = await networkToken.balanceOf(liquidityProtection.address);
                        expect(protectionNetworkBalance).to.equal(0);
                    });

                    it('verifies that the owner can migrate system pool tokens', async () => {
                        const protectionId = (await liquidityProtectionStore.protectedLiquidityIds(owner.address))[0];
                        const protection = await getProtection(protectionId);

                        const prevSystemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);

                        const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const prevVaultNetworkBalance = await getBalance(networkToken, masterVault.address);

                        await liquidityProtection.setTime(now + duration.seconds(1));

                        const prevGovBalance = await govToken.balanceOf(owner.address);

                        await liquidityProtection.migrateSystemPoolTokens([poolToken.address]);

                        // verify balances
                        const systemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                        expect(systemBalance).to.equal(prevSystemBalance.sub(protection.poolAmount));

                        const vaultBaseBalance = await getBalance(baseToken, masterVault.address);
                        const vaultNetworkBalance = await getBalance(networkToken, masterVault.address);
                        expect(vaultBaseBalance).to.equal(prevVaultBaseBalance.add(protection.reserveAmount.div(2)));
                        expect(vaultNetworkBalance).to.equal(prevVaultNetworkBalance);

                        const govBalance = await govToken.balanceOf(owner.address);
                        expect(govBalance).to.equal(prevGovBalance);

                        const protectionPoolBalance = await poolToken.balanceOf(liquidityProtection.address);
                        expect(protectionPoolBalance).to.equal(0);

                        const protectionBaseBalance = await getBalance(baseToken, liquidityProtection.address);
                        expect(protectionBaseBalance).to.equal(0);

                        const protectionNetworkBalance = await networkToken.balanceOf(liquidityProtection.address);
                        expect(protectionNetworkBalance).to.equal(0);
                    });
                });
            }

            describe('network token', () => {
                beforeEach(async () => {
                    await initLegacySystem(false);

                    const amount = BigNumber.from(100_000);
                    await baseToken.transfer(provider.address, amount);
                    await baseToken.connect(provider).approve(network.address, amount);
                    await network.connect(provider).deposit(baseToken.address, amount);

                    const amount1 = BigNumber.from(5000);
                    await baseToken.transfer(provider.address, amount1);
                    await addProtectedLiquidity(
                        poolToken.address,
                        baseToken,
                        baseToken.address,
                        amount1,
                        false,
                        provider
                    );

                    const amount2 = BigNumber.from(1000);
                    await addProtectedLiquidity(
                        poolToken.address,
                        networkToken,
                        networkToken.address,
                        amount2,
                        false,
                        owner
                    );
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

                    const prevPoolStats = await getPoolStats(poolToken, networkToken, false);
                    const prevProviderStats = await getProviderStats(owner, poolToken, networkToken, false);
                    const prevSystemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                    const prevWalletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);
                    const prevBalance = await getBalance(networkToken, owner.address);
                    const prevGovBalance = await govToken.balanceOf(owner.address);

                    const prevVaultBaseBalance = await getBalance(baseToken, masterVault.address);
                    const prevVaultNetworkBalance = await getBalance(networkToken, masterVault.address);

                    await liquidityProtection.setTime(now + duration.seconds(1));
                    await liquidityProtection.migratePositions([protectionId]);

                    // verify protected liquidities
                    expect(await liquidityProtectionStore.protectedLiquidityIds(owner.address)).to.be.empty;

                    // verify stats
                    const poolStats = await getPoolStats(poolToken, networkToken, false);
                    expect(poolStats.totalPoolAmount).to.equal(prevSystemBalance.add(protection.poolAmount));
                    expect(poolStats.totalReserveAmount).to.equal(
                        prevPoolStats.totalReserveAmount.sub(protection.reserveAmount)
                    );

                    const providerStats = await getProviderStats(owner, poolToken, networkToken, false);
                    expect(providerStats.totalProviderAmount).to.equal(
                        prevProviderStats.totalProviderAmount.sub(protection.reserveAmount)
                    );
                    expect(prevProviderStats.providerPools).to.deep.equal([poolToken.address]);

                    // verify balances
                    const systemBalance = await liquidityProtectionSystemStore.systemBalance(poolToken.address);
                    expect(systemBalance).to.equal(prevSystemBalance.add(protection.poolAmount));

                    const vaultBaseBalance = await getBalance(baseToken, masterVault.address);
                    const vaultNetworkBalance = await getBalance(networkToken, masterVault.address);
                    expect(vaultBaseBalance).to.equal(prevVaultBaseBalance);
                    expect(vaultNetworkBalance).to.equal(prevVaultNetworkBalance);

                    const walletBalance = await poolToken.balanceOf(liquidityProtectionWallet.address);
                    expect(walletBalance).to.equal(prevWalletBalance);

                    const balance = await getBalance(networkToken, owner.address);
                    expect(balance).to.almostEqual(new Decimal(prevBalance.add(protection.reserveAmount).toString()), {
                        maxRelativeError
                    });

                    const govBalance = await govToken.balanceOf(owner.address);
                    expect(govBalance).to.equal(prevGovBalance);

                    const protectionPoolBalance = await poolToken.balanceOf(liquidityProtection.address);
                    expect(protectionPoolBalance).to.equal(0);

                    const protectionBaseBalance = await getBalance(baseToken, liquidityProtection.address);
                    expect(protectionBaseBalance).to.equal(0);

                    const protectionNetworkBalance = await networkToken.balanceOf(liquidityProtection.address);
                    expectInRange(protectionNetworkBalance, BigNumber.from(0));
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
});

describe('BancorNetwork Financial Verification', () => {
    interface User {
        id: string;
        tknBalance: number;
        bntBalance: number;
    }

    interface Pool {
        tknInitialRate: number;
        bntInitialRate: number;
        bntMinLiquidity: number;
        bntMintingLimit: number;
    }

    interface State {
        tknBalances: Record<string, string>;
        bntBalances: Record<string, string>;
        bntknBalances: Record<string, string>;
        bnbntBalances: Record<string, string>;
        bntStakedBalance: string;
        tknStakedBalance: string;
        tknTradingLiquidity: string;
        bntTradingLiquidity: string;
    }

    interface Operation {
        type: string;
        userId: string;
        amount: string;
        elapsed: number;
        expected: State;
    }

    interface Flow {
        tradingFee: string;
        withdrawalFee: string;
        epVaultBalance: number;
        tknDecimals: number;
        users: User[];
        pool: Pool;
        operations: Operation[];
    }

    let users: { [id: string]: SignerWithAddress };
    let timestamp: number;
    let flow: Flow;

    let network: TestBancorNetwork;
    let networkToken: IERC20;
    let networkSettings: NetworkSettings;
    let masterPool: TestMasterPool;
    let networkTokenGovernance: TokenGovernance;
    let pendingWithdrawals: PendingWithdrawals;
    let poolCollection: TestPoolCollection;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let baseToken: TestERC20Burnable;
    let basePoolToken: PoolToken;
    let masterPoolToken: PoolToken;
    let govToken: IERC20;
    let tknDecimals: number;
    let bntDecimals: number;
    let bntknDecimals: number;
    let bnbntDecimals: number;

    const timeIncrease = async (delta: number) => {
        timestamp += delta;
        await network.setTime(timestamp);
    };

    const decimalToInteger = (value: string | number, decimals: number) => {
        return BigNumber.from(new Decimal(`${value}e+${decimals}`).toFixed());
    };

    const integerToDecimal = (value: BigNumber, decimals: number) => {
        return new Decimal(`${value}e-${decimals}`).toFixed();
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
        const wei = await toWei(userId, amount, bntDecimals, networkToken);
        await network.connect(users[userId]).deposit(networkToken.address, wei);
    };

    const withdrawTKN = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bntknDecimals, basePoolToken);
        await pendingWithdrawals.connect(users[userId]).initWithdrawal(basePoolToken.address, wei);
        const ids = await pendingWithdrawals.withdrawalRequestIds(users[userId].address);
        await network.connect(users[userId]).withdraw(ids[0]);
    };

    const withdrawBNT = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bnbntDecimals, masterPoolToken);
        await pendingWithdrawals.connect(users[userId]).initWithdrawal(masterPoolToken.address, wei);
        const ids = await pendingWithdrawals.withdrawalRequestIds(users[userId].address);
        await network.connect(users[userId]).withdraw(ids[0]);
    };

    const tradeTKN = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, tknDecimals, baseToken);
        await network
            .connect(users[userId])
            .trade(baseToken.address, networkToken.address, wei, 1, timestamp, users[userId].address);
    };

    const tradeBNT = async (userId: string, amount: string) => {
        const wei = await toWei(userId, amount, bntDecimals, networkToken);
        await network
            .connect(users[userId])
            .trade(networkToken.address, baseToken.address, wei, 1, timestamp, users[userId].address);
    };

    const verifyState = async (expected: State) => {
        const actual: State = {
            tknBalances: {},
            bntBalances: {},
            bntknBalances: {},
            bnbntBalances: {},
            bntStakedBalance: '',
            tknStakedBalance: '',
            tknTradingLiquidity: '',
            bntTradingLiquidity: ''
        };

        const poolData = await poolCollection.poolData(baseToken.address);

        for (const userId in users) {
            actual.tknBalances[userId] = integerToDecimal(
                await baseToken.balanceOf(users[userId].address),
                tknDecimals
            );
            actual.bntBalances[userId] = integerToDecimal(
                await networkToken.balanceOf(users[userId].address),
                bntDecimals
            );
            actual.bntknBalances[userId] = integerToDecimal(
                await basePoolToken.balanceOf(users[userId].address),
                bntknDecimals
            );
            actual.bnbntBalances[userId] = integerToDecimal(
                await masterPoolToken.balanceOf(users[userId].address),
                bnbntDecimals
            );
        }

        actual.tknBalances['masterVault'] = integerToDecimal(
            await baseToken.balanceOf(masterVault.address),
            tknDecimals
        );
        actual.tknBalances['epVault'] = integerToDecimal(
            await baseToken.balanceOf(externalProtectionVault.address),
            tknDecimals
        );
        actual.bntBalances['masterVault'] = integerToDecimal(
            await networkToken.balanceOf(masterVault.address),
            bntDecimals
        );
        actual.bnbntBalances['masterPool'] = integerToDecimal(
            await masterPoolToken.balanceOf(masterPool.address),
            bnbntDecimals
        );

        actual.bntStakedBalance = integerToDecimal(await masterPool.stakedBalance(), bntDecimals);
        actual.tknStakedBalance = integerToDecimal(poolData.liquidity.stakedBalance, tknDecimals);
        actual.tknTradingLiquidity = integerToDecimal(poolData.liquidity.baseTokenTradingLiquidity, tknDecimals);
        actual.bntTradingLiquidity = integerToDecimal(poolData.liquidity.networkTokenTradingLiquidity, bntDecimals);

        expect(actual).to.deep.equal(expected);
    };

    const init = async (fileName: string) => {
        const signers = await ethers.getSigners();

        users = {};
        timestamp = 0;
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
            networkToken,
            networkSettings,
            masterPool,
            masterPoolToken,
            networkTokenGovernance,
            govToken,
            pendingWithdrawals,
            poolCollection,
            masterVault,
            externalProtectionVault
        } = await createSystem());

        baseToken = await Contracts.TestERC20Burnable.deploy(TKN, TKN, tknAmount);
        basePoolToken = await createPool(baseToken, network, networkSettings, poolCollection);

        await baseToken.updateDecimals(tknDecimals);

        await networkTokenGovernance.burn(await networkToken.balanceOf(signers[0].address));
        await networkTokenGovernance.mint(signers[0].address, bntAmount);

        await networkSettings.setWithdrawalFeePPM(percentageToPPM(flow.withdrawalFee));
        await networkSettings.setPoolMintingLimit(
            baseToken.address,
            decimalToInteger(flow.pool.bntMintingLimit, bntDecimals)
        );
        await networkSettings.setAverageRateMaxDeviationPPM(PPM_RESOLUTION);
        await networkSettings.setMinLiquidityForTrading(flow.pool.bntMinLiquidity);

        await pendingWithdrawals.setLockDuration(0);

        await poolCollection.setTradingFeePPM(baseToken.address, percentageToPPM(flow.tradingFee));
        await poolCollection.setDepositLimit(baseToken.address, MAX_UINT256);
        await poolCollection.setInitialRate(baseToken.address, {
            n: decimalToInteger(flow.pool.bntInitialRate, bntDecimals),
            d: decimalToInteger(flow.pool.tknInitialRate, tknDecimals)
        });

        await baseToken.transfer(externalProtectionVault.address, decimalToInteger(flow.epVaultBalance, tknDecimals));

        for (const [i, { id, tknBalance, bntBalance }] of flow.users.entries()) {
            expect(id in users).to.equal(false, `user id '${id}' is not unique`);
            users[id] = signers[1 + i];
            await govToken.connect(users[id]).approve(network.address, MAX_UINT256);
            await baseToken.connect(users[id]).approve(network.address, MAX_UINT256);
            await networkToken.connect(users[id]).approve(network.address, MAX_UINT256);
            await basePoolToken.connect(users[id]).approve(pendingWithdrawals.address, MAX_UINT256);
            await masterPoolToken.connect(users[id]).approve(pendingWithdrawals.address, MAX_UINT256);
            await baseToken.transfer(users[id].address, decimalToInteger(tknBalance, tknDecimals));
            await networkToken.transfer(users[id].address, decimalToInteger(bntBalance, bntDecimals));
        }

        expect(await baseToken.balanceOf(signers[0].address)).to.equal(0);
        expect(await networkToken.balanceOf(signers[0].address)).to.equal(0);
    };

    const execute = async () => {
        for (const [n, { type, userId, amount, elapsed, expected }] of flow.operations.entries()) {
            console.log(`${n + 1} out of ${flow.operations.length}: after ${elapsed} seconds, ${type}(${amount})`);
            await timeIncrease(elapsed);
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
            }
            await verifyState(expected);
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
        test('BancorNetworkComplexFinancialScenario');
    });
});
