import Contracts, { IERC20, TestERC20Burnable, TestVault } from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createBurnableToken, createProxy, createSystem, createToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { getBalance, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Vault', () => {
    let deployer: SignerWithAddress;
    let sender: SignerWithAddress;
    let target: SignerWithAddress;
    let admin: SignerWithAddress;

    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let bnt: IERC20;
    let vbnt: IERC20;

    const createTestVault = async () =>
        createProxy(Contracts.TestVault, {
            ctorArgs: [bntGovernance.address, vbntGovernance.address]
        });

    shouldHaveGap('TestVault', '_isAuthorizedWithdrawal');

    before(async () => {
        [deployer, sender, target, admin] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ bnt, vbnt, bntGovernance, vbntGovernance } = await createSystem());
    });

    describe('construction', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(Contracts.TestVault.deploy(ZERO_ADDRESS, vbntGovernance.address)).to.be.revertedWithError(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to create with an invalid vBNT governance contract', async () => {
            await expect(Contracts.TestVault.deploy(bntGovernance.address, ZERO_ADDRESS)).to.be.revertedWithError(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(testVault.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await testVault.version()).to.equal(1);
            expect(await testVault.isPayable()).to.be.false;

            await expectRoles(testVault, Roles.Vault);

            await expectRole(testVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer.address]);
        });
    });

    describe('depositing the native token ', () => {
        let testVault: TestVault;

        const amount = 1_000_000;

        beforeEach(async () => {
            testVault = await createTestVault();
        });

        context('payable', () => {
            beforeEach(async () => {
                await testVault.setPayable(true);
            });

            it('should be able to receive the native token', async () => {
                const balance = await getBalance({ address: NATIVE_TOKEN_ADDRESS }, testVault.address);

                await deployer.sendTransaction({ value: amount, to: testVault.address });

                expect(await getBalance({ address: NATIVE_TOKEN_ADDRESS }, testVault.address)).to.equal(
                    balance.add(amount)
                );
            });
        });

        context('non-payable', () => {
            it('should revert when sending the native token', async () => {
                await expect(
                    deployer.sendTransaction({ value: amount, to: testVault.address })
                ).to.be.revertedWithError('NotPayable');
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
                token = tokenData.isBNT() ? bnt : await createToken(tokenData);

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
                await expect(testVault.withdrawFunds(token.address, ZERO_ADDRESS, amount)).to.be.revertedWithError(
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
                ).to.be.revertedWithError(tokenData.errors().exceedsBalance);
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.pause();
                });

                it('should revert', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.revertedWithError(
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
                        token = bnt;
                        break;

                    case TokenSymbol.vBNT:
                        token = vbnt;
                        break;

                    default:
                        token = await createBurnableToken(tokenData, amount);
                        break;
                }

                if (!tokenData.isNative()) {
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

            if (tokenData.isNative()) {
                it('should revert when attempting to burn the native token', async () => {
                    await expect(testVault.burn(token.address, amount)).to.revertedWithError('InvalidToken');
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
                    await expect(testVault.burn(token.address, amount + 1)).to.be.revertedWithError(
                        tokenData.errors().burnExceedsBalance
                    );
                });
            }

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.pause();
                });

                it('should revert', async () => {
                    await expect(testVault.burn(token.address, amount)).to.revertedWithError('Pausable: paused');
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
                token = tokenData.isBNT() ? bnt : await createToken(tokenData);
                await transfer(deployer, token, testVault.address, amount);
            });

            context('when authorized', () => {
                beforeEach(async () => {
                    await testVault.setAuthorizedWithdrawal(true);
                });

                it('should allow to withdraw', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).not.to.be.reverted;
                });
            });

            context('when unauthorized', () => {
                it('should revert', async () => {
                    await expect(
                        testVault.withdrawFunds(token.address, target.address, amount)
                    ).to.be.revertedWithError('AccessDenied');
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testAuthentication(new TokenData(symbol));
            });
        }
    });

    describe('pausing/unpausing', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createTestVault();

            await testVault.connect(deployer).grantRole(Roles.Upgradeable.ROLE_ADMIN, admin.address);
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                const res = await testVault.connect(sender).pause();

                await expect(res).to.emit(testVault, 'Paused').withArgs(sender.address);

                expect(await testVault.isPaused()).to.be.true;
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.connect(admin).pause();
                });

                it('should unpause the contract', async () => {
                    const res = await testVault.connect(sender).unpause();

                    await expect(res).to.emit(testVault, 'Unpaused').withArgs(sender.address);
                });
            });
        };

        const testPauseRestricted = () => {
            it('should revert when a non-admin is attempting to pause', async () => {
                await expect(testVault.connect(sender).pause()).to.be.revertedWithError('AccessDenied');
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.connect(admin).pause();
                });

                it('should revert when a non-admin is attempting unpause', async () => {
                    await expect(testVault.connect(sender).unpause()).to.be.revertedWithError('AccessDenied');
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
