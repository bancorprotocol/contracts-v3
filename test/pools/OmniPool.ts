import Contracts, {
    OmniVault,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestERC20Token,
    TestOmniPool,
    TestPoolCollection
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { PPM_RESOLUTION, ZERO_ADDRESS, MAX_UINT256 } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei, toPPM } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPool, createSystem, createToken, createTestToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { min, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('OmniPool', () => {
    let deployer: SignerWithAddress;
    let bntManager: SignerWithAddress;
    let fundingManager: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    const CONTEXT_ID = formatBytes32String('CTX');
    const FUNDING_LIMIT = toWei(10_000_000);

    shouldHaveGap('OmniPool', '_stakedBalance');

    before(async () => {
        [deployer, bntManager, fundingManager, provider, provider2] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let omniVault: OmniVault;
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;

        beforeEach(async () => {
            ({ network, bnt, networkSettings, bntGovernance, vbntGovernance, omniVault, omniPool, omniPoolToken } =
                await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.OmniPool.deploy(
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    omniVault.address,
                    omniPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.OmniPool.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    vbntGovernance.address,
                    networkSettings.address,
                    omniVault.address,
                    omniPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT governance contract', async () => {
            await expect(
                Contracts.OmniPool.deploy(
                    network.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    omniVault.address,
                    omniPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.OmniPool.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    ZERO_ADDRESS,
                    omniVault.address,
                    omniPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid omni vault contract', async () => {
            await expect(
                Contracts.OmniPool.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    omniPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid omni pool token contract', async () => {
            await expect(
                Contracts.OmniPool.deploy(
                    network.address,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    omniVault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(omniPool.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await omniPool.version()).to.equal(1);
            expect(await omniPool.isPayable()).to.be.false;

            await expectRoles(omniPool, Roles.OmniPool);

            await expectRole(omniPool, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address,
                network.address
            ]);
            await expectRole(omniPool, Roles.OmniPool.ROLE_BNT_POOL_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(omniPool, Roles.OmniPool.ROLE_BNT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(omniPool, Roles.OmniPool.ROLE_VAULT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(omniPool, Roles.OmniPool.ROLE_FUNDING_MANAGER, Roles.Upgradeable.ROLE_ADMIN);

            expect(await omniPool.stakedBalance()).to.equal(0);

            const tokenData = new TokenData(TokenSymbol.bnBNT);

            const poolToken = await Contracts.PoolToken.attach(await omniPool.poolToken());
            expect(await poolToken.owner()).to.equal(omniPool.address);
            expect(await poolToken.reserveToken()).to.equal(bnt.address);
            expect(await poolToken.name()).to.equal(tokenData.name());
            expect(await poolToken.symbol()).to.equal(tokenData.symbol());
            expect(await poolToken.decimals()).to.equal(tokenData.decimals());
        });
    });

    describe('minting BNT', () => {
        let bnt: IERC20;
        let omniPool: TestOmniPool;

        beforeEach(async () => {
            ({ bnt, omniPool } = await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_BNT_MANAGER, bntManager.address);
        });

        it('should revert when attempting to mint from a non-BNT manager', async () => {
            const nonBNTManager = deployer;

            await expect(omniPool.connect(nonBNTManager).mint(provider.address, 1)).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to mint to an invalid address', async () => {
            await expect(omniPool.connect(bntManager).mint(ZERO_ADDRESS, 1)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to mint an invalid amount', async () => {
            await expect(omniPool.connect(bntManager).mint(provider.address, 0)).to.be.revertedWith('ZeroValue');
        });

        it('should mint to the recipient', async () => {
            const amount = toWei(12345);

            const prevTotalSupply = await bnt.totalSupply();
            const prevRecipientTokenBalance = await bnt.balanceOf(provider.address);

            await omniPool.connect(bntManager).mint(provider.address, amount);

            expect(await bnt.totalSupply()).to.equal(prevTotalSupply.add(amount));
            expect(await bnt.balanceOf(provider.address)).to.equal(prevRecipientTokenBalance.add(amount));
        });
    });

    describe('burning BNT from the vault', () => {
        let bnt: IERC20;
        let omniPool: TestOmniPool;
        let omniVault: OmniVault;
        let vaultManager: SignerWithAddress;

        const amount = toWei(12_345);

        before(async () => {
            [, vaultManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ bnt, omniPool, omniVault } = await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_VAULT_MANAGER, vaultManager.address);

            await bnt.transfer(omniVault.address, amount);
        });

        it('should revert when attempting to burn from a non-vault manager', async () => {
            const nonVaultManager = deployer;

            await expect(omniPool.connect(nonVaultManager).burnFromVault(1)).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to burn an invalid amount', async () => {
            await expect(omniPool.connect(vaultManager).burnFromVault(0)).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to burn more than the balance of the omni vault', async () => {
            const tokenData = new TokenData(TokenSymbol.BNT);
            await expect(omniPool.connect(vaultManager).burnFromVault(amount.add(1))).to.be.revertedWith(
                tokenData.errors().burnExceedsBalance
            );
        });

        it('should burn from the omni vault', async () => {
            const amount = toWei(12_345);

            const prevTotalSupply = await bnt.totalSupply();
            const prevVaultTokenBalance = await bnt.balanceOf(omniVault.address);

            await omniPool.connect(vaultManager).burnFromVault(amount);

            expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(amount));
            expect(await bnt.balanceOf(omniVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        });
    });

    describe('request funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;
        let omniVault: OmniVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, bnt, omniPool, omniPoolToken, omniVault, poolCollection } =
                await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        const testRequest = async (amount: BigNumber, expectedAmount: BigNumber) => {
            const prevStakedBalance = await omniPool.stakedBalance();
            const prevFunding = await omniPool.currentPoolFunding(reserveToken.address);
            const prevAvailableFunding = await omniPool.availableFunding(reserveToken.address);

            const prevPoolTokenTotalSupply = await omniPoolToken.totalSupply();
            const prevPoolPoolTokenBalance = await omniPoolToken.balanceOf(omniPool.address);
            const prevVaultPoolTokenBalance = await omniPoolToken.balanceOf(omniVault.address);

            expect(prevVaultPoolTokenBalance).to.equal(0);

            const prevTokenTotalSupply = await bnt.totalSupply();
            const prevPoolTokenBalance = await bnt.balanceOf(omniPool.address);
            const prevVaultTokenBalance = await bnt.balanceOf(omniVault.address);

            let expectedPoolTokenAmount;
            if (prevPoolTokenTotalSupply.isZero()) {
                expectedPoolTokenAmount = expectedAmount;
            } else {
                expectedPoolTokenAmount = expectedAmount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);
            }

            const res = await omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount);

            await expect(res)
                .to.emit(omniPool, 'FundingRequested')
                .withArgs(CONTEXT_ID, reserveToken.address, expectedAmount, expectedPoolTokenAmount);

            expect(await omniPool.stakedBalance()).to.equal(prevStakedBalance.add(expectedAmount));
            expect(await omniPool.currentPoolFunding(reserveToken.address)).to.equal(prevFunding.add(expectedAmount));
            expect(await omniPool.availableFunding(reserveToken.address)).to.equal(
                prevAvailableFunding.sub(expectedAmount)
            );

            expect(await omniPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.add(expectedPoolTokenAmount));
            expect(await omniPoolToken.balanceOf(omniPool.address)).to.equal(
                prevPoolPoolTokenBalance.add(expectedPoolTokenAmount)
            );
            expect(await omniPoolToken.balanceOf(omniVault.address)).to.equal(prevVaultPoolTokenBalance);

            expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedAmount));
            expect(await bnt.balanceOf(omniPool.address)).to.equal(prevPoolTokenBalance);
            expect(await bnt.balanceOf(omniVault.address)).to.equal(prevVaultTokenBalance.add(expectedAmount));
        };

        it('should revert when attempting to request funding from a non-funding manager', async () => {
            const nonFundingManager = deployer;

            await expect(
                omniPool.connect(nonFundingManager).requestFunding(CONTEXT_ID, reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to request funding for a non-whitelisted pool', async () => {
            await expect(
                omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, ZERO_ADDRESS, 1)
            ).to.be.revertedWith('NotWhitelisted');

            const reserveToken2 = await createTestToken();
            await expect(
                omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken2.address, 1)
            ).to.be.revertedWith('NotWhitelisted');
        });

        it('should revert when attempting to request a zero funding amount', async () => {
            await expect(
                omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, 0)
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
                        omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
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
                            omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
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
                        omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount)
                    ).to.be.revertedWith('FundingLimitExceeded');
                }
            });
        });
    });

    describe('renounce funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;
        let omniVault: OmniVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, bnt, omniPool, omniPoolToken, omniVault, poolCollection } =
                await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        it('should revert when attempting to renounce funding from a non-funding manager', async () => {
            const nonFundingManager = deployer;

            await expect(
                omniPool.connect(nonFundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to renounce funding for a non-whitelisted pool', async () => {
            await expect(
                omniPool.connect(fundingManager).renounceFunding(CONTEXT_ID, ZERO_ADDRESS, 1)
            ).to.be.revertedWith('NotWhitelisted');

            const reserveToken2 = await createTestToken();
            await expect(
                omniPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken2.address, 1)
            ).to.be.revertedWith('NotWhitelisted');
        });

        it('should revert when attempting to renounce a zero funding amount', async () => {
            await expect(
                omniPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 0)
            ).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to renounce funding when no funding was ever requested', async () => {
            await expect(omniPool.connect(fundingManager).renounceFunding(CONTEXT_ID, reserveToken.address, 1)).to.be
                .reverted; // division by 0
        });

        context('with requested funding', () => {
            const requestedAmount = toWei(1_000_000);

            beforeEach(async () => {
                await omniPool
                    .connect(fundingManager)
                    .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
            });

            const testRenounce = async (amount: BigNumber) => {
                const prevStakedBalance = await omniPool.stakedBalance();
                const prevFunding = await omniPool.currentPoolFunding(reserveToken.address);
                const prevAvailableFunding = await omniPool.availableFunding(reserveToken.address);

                const prevPoolTokenTotalSupply = await omniPoolToken.totalSupply();
                const prevPoolPoolTokenBalance = await omniPoolToken.balanceOf(omniPool.address);
                const prevVaultPoolTokenBalance = await omniPoolToken.balanceOf(omniVault.address);

                expect(prevVaultPoolTokenBalance).to.equal(0);

                const prevTokenTotalSupply = await bnt.totalSupply();
                const prevPoolTokenBalance = await bnt.balanceOf(omniPool.address);
                const prevVaultTokenBalance = await bnt.balanceOf(omniVault.address);

                const reduceFundingAmount = min(prevFunding, amount);
                const expectedPoolTokenAmount = reduceFundingAmount
                    .mul(prevPoolTokenTotalSupply)
                    .div(prevStakedBalance);

                const res = await omniPool
                    .connect(fundingManager)
                    .renounceFunding(CONTEXT_ID, reserveToken.address, amount);

                await expect(res)
                    .to.emit(omniPool, 'FundingRenounced')
                    .withArgs(CONTEXT_ID, reserveToken.address, amount, expectedPoolTokenAmount);

                expect(await omniPool.stakedBalance()).to.equal(prevStakedBalance.sub(reduceFundingAmount));
                expect(await omniPool.currentPoolFunding(reserveToken.address)).to.equal(
                    prevFunding.sub(reduceFundingAmount)
                );

                expect(await omniPool.availableFunding(reserveToken.address)).to.equal(
                    prevAvailableFunding.gt(reduceFundingAmount)
                        ? prevAvailableFunding.add(reduceFundingAmount)
                        : FUNDING_LIMIT
                );

                expect(await omniPoolToken.totalSupply()).to.equal(
                    prevPoolTokenTotalSupply.sub(expectedPoolTokenAmount)
                );
                expect(await omniPoolToken.balanceOf(omniPool.address)).to.equal(
                    prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                );
                expect(await omniPoolToken.balanceOf(omniVault.address)).to.equal(prevVaultPoolTokenBalance);

                expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                expect(await bnt.balanceOf(omniPool.address)).to.equal(prevPoolTokenBalance);
                expect(await bnt.balanceOf(omniVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
            };

            it('should allow renouncing funding', async () => {
                for (const amount of [1, 10_000, toWei(200_000), toWei(300_000)]) {
                    await testRenounce(BigNumber.from(amount));
                }
            });

            it('should allow renouncing more funding than the previously requested amount', async () => {
                // ensure that there is enough tokens in the omni vault
                const extra = toWei(1000);
                await bnt.transfer(omniVault.address, extra);

                await testRenounce(requestedAmount.add(extra));
            });
        });
    });

    describe('deposit liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let vbnt: IERC20;
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, bnt, vbnt, omniPool, omniPoolToken, poolCollection } = await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
        });

        it('should revert when attempting to deposit from a non-network', async () => {
            const amount = 1;
            const nonNetwork = deployer;

            await expect(
                omniPool.connect(nonNetwork).depositFor(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to deposit a zero amount', async () => {
            const amount = 0;

            await expect(
                network.depositToOmniPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to deposit for an invalid provider', async () => {
            const amount = 1;

            await expect(network.depositToOmniPoolForT(CONTEXT_ID, ZERO_ADDRESS, amount, false, 0)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to deposit when no funding was requested', async () => {
            const amount = 1;

            await expect(
                network.depositToOmniPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWith('reverted with panic code 0x12 (Division or modulo division by zero)');
        });

        context('with a whitelisted and registered pool', () => {
            beforeEach(async () => {
                await createPool(reserveToken, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
            });

            context('with requested funding', () => {
                beforeEach(async () => {
                    const requestedAmount = toWei(1_000_000);

                    await omniPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
                });

                const testDeposit = async (
                    provider: SignerWithAddress,
                    amount: BigNumber,
                    isMigrating: boolean,
                    originalVBNTAmount: BigNumber
                ) => {
                    // since this is only a unit test, we will simulate a proper transfer of BNT amount from the network
                    // to the omni pool
                    await bnt.connect(deployer).transfer(omniPool.address, amount);

                    const prevStakedBalance = await omniPool.stakedBalance();

                    const prevPoolTokenTotalSupply = await omniPoolToken.totalSupply();
                    const prevPoolPoolTokenBalance = await omniPoolToken.balanceOf(omniPool.address);
                    const prevProviderPoolTokenBalance = await omniPoolToken.balanceOf(provider.address);

                    const prevTokenTotalSupply = await bnt.totalSupply();
                    const prevPoolTokenBalance = await bnt.balanceOf(omniPool.address);
                    const prevProviderTokenBalance = await bnt.balanceOf(provider.address);

                    const prevVBNTTotalSupply = await vbnt.totalSupply();
                    const prevPoolVBNTBalance = await vbnt.balanceOf(omniPool.address);
                    const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                    const expectedPoolTokenAmount = amount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                    let expectedVBNTAmount = expectedPoolTokenAmount;
                    if (isMigrating) {
                        expectedVBNTAmount = expectedVBNTAmount.gt(originalVBNTAmount)
                            ? expectedVBNTAmount.sub(originalVBNTAmount)
                            : BigNumber.from(0);
                    }

                    const res = await network.depositToOmniPoolForT(
                        CONTEXT_ID,
                        provider.address,
                        amount,
                        isMigrating,
                        originalVBNTAmount
                    );

                    await expect(res).to.emit(omniPool, 'TokenDeposited').withArgs(
                        CONTEXT_ID,

                        provider.address,
                        amount,
                        expectedPoolTokenAmount,
                        expectedVBNTAmount
                    );

                    expect(await omniPool.stakedBalance()).to.equal(prevStakedBalance);

                    expect(await omniPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                    expect(await omniPoolToken.balanceOf(omniPool.address)).to.equal(
                        prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                    );
                    expect(await omniPoolToken.balanceOf(provider.address)).to.equal(
                        prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                    );

                    expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                    expect(await bnt.balanceOf(omniPool.address)).to.equal(prevPoolTokenBalance.sub(amount));
                    expect(await bnt.balanceOf(provider.address)).to.equal(prevProviderTokenBalance);

                    expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply.add(expectedVBNTAmount));
                    expect(await vbnt.balanceOf(omniPool.address)).to.equal(prevPoolVBNTBalance);
                    expect(await vbnt.balanceOf(provider.address)).to.equal(
                        prevProviderVBNTBalance.add(expectedVBNTAmount)
                    );
                };

                it('should revert when attempting to deposit without sending BNT', async () => {
                    const amount = 1;

                    await expect(
                        network.depositToOmniPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
                    ).to.be.revertedWith('');
                });

                it('should revert when attempting to deposit too much liquidity', async () => {
                    const maxAmount = (await omniPoolToken.balanceOf(omniPool.address))
                        .mul(await omniPool.stakedBalance())
                        .div(await omniPoolToken.totalSupply());

                    await expect(
                        network.depositToOmniPoolForT(CONTEXT_ID, provider.address, maxAmount.add(1), false, 0)
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
        let bnt: IERC20;
        let vbnt: IERC20;
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        let fundingManager: SignerWithAddress;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, bnt, vbnt, omniPool, omniPoolToken, poolCollection } = await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
        });

        it('should revert when attempting to withdraw from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(omniPool.connect(nonNetwork).withdraw(CONTEXT_ID, provider.address, 1)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to withdraw for an invalid provider', async () => {
            await expect(network.withdrawFromOmniPoolT(CONTEXT_ID, ZERO_ADDRESS, 1)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to withdraw a zero amount', async () => {
            await expect(network.withdrawFromOmniPoolT(CONTEXT_ID, provider.address, 0)).to.be.revertedWith(
                'ZeroValue'
            );
        });

        it('should revert when attempting to withdraw before any deposits were made', async () => {
            await expect(network.withdrawFromOmniPoolT(CONTEXT_ID, provider.address, 1)).to.be.revertedWith(''); // division by 0
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

                    await omniPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
                });

                context('with deposited liquidity', () => {
                    let depositPoolTokenAmount: BigNumber;

                    beforeEach(async () => {
                        const prevProviderPoolTokenBalance = await omniPoolToken.balanceOf(provider.address);

                        // since this is only a unit test, we will simulate a proper transfer of BNT amount from the
                        // network to the omni pool
                        const depositAmount = toWei(1_000_000);
                        await bnt.connect(deployer).transfer(omniPool.address, depositAmount);

                        await network.depositToOmniPoolForT(CONTEXT_ID, provider.address, depositAmount, false, 0);

                        depositPoolTokenAmount = (await omniPoolToken.balanceOf(provider.address)).sub(
                            prevProviderPoolTokenBalance
                        );
                    });

                    const testWithdraw = async (provider: SignerWithAddress, poolTokenAmount: BigNumber) => {
                        await omniPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(omniPoolToken.address, omniPool.address, poolTokenAmount);
                        await vbnt.connect(provider).transfer(omniPool.address, poolTokenAmount);

                        const prevStakedBalance = await omniPool.stakedBalance();

                        const prevPoolTokenTotalSupply = await omniPoolToken.totalSupply();
                        const prevPoolPoolTokenBalance = await omniPoolToken.balanceOf(omniPool.address);
                        const prevOmniPoolTokenBalance = await omniPoolToken.balanceOf(network.address);
                        const prevProviderPoolTokenBalance = await omniPoolToken.balanceOf(provider.address);

                        const prevTokenTotalSupply = await bnt.totalSupply();
                        const prevPoolTokenBalance = await bnt.balanceOf(omniPool.address);
                        const prevProviderTokenBalance = await bnt.balanceOf(provider.address);

                        const prevVBNTTotalSupply = await vbnt.totalSupply();
                        const prevPoolVBNTBalance = await vbnt.balanceOf(omniPool.address);
                        const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                        const expectedBNTAmount = poolTokenAmount
                            .mul(prevStakedBalance.mul(PPM_RESOLUTION - WITHDRAWAL_FEE))
                            .div(prevPoolTokenTotalSupply.mul(PPM_RESOLUTION));
                        const expectedWithdrawalFeeAmount = poolTokenAmount
                            .mul(prevStakedBalance.mul(WITHDRAWAL_FEE))
                            .div(prevPoolTokenTotalSupply.mul(PPM_RESOLUTION));

                        const res = await network.withdrawFromOmniPoolT(CONTEXT_ID, provider.address, poolTokenAmount);

                        await expect(res)
                            .to.emit(omniPool, 'TokenWithdrawn')
                            .withArgs(
                                CONTEXT_ID,
                                provider.address,
                                expectedBNTAmount,
                                poolTokenAmount,
                                poolTokenAmount,
                                expectedWithdrawalFeeAmount
                            );

                        expect(await omniPool.stakedBalance()).to.equal(prevStakedBalance);

                        expect(await omniPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                        expect(await omniPoolToken.balanceOf(omniPool.address)).to.equal(
                            prevPoolPoolTokenBalance.add(poolTokenAmount)
                        );

                        expect(await omniPoolToken.balanceOf(network.address)).to.equal(
                            prevOmniPoolTokenBalance.sub(poolTokenAmount)
                        );
                        expect(await omniPoolToken.balanceOf(provider.address)).to.equal(prevProviderPoolTokenBalance);

                        expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedBNTAmount));
                        expect(await bnt.balanceOf(omniPool.address)).to.equal(prevPoolTokenBalance);
                        expect(await bnt.balanceOf(provider.address)).to.equal(
                            prevProviderTokenBalance.add(expectedBNTAmount)
                        );

                        expect(await vbnt.totalSupply()).to.equal(prevVBNTTotalSupply.sub(poolTokenAmount));
                        expect(await vbnt.balanceOf(omniPool.address)).to.equal(
                            prevPoolVBNTBalance.sub(poolTokenAmount)
                        );
                        expect(await vbnt.balanceOf(provider.address)).to.equal(prevProviderVBNTBalance);
                    };

                    it('should revert when attempting to withdraw more than the deposited amount', async () => {
                        const extra = 1;
                        const poolTokenAmount = depositPoolTokenAmount.add(extra);

                        await network.approveT(omniPoolToken.address, omniPool.address, poolTokenAmount);
                        await vbnt.connect(deployer).transfer(provider.address, extra);
                        await vbnt.connect(provider).transfer(omniPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromOmniPoolT(CONTEXT_ID, provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    it('should revert when attempting to deposit without sending VBNT', async () => {
                        const poolTokenAmount = 1000;

                        await omniPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(omniPoolToken.address, omniPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromOmniPoolT(CONTEXT_ID, provider.address, poolTokenAmount)
                        ).to.be.revertedWith(new TokenData(TokenSymbol.VBNT).errors().exceedsBalance);
                    });

                    it('should revert when attempting to deposit without approving BNT', async () => {
                        const poolTokenAmount = 1000;
                        await vbnt.connect(provider).transfer(omniPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromOmniPoolT(CONTEXT_ID, provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: insufficient allowance');
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
        let omniPool: TestOmniPool;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, omniPool, poolCollection } = await createSystem());

            reserveToken = await createTestToken();
            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, FUNDING_LIMIT);
        });

        for (const tradeFee of [true, false]) {
            context(`${tradeFee ? 'trade' : 'other'} fees`, () => {
                it('should revert when attempting to notify about collected fee from a non-network', async () => {
                    const nonNetwork = deployer;

                    await expect(
                        omniPool.connect(nonNetwork).onFeesCollected(reserveToken.address, 1, tradeFee)
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
                    await expect(network.onBNTFeesCollectedT(ZERO_ADDRESS, 1, tradeFee)).to.be.revertedWith(
                        'InvalidAddress'
                    );
                });

                for (const feeAmount of [0, 12_345, toWei(12_345)]) {
                    it(`should collect fees of ${feeAmount.toString()}`, async () => {
                        const prevStakedBalance = await omniPool.stakedBalance();
                        const prevFunding = await omniPool.currentPoolFunding(reserveToken.address);
                        const prevAvailableFunding = await omniPool.availableFunding(reserveToken.address);
                        const expectedFunding = tradeFee ? feeAmount : 0;

                        await network.onBNTFeesCollectedT(reserveToken.address, feeAmount, tradeFee);

                        expect(await omniPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                        expect(await omniPool.currentPoolFunding(reserveToken.address)).to.equal(
                            prevFunding.add(expectedFunding)
                        );
                        expect(await omniPool.availableFunding(reserveToken.address)).to.equal(
                            prevAvailableFunding.sub(expectedFunding)
                        );
                    });
                }
            });
        }
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;
        let bnt: IERC20;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(omniPool.connect(provider).withdrawFunds(token.address, provider.address, amount))
                    .to.emit(omniPool, 'FundsWithdrawn')
                    .withArgs(token.address, provider.address, provider.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    omniPool.connect(provider).withdrawFunds(token.address, provider.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        for (const symbol of [TokenSymbol.TKN, TokenSymbol.bnBNT]) {
            const isOmniPoolToken = symbol === TokenSymbol.bnBNT;

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ network, omniPool, omniPoolToken, bnt, networkSettings, poolCollection } = await createSystem());

                    await omniPool.grantRole(Roles.OmniPool.ROLE_BNT_MANAGER, bntManager.address);

                    await omniPool.grantRole(Roles.OmniPool.ROLE_FUNDING_MANAGER, fundingManager.address);

                    const reserveToken = await createTestToken();

                    if (isOmniPoolToken) {
                        token = omniPoolToken;

                        await createPool(reserveToken, network, networkSettings, poolCollection);

                        await omniPool.connect(bntManager).mint(deployer.address, amount);
                        await bnt.connect(deployer).transfer(omniPool.address, amount);

                        await networkSettings.setFundingLimit(reserveToken.address, amount);

                        await omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, amount);

                        await network.depositToOmniPoolForT(CONTEXT_ID, deployer.address, amount, false, 0);
                    } else {
                        token = await createToken(new TokenData(symbol));
                    }

                    await transfer(deployer, token, omniPool.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await omniPool.grantRole(Roles.Upgradeable.ROLE_ADMIN, provider.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with omni pool token manager role', () => {
                    beforeEach(async () => {
                        await omniPool.grantRole(Roles.OmniPool.ROLE_BNT_POOL_TOKEN_MANAGER, provider.address);
                    });

                    if (isOmniPoolToken) {
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
        let omniPool: TestOmniPool;
        let omniPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const BNT_LIQUIDITY = toWei(1_000_000_000);

        beforeEach(async () => {
            ({ networkSettings, network, omniPool, omniPoolToken, poolCollection } = await createSystem());

            await omniPool.grantRole(Roles.OmniPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await omniPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, BNT_LIQUIDITY);
        });

        for (const bntAmount of [0, 1000, toWei(10_000), toWei(1_000_000)]) {
            context(`underlying amount of ${bntAmount.toString()}`, () => {
                it('should properly convert between underlying amount and pool token amount', async () => {
                    const poolTokenTotalSupply = await omniPoolToken.totalSupply();
                    const stakedBalance = await omniPool.stakedBalance();

                    const poolTokenAmount = await omniPool.underlyingToPoolToken(bntAmount);
                    expect(poolTokenAmount).to.equal(
                        BigNumber.from(bntAmount).mul(poolTokenTotalSupply).div(stakedBalance)
                    );

                    const underlyingAmount = await omniPool.poolTokenToUnderlying(poolTokenAmount);
                    expect(underlyingAmount).to.be.closeTo(BigNumber.from(bntAmount), 1);
                });

                it('should properly calculate pool token amount to burn in order to increase underlying value', async () => {
                    const poolTokenAmount = toWei(100_000);
                    await omniPool.mintPoolTokenT(deployer.address, poolTokenAmount);

                    const prevUnderlying = await omniPool.poolTokenToUnderlying(poolTokenAmount);
                    const poolTokenAmountToBurn = await omniPool.poolTokenAmountToBurn(bntAmount);

                    // ensure that burning the resulted pool token amount increases the underlying by the
                    // specified BNT amount while taking into account pool tokens owned by the protocol
                    await omniPool.burnPoolTokenT(poolTokenAmountToBurn);

                    expect(await omniPool.poolTokenToUnderlying(poolTokenAmount)).to.equal(
                        prevUnderlying.add(bntAmount)
                    );
                });
            });
        }
    });
});
