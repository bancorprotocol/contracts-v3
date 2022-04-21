import { AccessControlEnumerable } from '../../components/Contracts';
import { TokenGovernance, VBNT } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isMainnet, isMainnetFork } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let deployerV2: string;
    let foundationMultisig: string;
    let liquidityProtection: string;
    let vbnt: VBNT;
    let vbntGovernance: TokenGovernance;

    const INITIAL_SUPPLY = toWei(1_000_000_000);
    const vbntData = new TokenData(TokenSymbol.vBNT);

    before(async () => {
        ({ deployer, deployerV2, foundationMultisig, liquidityProtection } = await getNamedAccounts());
    });

    beforeEach(async () => {
        vbnt = await DeployedContracts.VBNT.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    });

    it('should deploy the VBNT contract', async () => {
        expect(await vbnt.name()).to.equal(vbntData.name());
        expect(await vbnt.symbol()).to.equal(vbntData.symbol());
        expect(await vbnt.decimals()).to.equal(vbntData.decimals());
    });

    it('should deploy and configure the VBNT governance contract', async () => {
        expect(await vbntGovernance.token()).to.equal(vbnt.address);
        expect(await vbnt.owner()).to.equal(vbntGovernance.address);

        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [isMainnetFork() ? foundationMultisig : deployer]
        );
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            isMainnet() ? [deployerV2, deployer] : [deployer]
        );
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [liquidityProtection] : []
        );
    });

    if (!isMainnet()) {
        it('should mint the initial total supply', async () => {
            expect(await vbnt.balanceOf(deployer)).to.equal(INITIAL_SUPPLY);
        });
    }
});
