import Contracts from '../../components/Contracts';
import { BancorVault, TestERC20Token } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { TokenWithAddress, getBalance, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { BancorVault: BancorVaultRoles } = roles;

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

    beforeEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { vault } = await createSystem();

            await expect(vault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.BancorVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be properly initialized', async () => {
            const { vault } = await createSystem();

            expect(await vault.version()).to.equal(1);

            await expectRole(vault, BancorVaultRoles.ROLE_ADMIN, BancorVaultRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(vault, BancorVaultRoles.ROLE_ASSET_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER, [
                deployer.address
            ]);
            await expectRole(vault, BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, BancorVaultRoles.ROLE_ASSET_MANAGER);
        });
    });

    describe('asset management', () => {
        let networkToken: TestERC20Token;
        let vault: BancorVault;

        beforeEach(async () => {
            ({ vault, networkToken } = await createSystem());
        });

        it('should be able to receive ETH', async () => {
            const prevBalance = await getBalance({ address: NATIVE_TOKEN_ADDRESS }, vault.address);

            const amount = BigNumber.from(1000);
            await deployer.sendTransaction({ value: amount, to: vault.address });

            expect(await getBalance({ address: NATIVE_TOKEN_ADDRESS }, vault.address)).to.equal(
                prevBalance.add(amount)
            );
        });

        for (const symbol of ['BNT', 'ETH', 'TKN']) {
            context(symbol, () => {
                const getToken = (): TokenWithAddress => {
                    switch (symbol) {
                        case 'BNT':
                            return networkToken;

                        case 'ETH':
                            return { address: NATIVE_TOKEN_ADDRESS };

                        case 'TKN':
                            return reserveToken;

                        default:
                            throw new Error(`Unsupported type ${symbol}`);
                    }
                };

                const testWithdraw = () => {
                    it('should revert when trying to withdraw more tokens than the vault holds', async () => {
                        const amountToWithdraw = amount.add(BigNumber.from(100));

                        await expect(
                            vault.connect(sender).withdrawTokens(token.address, target.address, amountToWithdraw)
                        ).to.be.revertedWith(symbol !== 'ETH' ? 'ERC20: transfer amount exceeds balance' : '');
                    });

                    it('should be able to withdraw any tokens', async () => {
                        const prevTargetBalance = await getBalance(token, target.address);
                        const prevVaultBalance = await getBalance(token, vault.address);

                        const remainder = BigNumber.from(1);
                        const partialAmount = amount.sub(remainder);
                        let res = await vault
                            .connect(sender)
                            .withdrawTokens(token.address, target.address, partialAmount);
                        await expect(res)
                            .to.emit(vault, 'TokensWithdrawn')
                            .withArgs(token.address, sender.address, target.address, partialAmount);

                        let targetBalance = await getBalance(token, target.address);
                        let vaultBalance = await getBalance(token, vault.address);

                        expect(targetBalance).to.equal(prevTargetBalance.add(partialAmount));
                        expect(vaultBalance).to.equal(prevVaultBalance.sub(partialAmount));

                        res = await vault.connect(sender).withdrawTokens(token.address, target.address, remainder);
                        await expect(res)
                            .to.emit(vault, 'TokensWithdrawn')
                            .withArgs(token.address, sender.address, target.address, remainder);

                        expect(await getBalance(token, target.address)).to.equal(targetBalance.add(remainder));
                        expect(await getBalance(token, vault.address)).to.equal(vaultBalance.sub(remainder));
                    });

                    context('when paused', () => {
                        beforeEach(async () => {
                            await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ADMIN, admin.address);

                            expect(await vault.isPaused()).to.be.false;

                            await vault.connect(admin).pause();

                            expect(await vault.isPaused()).to.be.true;
                        });

                        testWithdrawRestricted('Pausable: paused');
                    });
                };

                const testWithdrawRestricted = (reason: string = 'ERR_ACCESS_DENIED') => {
                    it('should not be able to withdraw any tokens', async () => {
                        await expect(
                            vault.connect(sender).withdrawTokens(token.address, target.address, amount)
                        ).to.be.revertedWith(reason);
                    });
                };

                const amount = BigNumber.from(10000);
                let token: TokenWithAddress;

                beforeEach(async () => {
                    token = getToken();

                    await transfer(deployer, token, vault.address, amount);
                });

                it('should revert when withdrawing tokens to an invalid address', async () => {
                    await expect(vault.withdrawTokens(token.address, ZERO_ADDRESS, amount)).to.be.revertedWith(
                        'ERR_INVALID_ADDRESS'
                    );
                });

                it('should allow withdrawing 0 tokens', async () => {
                    const prevVaultBalance = await getBalance(token, vault.address);

                    await vault.withdrawTokens(token.address, target.address, BigNumber.from(0));

                    expect(await getBalance(token, vault.address)).to.equal(prevVaultBalance);
                });

                context('regular account', () => {
                    testWithdrawRestricted();
                });

                context('admin', () => {
                    beforeEach(async () => {
                        await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ADMIN, sender.address);
                    });

                    testWithdrawRestricted();
                });

                context('asset manager', () => {
                    beforeEach(async () => {
                        await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, sender.address);
                    });

                    testWithdraw();
                });

                context('network token manager', () => {
                    beforeEach(async () => {
                        await vault
                            .connect(deployer)
                            .grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, sender.address);
                    });

                    if (symbol !== 'BNT') {
                        testWithdrawRestricted();
                    } else {
                        testWithdraw();
                    }
                });
            });
        }
    });

    describe('pausing/unpausing', () => {
        let vault: BancorVault;

        beforeEach(async () => {
            ({ vault } = await createSystem());
        });

        const testPause = () => {
            it('should pause the contract', async () => {
                await vault.connect(sender).pause();

                expect(await vault.isPaused()).to.be.true;
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ADMIN, admin.address);
                    await vault.connect(admin).pause();

                    expect(await vault.isPaused()).to.be.true;
                });

                it('should unpause the contract', async () => {
                    await vault.connect(sender).unpause();

                    expect(await vault.isPaused()).to.be.false;
                });
            });
        };

        const testPauseRestricted = () => {
            it('should revert when a non-admin is attempting to pause', async () => {
                await expect(vault.connect(sender).pause()).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            context('when paused', () => {
                beforeEach(async () => {
                    await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ADMIN, admin.address);
                    await vault.connect(admin).pause();

                    expect(await vault.isPaused()).to.be.true;
                });

                it('should revert when a non-admin is attempting unpause', async () => {
                    await expect(vault.connect(sender).unpause()).to.be.revertedWith('ERR_ACCESS_DENIED');
                });
            });
        };

        context('admin', () => {
            beforeEach(async () => {
                await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ADMIN, sender.address);
            });

            testPause();
        });

        context('regular account', () => {
            testPauseRestricted();
        });

        context('asset manager', () => {
            beforeEach(async () => {
                await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, sender.address);
            });

            testPauseRestricted();
        });

        context('network token manager', () => {
            beforeEach(async () => {
                await vault.connect(deployer).grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, sender.address);
            });

            testPauseRestricted();
        });
    });
});
