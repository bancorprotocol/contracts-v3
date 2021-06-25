import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { BancorVault, TestERC20Token } from 'typechain';

import { NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS } from 'test/helpers/Constants';
import Errors from 'test/helpers/Errors';
import { TokenWithAddress, getBalance, transfer } from 'test/helpers/Utils';
import { expectAccessList, roles } from 'test/helpers/AccessControl';

const {
    BancorVault: { ROLE_ADMIN, ROLE_ASSET_MANAGER, ROLE_NETWORK_TOKEN_MANAGER }
} = roles;

let vault: BancorVault;
let networkToken: TestERC20Token;
let reserveToken: TestERC20Token;

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
        networkToken = await Contracts.TestERC20Token.deploy('BNT', 'BNT', BigNumber.from(1_000_000_000));
        reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
    });

    const testVault = (createVault: (networkTokenAddress: string) => Promise<BancorVault>) => {
        describe('construction', async () => {
            it('should be properly initialized', async () => {
                vault = await createVault(networkToken.address);

                expect(await vault.version()).to.equal(0);

                await expectAccessList(vault, [
                    {
                        role: ROLE_ADMIN,
                        adminRole: ROLE_ADMIN,
                        initMemberCount: 1,
                        initialMember: deployer.address
                    },
                    {
                        role: ROLE_ASSET_MANAGER,
                        adminRole: ROLE_ASSET_MANAGER,
                        initMemberCount: 1,
                        initialMember: deployer.address
                    },
                    {
                        role: ROLE_NETWORK_TOKEN_MANAGER,
                        adminRole: ROLE_ASSET_MANAGER,
                        initMemberCount: 0
                    }
                ]);
            });

            it('should revert when initialized with an invalid network token', async () => {
                await expect(createVault(ZERO_ADDRESS)).to.be.revertedWith(Errors.ERR_INVALID_ADDRESS);
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
                                await vault.connect(deployer).grantRole(ROLE_ADMIN, admin.address);

                                expect(await vault.isPaused()).to.be.false;

                                await vault.connect(admin).pause();

                                expect(await vault.isPaused()).to.be.true;
                            });

                            testWithdrawRestricted('Pausable: paused');
                        });
                    };

                    const testWithdrawRestricted = (reason: string = Errors.ERR_ACCESS_DENIED) => {
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
                            Errors.ERR_INVALID_ADDRESS
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

        describe('pausing/unpausing', () => {
            beforeEach(async () => {
                vault = await createVault(networkToken.address);
            });

            const testPause = () => {
                it('should pause the contract', async () => {
                    await vault.connect(sender).pause();

                    expect(await vault.isPaused()).to.be.true;
                });

                context('when paused', () => {
                    beforeEach(async () => {
                        await vault.connect(deployer).grantRole(ROLE_ADMIN, admin.address);
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
                    await expect(vault.connect(sender).pause()).to.be.revertedWith(Errors.ERR_ACCESS_DENIED);
                });

                context('when paused', () => {
                    beforeEach(async () => {
                        await vault.connect(deployer).grantRole(ROLE_ADMIN, admin.address);
                        await vault.connect(admin).pause();

                        expect(await vault.isPaused()).to.be.true;
                    });

                    it('should revert when a non-admin is attempting unpause', async () => {
                        await expect(vault.connect(sender).unpause()).to.be.revertedWith(Errors.ERR_ACCESS_DENIED);
                    });
                });
            };

            context('admin', () => {
                beforeEach(async () => {
                    await vault.connect(deployer).grantRole(ROLE_ADMIN, sender.address);
                });

                testPause();
            });

            context('regular account', () => {
                testPauseRestricted();
            });

            context('asset manager', () => {
                beforeEach(async () => {
                    await vault.connect(deployer).grantRole(ROLE_ASSET_MANAGER, sender.address);
                });

                testPauseRestricted();
            });

            context('network token manager', () => {
                beforeEach(async () => {
                    await vault.connect(deployer).grantRole(ROLE_NETWORK_TOKEN_MANAGER, sender.address);
                });

                testPauseRestricted();
            });
        });
    };

    context('as a regular contract ', () => {
        testVault(async (networkTokenAddress) => {
            const vault = await Contracts.BancorVault.deploy(networkTokenAddress);
            await vault.initialize();

            return vault;
        });
    });

    context('as a proxy', () => {
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
