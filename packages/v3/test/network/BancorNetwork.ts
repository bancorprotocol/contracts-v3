import Contracts, { AsyncReturnType } from '../../components/Contracts';

import {
    BancorVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestERC20Token,
    TestNetworkTokenPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TokenHolder
} from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS, NATIVE_TOKEN_ADDRESS, FEE_TYPES } from '../helpers/Constants';
import { createPool, createPoolCollection, createSystem, createTokenHolder } from '../helpers/Factory';
import { permitSignature } from '../helpers/Permit';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { createTokenBySymbol, getBalance, getTransactionCost, TokenWithAddress, createWallet } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, Wallet, Signer, utils, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { camelCase } from 'lodash';

const { Upgradeable: UpgradeableRoles } = roles;
const { solidityKeccak256, formatBytes32String } = utils;

describe('BancorNetwork', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;

    shouldHaveGap('BancorNetwork', '_externalProtectionWallet');

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
        if (tokenAddress === NATIVE_TOKEN_ADDRESS || tokenAddress === ZERO_ADDRESS) {
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

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { network, networkTokenPool, pendingWithdrawals } = await createSystem();

            await expect(network.initialize(networkTokenPool.address, pendingWithdrawals.address)).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when attempting to initialize with an invalid network token pool contract', async () => {
            const {
                networkTokenGovernance,
                govTokenGovernance,
                networkSettings,
                vault,
                networkPoolToken,
                pendingWithdrawals
            } = await createSystem();

            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                vault.address,
                networkPoolToken.address
            );

            await expect(network.initialize(ZERO_ADDRESS, pendingWithdrawals.address)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when attempting to initialize with an invalid pending withdrawals contract', async () => {
            const {
                networkTokenGovernance,
                govTokenGovernance,
                networkSettings,
                vault,
                networkPoolToken,
                networkTokenPool
            } = await createSystem();

            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                vault.address,
                networkPoolToken.address
            );

            await expect(network.initialize(networkTokenPool.address, ZERO_ADDRESS)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when initialized with an invalid network token governance contract', async () => {
            const { govTokenGovernance, networkSettings, vault, networkPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    ZERO_ADDRESS,
                    govTokenGovernance.address,
                    networkSettings.address,
                    vault.address,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid governance token governance contract', async () => {
            const { networkTokenGovernance, networkSettings, vault, networkPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    vault.address,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid network settings contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, vault, networkPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    ZERO_ADDRESS,
                    vault.address,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid vault contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, networkPoolToken } =
                await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid network pool token contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, vault } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    vault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be properly initialized', async () => {
            const {
                network,
                networkToken,
                networkTokenGovernance,
                govToken,
                govTokenGovernance,
                networkSettings,
                vault,
                networkPoolToken,
                networkTokenPool,
                pendingWithdrawals
            } = await createSystem();

            expect(await network.version()).to.equal(1);

            await expectRole(network, UpgradeableRoles.ROLE_OWNER, UpgradeableRoles.ROLE_OWNER, [deployer.address]);

            expect(await network.networkToken()).to.equal(networkToken.address);
            expect(await network.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await network.govToken()).to.equal(govToken.address);
            expect(await network.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.vault()).to.equal(vault.address);
            expect(await network.networkPoolToken()).to.equal(networkPoolToken.address);
            expect(await network.networkTokenPool()).to.equal(networkTokenPool.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.externalProtectionWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
            expect(await network.isPoolValid(networkToken.address)).to.be.true;
        });
    });

    describe('external protection wallet', () => {
        let newExternalProtectionWallet: TokenHolder;
        let network: TestBancorNetwork;

        beforeEach(async () => {
            ({ network } = await createSystem());

            newExternalProtectionWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the external protection wallet', async () => {
            await expect(
                network.connect(nonOwner).setExternalProtectionWallet(newExternalProtectionWallet.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting external protection wallet to an invalid address', async () => {
            await expect(network.setExternalProtectionWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should ignore updates to the same external protection wallet', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(newExternalProtectionWallet.address);

            const res = await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            await expect(res).not.to.emit(network, 'ExternalProtectionWalletUpdated');
        });

        it('should be able to set and update the external protection wallet', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);

            const res = await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            await expect(res)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(ZERO_ADDRESS, newExternalProtectionWallet.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            const newExternalProtectionWallet2 = await createTokenHolder();
            await newExternalProtectionWallet2.transferOwnership(network.address);

            const res2 = await network.setExternalProtectionWallet(newExternalProtectionWallet2.address);
            await expect(res2)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(newExternalProtectionWallet.address, newExternalProtectionWallet2.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet2.address);
            expect(await newExternalProtectionWallet2.owner()).to.equal(network.address);
        });

        it('should revert when attempting to set the external protection wallet without transferring its ownership', async () => {
            await expect(network.setExternalProtectionWallet(newExternalProtectionWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when a non-owner attempts to transfer the ownership of the protection wallet', async () => {
            await expect(
                network.connect(newOwner).transferExternalProtectionWalletOwnership(newOwner.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should allow explicitly transferring the ownership', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            await network.transferExternalProtectionWalletOwnership(newOwner.address);
            await newExternalProtectionWallet.connect(newOwner).acceptOwnership();
            expect(await newExternalProtectionWallet.owner()).to.equal(newOwner.address);
        });
    });

    describe('pool collections', () => {
        let network: TestBancorNetwork;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolType: number;

        beforeEach(async () => {
            ({ network, poolTokenFactory, poolCollection } = await createSystem());

            poolType = await poolCollection.poolType();
        });

        describe('adding new pool collection', () => {
            it('should revert when a non-owner attempts to add a new pool collection', async () => {
                await expect(network.connect(nonOwner).addPoolCollection(poolCollection.address)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when attempting to add an invalid pool collection', async () => {
                await expect(network.connect(nonOwner).addPoolCollection(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERR_INVALID_ADDRESS'
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
                    await expect(network.addPoolCollection(poolCollection.address)).to.be.revertedWith(
                        'ERR_COLLECTION_ALREADY_EXISTS'
                    );
                });

                it('should add a new pool collection with the same type', async () => {
                    expect(await network.poolCollections()).to.have.members([poolCollection.address]);

                    const newPoolCollection = await createPoolCollection(network, poolTokenFactory);
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

                const newPoolCollection = await createPoolCollection(network, poolTokenFactory);
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
                const newPoolCollection = await createPoolCollection(network, poolTokenFactory);
                await expect(
                    network.removePoolCollection(poolCollection.address, newPoolCollection.address)
                ).to.be.revertedWith('ERR_COLLECTION_DOES_NOT_EXIST');
            });

            context('with an exiting alternative pool collection', () => {
                let newPoolCollection: TestPoolCollection;
                let lastCollection: TestPoolCollection;

                beforeEach(async () => {
                    newPoolCollection = await createPoolCollection(network, poolTokenFactory);
                    lastCollection = await createPoolCollection(network, poolTokenFactory);

                    await network.addPoolCollection(newPoolCollection.address);
                    await network.addPoolCollection(lastCollection.address);
                });

                it('should revert when a non-owner attempts to remove an existing pool collection', async () => {
                    await expect(
                        network
                            .connect(nonOwner)
                            .removePoolCollection(poolCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should revert when attempting to remove a non-existing pool collection', async () => {
                    await expect(
                        network.removePoolCollection(ZERO_ADDRESS, newPoolCollection.address)
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');

                    const otherCollection = await createPoolCollection(network, poolTokenFactory);
                    await expect(
                        network.removePoolCollection(otherCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('ERR_COLLECTION_DOES_NOT_EXIST');
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

                /* eslint-disable @typescript-eslint/no-empty-function */
                it.skip('should revert when attempting to remove a pool collection with associated pools', async () => {});
                it.skip('should revert when attempting to remove a pool collection with an alternative with a different type', async () => {});
                /* eslint-enable @typescript-eslint/no-empty-function */
            });
        });

        describe('setting the latest pool collections', () => {
            let newPoolCollection: TestPoolCollection;

            beforeEach(async () => {
                newPoolCollection = await createPoolCollection(network, poolTokenFactory);

                await network.addPoolCollection(newPoolCollection.address);
                await network.addPoolCollection(poolCollection.address);
            });

            it('should revert when a non-owner attempts to set the latest pool collection', async () => {
                await expect(
                    network.connect(nonOwner).setLatestPoolCollection(poolCollection.address)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to set the latest pool collection to an invalid pool collection', async () => {
                await expect(network.connect(nonOwner).setLatestPoolCollection(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERR_INVALID_ADDRESS'
                );

                const newPoolCollection2 = await createPoolCollection(network, poolTokenFactory);
                await expect(network.setLatestPoolCollection(newPoolCollection2.address)).to.be.revertedWith(
                    'ERR_COLLECTION_DOES_NOT_EXIST'
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
        let networkToken: TestERC20Token;
        let poolCollection: TestPoolCollection;
        let poolType: number;

        const testCreatePool = async (symbol: string) => {
            beforeEach(async () => {
                ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

                reserveToken = await createTokenBySymbol(symbol, networkToken);

                poolType = await poolCollection.poolType();
            });

            it('should revert when attempting to create a pool for an invalid reserve token', async () => {
                await expect(network.createPool(poolType, ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when attempting to create a pool for an unsupported type', async () => {
                await expect(network.createPool(BigNumber.from(12345), reserveToken.address)).to.be.revertedWith(
                    'ERR_UNSUPPORTED_TYPE'
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
                            'ERR_POOL_ALREADY_EXISTS'
                        );
                    });
                });
            });
        };

        for (const symbol of ['ETH', 'TKN']) {
            context(symbol, () => {
                testCreatePool(symbol);
            });
        }

        it('should revert when attempting to create a pool for the network token', async () => {
            const { network, networkToken } = await createSystem();

            await expect(network.createPool(BigNumber.from(1), networkToken.address)).to.be.revertedWith(
                'ERR_UNSUPPORTED_TOKEN'
            );
        });
    });

    describe('deposit', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: TestERC20Token;
        let govToken: TestERC20Token;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let vault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let networkPoolToken: PoolToken;
        let externalProtectionWallet: TokenHolder;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const DEPOSIT_LIMIT = toWei(BigNumber.from(100_000_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                networkTokenPool,
                poolCollection,
                vault,
                pendingWithdrawals,
                networkPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            externalProtectionWallet = await createTokenHolder();
            await externalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(externalProtectionWallet.address);
        });

        const testDeposits = (symbol: string) => {
            const isNetworkToken = symbol === 'BNT';
            const isETH = symbol === 'ETH';

            let poolToken: PoolToken;
            let token: TokenWithAddress;

            beforeEach(async () => {
                token = await createTokenBySymbol(symbol, networkToken);

                if (isNetworkToken) {
                    poolToken = networkPoolToken;
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
                const prevVaultTokenBalance = await getBalance(token, vault.address);

                const prevNetworkTokenTotalSupply = await networkToken.totalSupply();
                const prevVaultNetworkTokenBalance = await networkToken.balanceOf(vault.address);

                const prevGovTotalSupply = await govToken.totalSupply();
                const prevProviderGovTokenBalance = await govToken.balanceOf(providerAddress);
                const prevSenderGovTokenBalance = await govToken.balanceOf(senderAddress);

                let expectedPoolTokenAmount;
                let transactionCost = BigNumber.from(0);

                if (isNetworkToken) {
                    expectedPoolTokenAmount = amount
                        .mul(await poolToken.totalSupply())
                        .div(await networkTokenPool.stakedBalance());

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
                            await networkTokenPool.stakedBalance(),
                            await getBalance(token, vault.address)
                        );

                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);

                    expect(await getBalance(token, vault.address)).to.equal(prevVaultTokenBalance);

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
                            await getBalance(token, vault.address)
                        );

                    await expect(res)
                        .to.emit(network, 'TotalLiquidityUpdated')
                        .withArgs(
                            contextId,
                            networkToken.address,
                            await networkPoolToken.totalSupply(),
                            await networkTokenPool.stakedBalance(),
                            await networkToken.balanceOf(vault.address)
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

                    expect(await getBalance(token, vault.address)).to.equal(prevVaultTokenBalance.add(amount));

                    // expect a few network tokens to be minted to the vault
                    expect(await networkToken.totalSupply()).to.be.gte(prevNetworkTokenTotalSupply);
                    expect(await networkToken.balanceOf(vault.address)).to.be.gte(prevVaultNetworkTokenBalance);

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
                        ).to.be.revertedWith('ERR_INVALID_ADDRESS');
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
                                await expect(deposit(BigNumber.from(0))).to.be.revertedWith('ERR_ZERO_VALUE');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(
                                    deposit(BigNumber.from(1), { poolAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                            });

                            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                                token = await createTokenBySymbol('TKN', networkToken);

                                await expect(deposit(BigNumber.from(1))).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
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
                                                'ERC20: transfer amount exceeds allowance'
                                            );
                                        });
                                    }

                                    context('with approval', () => {
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

                                                    const reserveToken = await createTokenBySymbol('TKN', networkToken);

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
                                                            'ERR_POOL_NOT_WHITELISTED'
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
                                                            'ERR_NETWORK_LIQUIDITY_DISABLED'
                                                        );
                                                    });
                                                });

                                                context('when spot rate is unstable', () => {
                                                    beforeEach(async () => {
                                                        const spotRate = {
                                                            n: toWei(BigNumber.from(1_000_000)),
                                                            d: toWei(BigNumber.from(10_000_000))
                                                        };

                                                        await poolCollection.setTradingLiquidityT(token.address, {
                                                            networkTokenTradingLiquidity: spotRate.n,
                                                            baseTokenTradingLiquidity: spotRate.d,
                                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                                            stakedBalance: toWei(BigNumber.from(1_000_000))
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
                                                                'ERR_NETWORK_LIQUIDITY_DISABLED'
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
                                                            ).to.be.revertedWith('ERR_ETH_AMOUNT_MISMATCH');

                                                            await expect(
                                                                deposit(amount, {
                                                                    value: amount.sub(BigNumber.from(1))
                                                                })
                                                            ).to.be.revertedWith('ERR_ETH_AMOUNT_MISMATCH');

                                                            await expect(
                                                                deposit(amount, { value: BigNumber.from(0) })
                                                            ).to.be.revertedWith('ERR_INVALID_POOL');
                                                        });
                                                    } else {
                                                        it('should revert when attempting to deposit ETH into a non ETH pool', async () => {
                                                            await expect(
                                                                deposit(amount, { value: BigNumber.from(1) })
                                                            ).to.be.revertedWith('ERR_INVALID_POOL');
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
                                toWei(BigNumber.from(1_000_000)),
                                toWei(BigNumber.from(500_000))
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
                        ).to.be.revertedWith('ERR_INVALID_ADDRESS');
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
                                await expect(deposit(BigNumber.from(0))).to.be.revertedWith('ERR_ZERO_VALUE');
                            });

                            it('should revert when attempting to deposit to an invalid pool', async () => {
                                await expect(
                                    deposit(BigNumber.from(1), { poolAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                            });

                            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                                const token2 = await createTokenBySymbol('TKN', networkToken);

                                await expect(
                                    deposit(BigNumber.from(1), {
                                        poolAddress: token2.address
                                    })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                            });

                            const testDepositAmount = async (amount: BigNumber) => {
                                const test = async () => verifyDeposit(provider, sender, amount, deposit);

                                context(`${amount} tokens`, () => {
                                    if (isNetworkToken || isETH) {
                                        it('should revert when attempting to deposit', async () => {
                                            await expect(deposit(amount)).to.be.revertedWith('ERR_PERMIT_UNSUPPORTED');
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

                                                await expect(deposit(amount)).to.be.revertedWith(
                                                    'ERR_POOL_NOT_WHITELISTED'
                                                );
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
                                                    'ERR_NETWORK_LIQUIDITY_DISABLED'
                                                );
                                            });
                                        });

                                        context('when spot rate is unstable', () => {
                                            beforeEach(async () => {
                                                const spotRate = {
                                                    n: toWei(BigNumber.from(1_000_000)),
                                                    d: toWei(BigNumber.from(10_000_000))
                                                };

                                                await poolCollection.setTradingLiquidityT(token.address, {
                                                    networkTokenTradingLiquidity: spotRate.n,
                                                    baseTokenTradingLiquidity: spotRate.d,
                                                    tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                                    stakedBalance: toWei(BigNumber.from(1_000_000))
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
                                                        'ERR_NETWORK_LIQUIDITY_DISABLED'
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
                                toWei(BigNumber.from(1_000_000)),
                                toWei(BigNumber.from(500_000))
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

        for (const symbol of ['BNT', 'ETH', 'TKN']) {
            context(symbol, () => {
                testDeposits(symbol);
            });
        }
    });

    describe('withdraw', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: TestERC20Token;
        let govToken: TestERC20Token;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let vault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let networkPoolToken: PoolToken;
        let externalProtectionWallet: TokenHolder;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%
        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                networkTokenPool,
                poolCollection,
                vault,
                pendingWithdrawals,
                networkPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            externalProtectionWallet = await createTokenHolder();
            await externalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(externalProtectionWallet.address);

            await setTime((await latest()).toNumber());
        });

        it('should revert when attempting to withdraw a non-existing withdrawal request', async () => {
            await expect(network.withdraw(BigNumber.from(12345))).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        const testWithdraw = async (symbol: string) => {
            const isNetworkToken = symbol === 'BNT';
            const isETH = symbol === 'ETH';

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
                    token = await createTokenBySymbol(symbol, networkToken);

                    // create a deposit
                    const amount = toWei(BigNumber.from(222_222_222));

                    if (isNetworkToken) {
                        poolToken = networkPoolToken;

                        const contextId = formatBytes32String('CTX');
                        const reserveToken = await createTokenBySymbol('TKN', networkToken);
                        await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);

                        await network.requestLiquidityT(contextId, reserveToken.address, amount);
                    } else {
                        poolToken = await createPool(token, network, networkSettings, poolCollection);

                        await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                        await poolCollection.setDepositLimit(token.address, MAX_UINT256);
                        await poolCollection.setInitialRate(token.address, INITIAL_RATE);
                    }

                    let value = BigNumber.from(0);
                    if (isETH) {
                        value = amount;
                    } else {
                        const reserveToken = await Contracts.TestERC20Token.attach(token.address);
                        await reserveToken.transfer(provider.address, amount);
                        await reserveToken.connect(provider).approve(network.address, amount);
                    }

                    await network.connect(provider).deposit(token.address, amount, { value });
                    poolTokenAmount = await poolToken.balanceOf(provider.address);

                    await poolToken.connect(provider).approve(pendingWithdrawals.address, poolTokenAmount);
                    await pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount);

                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                    id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                    creationTime = withdrawalRequest.createdAt;
                });

                it('should revert when attempting to withdraw from a different provider', async () => {
                    await expect(network.connect(deployer).withdraw(id)).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                context('during the lock duration', () => {
                    beforeEach(async () => {
                        await setTime(creationTime + 1000);
                    });

                    it('should revert when attempting to withdraw', async () => {
                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                            'ERR_WITHDRAWAL_NOT_ALLOWED'
                        );
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
                                'ERR_WITHDRAWAL_NOT_ALLOWED'
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
                                    'ERC20: transfer amount exceeds allowance'
                                );
                            });

                            it('should revert when attempting to withdraw with an insufficient governance token amount', async () => {
                                await govToken.connect(provider).transfer(deployer.address, BigNumber.from(1));
                                await govToken.connect(provider).approve(network.address, poolTokenAmount);

                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERC20: transfer amount exceeds balance'
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
                                const prevPoolPoolTokenBalance = await poolToken.balanceOf(networkTokenPool.address);
                                const prevCollectionPoolTokenBalance = await poolToken.balanceOf(
                                    poolCollection.address
                                );
                                const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);

                                const prevProviderTokenBalance = await getBalance(token, provider.address);

                                const prevGovTotalSupply = await govToken.totalSupply();
                                const prevPoolGovTokenBalance = await govToken.balanceOf(networkTokenPool.address);
                                const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);

                                let transactionCost = BigNumber.from(0);

                                if (isNetworkToken) {
                                    const withdrawalAmounts = await networkTokenPool.withdrawalAmountsT(
                                        poolTokenAmount
                                    );

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
                                            await networkTokenPool.stakedBalance(),
                                            await getBalance(token, vault.address)
                                        );

                                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                                    expect(await poolToken.balanceOf(networkTokenPool.address)).to.equal(
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
                                        await getBalance(token, vault.address),
                                        await getBalance(token, externalProtectionWallet.address)
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
                                            withdrawalAmounts.baseTokenAmountToTransferFromVaultToProvider.add(
                                                withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider
                                            ),
                                            poolTokenAmount,
                                            withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
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
                                            await getBalance(token, vault.address)
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
                                    expect(await poolToken.balanceOf(networkTokenPool.address)).to.equal(
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

                                expect(await govToken.balanceOf(networkTokenPool.address)).to.equal(
                                    prevPoolGovTokenBalance
                                );

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
                                            'ERR_NETWORK_LIQUIDITY_DISABLED'
                                        );
                                    });
                                });

                                context('when spot rate is unstable', () => {
                                    beforeEach(async () => {
                                        const spotRate = {
                                            n: toWei(BigNumber.from(1_000_000)),
                                            d: toWei(BigNumber.from(10_000_000))
                                        };

                                        await poolCollection.setTradingLiquidityT(token.address, {
                                            networkTokenTradingLiquidity: spotRate.n,
                                            baseTokenTradingLiquidity: spotRate.d,
                                            tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                                            stakedBalance: toWei(BigNumber.from(1_000_000))
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
                                            'ERR_NETWORK_LIQUIDITY_DISABLED'
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

        for (const symbol of ['BNT', 'ETH', 'TKN']) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });

    describe('trade', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: TestERC20Token;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let vault: BancorVault;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
        const NETWORK_TOKEN_LIQUIDITY = toWei(BigNumber.from(100_000));

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, networkTokenPool, poolCollection, vault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        interface Spec {
            symbol: string;
            balance: BigNumber;
            tradingFeePPM: number;
        }

        const testTrades = (source: Spec, target: Spec, toSelf: boolean) => {
            context(
                `trade from (${[source.symbol, source.balance, source.tradingFeePPM]}) to (${[
                    target.symbol,
                    target.balance,
                    target.tradingFeePPM
                ]}) (${toSelf ? 'to self' : 'to a different beneficiary'})`,
                () => {
                    const MIN_RETURN_AMOUNT = BigNumber.from(1);

                    const isSourceETH = source.symbol === 'ETH';
                    const isTargetETH = target.symbol === 'ETH';
                    const isSourceNetworkToken = source.symbol === 'BNT';
                    const isTargetNetworkToken = target.symbol === 'BNT';

                    let sourceToken: TokenWithAddress;
                    let targetToken: TokenWithAddress;

                    beforeEach(async () => {
                        let requestedLiquidity = false;

                        sourceToken = await createTokenBySymbol(source.symbol, networkToken);
                        if (!isSourceNetworkToken) {
                            // create and configure the source pool
                            await createPool(sourceToken, network, networkSettings, poolCollection);

                            await networkSettings.setPoolMintingLimit(sourceToken.address, MAX_UINT256);
                            await poolCollection.setDepositLimit(sourceToken.address, MAX_UINT256);
                            await poolCollection.setInitialRate(sourceToken.address, INITIAL_RATE);
                            await poolCollection.setTradingFeePPM(sourceToken.address, source.tradingFeePPM);

                            // deposit the source token liquidity
                            let sourceValue = BigNumber.from(0);
                            if (isSourceETH) {
                                sourceValue = source.balance;
                            } else {
                                const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                                await reserveToken.approve(network.address, source.balance);
                            }

                            await network.deposit(sourceToken.address, source.balance, { value: sourceValue });

                            requestedLiquidity = true;
                        }

                        targetToken = await createTokenBySymbol(target.symbol, networkToken);
                        if (!isTargetNetworkToken) {
                            // create and configure the target pool
                            await createPool(targetToken, network, networkSettings, poolCollection);

                            await networkSettings.setPoolMintingLimit(targetToken.address, MAX_UINT256);
                            await poolCollection.setDepositLimit(targetToken.address, MAX_UINT256);
                            await poolCollection.setInitialRate(targetToken.address, INITIAL_RATE);
                            await poolCollection.setTradingFeePPM(targetToken.address, target.tradingFeePPM);

                            // deposit the target token liquidity
                            let targetValue = BigNumber.from(0);
                            if (isTargetETH) {
                                targetValue = target.balance;
                            } else {
                                const reserveToken = await Contracts.TestERC20Token.attach(targetToken.address);
                                await reserveToken.approve(network.address, target.balance);
                            }

                            await network.deposit(targetToken.address, target.balance, { value: targetValue });

                            requestedLiquidity = true;
                        }

                        // deposit some large enough network token liquidity
                        if (!requestedLiquidity) {
                            const tempBalance = toWei(BigNumber.from(1_000_000));
                            const reserveToken = await Contracts.TestERC20Token.deploy('TKN2', 'TKN2', tempBalance);

                            await createPool(reserveToken, network, networkSettings, poolCollection);

                            await networkSettings.setPoolMintingLimit(reserveToken.address, MAX_UINT256);
                            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);
                            await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);

                            await reserveToken.approve(network.address, tempBalance);
                            await network.deposit(reserveToken.address, tempBalance);
                        }

                        await networkToken.approve(network.address, NETWORK_TOKEN_LIQUIDITY);
                        await network.deposit(networkToken.address, NETWORK_TOKEN_LIQUIDITY);

                        await network.setTime(await latest());
                    });

                    interface TradeAmountsOverrides {
                        sourceTokenAddress?: string;
                        targetTokenAddress?: string;
                    }
                    const tradeTargetAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
                        const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } =
                            overrides;

                        return network.tradeTargetAmount(sourceTokenAddress, targetTokenAddress, amount);
                    };

                    const tradeSourceAmount = async (amount: BigNumber, overrides: TradeAmountsOverrides = {}) => {
                        const { sourceTokenAddress = sourceToken.address, targetTokenAddress = targetToken.address } =
                            overrides;

                        return network.tradeSourceAmount(sourceTokenAddress, targetTokenAddress, amount);
                    };

                    const verifyTrade = async (
                        trader: Signer | Wallet,
                        beneficiary: string,
                        amount: BigNumber,
                        trade: (amount: BigNumber, options: Record<any, any>) => Promise<ContractTransaction>
                    ) => {
                        const traderAddress = await trader.getAddress();
                        const beneficiaryAddress = beneficiary !== ZERO_ADDRESS ? beneficiary : traderAddress;
                        const minReturnAmount = MIN_RETURN_AMOUNT;
                        const deadline = MAX_UINT256;

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
                                beneficiaryAddress
                            ]
                        );

                        const prevTraderSourceTokenAmount = await getBalance(sourceToken, traderAddress);
                        const prevVaultSourceTokenAmount = await getBalance(sourceToken, vault.address);

                        const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiaryAddress);
                        const prevVaultTargetTokenAmount = await getBalance(targetToken, vault.address);

                        const prevTraderNetworkTokenAmount = await getBalance(networkToken, traderAddress);
                        const prevBeneficiaryNetworkTokenAmount = await getBalance(networkToken, beneficiaryAddress);
                        const prevVaultNetworkTokenAmount = await getBalance(networkToken, vault.address);

                        const prevNetworkTokenPoolStakedBalance = await networkTokenPool.stakedBalance();

                        let sourceTradeAmounts!: AsyncReturnType<
                            TestBancorNetwork['callStatic']['tradePoolCollectionT']
                        >;
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

                        const res = await trade(amount, { minReturnAmount, deadline });

                        const transactionCost = await getTransactionCost(res);

                        const networkTokenPoolStakedBalance = await networkTokenPool.stakedBalance();

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
                                    FEE_TYPES.trading,
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
                                    FEE_TYPES.trading,
                                    tradeAmounts.feeAmount,
                                    networkTokenPoolStakedBalance
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

                            expect(networkTokenPoolStakedBalance).to.equal(
                                prevNetworkTokenPoolStakedBalance.add(tradeAmounts.feeAmount)
                            );
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
                                    FEE_TYPES.trading,
                                    sourceTradeAmounts.feeAmount,
                                    networkTokenPoolStakedBalance
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

                            expect(networkTokenPoolStakedBalance).to.equal(
                                prevNetworkTokenPoolStakedBalance.add(sourceTradeAmounts.feeAmount)
                            );

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
                                    FEE_TYPES.trading,
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
                            prevTraderSourceTokenAmount.sub(
                                amount.add(isSourceETH ? transactionCost : BigNumber.from(0))
                            )
                        );
                        expect(await getBalance(sourceToken, vault.address)).to.equal(
                            prevVaultSourceTokenAmount.add(amount)
                        );

                        expect(await getBalance(targetToken, beneficiaryAddress)).to.equal(
                            prevBeneficiaryTargetTokenAmount.add(
                                targetAmount.sub(
                                    traderAddress === beneficiaryAddress && isTargetETH
                                        ? transactionCost
                                        : BigNumber.from(0)
                                )
                            )
                        );
                        expect(await getBalance(targetToken, vault.address)).to.equal(
                            prevVaultTargetTokenAmount.sub(targetAmount)
                        );

                        // if neither the source or the target tokens are the network token - ensure that no network
                        // token amount has left the system
                        if (!isSourceNetworkToken && !isTargetNetworkToken) {
                            expect(await getBalance(networkToken, traderAddress)).to.equal(
                                prevTraderNetworkTokenAmount
                            );
                            expect(await getBalance(networkToken, beneficiaryAddress)).to.equal(
                                prevBeneficiaryNetworkTokenAmount
                            );
                            expect(await getBalance(networkToken, vault.address)).to.equal(prevVaultNetworkTokenAmount);
                        }
                    };

                    const testTrade = () => {
                        context('regular trade', () => {
                            let trader: SignerWithAddress;
                            let beneficiary: string;

                            const testAmount = BigNumber.from(1000);

                            before(async () => {
                                if (toSelf) {
                                    [, trader] = await ethers.getSigners();

                                    beneficiary = ZERO_ADDRESS;
                                } else {
                                    let trader2: SignerWithAddress;
                                    [, trader, trader2] = await ethers.getSigners();

                                    beneficiary = trader2.address;
                                }
                            });

                            beforeEach(async () => {
                                if (!isSourceETH) {
                                    const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

                                    await reserveToken.transfer(await trader.getAddress(), testAmount);
                                    await reserveToken.connect(trader).approve(network.address, testAmount);
                                }
                            });

                            interface TradeOverrides {
                                value?: BigNumber;
                                minReturnAmount?: BigNumber;
                                deadline?: BigNumber;
                                sourceTokenAddress?: string;
                                targetTokenAddress?: string;
                            }

                            const trade = async (amount: BigNumber, overrides: TradeOverrides = {}) => {
                                let {
                                    value,
                                    minReturnAmount = MIN_RETURN_AMOUNT,
                                    deadline = MAX_UINT256,
                                    sourceTokenAddress = sourceToken.address,
                                    targetTokenAddress = targetToken.address
                                } = overrides;

                                if (!value) {
                                    value = BigNumber.from(0);
                                    if (isSourceETH) {
                                        value = amount;
                                    }
                                }

                                return network
                                    .connect(trader)
                                    .trade(
                                        sourceTokenAddress,
                                        targetTokenAddress,
                                        amount,
                                        minReturnAmount,
                                        beneficiary,
                                        deadline,
                                        { value }
                                    );
                            };

                            it('should revert when attempting to trade or query using an invalid source pool', async () => {
                                await expect(
                                    trade(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeSourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                            });

                            it('should revert when attempting to trade or query using an invalid target pool', async () => {
                                await expect(
                                    trade(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeSourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                            });

                            it('should revert when attempting to trade or query using an invalid amount', async () => {
                                const amount = BigNumber.from(0);

                                await expect(trade(amount)).to.be.revertedWith('ERR_ZERO_VALUE');
                                await expect(tradeTargetAmount(amount)).to.be.revertedWith('ERR_ZERO_VALUE');
                                await expect(tradeSourceAmount(amount)).to.be.revertedWith('ERR_ZERO_VALUE');
                            });

                            it('should revert when attempting to trade using an invalid minimum return amount', async () => {
                                const minReturnAmount = BigNumber.from(0);

                                await expect(trade(testAmount, { minReturnAmount })).to.be.revertedWith(
                                    'ERR_ZERO_VALUE'
                                );
                            });

                            it('should revert when attempting to trade using an expired deadline', async () => {
                                const deadline = (await latest()).sub(BigNumber.from(1));

                                await expect(trade(testAmount, { deadline })).to.be.revertedWith(
                                    'ERR_EXPIRED_DEADLINE'
                                );
                            });

                            it('should revert when attempting to trade or query using unsupported tokens', async () => {
                                const reserveToken2 = await Contracts.TestERC20Token.deploy(
                                    'TKN2',
                                    'TKN2',
                                    BigNumber.from(1_000_000)
                                );
                                await reserveToken2.transfer(await trader.getAddress(), testAmount);
                                await reserveToken2.connect(trader).approve(network.address, testAmount);

                                // unknown source token
                                await expect(
                                    trade(testAmount, { sourceTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeSourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');

                                // unknown target token
                                await expect(
                                    trade(testAmount, { targetTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeSourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                            });

                            it('should revert when attempting to trade or query using same source and target tokens', async () => {
                                await expect(
                                    trade(testAmount, { targetTokenAddress: sourceToken.address })
                                ).to.be.revertedWith('ERR_INVALID_TOKENS');
                                await expect(
                                    tradeTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                                ).to.be.revertedWith('ERR_INVALID_TOKENS');
                                await expect(
                                    tradeSourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
                                ).to.be.revertedWith('ERR_INVALID_TOKENS');
                            });

                            const testTradeAmount = async (amount: BigNumber) => {
                                const test = async () => verifyTrade(trader, beneficiary, amount, trade);

                                context(`${amount} tokens`, () => {
                                    if (!isSourceETH) {
                                        beforeEach(async () => {
                                            const reserveToken = await Contracts.TestERC20Token.attach(
                                                sourceToken.address
                                            );
                                            await reserveToken.transfer(trader.address, amount);
                                        });

                                        it('should revert when attempting to trade without approving the network', async () => {
                                            await expect(trade(amount)).to.be.revertedWith(
                                                'ERC20: transfer amount exceeds allowance'
                                            );
                                        });
                                    }

                                    context('with approval', () => {
                                        if (isSourceETH) {
                                            // eslint-disable-next-line max-len
                                            it('should revert when attempting to trade a different amount than what was actually sent', async () => {
                                                await expect(
                                                    trade(amount, {
                                                        value: amount.add(BigNumber.from(1))
                                                    })
                                                ).to.be.revertedWith('ERR_ETH_AMOUNT_MISMATCH');

                                                await expect(
                                                    trade(amount, {
                                                        value: amount.sub(BigNumber.from(1))
                                                    })
                                                ).to.be.revertedWith('ERR_ETH_AMOUNT_MISMATCH');

                                                await expect(
                                                    trade(amount, { value: BigNumber.from(0) })
                                                ).to.be.revertedWith('ERR_INVALID_POOL');
                                            });
                                        } else {
                                            beforeEach(async () => {
                                                const reserveToken = await Contracts.TestERC20Token.attach(
                                                    sourceToken.address
                                                );
                                                await reserveToken.connect(trader).approve(network.address, amount);
                                            });

                                            it('should revert when attempting to trade ETH into a non ETH pool', async () => {
                                                await expect(
                                                    trade(amount, { value: BigNumber.from(1) })
                                                ).to.be.revertedWith('ERR_INVALID_POOL');
                                            });

                                            it('should complete a trade', async () => {
                                                await test();
                                            });
                                        }
                                    });
                                });
                            };

                            for (const amount of [
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(100_000)),
                                toWei(BigNumber.from(500_000))
                            ]) {
                                testTradeAmount(amount);
                            }
                        });
                    };

                    const testTradePermitted = () => {
                        context('permitted trade', () => {
                            let trader: Wallet;
                            let beneficiary: string;

                            const testAmount = BigNumber.from(1000);

                            beforeEach(async () => {
                                trader = await createWallet();

                                if (toSelf) {
                                    beneficiary = ZERO_ADDRESS;
                                } else {
                                    const [, trader2] = await ethers.getSigners();

                                    beneficiary = trader2.address;
                                }

                                if (!isSourceETH) {
                                    const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);

                                    await reserveToken.transfer(await trader.getAddress(), testAmount);
                                    await reserveToken.connect(trader).approve(network.address, testAmount);
                                }
                            });

                            interface TradeOverrides {
                                minReturnAmount?: BigNumber;
                                deadline?: BigNumber;
                                sourceTokenAddress?: string;
                                targetTokenAddress?: string;
                            }

                            const trade = async (amount: BigNumber, overrides: TradeOverrides = {}) => {
                                const {
                                    minReturnAmount = MIN_RETURN_AMOUNT,
                                    deadline = MAX_UINT256,
                                    sourceTokenAddress = sourceToken.address,
                                    targetTokenAddress = targetToken.address
                                } = overrides;

                                const { v, r, s } = await networkPermitSignature(
                                    trader,
                                    sourceTokenAddress,
                                    network,
                                    amount,
                                    deadline
                                );

                                return network
                                    .connect(trader)
                                    .tradePermitted(
                                        sourceTokenAddress,
                                        targetTokenAddress,
                                        amount,
                                        minReturnAmount,
                                        beneficiary,
                                        deadline,
                                        v,
                                        r,
                                        s
                                    );
                            };

                            it('should revert when attempting to trade or query using an invalid source pool', async () => {
                                await expect(
                                    trade(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeTargetAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeSourceAmount(testAmount, { sourceTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                            });

                            it('should revert when attempting to trade or query using an invalid target pool', async () => {
                                await expect(
                                    trade(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeTargetAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                                await expect(
                                    tradeSourceAmount(testAmount, { targetTokenAddress: ZERO_ADDRESS })
                                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                            });

                            it('should revert when attempting to trade or query using an invalid amount', async () => {
                                const amount = BigNumber.from(0);

                                await expect(trade(amount)).to.be.revertedWith('ERR_ZERO_VALUE');
                                await expect(tradeTargetAmount(amount)).to.be.revertedWith('ERR_ZERO_VALUE');
                                await expect(tradeSourceAmount(amount)).to.be.revertedWith('ERR_ZERO_VALUE');
                            });

                            it('should revert when attempting to trade using an invalid minimum return amount', async () => {
                                const minReturnAmount = BigNumber.from(0);

                                await expect(trade(testAmount, { minReturnAmount })).to.be.revertedWith(
                                    'ERR_ZERO_VALUE'
                                );
                            });

                            it('should revert when attempting to trade using an expired deadline', async () => {
                                const deadline = (await latest()).sub(BigNumber.from(1));

                                await expect(trade(testAmount, { deadline })).to.be.revertedWith(
                                    'ERC20Permit: expired deadline'
                                );
                            });

                            it('should revert when attempting to trade or query using unsupported tokens', async () => {
                                const reserveToken2 = await Contracts.TestERC20Token.deploy(
                                    'TKN2',
                                    'TKN2',
                                    BigNumber.from(1_000_000)
                                );
                                await reserveToken2.transfer(await trader.getAddress(), testAmount);
                                await reserveToken2.connect(trader).approve(network.address, testAmount);

                                // unknown source token
                                await expect(
                                    trade(testAmount, { sourceTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeTargetAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeSourceAmount(testAmount, { sourceTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');

                                // unknown target token
                                await expect(
                                    trade(testAmount, { targetTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeTargetAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                                await expect(
                                    tradeSourceAmount(testAmount, { targetTokenAddress: reserveToken2.address })
                                ).to.be.revertedWith('ERR_UNSUPPORTED_TOKEN');
                            });

                            it('should revert when attempting to trade or query using same source and target tokens', async () => {
                                await expect(
                                    trade(testAmount, { targetTokenAddress: sourceToken.address })
                                ).to.be.revertedWith('ERR_INVALID_TOKENS');
                                await expect(
                                    tradeTargetAmount(testAmount, { targetTokenAddress: sourceToken.address })
                                ).to.be.revertedWith('ERR_INVALID_TOKENS');
                                await expect(
                                    tradeSourceAmount(testAmount, { targetTokenAddress: sourceToken.address })
                                ).to.be.revertedWith('ERR_INVALID_TOKENS');
                            });

                            const testTradeAmount = async (amount: BigNumber) => {
                                const test = async () => verifyTrade(trader, beneficiary, amount, trade);

                                context(`${amount} tokens`, () => {
                                    if (isSourceNetworkToken || isSourceETH) {
                                        it('should revert when attempting to trade', async () => {
                                            await expect(trade(amount)).to.be.revertedWith('ERR_PERMIT_UNSUPPORTED');
                                        });

                                        return;
                                    }

                                    beforeEach(async () => {
                                        const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
                                        await reserveToken.transfer(trader.address, amount);
                                    });

                                    it('should complete a trade', async () => {
                                        await test();
                                    });
                                });
                            };

                            for (const amount of [
                                BigNumber.from(10_000),
                                toWei(BigNumber.from(100_000)),
                                toWei(BigNumber.from(500_000))
                            ]) {
                                testTradeAmount(amount);
                            }
                        });
                    };

                    testTrade();
                    testTradePermitted();
                }
            );
        };

        describe('regular tests', () => {
            for (const [sourceSymbol, targetSymbol] of [
                ['TKN', 'BNT'],
                ['TKN', 'ETH'],
                ['TKN1', 'TKN2'],
                ['BNT', 'ETH'],
                ['BNT', 'TKN'],
                ['ETH', 'BNT'],
                ['ETH', 'TKN']
            ]) {
                for (const sourceBalance of [1_000_000, 5_000_000]) {
                    for (const targetBalance of [1_000_000, 5_000_000]) {
                        for (const sourceTradingFeePPM of [0, 10_000]) {
                            for (const targetTradingFeePPM of [0, 100_000]) {
                                for (const toSelf of [true, false]) {
                                    testTrades(
                                        {
                                            symbol: sourceSymbol,
                                            balance: toWei(BigNumber.from(sourceBalance)),
                                            tradingFeePPM: sourceTradingFeePPM
                                        },
                                        {
                                            symbol: targetSymbol,
                                            balance: toWei(BigNumber.from(targetBalance)),
                                            tradingFeePPM: targetTradingFeePPM
                                        },
                                        toSelf
                                    );
                                }
                            }
                        }
                    }
                }
            }
        });

        describe('@stress tests', () => {
            for (const [sourceSymbol, targetSymbol] of [
                ['TKN', 'BNT'],
                ['TKN', 'ETH'],
                ['TKN1', 'TKN2'],
                ['BNT', 'ETH'],
                ['BNT', 'TKN'],
                ['ETH', 'BNT'],
                ['ETH', 'TKN']
            ]) {
                for (const sourceBalance of [1_000_000, 5_000_000, 50_000_000]) {
                    for (const targetBalance of [1_000_000, 5_000_000, 50_000_000]) {
                        for (const sourceTradingFeePPM of [0, 10_000, 500_000]) {
                            for (const targetTradingFeePPM of [0, 10_000, 500_000]) {
                                for (const toSelf of [true, false]) {
                                    testTrades(
                                        {
                                            symbol: sourceSymbol,
                                            balance: toWei(BigNumber.from(sourceBalance)),
                                            tradingFeePPM: sourceTradingFeePPM
                                        },
                                        {
                                            symbol: targetSymbol,
                                            balance: toWei(BigNumber.from(targetBalance)),
                                            tradingFeePPM: targetTradingFeePPM
                                        },
                                        toSelf
                                    );
                                }
                            }
                        }
                    }
                }
            }
        });
    });
});
