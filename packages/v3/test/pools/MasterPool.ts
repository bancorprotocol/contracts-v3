import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import {
    MasterVault,
    IERC20,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestERC20Token,
    TestMasterPool,
    TestPoolCollection,
    TestPoolCollectionUpgrader
} from '../../typechain-types';
import {
    FeeTypes,
    MASTER_POOL_TOKEN_NAME,
    MASTER_POOL_TOKEN_SYMBOL,
    PPM_RESOLUTION,
    ZERO_ADDRESS,
    TKN
} from '../../utils/Constants';
import { toWei, toPPM } from '../../utils/Types';
import { expectRole, roles } from '../helpers/AccessControl';
import { createPool, createPoolCollection, createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { createTokenBySymbol, TokenWithAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

const { Upgradeable: UpgradeableRoles, MasterPool: MasterPoolRoles } = roles;

describe('MasterPool', () => {
    let deployer: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    shouldHaveGap('MasterPool', '_stakedBalance');

    before(async () => {
        [deployer, provider, provider2] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let networkSettings: NetworkSettings;
        let networkTokenGovernance: TokenGovernance;
        let govTokenGovernance: TokenGovernance;
        let masterVault: MasterVault;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;

        beforeEach(async () => {
            ({
                network,
                networkToken,
                networkSettings,
                networkTokenGovernance,
                govTokenGovernance,
                masterVault,
                masterPool,
                masterPoolToken
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    ZERO_ADDRESS,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network token governance contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    govTokenGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid gov token governance contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool token contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(masterPool.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await masterPool.version()).to.equal(1);
            expect(await masterPool.isPayable()).to.be.false;

            await expectRole(masterPool, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);

            await expectRole(
                masterPool,
                MasterPoolRoles.ROLE_MASTER_POOL_TOKEN_MANAGER,
                UpgradeableRoles.ROLE_ADMIN
                // @TODO add staking rewards to initial members
            );

            expect(await masterPool.stakedBalance()).to.equal(0);

            const poolToken = await Contracts.PoolToken.attach(await masterPool.poolToken());
            expect(await poolToken.owner()).to.equal(masterPool.address);
            expect(await poolToken.reserveToken()).to.equal(networkToken.address);
            expect(await poolToken.name()).to.equal(MASTER_POOL_TOKEN_NAME);
            expect(await poolToken.symbol()).to.equal(MASTER_POOL_TOKEN_SYMBOL);
        });
    });

    describe('mint', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let recipient: SignerWithAddress;

        before(async () => {
            [deployer, recipient] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkToken, masterPool } = await createSystem());
        });

        it('should revert when attempting to mint from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(masterPool.connect(nonNetwork).mint(recipient.address, 1)).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to mint to an invalid address', async () => {
            await expect(network.mintT(ZERO_ADDRESS, 1)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to mint an invalid amount', async () => {
            await expect(network.mintT(recipient.address, 0)).to.be.revertedWith('ZeroValue');
        });

        it('should mint to the recipient', async () => {
            const amount = toWei(12345);

            const prevTotalSupply = await networkToken.totalSupply();
            const prevRecipientTokenBalance = await networkToken.balanceOf(recipient.address);

            await network.mintT(recipient.address, amount);

            expect(await networkToken.totalSupply()).to.equal(prevTotalSupply.add(amount));
            expect(await networkToken.balanceOf(recipient.address)).to.equal(prevRecipientTokenBalance.add(amount));
        });
    });

    describe('burnFromVault', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterVault: MasterVault;

        const amount = toWei(12_345);

        beforeEach(async () => {
            ({ network, networkToken, masterPool, masterVault } = await createSystem());

            await networkToken.transfer(masterVault.address, amount);
        });

        it('should revert when attempting to burn from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(masterPool.connect(nonNetwork).burnFromVault(1)).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to burn an invalid amount', async () => {
            await expect(network.burnFromVaultT(0)).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to burn more than balance of the master vault', async () => {
            await expect(network.burnFromVaultT(amount.add(1))).to.be.revertedWith('SafeERC20: low-level call failed');
        });

        it('should burn from the master vault', async () => {
            const amount = toWei(12_345);

            const prevTotalSupply = await networkToken.totalSupply();
            const prevVaultTokenBalance = await networkToken.balanceOf(masterVault.address);

            await network.burnFromVaultT(amount);

            expect(await networkToken.totalSupply()).to.equal(prevTotalSupply.sub(amount));
            expect(await networkToken.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        });
    });

    describe('is minting enabled', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({
                networkSettings,
                network,
                networkToken,
                masterPool,
                poolTokenFactory,
                poolCollection,
                poolCollectionUpgrader
            } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
        });

        it('should return false for an invalid pool', async () => {
            expect(await masterPool.isNetworkLiquidityEnabled(ZERO_ADDRESS, poolCollection.address)).to.be.false;
        });

        it('should return false for an invalid pool collection', async () => {
            expect(await masterPool.isNetworkLiquidityEnabled(reserveToken.address, ZERO_ADDRESS)).to.be.false;
        });

        it('should return false for a non-whitelisted token', async () => {
            expect(await masterPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection.address)).to.be
                .false;
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = toPPM(1);
            const MINTING_LIMIT = toWei(10_000_000);

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            context('when spot rate is unstable', () => {
                beforeEach(async () => {
                    const spotRate = { n: 1_000_000, d: 1 };

                    await poolCollection.setTradingLiquidityT(reserveToken.address, {
                        networkTokenTradingLiquidity: spotRate.n,
                        baseTokenTradingLiquidity: spotRate.d,
                        tradingLiquidityProduct: spotRate.n * spotRate.d,
                        stakedBalance: 0
                    });
                    await poolCollection.setAverageRateT(reserveToken.address, {
                        rate: {
                            n: spotRate.n * PPM_RESOLUTION,
                            d: spotRate.d * (PPM_RESOLUTION + MAX_DEVIATION + toPPM(0.1))
                        },
                        time: 0
                    });
                });

                it('should return false', async () => {
                    expect(await masterPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection.address)).to
                        .be.false;
                });
            });

            context('when spot rate is stable', () => {
                beforeEach(async () => {
                    const spotRate = {
                        n: toWei(1_000_000),
                        d: toWei(10_000_000)
                    };

                    await poolCollection.setTradingLiquidityT(reserveToken.address, {
                        networkTokenTradingLiquidity: spotRate.n,
                        baseTokenTradingLiquidity: spotRate.d,
                        tradingLiquidityProduct: spotRate.n.mul(spotRate.d),
                        stakedBalance: toWei(1_000_000)
                    });

                    await poolCollection.setAverageRateT(reserveToken.address, {
                        rate: {
                            n: spotRate.n,
                            d: spotRate.d
                        },
                        time: await network.currentTime()
                    });
                });

                it('should return true', async () => {
                    expect(await masterPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection.address)).to
                        .be.true;
                });

                it('should return false for another pool collection', async () => {
                    const poolCollection2 = await createPoolCollection(
                        network,
                        networkToken,
                        networkSettings,
                        poolTokenFactory,
                        poolCollectionUpgrader
                    );

                    expect(await masterPool.isNetworkLiquidityEnabled(reserveToken.address, poolCollection2.address)).to
                        .be.false;
                });
            });
        });
    });

    describe('request liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MAX_DEVIATION = toPPM(1);
        const MINTING_LIMIT = toWei(10_000_000);

        const contextId = formatBytes32String('CTX');

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, masterPool, masterPoolToken, masterVault, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
        });

        const testRequest = async (amount: BigNumber, expectedAmount: BigNumber) => {
            const prevStakedBalance = await masterPool.stakedBalance();
            const prevMintedAmount = await masterPool.mintedAmount(reserveToken.address);
            const prevUnallocatedLiquidity = await masterPool.unallocatedLiquidity(reserveToken.address);

            const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
            const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
            const prevVaultPoolTokenBalance = await masterPoolToken.balanceOf(masterVault.address);

            expect(prevVaultPoolTokenBalance).to.equal(0);

            const prevTokenTotalSupply = await networkToken.totalSupply();
            const prevPoolTokenBalance = await networkToken.balanceOf(masterPool.address);
            const prevVaultTokenBalance = await networkToken.balanceOf(masterVault.address);

            let expectedPoolTokenAmount;
            if (prevPoolTokenTotalSupply.isZero()) {
                expectedPoolTokenAmount = expectedAmount;
            } else {
                expectedPoolTokenAmount = expectedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);
            }

            const res = await network.requestLiquidityT(contextId, reserveToken.address, amount);

            await expect(res)
                .to.emit(masterPool, 'LiquidityRequested')
                .withArgs(contextId, reserveToken.address, expectedAmount, expectedPoolTokenAmount);

            expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedAmount));
            expect(await masterPool.mintedAmount(reserveToken.address)).to.equal(prevMintedAmount.add(expectedAmount));
            expect(await masterPool.unallocatedLiquidity(reserveToken.address)).to.equal(
                prevUnallocatedLiquidity.sub(expectedAmount)
            );

            expect(await masterPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.add(expectedPoolTokenAmount));
            expect(await masterPoolToken.balanceOf(masterPool.address)).to.equal(
                prevPoolPoolTokenBalance.add(expectedPoolTokenAmount)
            );
            expect(await masterPoolToken.balanceOf(masterVault.address)).to.equal(prevVaultPoolTokenBalance);

            expect(await networkToken.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedAmount));
            expect(await networkToken.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance);
            expect(await networkToken.balanceOf(masterVault.address)).to.equal(
                prevVaultTokenBalance.add(expectedAmount)
            );
        };

        it('should revert when attempting to request liquidity from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                masterPool.connect(nonNetwork).requestLiquidity(contextId, reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to request liquidity for an invalid pool', async () => {
            await expect(network.requestLiquidityT(contextId, ZERO_ADDRESS, 1)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to request a zero liquidity amount', async () => {
            await expect(network.requestLiquidityT(contextId, reserveToken.address, 0)).to.be.revertedWith('ZeroValue');
        });

        it('should allow requesting liquidity', async () => {
            for (const amount of [1, 10_000, toWei(1_000_000), toWei(500_000)]) {
                await testRequest(BigNumber.from(amount), BigNumber.from(amount));
            }
        });

        context('when close to the minting limit', () => {
            const remaining = toWei(1_000_000);

            beforeEach(async () => {
                const amount = MINTING_LIMIT.sub(remaining);

                await testRequest(amount, amount);
            });

            it('should allow requesting liquidity up to the limit', async () => {
                for (const amount of [toWei(10), toWei(100_000), toWei(899_990)]) {
                    await testRequest(amount, amount);
                }
            });

            it('should revert when requesting more liquidity amount than the minting limit', async () => {
                for (const amount of [remaining.add(1), remaining.add(toWei(2_000_000)), toWei(2_000_000)]) {
                    await expect(network.requestLiquidityT(contextId, reserveToken.address, amount)).to.be.revertedWith(
                        'MintingLimitExceeded'
                    );
                }
            });

            context('when the minting limit is lowered retroactively', () => {
                beforeEach(async () => {
                    await testRequest(BigNumber.from(100_000), BigNumber.from(100_000));

                    await networkSettings.setPoolMintingLimit(reserveToken.address, 1);
                });

                it('should revert when requesting more liquidity amount than the minting limit', async () => {
                    for (const amount of [10, 100_000, toWei(2_000_000), toWei(1_500_000)]) {
                        await expect(
                            network.requestLiquidityT(contextId, reserveToken.address, amount)
                        ).to.be.revertedWith('MintingLimitExceeded');
                    }
                });
            });
        });

        context('when at the minting limit', () => {
            beforeEach(async () => {
                await testRequest(MINTING_LIMIT, MINTING_LIMIT);
            });

            it('should revert when requesting more liquidity amount than the minting limit', async () => {
                for (const amount of [10, 100_000, toWei(2_000_000), toWei(1_500_000)]) {
                    await expect(network.requestLiquidityT(contextId, reserveToken.address, amount)).to.be.revertedWith(
                        'MintingLimitExceeded'
                    );
                }
            });
        });
    });

    describe('renounce liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MAX_DEVIATION = toPPM(1);
        const MINTING_LIMIT = toWei(10_000_000);

        const contextId = formatBytes32String('CTX');

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, masterPool, masterPoolToken, masterVault, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
        });

        it('should revert when attempting to renounce liquidity from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                masterPool.connect(nonNetwork).renounceLiquidity(contextId, reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to renounce liquidity for an invalid pool', async () => {
            await expect(network.renounceLiquidityT(contextId, ZERO_ADDRESS, 1)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to renounce a zero liquidity amount', async () => {
            await expect(network.renounceLiquidityT(contextId, reserveToken.address, 0)).to.be.revertedWith(
                'ZeroValue'
            );
        });

        it('should revert when attempting to renounce liquidity when no liquidity was ever requested', async () => {
            await expect(network.renounceLiquidityT(contextId, reserveToken.address, 1)).to.be.reverted; // division by 0
        });

        context('with requested liquidity', () => {
            const requestedAmount = toWei(1_000_000);

            beforeEach(async () => {
                await network.requestLiquidityT(contextId, reserveToken.address, requestedAmount);
            });

            const testRenounce = async (amount: BigNumber) => {
                const prevStakedBalance = await masterPool.stakedBalance();
                const prevMintedAmount = await masterPool.mintedAmount(reserveToken.address);
                const prevUnallocatedLiquidity = await masterPool.unallocatedLiquidity(reserveToken.address);

                const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
                const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
                const prevVaultPoolTokenBalance = await masterPoolToken.balanceOf(masterVault.address);

                expect(prevVaultPoolTokenBalance).to.equal(0);

                const prevTokenTotalSupply = await networkToken.totalSupply();
                const prevPoolTokenBalance = await networkToken.balanceOf(masterPool.address);
                const prevVaultTokenBalance = await networkToken.balanceOf(masterVault.address);

                const renouncedAmount = BigNumber.min(prevMintedAmount, amount);
                const expectedPoolTokenAmount = renouncedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                const res = await network.renounceLiquidityT(contextId, reserveToken.address, amount);

                await expect(res)
                    .to.emit(masterPool, 'LiquidityRenounced')
                    .withArgs(contextId, reserveToken.address, amount, expectedPoolTokenAmount);

                expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.sub(renouncedAmount));
                expect(await masterPool.mintedAmount(reserveToken.address)).to.equal(
                    prevMintedAmount.sub(renouncedAmount)
                );

                expect(await masterPool.unallocatedLiquidity(reserveToken.address)).to.equal(
                    prevUnallocatedLiquidity.gt(renouncedAmount)
                        ? prevUnallocatedLiquidity.add(renouncedAmount)
                        : MINTING_LIMIT
                );

                expect(await masterPoolToken.totalSupply()).to.equal(
                    prevPoolTokenTotalSupply.sub(expectedPoolTokenAmount)
                );
                expect(await masterPoolToken.balanceOf(masterPool.address)).to.equal(
                    prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                );
                expect(await masterPoolToken.balanceOf(masterVault.address)).to.equal(prevVaultPoolTokenBalance);

                expect(await networkToken.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                expect(await networkToken.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance);
                expect(await networkToken.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
            };

            it('should allow renouncing liquidity', async () => {
                for (const amount of [1, 10_000, toWei(200_000), toWei(300_000)]) {
                    await testRenounce(BigNumber.from(amount));
                }
            });

            it('should allow renouncing more liquidity than the previously requested amount', async () => {
                // ensure that there is enough tokens in the master vault
                const extra = toWei(1000);
                await networkToken.transfer(masterVault.address, extra);

                await testRenounce(requestedAmount.add(extra));
            });
        });
    });

    describe('deposit liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let govToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, govToken, masterPool, masterPoolToken, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
        });

        it('should revert when attempting to deposit from a non-network', async () => {
            const amount = 1;
            const nonNetwork = deployer;

            await expect(
                masterPool.connect(nonNetwork).depositFor(provider.address, amount, false, 0)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to deposit a zero amount', async () => {
            const amount = 0;

            await expect(network.depositToNetworkPoolForT(provider.address, amount, false, 0)).to.be.revertedWith(
                'ZeroValue'
            );
        });

        it('should revert when attempting to deposit for an invalid provider', async () => {
            const amount = 1;

            await expect(network.depositToNetworkPoolForT(ZERO_ADDRESS, amount, false, 0)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to deposit when no liquidity was requested', async () => {
            const amount = 1;

            await expect(network.depositToNetworkPoolForT(provider.address, amount, false, 0)).to.be.reverted; // division by 0
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = toPPM(1);
            const MINTING_LIMIT = toWei(10_000_000);

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION); // %1
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
            });

            context('with requested liquidity', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);
                    const contextId = formatBytes32String('CTX');

                    await network.requestLiquidityT(contextId, reserveToken.address, requestedAmount);
                });

                const testDeposit = async (
                    provider: SignerWithAddress,
                    amount: BigNumber,
                    isMigrating: boolean,
                    originalGovTokenAmount: BigNumber
                ) => {
                    // since this is only a unit test, we will simulate a proper transfer of the network token amount
                    // from the network to the master pool
                    await networkToken.connect(deployer).transfer(masterPool.address, amount);

                    const prevStakedBalance = await masterPool.stakedBalance();

                    const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
                    const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
                    const prevProviderPoolTokenBalance = await masterPoolToken.balanceOf(provider.address);

                    const prevTokenTotalSupply = await networkToken.totalSupply();
                    const prevPoolTokenBalance = await networkToken.balanceOf(masterPool.address);
                    const prevProviderTokenBalance = await networkToken.balanceOf(provider.address);

                    const prevGovTotalSupply = await govToken.totalSupply();
                    const prevPoolGovTokenBalance = await govToken.balanceOf(masterPool.address);
                    const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);

                    const expectedPoolTokenAmount = amount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                    let expectedGovTokenAmount = expectedPoolTokenAmount;
                    if (isMigrating) {
                        expectedGovTokenAmount = expectedGovTokenAmount.gt(originalGovTokenAmount)
                            ? expectedGovTokenAmount.sub(originalGovTokenAmount)
                            : BigNumber.from(0);
                    }

                    const depositAmounts = await network.callStatic.depositToNetworkPoolForT(
                        provider.address,
                        amount,
                        isMigrating,
                        originalGovTokenAmount
                    );
                    expect(depositAmounts.poolTokenAmount).to.equal(expectedPoolTokenAmount);
                    expect(depositAmounts.govTokenAmount).to.equal(expectedGovTokenAmount);

                    await network.depositToNetworkPoolForT(
                        provider.address,
                        amount,
                        isMigrating,
                        originalGovTokenAmount
                    );

                    expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance);

                    expect(await masterPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                    expect(await masterPoolToken.balanceOf(masterPool.address)).to.equal(
                        prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                    );
                    expect(await masterPoolToken.balanceOf(provider.address)).to.equal(
                        prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                    );

                    expect(await networkToken.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                    expect(await networkToken.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance.sub(amount));
                    expect(await networkToken.balanceOf(provider.address)).to.equal(prevProviderTokenBalance);

                    expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.add(expectedGovTokenAmount));
                    expect(await govToken.balanceOf(masterPool.address)).to.equal(prevPoolGovTokenBalance);
                    expect(await govToken.balanceOf(provider.address)).to.equal(
                        prevProviderGovTokenBalance.add(expectedGovTokenAmount)
                    );
                };

                it('should revert when attempting to deposit without sending the network tokens', async () => {
                    const amount = 1;

                    await expect(
                        network.depositToNetworkPoolForT(provider.address, amount, false, 0)
                    ).to.be.revertedWith('');
                });

                it('should revert when attempting to deposit too much liquidity', async () => {
                    const maxAmount = (await masterPoolToken.balanceOf(masterPool.address))
                        .mul(await masterPool.stakedBalance())
                        .div(await masterPoolToken.totalSupply());

                    await expect(
                        network.depositToNetworkPoolForT(provider.address, maxAmount.add(1), false, 0)
                    ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                });

                it('should allow depositing liquidity', async () => {
                    for (const amount of [1, 10_000, toWei(20_000), toWei(30_000)]) {
                        await testDeposit(provider, BigNumber.from(amount), false, BigNumber.from(0));
                        await testDeposit(provider2, BigNumber.from(amount), false, BigNumber.from(0));
                    }
                });

                it('should compensate migrating providers when they are depositing liquidity', async () => {
                    for (const amount of [1, 10_000, toWei(20_000), toWei(30_000)]) {
                        await testDeposit(provider, BigNumber.from(amount), true, BigNumber.from(100));
                        await testDeposit(provider2, BigNumber.from(amount), true, BigNumber.from(100));
                    }
                });
            });
        });
    });

    describe('withdraw liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let govToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, govToken, masterPool, masterPoolToken, poolCollection } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
        });

        it('should revert when attempting to withdraw from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(masterPool.connect(nonNetwork).withdraw(provider.address, 1)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to withdraw for an invalid provider', async () => {
            await expect(network.withdrawFromNetworkPoolT(ZERO_ADDRESS, 1)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to withdraw a zero amount', async () => {
            await expect(network.withdrawFromNetworkPoolT(provider.address, 0)).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to withdraw before any deposits were made', async () => {
            await expect(network.withdrawFromNetworkPoolT(provider.address, 1)).to.be.revertedWith(''); // division by 0
        });

        context('with a whitelisted and registered pool', () => {
            const MAX_DEVIATION = toPPM(1);
            const MINTING_LIMIT = toWei(10_000_000);
            const WITHDRAWAL_FEE = toPPM(5);

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
                await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
                await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            });

            context('with requested liquidity', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);
                    const contextId = formatBytes32String('CTX');

                    await network.requestLiquidityT(contextId, reserveToken.address, requestedAmount);
                });

                context('with deposited liquidity', () => {
                    let depositAmounts: {
                        poolTokenAmount: BigNumber;
                        govTokenAmount: BigNumber;
                    };

                    beforeEach(async () => {
                        // since this is only a unit test, we will simulate a proper transfer of the network token amount
                        // from the network to the master pool
                        const depositAmount = toWei(1_000_000);
                        await networkToken.connect(deployer).transfer(masterPool.address, depositAmount);

                        depositAmounts = await network.callStatic.depositToNetworkPoolForT(
                            provider.address,
                            depositAmount,
                            false,
                            0
                        );

                        await network.depositToNetworkPoolForT(provider.address, depositAmount, false, 0);
                    });

                    const testWithdraw = async (provider: SignerWithAddress, poolTokenAmount: BigNumber) => {
                        await masterPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(masterPoolToken.address, masterPool.address, poolTokenAmount);
                        await govToken.connect(provider).transfer(masterPool.address, poolTokenAmount);

                        const prevStakedBalance = await masterPool.stakedBalance();

                        const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
                        const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
                        const prevMasterPoolTokenBalance = await masterPoolToken.balanceOf(network.address);
                        const prevProviderPoolTokenBalance = await masterPoolToken.balanceOf(provider.address);

                        const prevTokenTotalSupply = await networkToken.totalSupply();
                        const prevPoolTokenBalance = await networkToken.balanceOf(masterPool.address);
                        const prevProviderTokenBalance = await networkToken.balanceOf(provider.address);

                        const prevGovTotalSupply = await govToken.totalSupply();
                        const prevPoolGovTokenBalance = await govToken.balanceOf(masterPool.address);
                        const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);
                        const expectedTokenAmount = poolTokenAmount
                            .mul(prevStakedBalance.mul(PPM_RESOLUTION - WITHDRAWAL_FEE))
                            .div(prevPoolTokenTotalSupply.mul(PPM_RESOLUTION));

                        const withdrawalAmounts = await network.callStatic.withdrawFromNetworkPoolT(
                            provider.address,
                            poolTokenAmount
                        );

                        expect(withdrawalAmounts.networkTokenAmount).to.equal(expectedTokenAmount);
                        expect(withdrawalAmounts.poolTokenAmount).to.equal(poolTokenAmount);

                        await network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount);

                        expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance);

                        expect(await masterPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                        expect(await masterPoolToken.balanceOf(masterPool.address)).to.equal(
                            prevPoolPoolTokenBalance.add(poolTokenAmount)
                        );

                        expect(await masterPoolToken.balanceOf(network.address)).to.equal(
                            prevMasterPoolTokenBalance.sub(poolTokenAmount)
                        );
                        expect(await masterPoolToken.balanceOf(provider.address)).to.equal(
                            prevProviderPoolTokenBalance
                        );

                        expect(await networkToken.totalSupply()).to.equal(
                            prevTokenTotalSupply.add(expectedTokenAmount)
                        );
                        expect(await networkToken.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance);
                        expect(await networkToken.balanceOf(provider.address)).to.equal(
                            prevProviderTokenBalance.add(expectedTokenAmount)
                        );

                        expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply.sub(poolTokenAmount));
                        expect(await govToken.balanceOf(masterPool.address)).to.equal(
                            prevPoolGovTokenBalance.sub(poolTokenAmount)
                        );
                        expect(await govToken.balanceOf(provider.address)).to.equal(prevProviderGovTokenBalance);
                    };

                    it('should revert when attempting to withdraw more than the deposited amount', async () => {
                        const extra = 1;
                        const poolTokenAmount = depositAmounts.poolTokenAmount.add(extra);

                        await network.approveT(masterPoolToken.address, masterPool.address, poolTokenAmount);
                        await govToken.connect(deployer).transfer(provider.address, extra);
                        await govToken.connect(provider).transfer(masterPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    it('should revert when attempting to deposit without sending the governance tokens', async () => {
                        const poolTokenAmount = 1000;

                        await masterPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(masterPoolToken.address, masterPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERR_UNDERFLOW');
                    });

                    it('should revert when attempting to deposit without approving the network tokens', async () => {
                        const poolTokenAmount = 1000;
                        await govToken.connect(provider).transfer(masterPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromNetworkPoolT(provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    it('should allow withdrawing liquidity', async () => {
                        for (const poolTokenAmount of [100, 10_000, toWei(20_000), toWei(30_000)]) {
                            await testWithdraw(provider, BigNumber.from(poolTokenAmount));
                        }
                    });
                });
            });
        });
    });

    describe('fee collection', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let masterPool: TestMasterPool;
        let reserveToken: TestERC20Token;

        const MINTING_LIMIT = toWei(10_000_000);

        beforeEach(async () => {
            ({ networkSettings, masterPool, network } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

            await networkSettings.setPoolMintingLimit(reserveToken.address, MINTING_LIMIT);
        });

        it('should revert when attempting to notify about collected fee from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                masterPool.connect(nonNetwork).onFeesCollected(reserveToken.address, 1, FeeTypes.Trading)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
            await expect(network.onNetworkTokenFeesCollectedT(ZERO_ADDRESS, 1, FeeTypes.Trading)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        for (const [name, type] of Object.entries(FeeTypes)) {
            for (const feeAmount of [0, 12_345, toWei(12_345)]) {
                it(`should collect ${name} fees of ${feeAmount.toString()}`, async () => {
                    const prevStakedBalance = await masterPool.stakedBalance();
                    const prevMintedAmount = await masterPool.mintedAmount(reserveToken.address);
                    const prevUnallocatedLiquidity = await masterPool.unallocatedLiquidity(reserveToken.address);
                    const expectedMintedAmount = type === FeeTypes.Trading ? feeAmount : 0;

                    await network.onNetworkTokenFeesCollectedT(reserveToken.address, feeAmount, type);

                    expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                    expect(await masterPool.mintedAmount(reserveToken.address)).to.equal(
                        prevMintedAmount.add(expectedMintedAmount)
                    );
                    expect(await masterPool.unallocatedLiquidity(reserveToken.address)).to.equal(
                        prevUnallocatedLiquidity.sub(expectedMintedAmount)
                    );
                });
            }
        }
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let networkToken: IERC20;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(masterPool.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(masterPool, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    masterPool.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [TKN, MASTER_POOL_TOKEN_SYMBOL]) {
            const isMasterPoolToken = symbol === MASTER_POOL_TOKEN_SYMBOL;

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ network, masterPool, masterPoolToken, networkToken, networkSettings, poolCollection } =
                        await createSystem());

                    const reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

                    if (isMasterPoolToken) {
                        token = masterPoolToken;

                        await createPool(reserveToken, network, networkSettings, poolCollection);

                        await network.mintT(deployer.address, amount);
                        await networkToken.connect(deployer).transfer(masterPool.address, amount);

                        await networkSettings.setPoolMintingLimit(reserveToken.address, amount);

                        const contextId = formatBytes32String('CTX');
                        await network.requestLiquidityT(contextId, reserveToken.address, amount);

                        await network.depositToNetworkPoolForT(deployer.address, amount, false, 0);
                    } else {
                        token = await createTokenBySymbol(symbol);
                    }

                    await transfer(deployer, token, masterPool.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await masterPool.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with master pool token manager role', () => {
                    beforeEach(async () => {
                        await masterPool.grantRole(MasterPoolRoles.ROLE_MASTER_POOL_TOKEN_MANAGER, user.address);
                    });

                    if (isMasterPoolToken) {
                        testWithdrawFunds();
                    } else {
                        testWithdrawFundsRestricted();
                    }
                });
            });
        }
    });
});
