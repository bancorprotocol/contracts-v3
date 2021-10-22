import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { BancorVault, TestERC20Token } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { prepareEach } from '../helpers/Fixture';
import { shouldHaveGap } from '../helpers/Proxy';
import {
    TokenWithAddress,
    getBalance,
    transfer,
    errorMessageTokenExceedsBalance,
    createTokenBySymbol
} from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, BancorVault: BancorVaultRoles } = roles;

let deployer: SignerWithAddress;
let sender: SignerWithAddress;
let target: SignerWithAddress;
let admin: SignerWithAddress;

let reserveToken: TestERC20Token;

describe('BancorVault', () => {
    shouldHaveGap('BancorVault');

    before(async () => {
        [deployer, sender, target, admin] = await ethers.getSigners();
    });

    prepareEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { bancorVault } = await createSystem();

            await expect(bancorVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.BancorVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const vault = await Contracts.BancorVault.deploy(reserveToken.address);
            await vault.initialize();

            expect(await vault.version()).to.equal(1);

            await expectRole(vault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(vault, BancorVaultRoles.ROLE_ASSET_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER, [
                deployer.address
            ]);
            await expectRole(vault, BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER);
        });
    });

    describe('asset management', () => {
        let networkToken: NetworkToken;
        let bancorVault: BancorVault;

        prepareEach(async () => {
            ({ bancorVault, networkToken } = await createSystem());
        });

        it('should be able to receive ETH', async () => {
            const prevBalance = await getBalance({ address: NATIVE_TOKEN_ADDRESS }, bancorVault.address);

            const amount = BigNumber.from(1000);
            await deployer.sendTransaction({ value: amount, to: bancorVault.address });

            expect(await getBalance({ address: NATIVE_TOKEN_ADDRESS }, bancorVault.address)).to.equal(
                prevBalance.add(amount)
            );
        });

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                const testWithdraw = () => {
                    it('should revert when trying to withdraw more tokens than the vault holds', async () => {
                        const amountToWithdraw = amount.add(BigNumber.from(100));

                        await expect(
                            bancorVault.connect(sender).withdrawTokens(token.address, target.address, amountToWithdraw)
                        ).to.be.revertedWith(errorMessageTokenExceedsBalance(symbol));
                    });

                    it('should be able to withdraw any tokens', async () => {
                        const prevTargetBalance = await getBalance(token, target.address);
                        const prevVaultBalance = await getBalance(token, bancorVault.address);

                        const remainder = BigNumber.from(1);
                        const partialAmount = amount.sub(remainder);
                        let res = await bancorVault
                            .connect(sender)
                            .withdrawTokens(token.address, target.address, partialAmount);
                        await expect(res)
                            .to.emit(bancorVault, 'TokensWithdrawn')
                            .withArgs(token.address, sender.address, target.address, partialAmount);

                        const targetBalance = await getBalance(token, target.address);
                        const vaultBalance = await getBalance(token, bancorVault.address);

                        expect(targetBalance).to.equal(prevTargetBalance.add(partialAmount));
                        expect(vaultBalance).to.equal(prevVaultBalance.sub(partialAmount));

                        res = await bancorVault
                            .connect(sender)
                            .withdrawTokens(token.address, target.address, remainder);
                        await expect(res)
                            .to.emit(bancorVault, 'TokensWithdrawn')
                            .withArgs(token.address, sender.address, target.address, remainder);

                        expect(await getBalance(token, target.address)).to.equal(targetBalance.add(remainder));
                        expect(await getBalance(token, bancorVault.address)).to.equal(vaultBalance.sub(remainder));
                    });

                    context('when paused', () => {
                        prepareEach(async () => {
                            await bancorVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, admin.address);

                            expect(await bancorVault.isPaused()).to.be.false;

                            await bancorVault.connect(admin).pause();

                            expect(await bancorVault.isPaused()).to.be.true;
                        });

                        testWithdrawRestricted('Pausable: paused');
                    });
                };

                const testWithdrawRestricted = (reason = 'AccessDenied') => {
                    it('should not be able to withdraw any tokens', async () => {
                        await expect(
                            bancorVault.connect(sender).withdrawTokens(token.address, target.address, amount)
                        ).to.be.revertedWith(reason);
                    });
                };

                const amount = BigNumber.from(10000);
                let token: TokenWithAddress;

                prepareEach(async () => {
                    if (symbol === BNT) {
                        token = networkToken;
                    } else {
                        token = await createTokenBySymbol(symbol);
                    }

                    await transfer(deployer, token, bancorVault.address, amount);
                });

                it('should revert when withdrawing tokens to an invalid address', async () => {
                    await expect(bancorVault.withdrawTokens(token.address, ZERO_ADDRESS, amount)).to.be.revertedWith(
                        'InvalidAddress'
                    );
                });

                it('should allow withdrawing 0 tokens', async () => {
                    const prevVaultBalance = await getBalance(token, bancorVault.address);

                    await bancorVault.withdrawTokens(token.address, target.address, BigNumber.from(0));

                    expect(await getBalance(token, bancorVault.address)).to.equal(prevVaultBalance);
                });

                context('regular account', () => {
                    testWithdrawRestricted();
                });

                context('admin', () => {
                    prepareEach(async () => {
                        await bancorVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, sender.address);
                    });

                    testWithdrawRestricted();
                });

                context('asset manager', () => {
                    prepareEach(async () => {
                        await bancorVault
                            .connect(deployer)
                            .grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, sender.address);
                    });

                    testWithdraw();
                });

                context('network token manager', () => {
                    prepareEach(async () => {
                        await bancorVault
                            .connect(deployer)
                            .grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, sender.address);
                    });

                    if (symbol !== BNT) {
                        testWithdrawRestricted();
                    } else {
                        testWithdraw();
                    }
                });
            });
        }
    });

    describe('pausing/unpausing', () => {
        let bancorVault: BancorVault;

        prepareEach(async () => {
            ({ bancorVault } = await createSystem());
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                await bancorVault.connect(sender).pause();

                expect(await bancorVault.isPaused()).to.be.true;
            });

            context('when paused', () => {
                prepareEach(async () => {
                    await bancorVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, admin.address);
                    await bancorVault.connect(admin).pause();

                    expect(await bancorVault.isPaused()).to.be.true;
                });

                it('should unpause the contract', async () => {
                    await bancorVault.connect(sender).unpause();

                    expect(await bancorVault.isPaused()).to.be.false;
                });
            });
        };

        const testPauseRestricted = () => {
            it('should revert when a non-admin is attempting to pause', async () => {
                await expect(bancorVault.connect(sender).pause()).to.be.revertedWith('AccessDenied');
            });

            context('when paused', () => {
                prepareEach(async () => {
                    await bancorVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, admin.address);
                    await bancorVault.connect(admin).pause();

                    expect(await bancorVault.isPaused()).to.be.true;
                });

                it('should revert when a non-admin is attempting unpause', async () => {
                    await expect(bancorVault.connect(sender).unpause()).to.be.revertedWith('AccessDenied');
                });
            });
        };

        context('admin', () => {
            prepareEach(async () => {
                await bancorVault.connect(deployer).grantRole(UpgradeableRoles.ROLE_ADMIN, sender.address);
            });

            testPause();
        });

        context('regular account', () => {
            testPauseRestricted();
        });

        context('asset manager', () => {
            prepareEach(async () => {
                await bancorVault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, sender.address);
            });

            testPauseRestricted();
        });

        context('network token manager', () => {
            prepareEach(async () => {
                await bancorVault
                    .connect(deployer)
                    .grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, sender.address);
            });

            testPauseRestricted();
        });
    });
});
