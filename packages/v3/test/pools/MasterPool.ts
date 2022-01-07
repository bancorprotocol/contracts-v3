import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import {
    MasterVault,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestERC20Token,
    TestMasterPool,
    TestPoolCollection
} from '../../typechain-types';
import { FeeType, PPM_RESOLUTION, ZERO_ADDRESS, MAX_UINT256 } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei, toPPM } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPool, createSystem, createToken, createTestToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('MasterPool', () => {
    let deployer: SignerWithAddress;
    let networkTokenManager: SignerWithAddress;
    let fundingManager: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    const CONTEXT_ID = formatBytes32String('CTX');
    const FUNDING_LIMIT = toWei(10_000_000);

    shouldHaveGap('MasterPool', '_stakedBalance');

    before(async () => {
        [deployer, networkTokenManager, fundingManager, provider, provider2] = await ethers.getSigners();
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

            await expectRoles(masterPool, Roles.MasterPool);

            await expectRole(masterPool, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address,
                network.address
            ]);
            await expectRole(masterPool, Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(masterPool, Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN, []);
            await expectRole(masterPool, Roles.MasterPool.ROLE_VAULT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(masterPool, Roles.MasterPool.ROLE_FUNDING_MANAGER, Roles.Upgradeable.ROLE_ADMIN);

            expect(await masterPool.stakedBalance()).to.equal(0);

            const tokenData = new TokenData(TokenSymbol.bnBNT);

            const poolToken = await Contracts.PoolToken.attach(await masterPool.poolToken());
            expect(await poolToken.owner()).to.equal(masterPool.address);
            expect(await poolToken.reserveToken()).to.equal(networkToken.address);
            expect(await poolToken.name()).to.equal(tokenData.name());
            expect(await poolToken.symbol()).to.equal(tokenData.symbol());
            expect(await poolToken.decimals()).to.equal(tokenData.decimals());
        });
    });

    describe('minting network tokens', () => {
        let networkToken: IERC20;
        let masterPool: TestMasterPool;

        beforeEach(async () => {
            ({ networkToken, masterPool } = await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER, networkTokenManager.address);
        });

        it('should revert when attempting to mint from a non-network token manager', async () => {
            const nonNetworkTokenManager = deployer;

            await expect(masterPool.connect(nonNetworkTokenManager).mint(provider.address, 1)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to mint to an invalid address', async () => {
            await expect(masterPool.connect(networkTokenManager).mint(ZERO_ADDRESS, 1)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to mint an invalid amount', async () => {
            await expect(masterPool.connect(networkTokenManager).mint(provider.address, 0)).to.be.revertedWith(
                'ZeroValue'
            );
        });

        it('should mint to the recipient', async () => {
            const amount = toWei(12345);

            const prevTotalSupply = await networkToken.totalSupply();
            const prevRecipientTokenBalance = await networkToken.balanceOf(provider.address);

            await masterPool.connect(networkTokenManager).mint(provider.address, amount);

            expect(await networkToken.totalSupply()).to.equal(prevTotalSupply.add(amount));
            expect(await networkToken.balanceOf(provider.address)).to.equal(prevRecipientTokenBalance.add(amount));
        });
    });

    describe('burning network tokens from the vault', () => {
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterVault: MasterVault;
        let vaultManager: SignerWithAddress;

        const amount = toWei(12_345);

        before(async () => {
            [, vaultManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkToken, masterPool, masterVault } = await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_VAULT_MANAGER, vaultManager.address);

            await networkToken.transfer(masterVault.address, amount);
        });

        it('should revert when attempting to burn from a non-vault manager', async () => {
            const nonVaultManager = deployer;

            await expect(masterPool.connect(nonVaultManager).burnFromVault(1)).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to burn an invalid amount', async () => {
            await expect(masterPool.connect(vaultManager).burnFromVault(0)).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to burn more than the balance of the master vault', async () => {
            const tokenData = new TokenData(TokenSymbol.BNT);
            await expect(masterPool.connect(vaultManager).burnFromVault(amount.add(1))).to.be.revertedWith(
                tokenData.errors().burnExceedsBalance
            );
        });

        it('should burn from the master vault', async () => {
            const amount = toWei(12_345);

            const prevTotalSupply = await networkToken.totalSupply();
            const prevVaultTokenBalance = await networkToken.balanceOf(masterVault.address);

            await masterPool.connect(vaultManager).burnFromVault(amount);

            expect(await networkToken.totalSupply()).to.equal(prevTotalSupply.sub(amount));
            expect(await networkToken.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        });
    });

    describe('request funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, masterPool, masterPoolToken, masterVault, poolCollection } =
                await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        const testRequest = async (amount: BigNumber, expectedAmount: BigNumber) => {
            const prevStakedBalance = await masterPool.stakedBalance();
            const prevFunding = await masterPool.currentPoolFunding(reserveToken.address);
            const prevAvailableFunding = await masterPool.availableFunding(reserveToken.address);

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

            const res = await masterPool
                .connect(fundingManager)
                .requestFunding(CONTEXT_ID, reserveToken.address, amount);

            await expect(res)
                .to.emit(masterPool, 'FundingRequested')
                .withArgs(CONTEXT_ID, reserveToken.address, expectedAmount, expectedPoolTokenAmount);

            expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedAmount));
            expect(await masterPool.currentPoolFunding(reserveToken.address)).to.equal(prevFunding.add(expectedAmount));
            expect(await masterPool.availableFunding(reserveToken.address)).to.equal(
                prevAvailableFunding.sub(expectedAmount)
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

        it('should revert when attempting to request funding from a non-funding manager', async () => {
            const nonFundingManager = deployer;

            await expect(
                masterPool.connect(nonFundingManager).requestFunding(CONTEXT_ID, reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to request funding for a non-whitelisted pool', async () => {
            await expect(
                masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, ZERO_ADDRESS, 1)
            ).to.be.revertedWith('NotWhitelisted');

            const reserveToken2 = await createTestToken();
            await expect(
                masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken2.address, 1)
            ).to.be.revertedWith('NotWhitelisted');
        });

        it('should revert when attempting to request a zero funding amount', async () => {
            await expect(
                masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, 0)
            ).to.be.revertedWith('ZeroValue');
        });

        it('should allow requesting funding', async () => {
            for (const amount of [1, 10_000, toWei(1_000_000), toWei(500_000)]) {
                await testRequest(BigNumber.from(amount), BigNumber.from(amount));
            }
        });

        context('when close to the funding limit', () => {
            const remaining = toWei(1_000_000);

            beforeEach(async () => {
                const amount = FUNDING_LIMIT.sub(remaining);

                await testRequest(amount, amount);
            });

            it('should allow requesting funding up to the limit', async () => {
                for (const amount of [toWei(10), toWei(100_000), toWei(899_990)]) {
                    await testRequest(amount, amount);
                }
            });

            it('should revert when requesting more funding amount than the funding limit', async () => {
                for (const amount of [remaining.add(1), remaining.add(toWei(2_000_000)), toWei(2_000_000)]) {
                    await expect(
                        masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                    ).to.be.revertedWith('FundingLimitExceeded');
                }
            });

            context('when the funding limit is lowered retroactively', () => {
                beforeEach(async () => {
                    await testRequest(BigNumber.from(100_000), BigNumber.from(100_000));

                    await networkSettings.setFundingLimit(reserveToken.address, 1);
                });

                it('should revert when requesting more funding amount than the funding limit', async () => {
                    for (const amount of [10, 100_000, toWei(2_000_000), toWei(1_500_000)]) {
                        await expect(
                            masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                        ).to.be.revertedWith('FundingLimitExceeded');
                    }
                });
            });
        });

        context('when at the funding limit', () => {
            beforeEach(async () => {
                await testRequest(FUNDING_LIMIT, FUNDING_LIMIT);
            });

            it('should revert when requesting more funding amount than the funding limit', async () => {
                for (const amount of [10, 100_000, toWei(2_000_000), toWei(1_500_000)]) {
                    await expect(
                        masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                    ).to.be.revertedWith('FundingLimitExceeded');
                }
            });
        });
    });

    describe('renounce funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, masterPool, masterPoolToken, masterVault, poolCollection } =
                await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        it('should revert when attempting to renounce funding from a non-funding manager', async () => {
            const nonFundingManager = deployer;

            await expect(
                masterPool.connect(nonFundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to renounce funding for a non-whitelisted pool', async () => {
            await expect(
                masterPool.connect(fundingManager).renounceFunding(CONTEXT_ID, ZERO_ADDRESS, 1)
            ).to.be.revertedWith('NotWhitelisted');

            const reserveToken2 = await createTestToken();
            await expect(
                masterPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken2.address, 1)
            ).to.be.revertedWith('NotWhitelisted');
        });

        it('should revert when attempting to renounce a zero funding amount', async () => {
            await expect(
                masterPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 0)
            ).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to renounce funding when no funding was ever requested', async () => {
            await expect(masterPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 1)).to.be
                .reverted; // division by 0
        });

        context('with requested funding', () => {
            const requestedAmount = toWei(1_000_000);

            beforeEach(async () => {
                await masterPool
                    .connect(fundingManager)
                    .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
            });

            const testRenounce = async (amount: BigNumber) => {
                const prevStakedBalance = await masterPool.stakedBalance();
                const prevFunding = await masterPool.currentPoolFunding(reserveToken.address);
                const prevAvailableFunding = await masterPool.availableFunding(reserveToken.address);

                const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
                const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
                const prevVaultPoolTokenBalance = await masterPoolToken.balanceOf(masterVault.address);

                expect(prevVaultPoolTokenBalance).to.equal(0);

                const prevTokenTotalSupply = await networkToken.totalSupply();
                const prevPoolTokenBalance = await networkToken.balanceOf(masterPool.address);
                const prevVaultTokenBalance = await networkToken.balanceOf(masterVault.address);

                const renouncedAmount = BigNumber.min(prevFunding, amount);
                const expectedPoolTokenAmount = renouncedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                const res = await masterPool
                    .connect(fundingManager)
                    .renounceFunding(CONTEXT_ID, reserveToken.address, amount);

                await expect(res)
                    .to.emit(masterPool, 'FundingRenounced')
                    .withArgs(CONTEXT_ID, reserveToken.address, amount, expectedPoolTokenAmount);

                expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.sub(renouncedAmount));
                expect(await masterPool.currentPoolFunding(reserveToken.address)).to.equal(
                    prevFunding.sub(renouncedAmount)
                );

                expect(await masterPool.availableFunding(reserveToken.address)).to.equal(
                    prevAvailableFunding.gt(renouncedAmount) ? prevAvailableFunding.add(renouncedAmount) : FUNDING_LIMIT
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

            it('should allow renouncing funding', async () => {
                for (const amount of [1, 10_000, toWei(200_000), toWei(300_000)]) {
                    await testRenounce(BigNumber.from(amount));
                }
            });

            it('should allow renouncing more funding than the previously requested amount', async () => {
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

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, govToken, masterPool, masterPoolToken, poolCollection } =
                await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
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

        it('should revert when attempting to deposit when no funding was requested', async () => {
            const amount = 1;

            await expect(network.depositToNetworkPoolForT(provider.address, amount, false, 0)).to.be.reverted; // division by 0
        });

        context('with a whitelisted and registered pool', () => {
            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
            });

            context('with requested funding', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);

                    await masterPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
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

        let fundingManager: SignerWithAddress;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, networkToken, govToken, masterPool, masterPoolToken, poolCollection } =
                await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
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
            const WITHDRAWAL_FEE = toPPM(5);

            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
                await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);
            });

            context('with requested funding', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);

                    await masterPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
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
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection } = await createSystem());

            reserveToken = await createTestToken();
            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        it('should revert when attempting to notify about collected fee from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                masterPool.connect(nonNetwork).onFeesCollected(reserveToken.address, 1, FeeType.Trading)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
            await expect(network.onNetworkTokenFeesCollectedT(ZERO_ADDRESS, 1, FeeType.Trading)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        for (const [name, type] of Object.entries(FeeType).filter(([, v]) => typeof v === 'number')) {
            for (const feeAmount of [0, 12_345, toWei(12_345)]) {
                it(`should collect ${name} fees of ${feeAmount.toString()}`, async () => {
                    const prevStakedBalance = await masterPool.stakedBalance();
                    const prevFunding = await masterPool.currentPoolFunding(reserveToken.address);
                    const prevAvailableFunding = await masterPool.availableFunding(reserveToken.address);
                    const expectedFunding = type === FeeType.Trading ? feeAmount : 0;

                    await network.onNetworkTokenFeesCollectedT(reserveToken.address, feeAmount, type);

                    expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                    expect(await masterPool.currentPoolFunding(reserveToken.address)).to.equal(
                        prevFunding.add(expectedFunding)
                    );
                    expect(await masterPool.availableFunding(reserveToken.address)).to.equal(
                        prevAvailableFunding.sub(expectedFunding)
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

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(masterPool.connect(provider).withdrawFunds(token.address, provider.address, amount))
                    .to.emit(masterPool, 'FundsWithdrawn')
                    .withArgs(token.address, provider.address, provider.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    masterPool.connect(provider).withdrawFunds(token.address, provider.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        for (const symbol of [TokenSymbol.TKN, TokenSymbol.bnBNT]) {
            const isMasterPoolToken = symbol === TokenSymbol.bnBNT;

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ network, masterPool, masterPoolToken, networkToken, networkSettings, poolCollection } =
                        await createSystem());

                    await masterPool.grantRole(
                        Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER,
                        networkTokenManager.address
                    );

                    await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

                    const reserveToken = await createTestToken();

                    if (isMasterPoolToken) {
                        token = masterPoolToken;

                        await createPool(reserveToken, network, networkSettings, poolCollection);

                        await masterPool.connect(networkTokenManager).mint(deployer.address, amount);
                        await networkToken.connect(deployer).transfer(masterPool.address, amount);

                        await networkSettings.setFundingLimit(reserveToken.address, amount);

                        await masterPool
                            .connect(fundingManager)
                            .requestFunding(CONTEXT_ID, reserveToken.address, amount);

                        await network.depositToNetworkPoolForT(deployer.address, amount, false, 0);
                    } else {
                        token = await createToken(new TokenData(symbol));
                    }

                    await transfer(deployer, token, masterPool.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await masterPool.grantRole(Roles.Upgradeable.ROLE_ADMIN, provider.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with master pool token manager role', () => {
                    beforeEach(async () => {
                        await masterPool.grantRole(Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, provider.address);
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

    describe('pool token calculations', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const NETWORK_TOKEN_LIQUIDITY = toWei(1_000_000_000);

        beforeEach(async () => {
            ({ networkSettings, network, masterPool, masterPoolToken, poolCollection } = await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await masterPool
                .connect(fundingManager)
                .requestFunding(CONTEXT_ID, reserveToken.address, NETWORK_TOKEN_LIQUIDITY);
        });

        for (const networkTokenAmount of [0, 1000, toWei(10_000), toWei(1_000_000)]) {
            context(`underlying amount of ${networkTokenAmount.toString()}`, () => {
                it('should properly convert between underlying amount and pool token amount', async () => {
                    const poolTokenTotalSupply = await masterPoolToken.totalSupply();
                    const stakedBalance = await masterPool.stakedBalance();

                    const poolTokenAmount = await masterPool.underlyingToPoolToken(networkTokenAmount);
                    expect(poolTokenAmount).to.equal(
                        BigNumber.from(networkTokenAmount).mul(poolTokenTotalSupply).div(stakedBalance)
                    );

                    const underlyingAmount = await masterPool.poolTokenToUnderlying(poolTokenAmount);
                    expect(underlyingAmount).to.be.closeTo(BigNumber.from(networkTokenAmount), 1);
                });

                it('should properly calculate pool token amount to burn in order to increase underlying value', async () => {
                    const poolTokenAmount = toWei(100_000);
                    await masterPool.mintPoolTokenT(deployer.address, poolTokenAmount);

                    const prevUnderlying = await masterPool.poolTokenToUnderlying(poolTokenAmount);
                    const poolTokenAmountToBurn = await masterPool.poolTokenAmountToBurn(networkTokenAmount);

                    // ensure that burning the resulted pool token amount increases the underlying by the
                    // specified network amount while taking into account pool tokens owned by the protocol
                    await masterPool.burnPoolTokenT(poolTokenAmountToBurn);

                    expect(await masterPool.poolTokenToUnderlying(poolTokenAmount)).to.equal(
                        prevUnderlying.add(networkTokenAmount)
                    );
                });
            });
        }
    });
});
