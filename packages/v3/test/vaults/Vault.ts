import Contracts from '../../components/Contracts';
import { IERC20, TestVault } from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { ETH, TKN, BNT, ZERO_ADDRESS, NATIVE_TOKEN_ADDRESS } from '../helpers/Constants';
import { createProxy, createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import {
    transfer,
    getBalance,
    createTokenBySymbol,
    errorMessageTokenExceedsBalance,
    TokenWithAddress
} from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;

describe('TestVault', () => {
    let deployer: SignerWithAddress;
    let sender: SignerWithAddress;
    let target: SignerWithAddress;
    let admin: SignerWithAddress;

    shouldHaveGap('TestVault', '_authorizeWithdrawal');

    before(async () => {
        [deployer, sender, target, admin] = await ethers.getSigners();
    });

    describe('construction', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createProxy(Contracts.TestVault);
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(testVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            expect(await testVault.version()).to.equal(1);
            expect(await testVault.isPayable()).to.be.false;
            await expectRole(testVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
        });
    });

    describe('depositing ETH ', () => {
        let testVault: TestVault;
        const amount = 1_000_000;

        beforeEach(async () => {
            testVault = await createProxy(Contracts.TestVault);
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
        let networkToken: IERC20;

        beforeEach(async () => {
            ({ networkToken } = await createSystem());

            testVault = await createProxy(Contracts.TestVault);

            await testVault.setAuthorizedWithdrawal(true);
            await testVault.setPayable(true);
        });

        const testWithdraw = (symbol: string) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            beforeEach(async () => {
                token = symbol === BNT ? networkToken : await createTokenBySymbol(symbol);

                await transfer(deployer, token, testVault.address, amount);
            });

            it('should withdraw funds to the target', async () => {
                await transfer(deployer, { address: token.address }, testVault.address, amount);

                const currentBalance = await getBalance({ address: token.address }, target);

                const res = await testVault.withdrawFunds(token.address, target.address, amount);
                await expect(res)
                    .to.emit(testVault, 'FundsWithdrawn')
                    .withArgs(token.address, deployer.address, target.address, amount);

                expect(await getBalance({ address: token.address }, target)).to.equal(currentBalance.add(amount));
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
                ).to.be.revertedWith(errorMessageTokenExceedsBalance(symbol));
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

            context('when not paused', () => {
                it('should not revert', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.not.reverted;
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => testWithdraw(symbol));
        }
    });

    describe('burning funds', async () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createProxy(Contracts.TestVault);

            await testVault.setAuthorizedWithdrawal(true);
            await testVault.setPayable(true);
        });

        const testBurn = (symbol: string) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            beforeEach(async () => {
                token = await createTokenBySymbol(symbol, true);

                await transfer(deployer, token, testVault.address, amount);
            });

            it('should burn funds', async () => {
                await transfer(deployer, { address: token.address }, testVault.address, amount);

                const currentBalance = await getBalance({ address: token.address }, ZERO_ADDRESS);

                const res = await testVault.burn(token.address, amount);
                await expect(res).to.emit(testVault, 'FundsBurned').withArgs(token.address, deployer.address, amount);

                expect(await getBalance({ address: token.address }, ZERO_ADDRESS)).to.equal(
                    symbol === TKN ? currentBalance : currentBalance.add(amount)
                );
            });

            it('should allow burning 0 tokens', async () => {
                const prevVaultBalance = await getBalance(token, testVault.address);

                const res = await testVault.burn(token.address, 0);
                await expect(res).not.to.emit(testVault, 'FundsBurned');

                expect(await getBalance(token, testVault.address)).to.equal(prevVaultBalance);
            });

            it('should revert when trying to withdraw more tokens than the vault holds', async () => {
                await expect(
                    testVault.withdrawFunds(
                        token.address,
                        target.address,
                        (await getBalance({ address: token.address }, testVault.address)).add(1)
                    )
                ).to.be.revertedWith(errorMessageTokenExceedsBalance(symbol));
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

            context('when not paused', () => {
                it('should not revert', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.not.reverted;
                });
            });
        };

        for (const symbol of [ETH, TKN]) {
            context(symbol, () => testBurn(symbol));
        }
    });

    describe('authorized/unauthorized', () => {
        let testVault: TestVault;
        let networkToken: IERC20;

        beforeEach(async () => {
            ({ networkToken } = await createSystem());

            testVault = await createProxy(Contracts.TestVault);

            await testVault.setPayable(true);
        });

        const testAuthentication = (symbol: string) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            beforeEach(async () => {
                token = symbol === BNT ? networkToken : await createTokenBySymbol(symbol);
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

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                return testAuthentication(symbol);
            });
        }
    });

    describe('pausing/unpausing', () => {
        let testVault: TestVault;

        beforeEach(async () => {
            testVault = await createProxy(Contracts.TestVault);
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                await testVault.connect(sender).pause();

                expect(await testVault.isPaused()).to.be.true;
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await testVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, admin.address);
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
                    await testVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, admin.address);
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
                await testVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, sender.address);
            });

            testPause();
        });

        context('regular account', () => {
            testPauseRestricted();
        });
    });
});
