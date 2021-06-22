import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { BancorVault, TestStandardToken } from 'typechain';

import { NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS, roles } from 'test/helpers/Constants';
import { TokenWithAddress, getBalance, transfer } from 'test/helpers/Utils';

const {
    BancorVault: { ROLE_ADMIN, ROLE_ASSET_MANAGER, ROLE_NETWORK_TOKEN_MANAGER }
} = roles;

let vault: BancorVault;
let networkToken: TestStandardToken;
let reserveToken: TestStandardToken;

let accounts: SignerWithAddress[];
let deployer: SignerWithAddress;
let sender: SignerWithAddress;
let target: SignerWithAddress;
let admin: SignerWithAddress;
let proxyAdmin: SignerWithAddress;

describe('BancorVault', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        [deployer, sender, target, admin, proxyAdmin] = accounts;
    });

    beforeEach(async () => {
        networkToken = await Contracts.TestStandardToken.deploy('BNT', 'BNT', BigNumber.from(1_000_000_000));
        reserveToken = await Contracts.TestStandardToken.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
    });

    const testVault = (createVault: (networkTokenAddress: string) => Promise<BancorVault>) => {
        describe('construction', async () => {
            it('should be properly initialized', async () => {
                vault = await createVault(networkToken.address);

                expect(await vault.getRoleMemberCount(ROLE_ADMIN)).to.equal(BigNumber.from(1));
                expect(await vault.getRoleMemberCount(ROLE_ASSET_MANAGER)).to.equal(BigNumber.from(1));
                expect(await vault.getRoleMemberCount(ROLE_NETWORK_TOKEN_MANAGER)).to.equal(BigNumber.from(0));

                expect(await vault.getRoleAdmin(ROLE_ADMIN)).to.equal(ROLE_ADMIN);
                expect(await vault.getRoleAdmin(ROLE_ASSET_MANAGER)).to.equal(ROLE_ASSET_MANAGER);
                expect(await vault.getRoleAdmin(ROLE_NETWORK_TOKEN_MANAGER)).to.equal(ROLE_ASSET_MANAGER);

                expect(await vault.hasRole(ROLE_ADMIN, deployer.address)).to.be.true;
                expect(await vault.hasRole(ROLE_ASSET_MANAGER, deployer.address)).to.be.true;
                expect(await vault.hasRole(ROLE_NETWORK_TOKEN_MANAGER, deployer.address)).to.be.false;
            });

            it('should revert when initialized with an invalid reserve token', async () => {
                await expect(createVault(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });
        });

        describe('asset management', () => {
            beforeEach(async () => {
                vault = await createVault(networkToken.address);
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

                            if (symbol !== 'ETH') {
                                await expect(
                                    vault
                                        .connect(sender)
                                        .withdrawTokens(token.address, target.address, amountToWithdraw)
                                ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                            } else {
                                await expect(
                                    vault
                                        .connect(sender)
                                        .withdrawTokens(token.address, target.address, amountToWithdraw)
                                ).to.be.reverted;
                            }
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
                                await vault.connect(deployer).grantRole(ROLE_ADMIN, admin.address);

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
                        vault = await createVault(networkToken.address);

                        token = getToken();
                        await transfer(deployer, token, vault.address, amount);
                    });

                    it('should revert when withdrawing tokens to an invalid address', async () => {
                        await expect(vault.withdrawTokens(token.address, ZERO_ADDRESS, amount)).to.be.revertedWith(
                            'ERR_INVALID_ADDRESS'
                        );
                    });

                    it('should not revert when withdrawing 0 tokens', async () => {
                        const prevVaultBalance = await getBalance(token, vault.address);

                        await vault.withdrawTokens(token.address, target.address, BigNumber.from(0));

                        expect(await getBalance(token, vault.address)).to.equal(prevVaultBalance);
                    });

                    context('regular account', () => {
                        testWithdrawRestricted();
                    });

                    context('admin', () => {
                        beforeEach(async () => {
                            await vault.connect(deployer).grantRole(ROLE_ADMIN, sender.address);
                        });

                        testWithdrawRestricted();
                    });

                    context('asset manager', () => {
                        beforeEach(async () => {
                            await vault.connect(deployer).grantRole(ROLE_ASSET_MANAGER, sender.address);
                        });

                        testWithdraw();
                    });

                    context('network token manager', () => {
                        beforeEach(async () => {
                            await vault.connect(deployer).grantRole(ROLE_NETWORK_TOKEN_MANAGER, sender.address);
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
    };

    context('as a proxy', () => {
        testVault(async (networkTokenAddress) => {
            vault = await Contracts.BancorVault.deploy(networkTokenAddress);
            await vault.initialize();

            return vault;
        });
    });

    context('as a regular contract', () => {
        testVault(async (networkTokenAddress) => {
            const logic = await Contracts.BancorVault.deploy(networkTokenAddress);

            const proxy = await Contracts.TransparentUpgradeableProxy.deploy(
                logic.address,
                proxyAdmin.address,
                logic.interface.encodeFunctionData('initialize')
            );

            return Contracts.BancorVault.attach(proxy.address);
        });
    });
});
