import Contracts, {
    MasterVault,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestERC20Token,
    TestMasterPool,
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

describe('MasterPool', () => {
    let deployer: SignerWithAddress;
    let bntManager: SignerWithAddress;
    let fundingManager: SignerWithAddress;
    let provider: SignerWithAddress;
    let provider2: SignerWithAddress;

    const CONTEXT_ID = formatBytes32String('CTX');
    const FUNDING_LIMIT = toWei(10_000_000);

    shouldHaveGap('MasterPool', '_stakedBalance');

    before(async () => {
        [deployer, bntManager, fundingManager, provider, provider2] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let masterVault: MasterVault;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;

        beforeEach(async () => {
            ({
                network,
                bnt,
                networkSettings,
                bntGovernance,
                vbntGovernance,
                masterVault,
                masterPool,
                masterPoolToken
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    vbntGovernance.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPoolToken.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT governance contract', async () => {
            await expect(
                Contracts.MasterPool.deploy(
                    network.address,
                    bntGovernance.address,
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
                    bntGovernance.address,
                    vbntGovernance.address,
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
                    bntGovernance.address,
                    vbntGovernance.address,
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
                    bntGovernance.address,
                    vbntGovernance.address,
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
            await expectRole(masterPool, Roles.MasterPool.ROLE_BNT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(masterPool, Roles.MasterPool.ROLE_VAULT_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
            await expectRole(masterPool, Roles.MasterPool.ROLE_FUNDING_MANAGER, Roles.Upgradeable.ROLE_ADMIN);

            expect(await masterPool.stakedBalance()).to.equal(0);

            const tokenData = new TokenData(TokenSymbol.bnBNT);

            const poolToken = await Contracts.PoolToken.attach(await masterPool.poolToken());
            expect(await poolToken.owner()).to.equal(masterPool.address);
            expect(await poolToken.reserveToken()).to.equal(bnt.address);
            expect(await poolToken.name()).to.equal(tokenData.name());
            expect(await poolToken.symbol()).to.equal(tokenData.symbol());
            expect(await poolToken.decimals()).to.equal(tokenData.decimals());
        });
    });

    describe('minting BNTs', () => {
        let bnt: IERC20;
        let masterPool: TestMasterPool;

        beforeEach(async () => {
            ({ bnt, masterPool } = await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_BNT_MANAGER, bntManager.address);
        });

        it('should revert when attempting to mint from a non-BNT manager', async () => {
            const nonBNTManager = deployer;

            await expect(masterPool.connect(nonBNTManager).mint(provider.address, 1)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to mint to an invalid address', async () => {
            await expect(masterPool.connect(bntManager).mint(ZERO_ADDRESS, 1)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to mint an invalid amount', async () => {
            await expect(masterPool.connect(bntManager).mint(provider.address, 0)).to.be.revertedWith('ZeroValue');
        });

        it('should mint to the recipient', async () => {
            const amount = toWei(12345);

            const prevTotalSupply = await bnt.totalSupply();
            const prevRecipientTokenBalance = await bnt.balanceOf(provider.address);

            await masterPool.connect(bntManager).mint(provider.address, amount);

            expect(await bnt.totalSupply()).to.equal(prevTotalSupply.add(amount));
            expect(await bnt.balanceOf(provider.address)).to.equal(prevRecipientTokenBalance.add(amount));
        });
    });

    describe('burning BNTs from the vault', () => {
        let bnt: IERC20;
        let masterPool: TestMasterPool;
        let masterVault: MasterVault;
        let vaultManager: SignerWithAddress;

        const amount = toWei(12_345);

        before(async () => {
            [, vaultManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ bnt, masterPool, masterVault } = await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_VAULT_MANAGER, vaultManager.address);

            await bnt.transfer(masterVault.address, amount);
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

            const prevTotalSupply = await bnt.totalSupply();
            const prevVaultTokenBalance = await bnt.balanceOf(masterVault.address);

            await masterPool.connect(vaultManager).burnFromVault(amount);

            expect(await bnt.totalSupply()).to.equal(prevTotalSupply.sub(amount));
            expect(await bnt.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
        });
    });

    describe('request funding', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, bnt, masterPool, masterPoolToken, masterVault, poolCollection } =
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

            const prevTokenTotalSupply = await bnt.totalSupply();
            const prevPoolTokenBalance = await bnt.balanceOf(masterPool.address);
            const prevVaultTokenBalance = await bnt.balanceOf(masterVault.address);

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

            expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedAmount));
            expect(await bnt.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance);
            expect(await bnt.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.add(expectedAmount));
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
        let bnt: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ networkSettings, network, bnt, masterPool, masterPoolToken, masterVault, poolCollection } =
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

                const prevTokenTotalSupply = await bnt.totalSupply();
                const prevPoolTokenBalance = await bnt.balanceOf(masterPool.address);
                const prevVaultTokenBalance = await bnt.balanceOf(masterVault.address);

                const reduceFundingAmount = min(prevFunding, amount);
                const expectedPoolTokenAmount = reduceFundingAmount
                    .mul(prevPoolTokenTotalSupply)
                    .div(prevStakedBalance);

                const res = await masterPool
                    .connect(fundingManager)
                    .renounceFunding(CONTEXT_ID, reserveToken.address, amount);

                await expect(res)
                    .to.emit(masterPool, 'FundingRenounced')
                    .withArgs(CONTEXT_ID, reserveToken.address, amount, expectedPoolTokenAmount);

                expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.sub(reduceFundingAmount));
                expect(await masterPool.currentPoolFunding(reserveToken.address)).to.equal(
                    prevFunding.sub(reduceFundingAmount)
                );

                expect(await masterPool.availableFunding(reserveToken.address)).to.equal(
                    prevAvailableFunding.gt(reduceFundingAmount)
                        ? prevAvailableFunding.add(reduceFundingAmount)
                        : FUNDING_LIMIT
                );

                expect(await masterPoolToken.totalSupply()).to.equal(
                    prevPoolTokenTotalSupply.sub(expectedPoolTokenAmount)
                );
                expect(await masterPoolToken.balanceOf(masterPool.address)).to.equal(
                    prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                );
                expect(await masterPoolToken.balanceOf(masterVault.address)).to.equal(prevVaultPoolTokenBalance);

                expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                expect(await bnt.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance);
                expect(await bnt.balanceOf(masterVault.address)).to.equal(prevVaultTokenBalance.sub(amount));
            };

            it('should allow renouncing funding', async () => {
                for (const amount of [1, 10_000, toWei(200_000), toWei(300_000)]) {
                    await testRenounce(BigNumber.from(amount));
                }
            });

            it('should allow renouncing more funding than the previously requested amount', async () => {
                // ensure that there is enough tokens in the master vault
                const extra = toWei(1000);
                await bnt.transfer(masterVault.address, extra);

                await testRenounce(requestedAmount.add(extra));
            });
        });
    });

    describe('deposit liquidity', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let vbnt: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, bnt, vbnt, masterPool, masterPoolToken, poolCollection } =
                await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
        });

        it('should revert when attempting to deposit from a non-network', async () => {
            const amount = 1;
            const nonNetwork = deployer;

            await expect(
                masterPool.connect(nonNetwork).depositFor(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to deposit a zero amount', async () => {
            const amount = 0;

            await expect(
                network.depositToMasterPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
            ).to.be.revertedWith('ZeroValue');
        });

        it('should revert when attempting to deposit for an invalid provider', async () => {
            const amount = 1;

            await expect(
                network.depositToMasterPoolForT(CONTEXT_ID, ZERO_ADDRESS, amount, false, 0)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to deposit when no funding was requested', async () => {
            const amount = 1;

            await expect(
                network.depositToMasterPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
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

                    await masterPool
                        .connect(fundingManager)
                        .requestFunding(CONTEXT_ID, reserveToken.address, requestedAmount);
                });

                const testDeposit = async (
                    provider: SignerWithAddress,
                    amount: BigNumber,
                    isMigrating: boolean,
                    originalVBNTAmount: BigNumber
                ) => {
                    // since this is only a unit test, we will simulate a proper transfer of the BNT amount
                    // from the network to the master pool
                    await bnt.connect(deployer).transfer(masterPool.address, amount);

                    const prevStakedBalance = await masterPool.stakedBalance();

                    const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
                    const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
                    const prevProviderPoolTokenBalance = await masterPoolToken.balanceOf(provider.address);

                    const prevTokenTotalSupply = await bnt.totalSupply();
                    const prevPoolTokenBalance = await bnt.balanceOf(masterPool.address);
                    const prevProviderTokenBalance = await bnt.balanceOf(provider.address);

                    const prevGovTotalSupply = await vbnt.totalSupply();
                    const prevPoolVBNTBalance = await vbnt.balanceOf(masterPool.address);
                    const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                    const expectedPoolTokenAmount = amount.mul(prevPoolTokenTotalSupply).div(prevStakedBalance);

                    let expectedVBNTAmount = expectedPoolTokenAmount;
                    if (isMigrating) {
                        expectedVBNTAmount = expectedVBNTAmount.gt(originalVBNTAmount)
                            ? expectedVBNTAmount.sub(originalVBNTAmount)
                            : BigNumber.from(0);
                    }

                    const res = await network.depositToMasterPoolForT(
                        CONTEXT_ID,
                        provider.address,
                        amount,
                        isMigrating,
                        originalVBNTAmount
                    );

                    await expect(res).to.emit(masterPool, 'TokenDeposited').withArgs(
                        CONTEXT_ID,

                        provider.address,
                        amount,
                        expectedPoolTokenAmount,
                        expectedVBNTAmount
                    );

                    expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance);

                    expect(await masterPoolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                    expect(await masterPoolToken.balanceOf(masterPool.address)).to.equal(
                        prevPoolPoolTokenBalance.sub(expectedPoolTokenAmount)
                    );
                    expect(await masterPoolToken.balanceOf(provider.address)).to.equal(
                        prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                    );

                    expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.sub(amount));
                    expect(await bnt.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance.sub(amount));
                    expect(await bnt.balanceOf(provider.address)).to.equal(prevProviderTokenBalance);

                    expect(await vbnt.totalSupply()).to.equal(prevGovTotalSupply.add(expectedVBNTAmount));
                    expect(await vbnt.balanceOf(masterPool.address)).to.equal(prevPoolVBNTBalance);
                    expect(await vbnt.balanceOf(provider.address)).to.equal(
                        prevProviderVBNTBalance.add(expectedVBNTAmount)
                    );
                };

                it('should revert when attempting to deposit without sending the BNTs', async () => {
                    const amount = 1;

                    await expect(
                        network.depositToMasterPoolForT(CONTEXT_ID, provider.address, amount, false, 0)
                    ).to.be.revertedWith('');
                });

                it('should revert when attempting to deposit too much liquidity', async () => {
                    const maxAmount = (await masterPoolToken.balanceOf(masterPool.address))
                        .mul(await masterPool.stakedBalance())
                        .div(await masterPoolToken.totalSupply());

                    await expect(
                        network.depositToMasterPoolForT(CONTEXT_ID, provider.address, maxAmount.add(1), false, 0)
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
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        let fundingManager: SignerWithAddress;

        before(async () => {
            [, fundingManager] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ networkSettings, network, bnt, vbnt, masterPool, masterPoolToken, poolCollection } =
                await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();
        });

        it('should revert when attempting to withdraw from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(masterPool.connect(nonNetwork).withdraw(CONTEXT_ID, provider.address, 1)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to withdraw for an invalid provider', async () => {
            await expect(network.withdrawFromMasterPoolT(CONTEXT_ID, ZERO_ADDRESS, 1)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to withdraw a zero amount', async () => {
            await expect(network.withdrawFromMasterPoolT(CONTEXT_ID, provider.address, 0)).to.be.revertedWith(
                'ZeroValue'
            );
        });

        it('should revert when attempting to withdraw before any deposits were made', async () => {
            await expect(network.withdrawFromMasterPoolT(CONTEXT_ID, provider.address, 1)).to.be.revertedWith(''); // division by 0
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
                    let depositPoolTokenAmount: BigNumber;

                    beforeEach(async () => {
                        const prevProviderPoolTokenBalance = await masterPoolToken.balanceOf(provider.address);

                        // since this is only a unit test, we will simulate a proper transfer of the BNT amount
                        // from the network to the master pool
                        const depositAmount = toWei(1_000_000);
                        await bnt.connect(deployer).transfer(masterPool.address, depositAmount);

                        await network.depositToMasterPoolForT(CONTEXT_ID, provider.address, depositAmount, false, 0);

                        depositPoolTokenAmount = (await masterPoolToken.balanceOf(provider.address)).sub(
                            prevProviderPoolTokenBalance
                        );
                    });

                    const testWithdraw = async (provider: SignerWithAddress, poolTokenAmount: BigNumber) => {
                        await masterPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(masterPoolToken.address, masterPool.address, poolTokenAmount);
                        await vbnt.connect(provider).transfer(masterPool.address, poolTokenAmount);

                        const prevStakedBalance = await masterPool.stakedBalance();

                        const prevPoolTokenTotalSupply = await masterPoolToken.totalSupply();
                        const prevPoolPoolTokenBalance = await masterPoolToken.balanceOf(masterPool.address);
                        const prevMasterPoolTokenBalance = await masterPoolToken.balanceOf(network.address);
                        const prevProviderPoolTokenBalance = await masterPoolToken.balanceOf(provider.address);

                        const prevTokenTotalSupply = await bnt.totalSupply();
                        const prevPoolTokenBalance = await bnt.balanceOf(masterPool.address);
                        const prevProviderTokenBalance = await bnt.balanceOf(provider.address);

                        const prevGovTotalSupply = await vbnt.totalSupply();
                        const prevPoolVBNTBalance = await vbnt.balanceOf(masterPool.address);
                        const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);

                        const expectedBNTAmount = poolTokenAmount
                            .mul(prevStakedBalance.mul(PPM_RESOLUTION - WITHDRAWAL_FEE))
                            .div(prevPoolTokenTotalSupply.mul(PPM_RESOLUTION));
                        const expectedWithdrawalFeeAmount = poolTokenAmount
                            .mul(prevStakedBalance.mul(WITHDRAWAL_FEE))
                            .div(prevPoolTokenTotalSupply.mul(PPM_RESOLUTION));

                        const res = await network.withdrawFromMasterPoolT(
                            CONTEXT_ID,
                            provider.address,
                            poolTokenAmount
                        );

                        await expect(res)
                            .to.emit(masterPool, 'TokenWithdrawn')
                            .withArgs(
                                CONTEXT_ID,
                                provider.address,
                                expectedBNTAmount,
                                poolTokenAmount,
                                poolTokenAmount,
                                expectedWithdrawalFeeAmount
                            );

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

                        expect(await bnt.totalSupply()).to.equal(prevTokenTotalSupply.add(expectedBNTAmount));
                        expect(await bnt.balanceOf(masterPool.address)).to.equal(prevPoolTokenBalance);
                        expect(await bnt.balanceOf(provider.address)).to.equal(
                            prevProviderTokenBalance.add(expectedBNTAmount)
                        );

                        expect(await vbnt.totalSupply()).to.equal(prevGovTotalSupply.sub(poolTokenAmount));
                        expect(await vbnt.balanceOf(masterPool.address)).to.equal(
                            prevPoolVBNTBalance.sub(poolTokenAmount)
                        );
                        expect(await vbnt.balanceOf(provider.address)).to.equal(prevProviderVBNTBalance);
                    };

                    it('should revert when attempting to withdraw more than the deposited amount', async () => {
                        const extra = 1;
                        const poolTokenAmount = depositPoolTokenAmount.add(extra);

                        await network.approveT(masterPoolToken.address, masterPool.address, poolTokenAmount);
                        await vbnt.connect(deployer).transfer(provider.address, extra);
                        await vbnt.connect(provider).transfer(masterPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromMasterPoolT(CONTEXT_ID, provider.address, poolTokenAmount)
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    it('should revert when attempting to deposit without sending the VBNTs', async () => {
                        const poolTokenAmount = 1000;

                        await masterPoolToken.connect(provider).transfer(network.address, poolTokenAmount);
                        await network.approveT(masterPoolToken.address, masterPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromMasterPoolT(CONTEXT_ID, provider.address, poolTokenAmount)
                        ).to.be.revertedWith(new TokenData(TokenSymbol.VBNT).errors().exceedsBalance);
                    });

                    it('should revert when attempting to deposit without approving the BNTs', async () => {
                        const poolTokenAmount = 1000;
                        await vbnt.connect(provider).transfer(masterPool.address, poolTokenAmount);

                        await expect(
                            network.withdrawFromMasterPoolT(CONTEXT_ID, provider.address, poolTokenAmount)
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

        for (const tradeFee of [true, false]) {
            context(`${tradeFee ? 'trade' : 'other'} fees`, () => {
                it('should revert when attempting to notify about collected fee from a non-network', async () => {
                    const nonNetwork = deployer;

                    await expect(
                        masterPool.connect(nonNetwork).onFeesCollected(reserveToken.address, 1, tradeFee)
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
                    await expect(network.onBNTFeesCollectedT(ZERO_ADDRESS, 1, tradeFee)).to.be.revertedWith(
                        'InvalidAddress'
                    );
                });

                for (const feeAmount of [0, 12_345, toWei(12_345)]) {
                    it(`should collect fees of ${feeAmount.toString()}`, async () => {
                        const prevStakedBalance = await masterPool.stakedBalance();
                        const prevFunding = await masterPool.currentPoolFunding(reserveToken.address);
                        const prevAvailableFunding = await masterPool.availableFunding(reserveToken.address);
                        const expectedFunding = tradeFee ? feeAmount : 0;

                        await network.onBNTFeesCollectedT(reserveToken.address, feeAmount, tradeFee);

                        expect(await masterPool.stakedBalance()).to.equal(prevStakedBalance.add(feeAmount));
                        expect(await masterPool.currentPoolFunding(reserveToken.address)).to.equal(
                            prevFunding.add(expectedFunding)
                        );
                        expect(await masterPool.availableFunding(reserveToken.address)).to.equal(
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
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let bnt: IERC20;

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
                    ({ network, masterPool, masterPoolToken, bnt, networkSettings, poolCollection } =
                        await createSystem());

                    await masterPool.grantRole(Roles.MasterPool.ROLE_BNT_MANAGER, bntManager.address);

                    await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

                    const reserveToken = await createTestToken();

                    if (isMasterPoolToken) {
                        token = masterPoolToken;

                        await createPool(reserveToken, network, networkSettings, poolCollection);

                        await masterPool.connect(bntManager).mint(deployer.address, amount);
                        await bnt.connect(deployer).transfer(masterPool.address, amount);

                        await networkSettings.setFundingLimit(reserveToken.address, amount);

                        await masterPool
                            .connect(fundingManager)
                            .requestFunding(CONTEXT_ID, reserveToken.address, amount);

                        await network.depositToMasterPoolForT(CONTEXT_ID, deployer.address, amount, false, 0);
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

        const BNT_LIQUIDITY = toWei(1_000_000_000);

        beforeEach(async () => {
            ({ networkSettings, network, masterPool, masterPoolToken, poolCollection } = await createSystem());

            await masterPool.grantRole(Roles.MasterPool.ROLE_FUNDING_MANAGER, fundingManager.address);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await masterPool.connect(fundingManager).requestFunding(CONTEXT_ID, reserveToken.address, BNT_LIQUIDITY);
        });

        for (const bntAmount of [0, 1000, toWei(10_000), toWei(1_000_000)]) {
            context(`underlying amount of ${bntAmount.toString()}`, () => {
                it('should properly convert between underlying amount and pool token amount', async () => {
                    const poolTokenTotalSupply = await masterPoolToken.totalSupply();
                    const stakedBalance = await masterPool.stakedBalance();

                    const poolTokenAmount = await masterPool.underlyingToPoolToken(bntAmount);
                    expect(poolTokenAmount).to.equal(
                        BigNumber.from(bntAmount).mul(poolTokenTotalSupply).div(stakedBalance)
                    );

                    const underlyingAmount = await masterPool.poolTokenToUnderlying(poolTokenAmount);
                    expect(underlyingAmount).to.be.closeTo(BigNumber.from(bntAmount), 1);
                });

                it('should properly calculate pool token amount to burn in order to increase underlying value', async () => {
                    const poolTokenAmount = toWei(100_000);
                    await masterPool.mintPoolTokenT(deployer.address, poolTokenAmount);

                    const prevUnderlying = await masterPool.poolTokenToUnderlying(poolTokenAmount);
                    const poolTokenAmountToBurn = await masterPool.poolTokenAmountToBurn(bntAmount);

                    // ensure that burning the resulted pool token amount increases the underlying by the
                    // specified network amount while taking into account pool tokens owned by the protocol
                    await masterPool.burnPoolTokenT(poolTokenAmountToBurn);

                    expect(await masterPool.poolTokenToUnderlying(poolTokenAmount)).to.equal(
                        prevUnderlying.add(bntAmount)
                    );
                });
            });
        }
    });
});
