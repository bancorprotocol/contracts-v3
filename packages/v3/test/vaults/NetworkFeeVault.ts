import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { NetworkFeeVault } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN } from '../helpers/Constants';
import { createProxy, createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { TokenWithAddress, createTokenBySymbol, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, NetworkFeeVault: NetworkFeeVaultRoles } = roles;

describe('NetworkFeeVault', () => {
    shouldHaveGap('NetworkFeeVault');

    describe('construction', () => {
        let networkFeeVault: NetworkFeeVault;

        beforeEach(async () => {
            ({ networkFeeVault } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(networkFeeVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();
            const networkFeeVault = await createProxy(Contracts.NetworkFeeVault);

            expect(await networkFeeVault.version()).to.equal(1);
            expect(await networkFeeVault.isPayable()).to.be.true;

            await expectRole(networkFeeVault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(networkFeeVault, NetworkFeeVaultRoles.ROLE_ASSET_MANAGER, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let networkFeeVault: NetworkFeeVault;
        let networkToken: NetworkToken;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(networkFeeVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(networkFeeVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    networkFeeVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [BNT, ETH, TKN]) {
            const isNetworkToken = symbol === BNT;

            beforeEach(async () => {
                ({ networkFeeVault, networkToken } = await createSystem());

                token = isNetworkToken ? networkToken : await createTokenBySymbol(TKN);

                transfer(deployer, token, networkFeeVault.address, amount);
            });

            context(`withdrawing ${symbol}`, () => {
                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await networkFeeVault.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await networkFeeVault.grantRole(NetworkFeeVaultRoles.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });
            });
        }
    });
});
