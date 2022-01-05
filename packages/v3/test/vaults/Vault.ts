import Contracts from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { IERC20, TestVault, TestERC20Burnable } from '../../typechain-types';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol, NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createProxy, createSystem, createToken, createBurnableToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer, getBalance } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Vault', () => {
    let deployer: SignerWithAddress;
    let sender: SignerWithAddress;
    let target: SignerWithAddress;
    let admin: SignerWithAddress;

    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let networkToken: IERC20;
    let govToken: IERC20;

    const createTestVault = async () =>
        createProxy(Contracts.TestVault, {
            ctorArgs: [networkTokenGovernance.address, govTokenGovernance.address]
        });

    shouldHaveGap('TestVault', '_isAuthorizedWithdrawal');

    before(async () => {
        [deployer, sender, target, admin] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ networkToken, govToken, networkTokenGovernance, govTokenGovernance } = await createSystem());
    });

    describe('construction', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();
        });

        it('should revert when attempting to create with an invalid network token governance contract', async () => {
            await expect(Contracts.TestVault.deploy(ZERO_ADDRESS, govTokenGovernance.address)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to create with an invalid governance token governance contract', async () => {
            await expect(Contracts.TestVault.deploy(networkTokenGovernance.address, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(testVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await testVault.version()).to.equal(1);
            expect(await testVault.isPayable()).to.be.false;

            await expectRoles(testVault, Roles.Vault);

            await expectRole(testVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer.address]);
        });
    });

    describe('depositing ETH ', () => {
        let testVault: TestVault;

        const amount = 1_000_000;

        beforeEach(async () => {
            testVault = await createTestVault();
        });

        context('payable', () => {
            beforeEach(async () => {
                await testVault.setPayable(true);
            });

            it('should be able to receive ETH', async () => {
                const balance = await getBalance({ address: NATIVE_TOKEN_ADDRESS }, testVault.address);

                await deployer.sendTransaction({ value: amount, to: testVault.address });

                expect(await getBalance({ address: NATIVE_TOKEN_ADDRESS }, testVault.address)).to.equal(
                    balance.add(amount)
                );
            });
        });

        context('non-payable', () => {
            it('should revert when sending ETH', async () => {
                await expect(deployer.sendTransaction({ value: amount, to: testVault.address })).to.be.revertedWith(
                    'NotPayable'
                );
            });
        });
    });

    describe('withdrawing funds', async () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();

            await testVault.setAuthorizedWithdrawal(true);
            await testVault.setPayable(true);
        });

        const testWithdraw = (tokenData: TokenData) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            beforeEach(async () => {
                token = tokenData.isNetworkToken() ? networkToken : await createToken(tokenData);

                await transfer(deployer, token, testVault.address, amount + 1);
            });

            it('should withdraw funds to the target', async () => {
                const prevBalance = await getBalance({ address: token.address }, target);

                const res = await testVault.withdrawFunds(token.address, target.address, amount);
                await expect(res)
                    .to.emit(testVault, 'FundsWithdrawn')
                    .withArgs(token.address, deployer.address, target.address, amount);

                expect(await getBalance({ address: token.address }, target)).to.equal(prevBalance.add(amount));
            });

            it('should revert when withdrawing tokens to an invalid address', async () => {
                await expect(testVault.withdrawFunds(token.address, ZERO_ADDRESS, amount)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            it('should allow withdrawing 0 tokens', async () => {
                const prevVaultBalance = await getBalance(token, testVault.address);

                const res = await testVault.withdrawFunds(token.address, target.address, 0);
                await expect(res).not.to.emit(testVault, 'FundsWithdrawn');

                expect(await getBalance(token, testVault.address)).to.equal(prevVaultBalance);
            });

            it('should revert when trying to withdraw more tokens than the vault holds', async () => {
                await expect(
                    testVault.withdrawFunds(
                        token.address,
                        target.address,
                        (await getBalance({ address: token.address }, testVault.address)).add(1)
                    )
                ).to.be.revertedWith(tokenData.errors().exceedsBalance);
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.pause();
                });

                it('should revert', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.revertedWith(
                        'Pausable: paused'
                    );
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => testWithdraw(new TokenData(symbol)));
        }
    });

    describe('burning funds', async () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();

            await testVault.setAuthorizedWithdrawal(true);
            await testVault.setPayable(true);
        });

        const testBurn = (tokenData: TokenData) => {
            let token: TokenWithAddress;
            let reserveToken: TestERC20Burnable;

            const amount = 1_000_000;

            beforeEach(async () => {
                switch (tokenData.symbol()) {
                    case TokenSymbol.BNT:
                        token = networkToken;
                        break;

                    case TokenSymbol.vBNT:
                        token = govToken;
                        break;

                    default:
                        token = await createBurnableToken(tokenData, amount);
                        break;
                }

                if (!tokenData.isNativeToken()) {
                    reserveToken = await Contracts.TestERC20Burnable.attach(token.address);
                }

                await transfer(deployer, token, testVault.address, amount);
            });

            it('should allow burning 0 tokens', async () => {
                const prevVaultBalance = await getBalance(token, testVault.address);

                const res = await testVault.burn(token.address, 0);
                await expect(res).not.to.emit(testVault, 'FundsBurned');

                expect(await getBalance(token, testVault.address)).to.equal(prevVaultBalance);
            });

            if (tokenData.isNativeToken()) {
                it('should revert when attempting to burn ETH', async () => {
                    await expect(testVault.burn(token.address, amount)).to.revertedWith('InvalidToken');
                });
            } else {
                it('should burn funds', async () => {
                    const prevBalance = await getBalance(token, testVault.address);
                    const prevTotalSupply = await reserveToken.totalSupply();

                    const res = await testVault.burn(token.address, amount);
                    await expect(res)
                        .to.emit(testVault, 'FundsBurned')
                        .withArgs(token.address, deployer.address, amount);

                    expect(await getBalance(token, testVault.address)).to.equal(prevBalance.sub(amount));
                    expect(await reserveToken.totalSupply()).to.equal(prevTotalSupply.sub(amount));
                });

                it('should revert when trying to burn more tokens than the vault holds', async () => {
                    await expect(testVault.burn(token.address, amount + 1)).to.be.revertedWith(
                        tokenData.errors().burnExceedsBalance
                    );
                });
            }

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.pause();
                });

                it('should revert', async () => {
                    await expect(testVault.burn(token.address, amount)).to.revertedWith('Pausable: paused');
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.vBNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => testBurn(new TokenData(symbol)));
        }
    });

    describe('authorized/unauthorized', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();

            await testVault.setPayable(true);
        });

        const testAuthentication = (tokenData: TokenData) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            beforeEach(async () => {
                token = tokenData.isNetworkToken() ? networkToken : await createToken(tokenData);
                await transfer(deployer, token, testVault.address, amount);
            });

            context('when authorized', () => {
                beforeEach(async () => {
                    await testVault.setAuthorizedWithdrawal(true);
                });

                it('should allow to withdraw', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.not.reverted;
                });
            });

            context('when unauthorized', () => {
                it('should revert', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.be.revertedWith(
                        'AccessDenied'
                    );
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                return testAuthentication(new TokenData(symbol));
            });
        }
    });

    describe('pausing/unpausing', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                await testVault.connect(sender).pause();

                expect(await testVault.isPaused()).to.be.true;
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.connect(deployer).grantRole(Roles.Upgradeable.ROLE_ADMIN, admin.address);
                    await testVault.connect(admin).pause();

                    expect(await testVault.isPaused()).to.be.true;
                });

                it('should unpause the contract', async () => {
                    await testVault.connect(sender).unpause();

                    expect(await testVault.isPaused()).to.be.false;
                });
            });
        };

        const testPauseRestricted = () => {
            it('should revert when a non-admin is attempting to pause', async () => {
                await expect(testVault.connect(sender).pause()).to.be.revertedWith('AccessDenied');
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.connect(deployer).grantRole(Roles.Upgradeable.ROLE_ADMIN, admin.address);
                    await testVault.connect(admin).pause();

                    expect(await testVault.isPaused()).to.be.true;
                });

                it('should revert when a non-admin is attempting unpause', async () => {
                    await expect(testVault.connect(sender).unpause()).to.be.revertedWith('AccessDenied');
                });
            });
        };

        context('admin', () => {
            beforeEach(async () => {
                await testVault.connect(deployer).grantRole(Roles.Upgradeable.ROLE_ADMIN, sender.address);
            });

            testPause();
        });

        context('regular account', () => {
            testPauseRestricted();
        });
    });
});
