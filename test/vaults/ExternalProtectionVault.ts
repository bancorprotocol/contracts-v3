import Contracts, { IERC20, ExternalProtectionVault, TestBancorNetwork } from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createSystem, createToken, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('ExternalProtectionVault', () => {
    shouldHaveGap('ExternalProtectionVault');

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let externalProtectionVault: ExternalProtectionVault;

        beforeEach(async () => {
            ({ network, bntGovernance, vbntGovernance, externalProtectionVault } = await createSystem());
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.ExternalProtectionVault.deploy(ZERO_ADDRESS, vbntGovernance.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT governance contract', async () => {
            await expect(
                Contracts.ExternalProtectionVault.deploy(bntGovernance.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(externalProtectionVault.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await externalProtectionVault.version()).to.equal(1);
            expect(await externalProtectionVault.isPayable()).to.be.true;

            await expectRoles(externalProtectionVault, Roles.Upgradeable);

            await expectRole(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address,
                network.address
            ]);
            await expectRole(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
                network.address
            ]);
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let externalProtectionVault: ExternalProtectionVault;
        let bnt: IERC20;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(externalProtectionVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(externalProtectionVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    externalProtectionVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            const tokenData = new TokenData(symbol);

            beforeEach(async () => {
                ({ externalProtectionVault, bnt } = await createSystem());

                token = tokenData.isBNT() ? bnt : await createToken(tokenData);

                await transfer(deployer, token, externalProtectionVault.address, amount);
            });

            context(`withdrawing ${symbol}`, () => {
                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await externalProtectionVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await externalProtectionVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });
            });
        }
    });
});
