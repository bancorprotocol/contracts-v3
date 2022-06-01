import Contracts, { IERC20, MasterVault, TestBancorNetwork, TestBNTPool } from '../../components/Contracts';
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

describe('MasterVault', () => {
    shouldHaveGap('MasterVault');

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let masterVault: MasterVault;
        let bntPool: TestBNTPool;

        beforeEach(async () => {
            ({ network, bntGovernance, vbntGovernance, masterVault, bntPool } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(masterVault.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when initialized with an invalid BNT governance contract', async () => {
            await expect(Contracts.MasterVault.deploy(ZERO_ADDRESS, vbntGovernance.address)).to.be.revertedWithError(
                'InvalidAddress'
            );
        });

        it('should revert when initialized with an invalid BNT governance contract', async () => {
            await expect(Contracts.MasterVault.deploy(bntGovernance.address, ZERO_ADDRESS)).to.be.revertedWithError(
                'InvalidAddress'
            );
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();

            expect(await masterVault.version()).to.equal(1);
            expect(await masterVault.isPayable()).to.be.true;

            await expectRoles(masterVault, Roles.MasterVault);

            await expectRole(masterVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address,
                network.address
            ]);
            await expectRole(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
                network.address
            ]);
            await expectRole(masterVault, Roles.MasterVault.ROLE_BNT_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
                bntPool.address
            ]);
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let masterVault: MasterVault;
        let bnt: IERC20;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(masterVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(masterVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    masterVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWithError('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            const tokenData = new TokenData(symbol);

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ masterVault, bnt } = await createSystem());

                    token = tokenData.isBNT() ? bnt : await createToken(tokenData);

                    await transfer(deployer, token, masterVault.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(Roles.Upgradeable.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });

                context('with BNT manager role', () => {
                    beforeEach(async () => {
                        await masterVault.grantRole(Roles.MasterVault.ROLE_BNT_MANAGER, user.address);
                    });

                    tokenData.isBNT() ? testWithdrawFunds() : testWithdrawFundsRestricted();
                });
            });
        }
    });
});
