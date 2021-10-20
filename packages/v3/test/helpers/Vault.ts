import { NetworkToken } from '../../components/LegacyContracts';
import { IVault } from '../../typechain';
import { mapHashToRole } from './AccessControl';
import { BNT } from './Constants';
import { createTokenBySymbol } from './Utils';
import { expect } from 'chai';
import { ethers } from 'hardhat';

export const withdrawFundsTest = (
    getVault: () => Promise<{
        vault: IVault;
        networkToken: NetworkToken;
    }>,
    tests: {
        token: string;
        roles: { role: string | undefined; isExpectedSuccessful: boolean }[];
    }[]
) => {
    const ROLE_NONE = 'ROLE_NONE';

    for (let test of tests) {
        context('withdraw funds ' + test.token, () => {
            for (let roleToTest of test.roles) {
                const roleName = roleToTest.role ? mapHashToRole[roleToTest.role] : ROLE_NONE;

                const testName = roleToTest.isExpectedSuccessful
                    ? 'should not revert with role: '
                    : 'should revert with role: ';

                it(testName + roleName, async () => {
                    const { vault, networkToken } = await getVault();

                    const [, sender, target] = await ethers.getSigners();

                    const token =
                        test.token === BNT ? networkToken.address : (await createTokenBySymbol(test.token)).address;

                    if (roleName !== ROLE_NONE) {
                        await (vault as any).grantRole(roleToTest.role, sender.address);
                    }
                    const res = vault.connect(sender).withdrawFunds(token, target.address, 0);

                    if (roleToTest.isExpectedSuccessful) {
                        await expect(res)
                            .to.emit(vault, 'FundsWithdrawn')
                            .withArgs(token, sender.address, target.address, 0);
                    } else {
                        await expect(res).to.revertedWith('AccessDenied');
                    }
                });
            }
        });
    }
};
