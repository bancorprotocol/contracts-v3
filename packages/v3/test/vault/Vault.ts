import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { TestVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { ETH, TKN, BNT, ZERO_ADDRESS } from '../helpers/Constants';
import { createProxy, createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
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
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;

let deployer: SignerWithAddress;
let sender: SignerWithAddress;
let target: SignerWithAddress;
let admin: SignerWithAddress;

describe('TestVault', () => {
    shouldHaveGap('TestVault', '_authenticateWithdrawal');

    before(async () => {
        [deployer, sender, target, admin] = await ethers.getSigners();
    });

    describe('construction', () => {
        let testVault: TestVault;

        prepareEach(async () => {
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

        context('receiving ETH', () => {
            it('should allow when payable', async () => {
                await testVault.setPayable(true);

                await deployer.sendTransaction({ value: 0, to: testVault.address });
            });
            it('should revert when not payable', async () => {
                await expect(deployer.sendTransaction({ value: 0, to: testVault.address })).to.be.revertedWith(
                    'NotPayable'
                );
            });
        });
    });

    describe('withdrawing funds', async () => {
        let testVault: TestVault;
        let networkToken: NetworkToken;

        prepareEach(async () => {
            ({ networkToken } = await createSystem());

            testVault = await createProxy(Contracts.TestVault);

            await testVault.setAuthenticateWithdrawal(true);
            await testVault.setPayable(true);
        });

        const testWithdraw = (symbol: string) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            prepareEach(async () => {
                token = symbol === BNT ? networkToken : await createTokenBySymbol(symbol);
                await transfer(deployer, token, testVault.address, amount);
            });

            it('withdrawing fund should emit event', async () => {
                await expect(testVault.withdrawFunds(token.address, target.address, 0))
                    .to.emit(testVault, 'FundsWithdrawn')
                    .withArgs(token.address, deployer.address, target.address, 0);
            });

            it("withdrawing fund should change the target's balance", async () => {
                await transfer(deployer, { address: token.address }, testVault.address, amount);

                const currentBalance = await getBalance({ address: token.address }, target);

                await testVault.withdrawFunds(token.address, target.address, amount);

                expect(await getBalance({ address: token.address }, target)).to.equal(currentBalance.add(amount));
            });

            it('should revert when withdrawing tokens to an invalid address', async () => {
                await expect(testVault.withdrawFunds(token.address, ZERO_ADDRESS, amount)).to.be.revertedWith(
                    'InvalidAddress'
                );
            });

            it('should allow withdrawing 0 tokens', async () => {
                const prevVaultBalance = await getBalance(token, testVault.address);

                await testVault.withdrawFunds(token.address, target.address, BigNumber.from(0));

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
                it('should succeed when contract is not paused', async () => {
                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.not.reverted;
                });

                it('should fail when contract is paused', async () => {
                    await testVault.pause();

                    await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.revertedWith(
                        'Pausable: paused'
                    );
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => testWithdraw(symbol));
        }
    });

    describe('authenticated/unauthenticated', () => {
        let testVault: TestVault;
        let networkToken: NetworkToken;

        prepareEach(async () => {
            ({ networkToken } = await createSystem());

            testVault = await createProxy(Contracts.TestVault);

            await testVault.setPayable(true);
        });

        const testAuthentication = (symbol: string) => {
            let token: TokenWithAddress;
            const amount = 1_000_000;

            prepareEach(async () => {
                token = symbol === BNT ? networkToken : await createTokenBySymbol(symbol);
                await transfer(deployer, token, testVault.address, amount);
            });

            it('should allow when authenticated', async () => {
                await testVault.setAuthenticateWithdrawal(true);

                await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.not.reverted;
            });

            it('should revert when unauthenticated', async () => {
                await testVault.setAuthenticateWithdrawal(false);

                await expect(testVault.withdrawFunds(token.address, target.address, amount)).to.be.revertedWith(
                    'AccessDenied'
                );
            });
        };

        context('when authenticated', () => {
            for (const symbol of [BNT, ETH, TKN]) {
                context(symbol, () => {
                    return testAuthentication(symbol);
                });
            }
        });
    });

    describe('pausing/unpausing', () => {
        let testVault: TestVault;

        prepareEach(async () => {
            testVault = await createProxy(Contracts.TestVault);
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                await testVault.connect(sender).pause();

                expect(await testVault.isPaused()).to.be.true;
            });

            context('when paused', () => {
                prepareEach(async () => {
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
                prepareEach(async () => {
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
            prepareEach(async () => {
                await testVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, sender.address);
            });

            testPause();
        });

        context('regular account', () => {
            testPauseRestricted();
        });
    });
});
