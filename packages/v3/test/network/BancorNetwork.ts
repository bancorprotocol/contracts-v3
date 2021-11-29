import { AsyncReturnType } from '../../components/ContractBuilder';
import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import {
    IERC20,
    BancorVault,
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
    PendingWithdrawals,
    ExternalProtectionVault
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
    setupSimplePool,
    PoolSpec
} from '../helpers/Factory';
import { permitSignature } from '../helpers/Permit';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { toDecimal, toWei } from '../helpers/Types';
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
import { BigNumber, ContractTransaction, Signer, utils, Wallet } from 'ethers';
import fs from 'fs';
import { ethers, waffle } from 'hardhat';
import { camelCase } from 'lodash';
import { Context } from 'mocha';
import path from 'path';

const { Upgradeable: UpgradeableRoles, ExternalProtectionVault: ExternalProtectionVaultRoles } = roles;
const { solidityKeccak256, formatBytes32String } = utils;

describe('BancorNetwork', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;

    const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

    shouldHaveGap('BancorNetwork', '_masterPool');

    before(async () => {
        [deployer, nonOwner, newOwner] = await ethers.getSigners();
    });

    const networkPermitSignature = async (
        sender: Wallet,
        tokenAddress: string,
        network: TestBancorNetwork,
        amount: BigNumber,
        deadline: BigNumber
    ) => {
        if (
            tokenAddress === NATIVE_TOKEN_ADDRESS ||
            tokenAddress === ZERO_ADDRESS ||
            tokenAddress === (await network.networkToken())
        ) {
            return {
                v: BigNumber.from(0),
                r: formatBytes32String(''),
                s: formatBytes32String('')
            };
        }

        const reserveToken = await Contracts.TestERC20Token.attach(tokenAddress);
        const senderAddress = await sender.getAddress();

        const nonce = await reserveToken.nonces(senderAddress);

        return permitSignature(
            sender,
            await reserveToken.name(),
            reserveToken.address,
            network.address,
            amount,
            nonce,
            deadline
        );
    };

    const specToString = (spec: PoolSpec) => {
        if (spec.tradingFeePPM !== undefined) {
            return `${spec.symbol} (balance=${spec.balance}, fee=${feeToString(spec.tradingFeePPM)})`;
        }

        return `${spec.symbol} (balance=${spec.balance})`;
    };

    const initWithdraw = async (
        provider: SignerWithAddress,
        pendingWithdrawals: TestPendingWithdrawals,
        poolToken: PoolToken,
        amount: BigNumber
    ) => {
        await poolToken.connect(provider).approve(pendingWithdrawals.address, amount);
        await pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, amount);

        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
        const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
        const creationTime = withdrawalRequest.createdAt;

        return { id, creationTime };
    };

    const trade = async (
        trader: SignerWithAddress,
        sourceToken: TokenWithAddress,
        targetToken: TokenWithAddress,
        amount: BigNumber,
        minReturnAmount: BigNumber,
        deadline: BigNumber,
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

    const feeToString = (feePPM: number) => `${toDecimal(feePPM).mul(100).div(toDecimal(PPM_RESOLUTION))}%`;

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let govToken: IERC20;
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let masterPool: TestMasterPool;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let bancorVault: BancorVault;
        let externalProtectionVault: ExternalProtectionVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                networkTokenGovernance,
                govTokenGovernance,
                masterPool,
                poolCollectionUpgrader,
                bancorVault,
                externalProtectionVault,
                pendingWithdrawals,
                masterPoolToken
            } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(
                network.initialize(masterPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address)
            ).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when attempting to initialize with an invalid master pool contract', async () => {
            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                bancorVault.address,
                masterPoolToken.address,
                externalProtectionVault.address
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
                bancorVault.address,
                masterPoolToken.address,
                externalProtectionVault.address
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
                bancorVault.address,
                masterPoolToken.address,
                externalProtectionVault.address
            );

            await expect(
                network.initialize(masterPool.address, pendingWithdrawals.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid network token governance contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    ZERO_ADDRESS,
                    govTokenGovernance.address,
                    networkSettings.address,
                    bancorVault.address,
                    masterPoolToken.address,
                    externalProtectionVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid governance token governance contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bancorVault.address,
                    masterPoolToken.address,
                    externalProtectionVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid network settings contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    ZERO_ADDRESS,
                    bancorVault.address,
                    masterPoolToken.address,
                    externalProtectionVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid vault contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    masterPoolToken.address,
                    externalProtectionVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid master pool token contract', async () => {
            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    bancorVault.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid external protection vault contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, bancorVault, masterPoolToken } =
                await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    bancorVault.address,
                    masterPoolToken.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            expect(await network.version()).to.equal(1);

            await expectRole(network, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);

            expect(await network.networkToken()).to.equal(networkToken.address);
            expect(await network.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await network.govToken()).to.equal(govToken.address);
            expect(await network.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.vault()).to.equal(bancorVault.address);
            expect(await network.masterPoolToken()).to.equal(masterPoolToken.address);
            expect(await network.masterPool()).to.equal(masterPool.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.poolCollectionUpgrader()).to.equal(poolCollectionUpgrader.address);
            expect(await network.externalProtectionVault()).to.equal(externalProtectionVault.address);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
            expect(await network.isPoolValid(networkToken.address)).to.be.true;
        });
    });

    describe('pool collections', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let poolType: number;

        beforeEach(async () => {
            ({ network, networkSettings, poolTokenFactory, poolCollection, poolCollectionUpgrader } =
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
                        poolTokenFactory,
                        poolCollectionUpgrader,
                        (await poolCollection.version()) + 1
                    );
                    lastCollection = await createPoolCollection(
                        network,
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
                    const reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
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
                await expect(network.createPool(BigNumber.from(12345), reserveToken.address)).to.be.revertedWith(
                    'InvalidType'
                );
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
                await expect(network.createPool(BigNumber.from(1), networkToken.address)).to.be.revertedWith(
                    'InvalidToken'
                );
            });
        });
    });

    describe('upgrade pool', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let targetPoolCollection: TestPoolCollection;

        const MIN_RETURN_AMOUNT = BigNumber.from(1);
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));

        const reserveTokenSymbols = [TKN, ETH, TKN];
        let reserveTokenAddresses: string[];

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        const setup = async () => {
            ({
                network,
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
                        balance: toWei(BigNumber.from(50_000_000)),
                        initialRate: INITIAL_RATE
                    },
                    deployer,
                    network,
                    networkSettings,
                    poolCollection
                );

                reserveTokenAddresses.push(token.address);
            }

            targetPoolCollection = await createPoolCollection(
                network,
                poolTokenFactory,
                poolCollectionUpgrader,
                (await poolCollection.version()) + 1
            );

            await network.addPoolCollection(targetPoolCollection.address);
            await network.setLatestPoolCollection(targetPoolCollection.address);

            await depositToPool(deployer, networkToken, toWei(BigNumber.from(100_000)), network);

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
            expect(await targetPoolCollection.poolCount()).to.equal(BigNumber.from(0));

            for (const reserveTokenAddress of reserveTokenAddresses) {
                expect(await network.collectionByPool(reserveTokenAddress)).to.equal(poolCollection.address);
            }

            await network.upgradePools(reserveTokenAddresses);

            expect(await poolCollection.poolCount()).to.equal(BigNumber.from(0));
            expect(await targetPoolCollection.poolCount()).to.equal(reserveTokenAddresses.length);

            for (const reserveTokenAddress of reserveTokenAddresses) {
                const isETH = reserveTokenAddress === NATIVE_TOKEN_ADDRESS;

                expect(await network.collectionByPool(reserveTokenAddress)).to.equal(targetPoolCollection.address);

                // perform deposit, withdraw, and trade sanity checks
                const token = { address: reserveTokenAddress };
                const pool = await targetPoolCollection.poolData(reserveTokenAddress);
                const poolToken = await Contracts.PoolToken.attach(pool.poolToken);

                const prevPoolTokenBalance = await poolToken.balanceOf(deployer.address);
                await depositToPool(deployer, token, toWei(BigNumber.from(1_000_000)), network);
                expect(await poolToken.balanceOf(deployer.address)).to.be.gte(prevPoolTokenBalance);

                const poolTokenAmount = await toWei(BigNumber.from(1));
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

                const tradeAmount = toWei(BigNumber.from(1));

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
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let govToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;
        let externalProtectionVault: ExternalProtectionVault;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const DEPOSIT_LIMIT = toWei(BigNumber.from(100_000_000));

        const setup = async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                masterPool,
                poolCollection,
                bancorVault,
                pendingWithdrawals,
                masterPoolToken,
                externalProtectionVault
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

                await setTime((await latest()).toNumber());
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
                const prevVaultTokenBalance = await getBalance(token, bancorVault.address);

                const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                const prevVaultNetworkTokenBalance = await networkToken.balanceOf(bancorVault.address);

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
                            await getBalance(token, bancorVault.address)
                        );

                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);

                    expect(await getBalance(token, bancorVault.address)).to.equal(prevVaultTokenBalance);

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
                            await getBalance(token, bancorVault.address)
                        );

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            networkToken.address,
                            await masterPoolToken.totalSupply(),
                            await masterPool.stakedBalance(),
                            await networkToken.balanceOf(bancorVault.address)
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

                    expect(await getBalance(token, bancorVault.address)).to.equal(prevVaultTokenBalance.add(amount));

                    // expect a few network tokens to be minted to the vault
                    expect(await networkToken.totalSupply()).to.be.gte(prevNetworkTokenTotalSupply);
                    expect(await networkToken.balanceOf(bancorVault.address)).to.be.gte(prevVaultNetworkTokenBalance);

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
                        await expect(
                            network.depositFor(ZERO_ADDRESS, token.address, BigNumber.from(1))
                        ).to.be.revertedWith('InvalidAddress');
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
                                                    await networkSettings.setPoolMintingLimit(
                                                        token.address,
                                                        BigNumber.from(0)
                                                    );
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
                                                            n: toWei(BigNumber.from(1_000_000)),
                                                            d: toWei(BigNumber.from(10_000_000))
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
                                                                    PPM_RESOLUTION.add(
                                                                        MAX_DEVIATION.add(BigNumber.from(5000))
                                                                    )
                                                                )
                                                            },
                                                            time: BigNumber.from(0)
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
                                                                    value: amount.add(BigNumber.from(1))
                                                                })
                                                            ).to.be.revertedWith('EthAmountMismatch');

                                                            await expect(
                                                                deposit(amount, {
                                                                    value: amount.sub(BigNumber.from(1))
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
                                                                    BigNumber.from(1000)
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

                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(1_000_000))
                            ]) {
                                testDepositAmount(amount);
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
                        const { v, r, s } = await networkPermitSignature(
                            provider,
                            token.address,
                            network,
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

                                const { v, r, s } = await networkPermitSignature(
                                    sender,
                                    poolAddress,
                                    network,
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
                                            await networkSettings.setPoolMintingLimit(token.address, BigNumber.from(0));
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
                                                    n: toWei(BigNumber.from(1_000_000)),
                                                    d: toWei(BigNumber.from(10_000_000))
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
                                                            PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(5000)))
                                                        )
                                                    },
                                                    time: BigNumber.from(0)
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
                                                        await networkSettings.setPoolMintingLimit(
                                                            token.address,
                                                            BigNumber.from(1000)
                                                        );
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

                            for (const amount of [
                                BigNumber.from(10),
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(1_000_000))
                            ]) {
                                testDepositAmount(amount);
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
        let bancorVault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let masterPoolToken: PoolToken;
        let externalProtectionVault: ExternalProtectionVault;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));

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
                bancorVault,
                pendingWithdrawals,
                masterPoolToken,
                externalProtectionVault
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await setTime((await latest()).toNumber());
        };

        beforeEach(async () => {
            await waffle.loadFixture(setup);
        });

        it('should revert when attempting to withdraw a non-existing withdrawal request', async () => {
            await expect(network.withdraw(BigNumber.from(12345))).to.be.revertedWith('AccessDenied');
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
                    const amount = toWei(BigNumber.from(222_222_222));

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
                                await govToken.connect(provider).transfer(deployer.address, BigNumber.from(1));
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
                                            await getBalance(token, bancorVault.address)
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
                                        await getBalance(token, bancorVault.address),
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
                                            withdrawalAmounts.baseTokenAmountToTransferFromBancorVault.add(
                                                withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionVault
                                            ),
                                            poolTokenAmount,
                                            withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionVault,
                                            withdrawalAmounts.networkTokenAmountToMintForProvider,
                                            withdrawalAmounts.baseTokenWithdrawalFeeAmount
                                        );

                                    const poolLiquidity = await poolCollection.poolLiquidity(token.address);

                                    await expect(res)
                                        .to.emit(network, 'TotalLiquidityUpdated')
                                        .withArgs(
                                            contextId,
                                            token.address,
                                            await poolToken.totalSupply(),
                                            poolLiquidity.stakedBalance,
                                            await getBalance(token, bancorVault.address)
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
                                            n: toWei(BigNumber.from(1_000_000)),
                                            d: toWei(BigNumber.from(10_000_000))
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
                                                d: spotRate.d.mul(
                                                    PPM_RESOLUTION.add(MAX_DEVIATION.add(BigNumber.from(5000)))
                                                )
                                            },
                                            time: BigNumber.from(0)
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
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const NETWORK_TOKEN_LIQUIDITY = toWei(BigNumber.from(100_000));
        const MIN_RETURN_AMOUNT = BigNumber.from(1);

        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        let trader: Wallet;

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, masterPool, poolCollection, bancorVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            trader = await createWallet();

            ({ token: sourceToken } = await setupSimplePool(
                source,
                deployer,
                network,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupSimplePool(
                target,
                deployer,
                network,
                networkSettings,
                poolCollection
            ));

            await depositToPool(deployer, networkToken, NETWORK_TOKEN_LIQUIDITY, network);

            await network.setTime(await latest());
        };

        interface TradeOverrides {
            value?: BigNumber;
            minReturnAmount?: BigNumber;
            deadline?: BigNumber;
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
            deadline?: BigNumber;
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

            const { v, r, s } = await networkPermitSignature(
                trader,
                sourceTokenAddress,
                network,
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
            const prevVaultSourceTokenAmount = await getBalance(sourceToken, bancorVault.address);

            const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiary);
            const prevVaultTargetTokenAmount = await getBalance(targetToken, bancorVault.address);

            const prevTraderNetworkTokenAmount = await getBalance(networkToken, traderAddress);
            const prevBeneficiaryNetworkTokenAmount = await getBalance(networkToken, beneficiary);
            const prevVaultNetworkTokenAmount = await getBalance(networkToken, bancorVault.address);

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

            const targetAmount = await tradeTargetAmount(amount);
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
            expect(await getBalance(sourceToken, bancorVault.address)).to.equal(prevVaultSourceTokenAmount.add(amount));

            expect(await getBalance(targetToken, beneficiary)).to.equal(
                prevBeneficiaryTargetTokenAmount.add(
                    targetAmount.sub(traderAddress === beneficiary && isTargetETH ? transactionCost : BigNumber.from(0))
                )
            );
            expect(await getBalance(targetToken, bancorVault.address)).to.equal(
                prevVaultTargetTokenAmount.sub(targetAmount)
            );

            // if neither the source or the target tokens are the network token - ensure that no network
            // token amount has left the system
            if (!isSourceNetworkToken && !isTargetNetworkToken) {
                expect(await getBalance(networkToken, traderAddress)).to.equal(prevTraderNetworkTokenAmount);
                expect(await getBalance(networkToken, beneficiary)).to.equal(prevBeneficiaryNetworkTokenAmount);
                expect(await getBalance(networkToken, bancorVault.address)).to.equal(prevVaultNetworkTokenAmount);
            }
        };

        interface TradeAmountsOverrides {
            sourceTokenAddress?: string;
            targetTokenAddress?: string;
        }
        const tradeTargetAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return network.tradeTargetAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const tradeSourceAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
            const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } = overrides;

            return network.tradeSourceAmount(sourceTokenAddress, targetTokenAddress, amount);
        };

        const testTradesBasic = (source: PoolSpec, target: PoolSpec) => {
            const isSourceETH = source.symbol === ETH;
            const isSourceNetworkToken = source.symbol === BNT;

            context(`basic trades from ${source.symbol} to ${target.symbol}`, () => {
                const testAmount = BigNumber.from(1000);

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

                        it('should revert when attempting to trade or query using an invalid source pool', async () => {
                            await expect(
                                tradeFunc(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradePermitted(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');

                            await expect(
                                tradeTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradeSourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                        });

                        it('should revert when attempting to trade or query using an invalid target pool', async () => {
                            await expect(
                                tradeFunc(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradeTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                            await expect(
                                tradeSourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                            ).to.be.revertedWith('InvalidAddress');
                        });

                        it('should revert when attempting to trade or query using an invalid amount', async () => {
                            const amount = BigNumber.from(0);

                            await expect(tradeFunc(amount)).to.be.revertedWith('ZeroValue');
                            await expect(tradeTargetAmount(amount)).to.be.revertedWith('ZeroValue');
                            await expect(tradeSourceAmount(amount)).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to trade using an invalid minimum return amount', async () => {
                            const minReturnAmount = BigNumber.from(0);

                            await expect(tradeFunc(testAmount, { minReturnAmount })).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to trade using an expired deadline', async () => {
                            const deadline = (await latest()).sub(BigNumber.from(1000));

                            await expect(tradeFunc(testAmount, { deadline })).to.be.revertedWith(
                                permitted ? 'ERC20Permit: expired deadline' : 'DeadlineExpired'
                            );
                        });

                        it('should revert when attempting to trade or query using unsupported tokens', async () => {
                            const reserveToken2 = await Contracts.TestERC20Token.deploy(
                                TKN,
                                TKN,
                                BigNumber.from(1_000_000)
                            );

                            await reserveToken2.transfer(await trader.getAddress(), testAmount);
                            await reserveToken2.connect(trader).approve(network.address, testAmount);

                            // unknown source token
                            await expect(
                                trade(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeSourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');

                            // unknown target token
                            await expect(
                                trade(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                            await expect(
                                tradeSourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                            ).to.be.revertedWith('InvalidToken');
                        });

                        it('should revert when attempting to trade or query using same source and target tokens', async () => {
                            await expect(
                                trade(testAmount, { targetTokenAddress: sourceToken.address })
                            ).to.be.revertedWith('InvalidTokens');
                            await expect(
                                tradeTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                            ).to.be.revertedWith('InvalidTokens');
                            await expect(
                                tradeSourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
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
                                value: testAmount.add(BigNumber.from(1))
                            })
                        ).to.be.revertedWith('EthAmountMismatch');

                        await expect(
                            trade(testAmount, {
                                value: testAmount.sub(BigNumber.from(1))
                            })
                        ).to.be.revertedWith('EthAmountMismatch');

                        await expect(trade(testAmount, { value: BigNumber.from(0) })).to.be.revertedWith('InvalidPool');
                    });
                } else {
                    it('should revert when passing ETH with a non ETH trade', async () => {
                        await expect(trade(testAmount, { value: BigNumber.from(1) })).to.be.revertedWith('InvalidPool');
                    });

                    context('with an insufficient approval', () => {
                        const extraAmount = BigNumber.from(10);
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
            testPermittedTrades(source, target, toWei(BigNumber.from(100_000)));
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
                    balance: toWei(BigNumber.from(1_000_000)),
                    initialRate: INITIAL_RATE
                },
                {
                    symbol: targetSymbol,
                    balance: toWei(BigNumber.from(5_000_000)),
                    initialRate: INITIAL_RATE
                }
            );

            for (const sourceBalance of [toWei(BigNumber.from(1_000_000)), toWei(BigNumber.from(50_000_000))]) {
                for (const targetBalance of [toWei(BigNumber.from(1_000_000)), toWei(BigNumber.from(50_000_000))]) {
                    for (const amount of [BigNumber.from(10_000), toWei(BigNumber.from(500_000))]) {
                        const TRADING_FEES = [0, 50_000];
                        for (const tradingFeePPM of TRADING_FEES) {
                            const isSourceNetworkToken = sourceSymbol === BNT;
                            const isTargetNetworkToken = targetSymbol === BNT;

                            // if either the source or the target token is the network token - only test fee in one of
                            // the directions
                            if (isSourceNetworkToken || isTargetNetworkToken) {
                                testTrades(
                                    {
                                        symbol: sourceSymbol,
                                        balance: sourceBalance,
                                        tradingFeePPM: isSourceNetworkToken ? undefined : tradingFeePPM,
                                        initialRate: INITIAL_RATE
                                    },
                                    {
                                        symbol: targetSymbol,
                                        balance: targetBalance,
                                        tradingFeePPM: isTargetNetworkToken ? undefined : tradingFeePPM,
                                        initialRate: INITIAL_RATE
                                    },
                                    amount
                                );
                            } else {
                                for (const tradingFeePPM2 of TRADING_FEES) {
                                    testTrades(
                                        {
                                            symbol: sourceSymbol,
                                            balance: sourceBalance,
                                            tradingFeePPM,
                                            initialRate: INITIAL_RATE
                                        },
                                        {
                                            symbol: targetSymbol,
                                            balance: targetBalance,
                                            tradingFeePPM: tradingFeePPM2,
                                            initialRate: INITIAL_RATE
                                        },
                                        amount
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
        let networkSettings: NetworkSettings;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let recipient: TestFlashLoanRecipient;
        let token: TokenWithAddress;

        const amount = toWei(BigNumber.from(123456));

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const ZERO_BYTES = '0x';
        const ZERO_BYTES32 = formatBytes32String('');

        const setup = async () => {
            ({ network, networkSettings, networkToken, masterPool, poolCollection, bancorVault } =
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

        const testFlashLoan = async (symbol: string, flashLoanFeePPM: BigNumber) => {
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
                        networkSettings,
                        poolCollection
                    ));
                }

                await networkSettings.setFlashLoanFeePPM(flashLoanFeePPM);

                await transfer(deployer, token, recipient.address, feeAmount);
                await recipient.snapshot(token.address);
            });

            const test = async () => {
                const prevVaultBalance = await getBalance(token, bancorVault.address);
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

                expect(await getBalance(token, bancorVault.address)).to.be.gte(prevVaultBalance.add(feeAmount));
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

            if (flashLoanFeePPM.gt(0)) {
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
                    const extraReturn = toWei(BigNumber.from(12345));

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
            for (const flashLoanFeePPM of [0, 10_000, 100_000]) {
                context(`${symbol} with fee=${feeToString(flashLoanFeePPM)}`, () => {
                    testFlashLoan(symbol, BigNumber.from(flashLoanFeePPM));
                });
            }
        }
    });
});

describe('BancorNetwork Financial Verification', () => {
    interface User {
        id: string;
        tknBalance: string;
        bntBalance: string;
    }

    interface Pool {
        tknProvider: string;
        tknBalance: string;
        bntBalance: string;
        bntMintLimit: string;
    }

    interface State {
        tknBalances: any;
        bntBalances: any;
        bntknBalances: any;
        bnbntBalances: any;
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
        epwBalance: string;
        tknDecimals: number;
        users: User[];
        pool: Pool;
        operations: Operation[];
    }

    // prettier-ignore
    const tests = (numOfTests: number = Number.MAX_SAFE_INTEGER) => {
        const flow: Flow = JSON.parse(fs.readFileSync(path.join('test', 'data', 'BancorNetworkFlowTest.json'), { encoding: 'utf8' }));

        flow.operations.unshift({
            type: 'depositTKN',
            userId: flow.pool.tknProvider,
            elapsed: 0,
            amount: flow.pool.tknBalance,
            expected: {
                tknBalances: flow.users.reduce((tknBalances, user) => ({ ...tknBalances, [user.id]: user.tknBalance }), { vault: flow.pool.tknBalance, wallet: flow.epwBalance }),
                bntBalances: flow.users.reduce((bntBalances, user) => ({ ...bntBalances, [user.id]: user.bntBalance }), { vault: flow.pool.bntBalance }),
                bntknBalances: flow.users.reduce((tknBalances, user) => ({ ...tknBalances, [user.id]: '0' }), {}),
                bnbntBalances: flow.users.reduce((tknBalances, user) => ({ ...tknBalances, [user.id]: '0' }), { protocol: flow.pool.bntBalance }),
                bntStakedBalance: flow.pool.bntBalance,
                tknStakedBalance: flow.pool.tknBalance,
                tknTradingLiquidity: flow.pool.tknBalance,
                bntTradingLiquidity: flow.pool.bntBalance
            }
        });

        flow.operations[0].expected.tknBalances[flow.pool.tknProvider] = new Decimal(flow.operations[0].expected.tknBalances[flow.pool.tknProvider]).sub(flow.pool.tknBalance).toFixed();
        flow.operations[0].expected.bntknBalances[flow.pool.tknProvider] = flow.pool.tknBalance;

        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let networkSettings: NetworkSettings;
        let masterPool: TestMasterPool;
        let networkTokenGovernance: TokenGovernance;
        let pendingWithdrawals: PendingWithdrawals;
        let poolCollection: TestPoolCollection;
        let bancorVault: BancorVault;
        let externalProtectionVault: ExternalProtectionVault;
        let baseToken: TestERC20Burnable;
        let basePoolToken: PoolToken;
        let masterPoolToken: PoolToken;
        let govToken: IERC20;
        let tknDecimals: number;
        let bntDecimals: number;
        let bntknDecimals: number;
        let bnbntDecimals: number;

        let users: { [id: string]: SignerWithAddress } = {};

        let timestamp = 0;

        const timeIncrease = async (delta: number) => {
            timestamp += delta;
            await network.setTime(timestamp);
        };

        const decimalToInteger = (value: string, decimals: number) => {
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
            await network.connect(users[userId]).trade(baseToken.address, networkToken.address, wei, 1, timestamp, users[userId].address);
        };

        const tradeBNT = async (userId: string, amount: string) => {
            const wei = await toWei(userId, amount, bntDecimals, networkToken);
            await network.connect(users[userId]).trade(networkToken.address, baseToken.address, wei, 1, timestamp, users[userId].address);
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
                actual.tknBalances[userId] = integerToDecimal(await baseToken.balanceOf(users[userId].address), tknDecimals);
                actual.bntBalances[userId] = integerToDecimal(await networkToken.balanceOf(users[userId].address), bntDecimals);
                actual.bntknBalances[userId] = integerToDecimal(await basePoolToken.balanceOf(users[userId].address), bntknDecimals);
                actual.bnbntBalances[userId] = integerToDecimal(await masterPoolToken.balanceOf(users[userId].address), bnbntDecimals);
            }

            actual.tknBalances['vault'] = integerToDecimal(await baseToken.balanceOf(bancorVault.address), tknDecimals);
            actual.tknBalances['wallet'] = integerToDecimal(await baseToken.balanceOf(externalProtectionVault.address), tknDecimals);
            actual.bntBalances['vault'] = integerToDecimal(await networkToken.balanceOf(bancorVault.address), bntDecimals);
            actual.bnbntBalances['protocol'] = integerToDecimal(await masterPoolToken.balanceOf(masterPool.address), bnbntDecimals);

            actual.bntStakedBalance = integerToDecimal(await masterPool.stakedBalance(), bntDecimals);
            actual.tknStakedBalance = integerToDecimal(poolData.liquidity.stakedBalance, tknDecimals);
            actual.tknTradingLiquidity = integerToDecimal(poolData.liquidity.baseTokenTradingLiquidity, tknDecimals);
            actual.bntTradingLiquidity = integerToDecimal(poolData.liquidity.networkTokenTradingLiquidity, bntDecimals);

            expect(actual).to.deep.equal(expected);
        };

        before(async () => {
            const signers = await ethers.getSigners();

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
                bancorVault,
                externalProtectionVault
            } = await createSystem());

            baseToken = await Contracts.TestERC20Burnable.deploy(TKN, TKN, MAX_UINT256);
            basePoolToken = await createPool(baseToken, network, networkSettings, poolCollection);
            await networkTokenGovernance.mint(signers[0].address, MAX_UINT256.sub(await networkToken.balanceOf(signers[0].address)));

            tknDecimals = flow.tknDecimals;
            bntDecimals = DEFAULT_DECIMALS.toNumber();
            bntknDecimals = DEFAULT_DECIMALS.toNumber();
            bnbntDecimals = DEFAULT_DECIMALS.toNumber();
            await baseToken.updateDecimals(tknDecimals);

            const tknInitialBalance = decimalToInteger(flow.pool.tknBalance, tknDecimals);
            const bntInitialBalance = decimalToInteger(flow.pool.bntBalance, bntDecimals);

            await networkSettings.setWithdrawalFeePPM(percentageToPPM(flow.withdrawalFee));
            await networkSettings.setPoolMintingLimit(baseToken.address, decimalToInteger(flow.pool.bntMintLimit, bntDecimals));
            await networkSettings.setAverageRateMaxDeviationPPM(PPM_RESOLUTION);
            await networkSettings.setMinLiquidityForTrading(bntInitialBalance);

            await pendingWithdrawals.setLockDuration(0);

            await poolCollection.setTradingFeePPM(baseToken.address, percentageToPPM(flow.tradingFee));
            await poolCollection.setDepositLimit(baseToken.address, MAX_UINT256);
            await poolCollection.setInitialRate(baseToken.address, { n: bntInitialBalance, d: tknInitialBalance });

            await baseToken.transfer(externalProtectionVault.address, decimalToInteger(flow.epwBalance, tknDecimals));

            for (let i = 0; i < flow.users.length; i++) {
                const user = flow.users[i];
                expect(user.id in users).to.equal(false, `user id '${user.id}' is not unique`);
                users[user.id] = signers[1 + i];
                await govToken.connect(users[user.id]).approve(network.address, MAX_UINT256);
                await baseToken.connect(users[user.id]).approve(network.address, MAX_UINT256);
                await networkToken.connect(users[user.id]).approve(network.address, MAX_UINT256);
                await basePoolToken.connect(users[user.id]).approve(pendingWithdrawals.address, MAX_UINT256);
                await masterPoolToken.connect(users[user.id]).approve(pendingWithdrawals.address, MAX_UINT256);
                await baseToken.transfer(users[user.id].address, decimalToInteger(user.tknBalance, tknDecimals));
                await networkToken.transfer(users[user.id].address, decimalToInteger(user.bntBalance, bntDecimals));
            }

            await baseToken.burn(await baseToken.balanceOf(signers[0].address));
            await networkTokenGovernance.burn(await networkToken.balanceOf(signers[0].address));
        });

        it('should properly deposit, withdraw and trade', async function (this: Context) {
            this.timeout(0);
            const operations = flow.operations.slice(0, numOfTests);
            for (let n = 0; n < operations.length; n++) {
                const { type, userId, amount, elapsed, expected } = operations[n];
                console.log(`${n + 1} out of ${operations.length}: after ${elapsed} seconds, ${type}(${amount})`);
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
        });
    };

    describe('quick tests', () => {
        tests(100);
    });

    describe('@stress tests', () => {
        tests();
    });
});
