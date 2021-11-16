import Contracts from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { BancorVault } from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { ZERO_ADDRESS, BNT, ETH, TKN } from '../helpers/Constants';
import { createProxy, createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { createTokenBySymbol, TokenWithAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles, BancorVault: BancorVaultRoles } = roles;

describe('BancorVault', () => {
    shouldHaveGap('BancorVault');

    describe('construction', () => {
        let bancorVault: BancorVault;

        beforeEach(async () => {
            ({ bancorVault } = await createSystem());
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorVault.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should revert when initialized with an invalid network token', async () => {
            await expect(Contracts.BancorVault.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const [deployer] = await ethers.getSigners();
            const reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
            const vault = await createProxy(Contracts.BancorVault, { ctorArgs: [reserveToken.address] });

            expect(await bancorVault.version()).to.equal(1);
            expect(await bancorVault.isPayable()).to.be.true;

            await expectRole(vault, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [deployer.address]);
            await expectRole(vault, BancorVaultRoles.ROLE_ASSET_MANAGER, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
            await expectRole(vault, BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, UpgradeableRoles.ROLE_ADMIN);
        });
    });

    describe('asset management', () => {
        const amount = 1_000_000;

        let bancorVault: BancorVault;
        let networkToken: NetworkToken;

        let deployer: SignerWithAddress;
        let user: SignerWithAddress;

        let token: TokenWithAddress;

        const testWithdrawFunds = () => {
            it('should allow withdrawals', async () => {
                await expect(bancorVault.connect(user).withdrawFunds(token.address, user.address, amount))
                    .to.emit(bancorVault, 'FundsWithdrawn')
                    .withArgs(token.address, user.address, user.address, amount);
            });
        };

        const testWithdrawFundsRestricted = () => {
            it('should revert', async () => {
                await expect(
                    bancorVault.connect(user).withdrawFunds(token.address, user.address, amount)
                ).to.revertedWith('AccessDenied');
            });
        };

        before(async () => {
            [deployer, user] = await ethers.getSigners();
        });

        for (const symbol of [BNT, ETH, TKN]) {
            const isNetworkToken = symbol === BNT;

            context(`withdrawing ${symbol}`, () => {
                beforeEach(async () => {
                    ({ bancorVault, networkToken } = await createSystem());

                    token = isNetworkToken ? networkToken : await createTokenBySymbol(symbol);

                    await transfer(deployer, token, bancorVault.address, amount);
                });

                context('with no special permissions', () => {
                    testWithdrawFundsRestricted();
                });

                context('with admin role', () => {
                    beforeEach(async () => {
                        await bancorVault.grantRole(UpgradeableRoles.ROLE_ADMIN, user.address);
                    });

                    testWithdrawFundsRestricted();
                });

                context('with asset manager role', () => {
                    beforeEach(async () => {
                        await bancorVault.grantRole(BancorVaultRoles.ROLE_ASSET_MANAGER, user.address);
                    });

                    testWithdrawFunds();
                });

                context('with network token manager role', () => {
                    beforeEach(async () => {
                        await bancorVault.grantRole(BancorVaultRoles.ROLE_NETWORK_TOKEN_MANAGER, user.address);
                    });

                    isNetworkToken ? testWithdrawFunds() : testWithdrawFundsRestricted();
                });
            });
        }
    });
});
