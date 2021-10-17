import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { TestERC20Token, ExternalProtectionVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
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

const { Upgradeable: UpgradeableRoles, ExternalProtectionVault: ExternalProtectionVaultRoles } = roles;

let deployer: SignerWithAddress;
let sender: SignerWithAddress;
let target: SignerWithAddress;
let admin: SignerWithAddress;

describe('ExternalProtectionVault', () => {
    shouldHaveGap('ExternalProtectionVault');

    before(async () => {
        [deployer, sender, target, admin] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { externalProtectionVault } = await createSystem();

            await expect(externalProtectionVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be payable', async () => {
            const { externalProtectionVault } = await createSystem();

            expect(await externalProtectionVault.isPayable()).to.be.true;
        });

        it('should be properly initialized', async () => {
            const externalProtectionVault = await Contracts.ExternalProtectionVault.deploy();
            await externalProtectionVault.initialize();

            expect(await externalProtectionVault.version()).to.equal(1);

            await expectRole(externalProtectionVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(
                externalProtectionVault,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER,
                [deployer.address]
            );
        });
    });

    describe('asset management', () => {
        let networkToken: NetworkToken;
        let externalProtectionVault: ExternalProtectionVault;

        beforeEach(async () => {
            ({ networkToken, externalProtectionVault } = await createSystem());
        });

        it('should be payable', async () => {
            expect(await externalProtectionVault.isPayable()).to.be.true;
        });

        it('should be able to receive ETH', async () => {
            const prevBalance = await getBalance({ address: NATIVE_TOKEN_ADDRESS }, externalProtectionVault.address);

            const amount = BigNumber.from(1000);
            await deployer.sendTransaction({ value: amount, to: externalProtectionVault.address });

            expect(await getBalance({ address: NATIVE_TOKEN_ADDRESS }, externalProtectionVault.address)).to.equal(
                prevBalance.add(amount)
            );
        });

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                const testWithdraw = () => {
                    it('should revert when trying to withdraw more tokens than the vault holds', async () => {
                        const amountToWithdraw = amount.add(BigNumber.from(100));

                        await expect(
                            externalProtectionVault
                                .connect(sender)
                                .withdrawFunds(token.address, target.address, amountToWithdraw)
                        ).to.be.revertedWith(errorMessageTokenExceedsBalance(symbol));
                    });

                    it('should be able to withdraw any tokens', async () => {
                        const prevTargetBalance = await getBalance(token, target.address);
                        const prevVaultBalance = await getBalance(token, externalProtectionVault.address);

                        const remainder = BigNumber.from(1);
                        const partialAmount = amount.sub(remainder);
                        let res = await externalProtectionVault
                            .connect(sender)
                            .withdrawFunds(token.address, target.address, partialAmount);
                        await expect(res)
                            .to.emit(externalProtectionVault, 'FundsWithdrawn')
                            .withArgs(token.address, sender.address, target.address, partialAmount);

                        const targetBalance = await getBalance(token, target.address);
                        const vaultBalance = await getBalance(token, externalProtectionVault.address);

                        expect(targetBalance).to.equal(prevTargetBalance.add(partialAmount));
                        expect(vaultBalance).to.equal(prevVaultBalance.sub(partialAmount));

                        res = await externalProtectionVault
                            .connect(sender)
                            .withdrawFunds(token.address, target.address, remainder);
                        await expect(res)
                            .to.emit(externalProtectionVault, 'FundsWithdrawn')
                            .withArgs(token.address, sender.address, target.address, remainder);

                        expect(await getBalance(token, target.address)).to.equal(targetBalance.add(remainder));
                        expect(await getBalance(token, externalProtectionVault.address)).to.equal(
                            vaultBalance.sub(remainder)
                        );
                    });
                };

                const testWithdrawRestricted = (reason = 'AccessDenied()') => {
                    it('should not be able to withdraw any tokens', async () => {
                        await expect(
                            externalProtectionVault.connect(sender).withdrawFunds(token.address, target.address, amount)
                        ).to.be.revertedWith(reason);
                    });
                };

                const amount = BigNumber.from(10000);
                let token: TokenWithAddress;

                beforeEach(async () => {
                    if (symbol === BNT) {
                        token = networkToken;
                    } else {
                        token = await createTokenBySymbol(symbol);
                    }

                    await transfer(deployer, token, externalProtectionVault.address, amount);
                });

                it('should revert when withdrawing tokens to an invalid address', async () => {
                    await expect(
                        externalProtectionVault.withdrawFunds(token.address, ZERO_ADDRESS, amount)
                    ).to.be.revertedWith('InvalidAddress()');
                });

                it('should allow withdrawing 0 tokens', async () => {
                    const prevVaultBalance = await getBalance(token, externalProtectionVault.address);

                    await externalProtectionVault.withdrawFunds(token.address, target.address, BigNumber.from(0));

                    expect(await getBalance(token, externalProtectionVault.address)).to.equal(prevVaultBalance);
                });

                context('regular account', () => {
                    testWithdrawRestricted();
                });

                context('admin', () => {
                    beforeEach(async () => {
                        await externalProtectionVault
                            .connect(deployer)
                            .grantRole(UpgradeableRoles.ROLE_ADMIN, sender.address);
                    });

                    testWithdrawRestricted();
                });

                context('asset manager', () => {
                    beforeEach(async () => {
                        await externalProtectionVault
                            .connect(deployer)
                            .grantRole(ExternalProtectionVaultRoles.ROLE_ASSET_MANAGER, sender.address);
                    });

                    testWithdraw();
                });
            });
        }
    });
});
